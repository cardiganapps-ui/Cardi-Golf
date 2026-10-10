-- Polo · 0030 · A tenant id on every child table, and set-based row-level security (DB-12, SEC-05)
--
-- Every read policy of a round-, group- or lot-scoped table asked, row by row,
-- which tournament the row's parent belongs to and whether the caller is in it
-- (is_tournament_member(round_tournament_id(round_id))): about fifteen
-- security-definer calls per row, which Postgres never inlines. A 60-player
-- reload spent seconds of database time in them, close to the authenticated
-- role's statement timeout, and any member could make the database do that
-- work at will (SEC-05). Every FOR ALL write policy was also OR'd into SELECT,
-- adding its own per-row calls.
--
-- Expand only. Nothing is dropped, nothing a phone sends changes, and every
-- write the database allowed or refused before it still allows or refuses
-- (supabase/tests/tenant_write_matrix.sql holds the matrix as main answered
-- it; supabase/tests/upgrade_0030.sh proves the backfill and the policies on
-- a database with data from before):
--
--   1. `tournament_id` on groups, group_members, round_tees, scores,
--      snake_tiebreaks, card_signatures, handicap_overrides, hole_awards,
--      calcutta_bids, calcutta_buybacks and photos (team_members, rejected_writes
--      and money_adjustments already have one). Each is
--        a. added nullable, then backfilled from its parent (round, group or
--           lot) with the table's user triggers off, so the backfill writes no
--           audit row, recomputes no result, and moves no `version` or
--           `updated_at`; the triggers come back exactly as they were;
--        b. filled from the parent by a BEFORE INSERT trigger when a writer
--           leaves it out (every phone today), and again when an update moves
--           the row to another parent without naming the tenant;
--        c. NOT NULL, and tied to the parent by a composite foreign key
--           (tournament_id, <parent>) → parent (tournament_id, id), on update
--           and delete cascade like the parent key it sits beside: a child
--           can never name another tournament than its parent's;
--        d. indexed (tournament_id, <parent>), which also covers the key.
--      An upsert's update path runs no BEFORE INSERT trigger, but the row it
--      updates already has its tenant and a phone's SET never names it.
--   2. my_tournament_ids(): the tournaments the caller is a member of, the
--      same set is_tournament_member answers true for (organizer, confirmed
--      profile link, PIN claim; the platform admin: all). Read policies become
--      `tournament_id = any ((select public.my_tournament_ids())::uuid[])`: one call
--      per statement, then an array test per row. The tables with their own
--      tournament_id get the same rewrite.
--   3. Every FOR ALL write policy on these tables (and holes/tees, whose
--      can_edit_course ran per row on every read of a course) is split into
--      INSERT, UPDATE and DELETE with the same expressions, so none is OR'd
--      into SELECT. Each one's USING already implied its table's read, so
--      what anyone sees does not change.
--   4. restore_tournament takes the new columns: a backup's tenant ids must be
--      this tournament's, and every child row is written with it.
--
-- The social tables (profiles, friendships, notifications, crews,
-- push_subscriptions, device_sessions) are untouched, and none gains a
-- platform branch. Re-running this file changes nothing.

set local lock_timeout = '10s';

-- ---------------------------------------------------------------------------
-- 1. The parents' (tournament_id, id), which the children's keys point at
-- ---------------------------------------------------------------------------
create unique index if not exists rounds_tenant_uk on public.rounds (tournament_id, id);
create unique index if not exists calcutta_lots_tenant_uk on public.calcutta_lots (tournament_id, id);

-- The trigger functions: definer, so a writer's own read rights never decide
-- what the tenant is; the foreign key and the policies decide whether the row
-- goes in. An explicit tenant on insert is kept, for the key to judge.
create or replace function public.tenant_from_round()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.tournament_id is null then
      new.tournament_id := (select r.tournament_id from public.rounds r where r.id = new.round_id);
    end if;
  elsif new.round_id is distinct from old.round_id and new.tournament_id is not distinct from old.tournament_id then
    new.tournament_id := (select r.tournament_id from public.rounds r where r.id = new.round_id);
  end if;
  return new;
end;
$$;

create or replace function public.tenant_from_group()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.tournament_id is null then
      new.tournament_id := (select g.tournament_id from public.groups g where g.id = new.group_id);
    end if;
  elsif new.group_id is distinct from old.group_id and new.tournament_id is not distinct from old.tournament_id then
    new.tournament_id := (select g.tournament_id from public.groups g where g.id = new.group_id);
  end if;
  return new;
end;
$$;

create or replace function public.tenant_from_lot()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.tournament_id is null then
      new.tournament_id := (select l.tournament_id from public.calcutta_lots l where l.id = new.lot_id);
    end if;
  elsif new.lot_id is distinct from old.lot_id and new.tournament_id is not distinct from old.tournament_id then
    new.tournament_id := (select l.tournament_id from public.calcutta_lots l where l.id = new.lot_id);
  end if;
  return new;
end;
$$;
revoke execute on function public.tenant_from_round(), public.tenant_from_group(), public.tenant_from_lot() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. The column, table by table: add, backfill (user triggers off), trigger,
--    NOT NULL, key, index. Groups first: group_members' key points at them.
-- ---------------------------------------------------------------------------
do $$
declare
  c record;
  t record;
  was jsonb;
