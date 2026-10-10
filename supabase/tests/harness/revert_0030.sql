-- The way back from 0030, as a forward migration would take it (never applied
-- anywhere but the harness). supabase/tests/upgrade_0030.sh applies it after
-- 0030, followed by 0029's own restore_tournament (section 4 of
-- 0029_close_gate.sql, which this file does not repeat), and checks that the
-- policies, the functions and every row are exactly what 0029 left. If 0030
-- ever has to go, a migration made of this file plus that section is it.

-- 1. The policies as 0029 left them: per-row reads to public, FOR ALL writes.
do $$
declare
  tbl text;
  c record;
begin
  foreach tbl in array array['players', 'rounds', 'pairs', 'teams', 'team_members', 'calcutta_lots', 'payments', 'game_entries', 'game_results'] loop
    execute format('drop policy if exists %I on public.%I', tbl || '_read', tbl);
    execute format('drop policy if exists %I on public.%I', tbl || '_insert', tbl);
    execute format('drop policy if exists %I on public.%I', tbl || '_update', tbl);
    execute format('drop policy if exists %I on public.%I', tbl || '_delete', tbl);
    execute format('create policy %I on public.%I for select using (public.is_tournament_member(tournament_id))', tbl || '_read', tbl);
    if tbl in ('game_entries', 'game_results') then
      execute format('create policy %I on public.%I for all using (public.is_tournament_organizer(tournament_id)) with check (public.is_tournament_organizer(tournament_id) and public.player_tournament_id(player_id) = tournament_id)', tbl || '_write', tbl);
    else
      execute format('create policy %I on public.%I for all using (public.is_tournament_organizer(tournament_id)) with check (public.is_tournament_organizer(tournament_id))', tbl || '_write', tbl);
    end if;
  end loop;
  for c in
    select * from (values
      ('groups', 'public.round_tournament_id(round_id)', 'public.is_tournament_organizer(public.round_tournament_id(round_id))'),
      ('group_members', 'public.group_tournament_id(group_id)', 'public.is_tournament_organizer(public.group_tournament_id(group_id))'),
      ('round_tees', 'public.round_tournament_id(round_id)', 'public.is_tournament_organizer(public.round_tournament_id(round_id))'),
      ('handicap_overrides', 'public.round_tournament_id(round_id)', 'public.is_tournament_organizer(public.round_tournament_id(round_id))'),
      ('calcutta_bids', 'public.lot_tournament_id(lot_id)', 'public.is_tournament_organizer(public.lot_tournament_id(lot_id))'),
      ('calcutta_buybacks', 'public.lot_tournament_id(lot_id)', 'public.is_tournament_organizer(public.lot_tournament_id(lot_id))'),
      ('photos', 'public.round_tournament_id(round_id)', 'public.is_tournament_member(public.round_tournament_id(round_id))')
    ) v(tbl, tid, rule)
  loop
    execute format('drop policy if exists %I on public.%I', c.tbl || '_read', c.tbl);
    execute format('drop policy if exists %I on public.%I', c.tbl || '_insert', c.tbl);
    execute format('drop policy if exists %I on public.%I', c.tbl || '_update', c.tbl);
    execute format('drop policy if exists %I on public.%I', c.tbl || '_delete', c.tbl);
    execute format('create policy %I on public.%I for select using (public.is_tournament_member(%s))', c.tbl || '_read', c.tbl, c.tid);
    execute format('create policy %I on public.%I for all using (%s) with check (%s)', c.tbl || '_write', c.tbl, c.rule, c.rule);
  end loop;
end;
$$;
drop policy if exists tournaments_read on public.tournaments;
create policy tournaments_read on public.tournaments for select using (public.is_tournament_member(id));
drop policy if exists round_results_read on public.round_results;
create policy round_results_read on public.round_results for select using (public.is_tournament_member(tournament_id));
drop policy if exists money_adjustments_read on public.money_adjustments;
create policy money_adjustments_read on public.money_adjustments for select to authenticated using (public.is_tournament_member(tournament_id));
drop policy if exists scores_read on public.scores;
create policy scores_read on public.scores for select using (public.is_tournament_member(public.round_tournament_id(round_id)));
drop policy if exists card_signatures_read on public.card_signatures;
create policy card_signatures_read on public.card_signatures for select using (public.is_tournament_member(public.round_tournament_id(round_id)));

drop policy if exists snake_tiebreaks_read on public.snake_tiebreaks;
create policy snake_tiebreaks_read on public.snake_tiebreaks for select using (public.is_tournament_member(public.round_tournament_id(round_id)));
drop policy if exists snake_tiebreaks_insert on public.snake_tiebreaks;
drop policy if exists snake_tiebreaks_update on public.snake_tiebreaks;
drop policy if exists snake_tiebreaks_delete on public.snake_tiebreaks;
create policy snake_tiebreaks_write on public.snake_tiebreaks for all
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

drop policy if exists hole_awards_read on public.hole_awards;
create policy hole_awards_read on public.hole_awards for select using (public.is_tournament_member(public.round_tournament_id(round_id)));
drop policy if exists hole_awards_insert on public.hole_awards;
drop policy if exists hole_awards_update on public.hole_awards;
drop policy if exists hole_awards_delete on public.hole_awards;
create policy hole_awards_write on public.hole_awards for all
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

drop policy if exists tees_insert on public.tees;
drop policy if exists tees_update on public.tees;
drop policy if exists tees_delete on public.tees;
create policy tees_write on public.tees for all using (public.can_edit_course(course_id)) with check (public.can_edit_course(course_id));
drop policy if exists holes_insert on public.holes;
drop policy if exists holes_update on public.holes;
drop policy if exists holes_delete on public.holes;
create policy holes_write on public.holes for all
  using (public.can_edit_course((select tees.course_id from public.tees where tees.id = holes.tee_id)))
  with check (public.can_edit_course((select tees.course_id from public.tees where tees.id = holes.tee_id)));

-- 2. The columns, children before groups (group_members' key points at groups).
do $$
declare
  tbl text;
begin
  foreach tbl in array array['group_members', 'round_tees', 'scores', 'snake_tiebreaks', 'card_signatures', 'handicap_overrides',
                             'hole_awards', 'photos', 'calcutta_bids', 'calcutta_buybacks', 'groups'] loop
    execute format('drop trigger if exists %I on public.%I', tbl || '_tenant', tbl);
    execute format('alter table public.%I drop constraint if exists %I', tbl, tbl || '_tenant_fkey');
    execute format('drop index if exists public.%I', tbl || '_tenant_idx');
    if tbl = 'groups' then
      drop index if exists public.groups_tenant_uk;
    end if;
    execute format('alter table public.%I drop column if exists tournament_id', tbl);
  end loop;
end;
$$;
drop index if exists public.rounds_tenant_uk;
drop index if exists public.calcutta_lots_tenant_uk;
drop function if exists public.tenant_from_round();
drop function if exists public.tenant_from_group();
drop function if exists public.tenant_from_lot();
drop function if exists public.my_tournament_ids();