begin
  for c in
    select * from (values
      (1, 'groups', 'round_id', 'rounds', 'tenant_from_round'),
      (2, 'group_members', 'group_id', 'groups', 'tenant_from_group'),
      (3, 'round_tees', 'round_id', 'rounds', 'tenant_from_round'),
      (4, 'scores', 'round_id', 'rounds', 'tenant_from_round'),
      (5, 'snake_tiebreaks', 'round_id', 'rounds', 'tenant_from_round'),
      (6, 'card_signatures', 'round_id', 'rounds', 'tenant_from_round'),
      (7, 'handicap_overrides', 'round_id', 'rounds', 'tenant_from_round'),
      (8, 'hole_awards', 'round_id', 'rounds', 'tenant_from_round'),
      (9, 'photos', 'round_id', 'rounds', 'tenant_from_round'),
      (10, 'calcutta_bids', 'lot_id', 'calcutta_lots', 'tenant_from_lot'),
      (11, 'calcutta_buybacks', 'lot_id', 'calcutta_lots', 'tenant_from_lot')
    ) v(ord, tbl, col, parent, fn)
    order by ord
  loop
    execute format('alter table public.%I add column if not exists tournament_id uuid', c.tbl);

    -- Backfill with the table's own triggers off (audit, results, version,
    -- updated_at, disputes), each put back in the mode it had.
    was := '[]';
    for t in
      select tgname, tgenabled from pg_trigger
      where tgrelid = format('public.%I', c.tbl)::regclass and not tgisinternal and tgenabled <> 'D'
      order by tgname
    loop
      was := was || jsonb_build_array(jsonb_build_object('name', t.tgname, 'mode', t.tgenabled::text));
      execute format('alter table public.%I disable trigger %I', c.tbl, t.tgname);
    end loop;
    execute format(
      'update public.%1$I x set tournament_id = p.tournament_id from public.%2$I p where p.id = x.%3$I and x.tournament_id is distinct from p.tournament_id',
      c.tbl, c.parent, c.col);
    for t in select value ->> 'name' as tgname, value ->> 'mode' as mode from jsonb_array_elements(was) loop
      execute format('alter table public.%I %s trigger %I', c.tbl,
        case t.mode when 'A' then 'enable always' when 'R' then 'enable replica' else 'enable' end, t.tgname);
    end loop;

    execute format('create or replace trigger %I before insert or update on public.%I for each row execute function public.%I()',
      c.tbl || '_tenant', c.tbl, c.fn);
    execute format('alter table public.%I alter column tournament_id set not null', c.tbl);
    if not exists (select 1 from pg_constraint where conrelid = format('public.%I', c.tbl)::regclass and conname = c.tbl || '_tenant_fkey') then
      execute format(
        'alter table public.%1$I add constraint %2$I foreign key (tournament_id, %3$I) references public.%4$I (tournament_id, id) on update cascade on delete cascade',
        c.tbl, c.tbl || '_tenant_fkey', c.col, c.parent);
    end if;
    execute format('create index if not exists %I on public.%I (tournament_id, %I)', c.tbl || '_tenant_idx', c.tbl, c.col);

    if c.tbl = 'groups' then
      create unique index if not exists groups_tenant_uk on public.groups (tournament_id, id);
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. my_tournament_ids(): is_tournament_member, as a set
-- ---------------------------------------------------------------------------
-- is_tournament_member(t) = is_tournament_organizer_own(t) or my_player_id(t)
-- is not null or is_platform_admin(). The organizer's own rows, the players
-- confirmed-linked to this account, and this device's PIN claim give the same
-- tournaments (an admin player is a player, so his claim or link is there
-- already); the platform admin reads every tournament, as before.
create or replace function public.my_tournament_ids()
returns uuid[]
language sql stable security definer
set search_path = public
as $$
  select case
    when auth.uid() is null then '{}'::uuid[]
    when public.is_platform_admin() then array(select t.id from public.tournaments t)
    else array(
      select o.tournament_id from public.tournament_organizers o where o.auth_user_id = auth.uid()
      union
      select p.tournament_id from public.players p where p.profile_id = auth.uid() and p.profile_status = 'confirmed'
      union
      select d.tournament_id from public.device_sessions d
      where d.auth_user_id = auth.uid() and d.tournament_id is not null and d.player_id is not null
    )
  end
$$;
-- Only a signed-in role reads under these policies (they are `to
-- authenticated`; anon read nothing before either, since it has no uid).
revoke execute on function public.my_tournament_ids() from public, anon;
grant execute on function public.my_tournament_ids() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Read policies, set-based; FOR ALL write policies split by command
-- ---------------------------------------------------------------------------
-- Each split policy carries the FOR ALL policy's own USING and WITH CHECK,
-- word for word (upgrade_0030.sh compares them as Postgres stores them).

-- tournaments (its read policy only; update and delete were already split)
drop policy if exists tournaments_read on public.tournaments;
create policy tournaments_read on public.tournaments for select to authenticated
  using (id = any ((select public.my_tournament_ids())::uuid[]));

-- Tables with their own tournament_id, organizer writes
do $$
declare
  tbl text;
begin
  foreach tbl in array array['players', 'rounds', 'pairs', 'teams', 'team_members', 'calcutta_lots', 'payments'] loop
    execute format('drop policy if exists %I on public.%I', tbl || '_read', tbl);
    execute format('create policy %I on public.%I for select to authenticated using (tournament_id = any ((select public.my_tournament_ids())::uuid[]))', tbl || '_read', tbl);
    execute format('drop policy if exists %I on public.%I', tbl || '_write', tbl);
    execute format('drop policy if exists %I on public.%I', tbl || '_insert', tbl);
    execute format('drop policy if exists %I on public.%I', tbl || '_update', tbl);
    execute format('drop policy if exists %I on public.%I', tbl || '_delete', tbl);
    execute format('create policy %I on public.%I for insert with check (public.is_tournament_organizer(tournament_id))', tbl || '_insert', tbl);
    execute format('create policy %I on public.%I for update using (public.is_tournament_organizer(tournament_id)) with check (public.is_tournament_organizer(tournament_id))', tbl || '_update', tbl);
    execute format('create policy %I on public.%I for delete using (public.is_tournament_organizer(tournament_id))', tbl || '_delete', tbl);
  end loop;
end;
$$;

-- Entrants and custom-bet results: the player must be of the same tournament
do $$
declare
  tbl text;
begin
  foreach tbl in array array['game_entries', 'game_results'] loop
    execute format('drop policy if exists %I on public.%I', tbl || '_read', tbl);
    execute format('create policy %I on public.%I for select to authenticated using (tournament_id = any ((select public.my_tournament_ids())::uuid[]))', tbl || '_read', tbl);
    execute format('drop policy if exists %I on public.%I', tbl || '_write', tbl);
    execute format('drop policy if exists %I on public.%I', tbl || '_insert', tbl);
    execute format('drop policy if exists %I on public.%I', tbl || '_update', tbl);
    execute format('drop policy if exists %I on public.%I', tbl || '_delete', tbl);
    execute format('create policy %I on public.%I for insert with check (public.is_tournament_organizer(tournament_id) and public.player_tournament_id(player_id) = tournament_id)', tbl || '_insert', tbl);
    execute format('create policy %I on public.%I for update using (public.is_tournament_organizer(tournament_id)) with check (public.is_tournament_organizer(tournament_id) and public.player_tournament_id(player_id) = tournament_id)', tbl || '_update', tbl);
    execute format('create policy %I on public.%I for delete using (public.is_tournament_organizer(tournament_id))', tbl || '_delete', tbl);
  end loop;
end;
$$;

-- Read-only to clients: published results, the Comité's money assignments
drop policy if exists round_results_read on public.round_results;
create policy round_results_read on public.round_results for select to authenticated
  using (tournament_id = any ((select public.my_tournament_ids())::uuid[]));
drop policy if exists money_adjustments_read on public.money_adjustments;
create policy money_adjustments_read on public.money_adjustments for select to authenticated
  using (tournament_id = any ((select public.my_tournament_ids())::uuid[]));

-- Child tables whose writes are the Comité's: the parent decides which tournament
do $$
declare
  c record;
begin
  for c in
    select * from (values
      ('groups', 'public.is_tournament_organizer(public.round_tournament_id(round_id))'),
      ('group_members', 'public.is_tournament_organizer(public.group_tournament_id(group_id))'),
      ('round_tees', 'public.is_tournament_organizer(public.round_tournament_id(round_id))'),
      ('handicap_overrides', 'public.is_tournament_organizer(public.round_tournament_id(round_id))'),
      ('calcutta_bids', 'public.is_tournament_organizer(public.lot_tournament_id(lot_id))'),
      ('calcutta_buybacks', 'public.is_tournament_organizer(public.lot_tournament_id(lot_id))'),
      -- Photos: any member of the round's tournament, as before.
      ('photos', 'public.is_tournament_member(public.round_tournament_id(round_id))')
    ) v(tbl, rule)
  loop
    execute format('drop policy if exists %I on public.%I', c.tbl || '_read', c.tbl);
    execute format('create policy %I on public.%I for select to authenticated using (tournament_id = any ((select public.my_tournament_ids())::uuid[]))', c.tbl || '_read', c.tbl);
    execute format('drop policy if exists %I on public.%I', c.tbl || '_write', c.tbl);
    execute format('drop policy if exists %I on public.%I', c.tbl || '_insert', c.tbl);
    execute format('drop policy if exists %I on public.%I', c.tbl || '_update', c.tbl);
    execute format('drop policy if exists %I on public.%I', c.tbl || '_delete', c.tbl);
    execute format('create policy %I on public.%I for insert with check (%s)', c.tbl || '_insert', c.tbl, c.rule);
    execute format('create policy %I on public.%I for update using (%s) with check (%s)', c.tbl || '_update', c.tbl, c.rule, c.rule);
    execute format('create policy %I on public.%I for delete using (%s)', c.tbl || '_delete', c.tbl, c.rule);
  end loop;
end;
$$;

-- scores and card_signatures: their writes were split already (0026, 0010); only the read changes
drop policy if exists scores_read on public.scores;
create policy scores_read on public.scores for select to authenticated
  using (tournament_id = any ((select public.my_tournament_ids())::uuid[]));
drop policy if exists card_signatures_read on public.card_signatures;
create policy card_signatures_read on public.card_signatures for select to authenticated
  using (tournament_id = any ((select public.my_tournament_ids())::uuid[]));

-- snake_tiebreaks: 0026's FOR ALL, split (a phone's answer: live rounds only, REL-08)
drop policy if exists snake_tiebreaks_read on public.snake_tiebreaks;
create policy snake_tiebreaks_read on public.snake_tiebreaks for select to authenticated
  using (tournament_id = any ((select public.my_tournament_ids())::uuid[]));
drop policy if exists snake_tiebreaks_write on public.snake_tiebreaks;
drop policy if exists snake_tiebreaks_insert on public.snake_tiebreaks;
drop policy if exists snake_tiebreaks_update on public.snake_tiebreaks;
drop policy if exists snake_tiebreaks_delete on public.snake_tiebreaks;
create policy snake_tiebreaks_insert on public.snake_tiebreaks for insert
  with check (
    public.is_tournament_organizer(public.round_tournament_id(round_id))
    or (
      public.round_is_live(round_id)
      and exists (select 1 from public.groups g where g.id = snake_tiebreaks.group_id and g.round_id = snake_tiebreaks.round_id)
      and exists (
        select 1 from public.group_members m
        where m.group_id = snake_tiebreaks.group_id and m.player_id = public.my_player_id(public.round_tournament_id(snake_tiebreaks.round_id))
      )
      and exists (select 1 from public.group_members m where m.group_id = snake_tiebreaks.group_id and m.player_id = snake_tiebreaks.last_holed_player_id)
      and decided_by = public.my_player_id(public.round_tournament_id(round_id))
    )
  );
create policy snake_tiebreaks_update on public.snake_tiebreaks for update
  using (
    public.is_tournament_organizer(public.round_tournament_id(round_id))
    or (
      public.round_is_live(round_id)
      and exists (
        select 1 from public.group_members m
        where m.group_id = snake_tiebreaks.group_id and m.player_id = public.my_player_id(public.round_tournament_id(snake_tiebreaks.round_id))
      )
    )
  )
  with check (
    public.is_tournament_organizer(public.round_tournament_id(round_id))
    or (
      public.round_is_live(round_id)
      and exists (select 1 from public.groups g where g.id = snake_tiebreaks.group_id and g.round_id = snake_tiebreaks.round_id)
      and exists (
        select 1 from public.group_members m
        where m.group_id = snake_tiebreaks.group_id and m.player_id = public.my_player_id(public.round_tournament_id(snake_tiebreaks.round_id))
      )
      and exists (select 1 from public.group_members m where m.group_id = snake_tiebreaks.group_id and m.player_id = snake_tiebreaks.last_holed_player_id)
      and decided_by = public.my_player_id(public.round_tournament_id(round_id))
    )
  );
create policy snake_tiebreaks_delete on public.snake_tiebreaks for delete
  using (
    public.is_tournament_organizer(public.round_tournament_id(round_id))
    or (
      public.round_is_live(round_id)
      and exists (
        select 1 from public.group_members m
        where m.group_id = snake_tiebreaks.group_id and m.player_id = public.my_player_id(public.round_tournament_id(snake_tiebreaks.round_id))
      )
    )
  );

-- hole_awards: 0026's FOR ALL, split
drop policy if exists hole_awards_read on public.hole_awards;
create policy hole_awards_read on public.hole_awards for select to authenticated
  using (tournament_id = any ((select public.my_tournament_ids())::uuid[]));
drop policy if exists hole_awards_write on public.hole_awards;
drop policy if exists hole_awards_insert on public.hole_awards;
drop policy if exists hole_awards_update on public.hole_awards;
drop policy if exists hole_awards_delete on public.hole_awards;
create policy hole_awards_insert on public.hole_awards for insert
  with check (
    (public.is_tournament_organizer(public.round_tournament_id(round_id)) and public.player_tournament_id(player_id) = public.round_tournament_id(round_id))
    or (
      public.round_is_live(round_id)
      and exists (select 1 from public.groups g where g.id = hole_awards.group_id and g.round_id = hole_awards.round_id)
      and exists (
        select 1 from public.group_members m
        where m.group_id = hole_awards.group_id and m.player_id = public.my_player_id(public.round_tournament_id(hole_awards.round_id))
      )
      and exists (select 1 from public.group_members m where m.group_id = hole_awards.group_id and m.player_id = hole_awards.player_id)
      and decided_by = public.my_player_id(public.round_tournament_id(round_id))
    )
  );
create policy hole_awards_update on public.hole_awards for update
  using (
    public.is_tournament_organizer(public.round_tournament_id(round_id))
    or (
      public.round_is_live(round_id)
      and exists (
        select 1 from public.group_members m
        where m.group_id = hole_awards.group_id and m.player_id = public.my_player_id(public.round_tournament_id(hole_awards.round_id))
      )
    )
  )
  with check (
    (public.is_tournament_organizer(public.round_tournament_id(round_id)) and public.player_tournament_id(player_id) = public.round_tournament_id(round_id))
    or (
      public.round_is_live(round_id)
      and exists (select 1 from public.groups g where g.id = hole_awards.group_id and g.round_id = hole_awards.round_id)
      and exists (
        select 1 from public.group_members m
        where m.group_id = hole_awards.group_id and m.player_id = public.my_player_id(public.round_tournament_id(hole_awards.round_id))
      )
      and exists (select 1 from public.group_members m where m.group_id = hole_awards.group_id and m.player_id = hole_awards.player_id)
      and decided_by = public.my_player_id(public.round_tournament_id(round_id))
    )
  );
create policy hole_awards_delete on public.hole_awards for delete
  using (
    public.is_tournament_organizer(public.round_tournament_id(round_id))
    or (
      public.round_is_live(round_id)
      and exists (
        select 1 from public.group_members m
        where m.group_id = hole_awards.group_id and m.player_id = public.my_player_id(public.round_tournament_id(hole_awards.round_id))
      )
    )
  );

-- Courses are shared, not a tenant's: the reads stay `auth.uid() is not null`;
-- only can_edit_course stops running on every row read.
drop policy if exists tees_write on public.tees;
drop policy if exists tees_insert on public.tees;
drop policy if exists tees_update on public.tees;
drop policy if exists tees_delete on public.tees;
create policy tees_insert on public.tees for insert with check (public.can_edit_course(course_id));
create policy tees_update on public.tees for update using (public.can_edit_course(course_id)) with check (public.can_edit_course(course_id));
create policy tees_delete on public.tees for delete using (public.can_edit_course(course_id));
drop policy if exists holes_write on public.holes;
drop policy if exists holes_insert on public.holes;
drop policy if exists holes_update on public.holes;
drop policy if exists holes_delete on public.holes;
create policy holes_insert on public.holes for insert
  with check (public.can_edit_course((select tees.course_id from public.tees where tees.id = holes.tee_id)));
create policy holes_update on public.holes for update
  using (public.can_edit_course((select tees.course_id from public.tees where tees.id = holes.tee_id)))
  with check (public.can_edit_course((select tees.course_id from public.tees where tees.id = holes.tee_id)));
create policy holes_delete on public.holes for delete
  using (public.can_edit_course((select tees.course_id from public.tees where tees.id = holes.tee_id)));

-- ---------------------------------------------------------------------------
-- 5. A restore writes every child row with this tournament's id (0029's
--    function; the tenant check covers the child tables, and each insert
--    names the tenant, which the composite keys hold to the parent's)
-- ---------------------------------------------------------------------------
create or replace function public.restore_tournament(p_tournament_id uuid, p_backup jsonb)
returns jsonb
language plpgsql volatile security definer
set search_path = public
as $$
declare
  tb jsonb;
  n_players int;
  n_rounds int;
  n_scores int;
  was text;
begin
  if not public.is_tournament_organizer(p_tournament_id) then
    raise exception 'Solo el Comité puede restaurar un respaldo' using errcode = '42501';
  end if;
  if (p_backup ->> 'version')::int is distinct from 1 then
    raise exception 'Versión de respaldo no soportada' using errcode = '22023';
  end if;
  if (p_backup ->> 'tournamentId')::uuid is distinct from p_tournament_id then
    raise exception 'wrong-tournament' using errcode = '22023';
  end if;
  tb := coalesce(p_backup -> 'tables', '{}'::jsonb);

  create temp table r_tournaments on commit drop as select * from jsonb_populate_recordset(null::public.tournaments, coalesce(tb -> 'tournaments', '[]'::jsonb));
  create temp table r_players on commit drop as select * from jsonb_populate_recordset(null::public.players, coalesce(tb -> 'players', '[]'::jsonb));
  create temp table r_rounds on commit drop as select * from jsonb_populate_recordset(null::public.rounds, coalesce(tb -> 'rounds', '[]'::jsonb));
  create temp table r_pairs on commit drop as select * from jsonb_populate_recordset(null::public.pairs, coalesce(tb -> 'pairs', '[]'::jsonb));
  create temp table r_teams on commit drop as select * from jsonb_populate_recordset(null::public.teams, coalesce(tb -> 'teams', '[]'::jsonb));
  create temp table r_team_members on commit drop as select * from jsonb_populate_recordset(null::public.team_members, coalesce(tb -> 'team_members', '[]'::jsonb));
  create temp table r_groups on commit drop as select * from jsonb_populate_recordset(null::public.groups, coalesce(tb -> 'groups', '[]'::jsonb));
  create temp table r_group_members on commit drop as select * from jsonb_populate_recordset(null::public.group_members, coalesce(tb -> 'group_members', '[]'::jsonb));
  create temp table r_round_tees on commit drop as select * from jsonb_populate_recordset(null::public.round_tees, coalesce(tb -> 'round_tees', '[]'::jsonb));
  create temp table r_scores on commit drop as select * from jsonb_populate_recordset(null::public.scores, coalesce(tb -> 'scores', '[]'::jsonb));
  create temp table r_snake_tiebreaks on commit drop as select * from jsonb_populate_recordset(null::public.snake_tiebreaks, coalesce(tb -> 'snake_tiebreaks', '[]'::jsonb));
  create temp table r_card_signatures on commit drop as select * from jsonb_populate_recordset(null::public.card_signatures, coalesce(tb -> 'card_signatures', '[]'::jsonb));
  create temp table r_handicap_overrides on commit drop as select * from jsonb_populate_recordset(null::public.handicap_overrides, coalesce(tb -> 'handicap_overrides', '[]'::jsonb));
  create temp table r_calcutta_lots on commit drop as select * from jsonb_populate_recordset(null::public.calcutta_lots, coalesce(tb -> 'calcutta_lots', '[]'::jsonb));
  create temp table r_calcutta_bids on commit drop as select * from jsonb_populate_recordset(null::public.calcutta_bids, coalesce(tb -> 'calcutta_bids', '[]'::jsonb));
  create temp table r_calcutta_buybacks on commit drop as select * from jsonb_populate_recordset(null::public.calcutta_buybacks, coalesce(tb -> 'calcutta_buybacks', '[]'::jsonb));
  create temp table r_payments on commit drop as select * from jsonb_populate_recordset(null::public.payments, coalesce(tb -> 'payments', '[]'::jsonb));
  create temp table r_money_adjustments on commit drop as select * from jsonb_populate_recordset(null::public.money_adjustments, coalesce(tb -> 'money_adjustments', '[]'::jsonb));
  create temp table r_game_entries on commit drop as select * from jsonb_populate_recordset(null::public.game_entries, coalesce(tb -> 'game_entries', '[]'::jsonb));
  create temp table r_hole_awards on commit drop as select * from jsonb_populate_recordset(null::public.hole_awards, coalesce(tb -> 'hole_awards', '[]'::jsonb));
  create temp table r_game_results on commit drop as select * from jsonb_populate_recordset(null::public.game_results, coalesce(tb -> 'game_results', '[]'::jsonb));

  -- Tenant: every row of the backup belongs to this tournament.
  if exists (select 1 from r_tournaments where id is distinct from p_tournament_id)
     or exists (select 1 from r_players where tournament_id is distinct from p_tournament_id)
     or exists (select 1 from r_rounds where tournament_id is distinct from p_tournament_id)
     or exists (select 1 from r_pairs where tournament_id is distinct from p_tournament_id)
     or exists (select 1 from r_teams where tournament_id is distinct from p_tournament_id)
     or exists (select 1 from r_team_members where tournament_id is distinct from p_tournament_id)
     or exists (select 1 from r_calcutta_lots where tournament_id is distinct from p_tournament_id)
     or exists (select 1 from r_payments where tournament_id is distinct from p_tournament_id)
     or exists (select 1 from r_money_adjustments where tournament_id is distinct from p_tournament_id)
     or exists (select 1 from r_game_entries where tournament_id is distinct from p_tournament_id)
     or exists (select 1 from r_game_results where tournament_id is distinct from p_tournament_id)
     -- The child tables carry the tenant too since 0030; a backup from before has none (null), and gets this one.
     or exists (select 1 from r_groups where tournament_id <> p_tournament_id)
     or exists (select 1 from r_group_members where tournament_id <> p_tournament_id)
     or exists (select 1 from r_round_tees where tournament_id <> p_tournament_id)
     or exists (select 1 from r_scores where tournament_id <> p_tournament_id)
     or exists (select 1 from r_snake_tiebreaks where tournament_id <> p_tournament_id)
     or exists (select 1 from r_card_signatures where tournament_id <> p_tournament_id)
     or exists (select 1 from r_handicap_overrides where tournament_id <> p_tournament_id)
     or exists (select 1 from r_hole_awards where tournament_id <> p_tournament_id)
     or exists (select 1 from r_calcutta_bids where tournament_id <> p_tournament_id)
     or exists (select 1 from r_calcutta_buybacks where tournament_id <> p_tournament_id) then
    raise exception 'El respaldo tiene filas de otro torneo' using errcode = '22023';
  end if;
  -- Ids (NEW-12): a row the backup names is never a row another tournament
  -- already has, directly or through its round or lot. Since 0010 players and
  -- rounds were upserted by id, so a backup listing another tournament's ids
  -- rewrote them there (its names, its handicaps, its round's status), and its
  -- scores and groups landed in that round. Checked before anything is written.
  if exists (select 1 from r_players x join public.players y on y.id = x.id where y.tournament_id <> p_tournament_id)
     or exists (select 1 from r_rounds x join public.rounds y on y.id = x.id where y.tournament_id <> p_tournament_id)
     or exists (select 1 from r_pairs x join public.pairs y on y.id = x.id where y.tournament_id <> p_tournament_id)
     or exists (select 1 from r_teams x join public.teams y on y.id = x.id where y.tournament_id <> p_tournament_id)
     or exists (select 1 from r_calcutta_lots x join public.calcutta_lots y on y.id = x.id where y.tournament_id <> p_tournament_id)
     or exists (select 1 from r_payments x join public.payments y on y.id = x.id where y.tournament_id <> p_tournament_id)
     or exists (select 1 from r_money_adjustments x join public.money_adjustments y on y.id = x.id where y.tournament_id <> p_tournament_id)
     or exists (select 1 from r_groups x join public.groups y on y.id = x.id join public.rounds r on r.id = y.round_id where r.tournament_id <> p_tournament_id)
     or exists (select 1 from r_scores x join public.scores y on y.id = x.id join public.rounds r on r.id = y.round_id where r.tournament_id <> p_tournament_id)
     or exists (select 1 from r_calcutta_bids x join public.calcutta_bids y on y.id = x.id join public.calcutta_lots l on l.id = y.lot_id where l.tournament_id <> p_tournament_id) then
    raise exception 'El respaldo trae filas que son de otro torneo; no se restauró nada' using errcode = '22023';
  end if;
  if exists (select 1 from r_players where id is null) or exists (select 1 from r_rounds where id is null)
     or exists (select 1 from r_pairs where id is null) or exists (select 1 from r_groups where id is null)
     or exists (select 1 from r_teams where id is null)
     or exists (select 1 from r_calcutta_lots where id is null) then
    raise exception 'El respaldo está incompleto (filas sin id)' using errcode = '22023';
  end if;
  -- One call is one decision (paid, flagged and voided whole): a row with no
  -- call would come back as a call of its own, splitting a refund. The export
  -- always carries it, so a backup without it was edited: refused.
  if exists (select 1 from r_money_adjustments where call_id is null) then
    raise exception 'El respaldo trae decisiones del Comité incompletas; no se restauró nada' using errcode = '22023';
  end if;
  -- References: everything points at rows the backup also carries (and, by the
  -- check above, those are this tournament's or new).
  if exists (select 1 from r_groups g where not exists (select 1 from r_rounds r where r.id = g.round_id))
     or exists (select 1 from r_group_members m where not exists (select 1 from r_groups g where g.id = m.group_id) or not exists (select 1 from r_players p where p.id = m.player_id))
     or exists (select 1 from r_round_tees x where not exists (select 1 from r_rounds r where r.id = x.round_id) or not exists (select 1 from r_players p where p.id = x.player_id))
     or exists (select 1 from r_scores s where not exists (select 1 from r_rounds r where r.id = s.round_id) or not exists (select 1 from r_players p where p.id = s.player_id))
     or exists (select 1 from r_snake_tiebreaks x where not exists (select 1 from r_rounds r where r.id = x.round_id) or not exists (select 1 from r_groups g where g.id = x.group_id) or not exists (select 1 from r_players p where p.id = x.last_holed_player_id))
     or exists (select 1 from r_card_signatures x where not exists (select 1 from r_rounds r where r.id = x.round_id) or not exists (select 1 from r_pairs p where p.id = x.pair_id))
     or exists (select 1 from r_handicap_overrides x where not exists (select 1 from r_rounds r where r.id = x.round_id) or not exists (select 1 from r_players p where p.id = x.player_id))
     or exists (select 1 from r_pairs x where not exists (select 1 from r_players p where p.id = x.player1_id) or not exists (select 1 from r_players p where p.id = x.player2_id))
     or exists (select 1 from r_team_members x where not exists (select 1 from r_teams tm where tm.id = x.team_id) or not exists (select 1 from r_players p where p.id = x.player_id))
     or exists (select 1 from r_calcutta_lots x where not exists (select 1 from r_players p where p.id = x.player_id) or (x.owner_id is not null and not exists (select 1 from r_players p where p.id = x.owner_id)))
     or exists (select 1 from r_calcutta_bids x where not exists (select 1 from r_calcutta_lots l where l.id = x.lot_id) or not exists (select 1 from r_players p where p.id = x.bidder_id))
     or exists (select 1 from r_calcutta_buybacks x where not exists (select 1 from r_calcutta_lots l where l.id = x.lot_id))
     or exists (select 1 from r_payments x where (x.from_player_id is not null and not exists (select 1 from r_players p where p.id = x.from_player_id)) or (x.to_player_id is not null and not exists (select 1 from r_players p where p.id = x.to_player_id)))
     or exists (select 1 from r_money_adjustments x where x.to_player_id is not null and not exists (select 1 from r_players p where p.id = x.to_player_id))
     or exists (select 1 from r_game_entries x where not exists (select 1 from r_players p where p.id = x.player_id))
     or exists (select 1 from r_game_results x where not exists (select 1 from r_players p where p.id = x.player_id))
     or exists (select 1 from r_hole_awards x where not exists (select 1 from r_rounds r where r.id = x.round_id) or not exists (select 1 from r_players p where p.id = x.player_id) or (x.group_id is not null and not exists (select 1 from r_groups g where g.id = x.group_id))) then
    raise exception 'El respaldo está incompleto: hay filas que apuntan a datos que no trae' using errcode = '22023';
  end if;

  -- Defaults for columns older backups did not have; courses are not restored, so drop dangling tee refs.
  update r_scores set id = gen_random_uuid() where id is null;
  -- (the API session runs with safeupdate: every UPDATE/DELETE needs a WHERE)
  update r_scores set disputed = false, previous = null, reason = null, picked_up = coalesce(picked_up, false), updated_at = coalesce(updated_at, now()) where true;
  update r_players set default_tee_id = null where default_tee_id is not null and not exists (select 1 from public.tees t where t.id = r_players.default_tee_id);
  update r_rounds set course_id = null where course_id is not null and not exists (select 1 from public.courses c where c.id = r_rounds.course_id);
  delete from r_round_tees where not exists (select 1 from public.tees t where t.id = r_round_tees.tee_id);
  update r_scores set entered_by = null where entered_by is not null and not exists (select 1 from r_players p where p.id = r_scores.entered_by);
  update r_snake_tiebreaks set decided_by = null where decided_by is not null and not exists (select 1 from r_players p where p.id = r_snake_tiebreaks.decided_by);
  update r_card_signatures set signed_by = null where signed_by is not null and not exists (select 1 from r_players p where p.id = r_card_signatures.signed_by);
  update r_handicap_overrides set "by" = null where "by" is not null and not exists (select 1 from r_players p where p.id = r_handicap_overrides."by");
  update r_hole_awards set decided_by = null where decided_by is not null and not exists (select 1 from r_players p where p.id = r_hole_awards.decided_by);

  -- Wipe dependents (players and rounds are upserted so PINs and device links survive).
  update public.tournaments set current_round_id = null, banker_player_id = null where id = p_tournament_id;
  delete from public.payments where tournament_id = p_tournament_id;
  delete from public.money_adjustments where tournament_id = p_tournament_id;
  delete from public.calcutta_lots where tournament_id = p_tournament_id;
  delete from public.card_signatures where round_id in (select id from public.rounds where tournament_id = p_tournament_id);
  delete from public.handicap_overrides where round_id in (select id from public.rounds where tournament_id = p_tournament_id);
  delete from public.snake_tiebreaks where round_id in (select id from public.rounds where tournament_id = p_tournament_id);
  delete from public.scores where round_id in (select id from public.rounds where tournament_id = p_tournament_id);
  delete from public.round_tees where round_id in (select id from public.rounds where tournament_id = p_tournament_id);
  delete from public.game_entries where tournament_id = p_tournament_id;
  delete from public.game_results where tournament_id = p_tournament_id;
  delete from public.hole_awards where round_id in (select id from public.rounds where tournament_id = p_tournament_id);
  delete from public.groups where round_id in (select id from public.rounds where tournament_id = p_tournament_id);
  delete from public.pairs where tournament_id = p_tournament_id;
  delete from public.teams where tournament_id = p_tournament_id;

  insert into public.players (id, tournament_id, full_name, display_name, tier, base_hcp, handicap_source, handicap_index, estimate_inputs, default_tee_id, is_honoree, is_admin, avatar_url, form_guide, sort_order, created_at)
  select id, p_tournament_id, full_name, display_name, tier, coalesce(base_hcp, 18), coalesce(handicap_source, 'manual'), handicap_index, estimate_inputs, default_tee_id, coalesce(is_honoree, false), coalesce(is_admin, false), avatar_url, form_guide, coalesce(sort_order, 0), coalesce(created_at, now())
  from r_players
  on conflict (id) do update set
    full_name = excluded.full_name, display_name = excluded.display_name, tier = excluded.tier, base_hcp = excluded.base_hcp,
    handicap_source = excluded.handicap_source, handicap_index = excluded.handicap_index, estimate_inputs = excluded.estimate_inputs,
    default_tee_id = excluded.default_tee_id, is_honoree = excluded.is_honoree, is_admin = excluded.is_admin, avatar_url = excluded.avatar_url,
    form_guide = excluded.form_guide, sort_order = excluded.sort_order;
  delete from public.players where tournament_id = p_tournament_id and not exists (select 1 from r_players r where r.id = players.id);

  update public.rounds set number = number + 1000 where tournament_id = p_tournament_id;
  insert into public.rounds (id, tournament_id, number, date, course_id, holes, status)
  select id, p_tournament_id, number, date, course_id, coalesce(holes, 18), coalesce(status, 'scheduled') from r_rounds
  on conflict (id) do update set number = excluded.number, date = excluded.date, course_id = excluded.course_id, holes = excluded.holes, status = excluded.status;
  delete from public.rounds where tournament_id = p_tournament_id and not exists (select 1 from r_rounds r where r.id = rounds.id);

  insert into public.groups (id, tournament_id, round_id, number, tee_time, start_hole) select id, p_tournament_id, round_id, number, tee_time, coalesce(start_hole, 1) from r_groups;
  insert into public.group_members (group_id, player_id, tournament_id) select group_id, player_id, p_tournament_id from r_group_members on conflict do nothing;
  insert into public.round_tees (round_id, player_id, tee_id, tournament_id) select round_id, player_id, tee_id, p_tournament_id from r_round_tees on conflict do nothing;
  insert into public.pairs (id, tournament_id, name, player1_id, player2_id, kind, picked_by_honoree, drawn_at)
  select id, p_tournament_id, name, player1_id, player2_id, kind, coalesce(picked_by_honoree, false), drawn_at from r_pairs;
  insert into public.teams (id, tournament_id, name, number, drawn_at)
  select id, p_tournament_id, name, coalesce(number, 1), drawn_at from r_teams;
  insert into public.team_members (team_id, player_id, tournament_id)
  select team_id, player_id, p_tournament_id from r_team_members on conflict do nothing;
  insert into public.scores (id, tournament_id, round_id, player_id, hole, strokes, putts, picked_up, entered_by, client_ts, updated_at, disputed, previous, reason)
  select id, p_tournament_id, round_id, player_id, hole, strokes, putts, picked_up, entered_by, client_ts, updated_at, false, null, null from r_scores;
  insert into public.snake_tiebreaks (tournament_id, round_id, group_id, hole, last_holed_player_id, decided_by, created_at)
  select p_tournament_id, round_id, group_id, hole, last_holed_player_id, decided_by, coalesce(created_at, now()) from r_snake_tiebreaks on conflict do nothing;
  insert into public.card_signatures (tournament_id, round_id, pair_id, signed_by, signed_at)
  select p_tournament_id, round_id, pair_id, signed_by, coalesce(signed_at, now()) from r_card_signatures on conflict do nothing;
  insert into public.handicap_overrides (tournament_id, round_id, player_id, playing_hcp, reason, "by", at)
  select p_tournament_id, round_id, player_id, playing_hcp, reason, "by", coalesce(at, now()) from r_handicap_overrides on conflict do nothing;
  insert into public.calcutta_lots (id, tournament_id, player_id, lot_number, status, price, owner_id, sold_at)
  select id, p_tournament_id, player_id, lot_number, coalesce(status, 'pending'), price, owner_id, sold_at from r_calcutta_lots;
  insert into public.calcutta_bids (id, tournament_id, lot_id, bidder_id, amount, created_at)
  select coalesce(id, gen_random_uuid()), p_tournament_id, lot_id, bidder_id, amount, coalesce(created_at, now()) from r_calcutta_bids;
  insert into public.calcutta_buybacks (lot_id, tournament_id, pct, amount, paid) select lot_id, p_tournament_id, pct, amount, coalesce(paid, false) from r_calcutta_buybacks on conflict do nothing;
  insert into public.payments (id, tournament_id, from_player_id, to_player_id, amount, kind, paid, note, created_at)
  select coalesce(id, gen_random_uuid()), p_tournament_id, from_player_id, to_player_id, amount, kind, coalesce(paid, false), note, coalesce(created_at, now()) from r_payments;
  insert into public.money_adjustments (id, tournament_id, source_key, kind, to_player_id, amount, reason, call_id, created_by, created_at, voided_at, voided_by, void_reason)
  select coalesce(id, gen_random_uuid()), p_tournament_id, source_key, kind, to_player_id, amount, reason, call_id, created_by, coalesce(created_at, now()), voided_at, voided_by, void_reason from r_money_adjustments;
  insert into public.game_entries (tournament_id, game_id, player_id, created_at)
  select p_tournament_id, game_id, player_id, coalesce(created_at, now()) from r_game_entries on conflict do nothing;
  insert into public.game_results (tournament_id, game_id, player_id, share, created_at)
  select p_tournament_id, game_id, player_id, coalesce(share, 1), coalesce(created_at, now()) from r_game_results on conflict do nothing;
  insert into public.hole_awards (tournament_id, round_id, group_id, hole, game_id, player_id, decided_by, created_at)
  select p_tournament_id, round_id, group_id, hole, game_id, player_id, decided_by, coalesce(created_at, now()) from r_hole_awards on conflict do nothing;

  -- The backup's status as it was, Terminado included: the close gate (0029) lets this one write through.
  was := coalesce(current_setting('cardi.restore', true), '');
  perform set_config('cardi.restore', '1', true);
  update public.tournaments t
  set name = coalesce(r.name, t.name), tagline = r.tagline, logo_url = r.logo_url, accent_color = r.accent_color,
      status = coalesce(r.status, t.status), settings = coalesce(r.settings, t.settings),
      timezone = coalesce(r.timezone, t.timezone), currency = coalesce(r.currency, t.currency),
      current_round_id = case when exists (select 1 from r_rounds x where x.id = r.current_round_id) then r.current_round_id end,
      banker_player_id = case when exists (select 1 from r_players x where x.id = r.banker_player_id) then r.banker_player_id end
  from r_tournaments r
  where t.id = p_tournament_id;
  perform set_config('cardi.restore', was, true);

  select count(*) into n_players from r_players;
  select count(*) into n_rounds from r_rounds;
  select count(*) into n_scores from r_scores;
  return jsonb_build_object('players', n_players, 'rounds', n_rounds, 'scores', n_scores);
end;
$$;
revoke execute on function public.restore_tournament(uuid, jsonb) from public, anon;
grant execute on function public.restore_tournament(uuid, jsonb) to authenticated, service_role;
