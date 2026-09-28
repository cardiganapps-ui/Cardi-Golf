-- Cardi-Golf · 0010 · admin data safety (audit 2026-09-28, cleanup PR 3).
-- Transactional Comité paths as RPCs, tighter policies, per-device PIN
-- lockout, Comité-only score corrections. Everything here is additive for
-- the running bundle except the score column grants (deploy right after).

-- ---------------------------------------------------------------------------
-- 1. Roles
-- ---------------------------------------------------------------------------
create or replace function public.is_tournament_owner(tid uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.tournament_organizers o
    where o.tournament_id = tid and o.auth_user_id = auth.uid() and o.role = 'owner'
  )
$$;

-- A linked player flagged is_admin (any tournament).
create or replace function public.is_admin_player()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.device_sessions d
    join public.players p on p.id = d.player_id
    where d.auth_user_id = auth.uid() and p.is_admin
  )
$$;

-- An email account (never an anonymous device).
create or replace function public.is_account_user(uid uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from auth.users u where u.id = uid and coalesce(u.is_anonymous, false) = false)
$$;

-- owner | admin (account roles) | member (linked device) | none.
create or replace function public.my_tournament_role(tid uuid)
returns text
language sql stable security definer
set search_path = public
as $$
  select case
    when exists (select 1 from public.tournament_organizers o where o.tournament_id = tid and o.auth_user_id = auth.uid() and o.role = 'owner') then 'owner'
    when exists (select 1 from public.tournament_organizers o where o.tournament_id = tid and o.auth_user_id = auth.uid()) then 'admin'
    when exists (select 1 from public.device_sessions d where d.auth_user_id = auth.uid() and d.tournament_id = tid) then 'member'
    else 'none'
  end
$$;

drop policy if exists tournament_organizers_read on public.tournament_organizers;
create policy tournament_organizers_read on public.tournament_organizers for select
  using (auth_user_id = auth.uid());
drop policy if exists tournament_organizers_write on public.tournament_organizers;
create policy tournament_organizers_write on public.tournament_organizers for all
  using (public.is_tournament_owner(tournament_id))
  with check (public.is_tournament_owner(tournament_id) and public.is_account_user(auth_user_id));

-- ---------------------------------------------------------------------------
-- 2. Groups: upsert in place so tiebreak answers and ids survive an edit
-- ---------------------------------------------------------------------------
alter table public.groups drop constraint groups_round_id_number_key;
alter table public.groups add constraint groups_round_id_number_key unique (round_id, number) deferrable initially immediate;

-- p_groups: [{ id?, number, tee_time?, start_hole?, player_ids: [] }]
create or replace function public.upsert_groups(p_round_id uuid, p_groups jsonb)
returns jsonb
language plpgsql volatile security definer
set search_path = public
as $$
declare
  tid uuid;
  g jsonb;
  gid uuid;
  members uuid[];
  kept uuid[] := '{}';
  result jsonb := '[]'::jsonb;
begin
  tid := public.round_tournament_id(p_round_id);
  if tid is null or not public.is_tournament_organizer(tid) then
    raise exception 'Solo el Comité puede cambiar los grupos' using errcode = '42501';
  end if;
  if p_groups is null or jsonb_typeof(p_groups) <> 'array' then
    raise exception 'Grupos inválidos' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_groups) x, jsonb_array_elements_text(coalesce(x -> 'player_ids', '[]'::jsonb)) pid
    left join public.players p on p.id = pid::uuid and p.tournament_id = tid
    where p.id is null
  ) then
    raise exception 'Hay un jugador que no es de este torneo' using errcode = '22023';
  end if;
  if (
    select count(*) - count(distinct pid)
    from jsonb_array_elements(p_groups) x, jsonb_array_elements_text(coalesce(x -> 'player_ids', '[]'::jsonb)) pid
  ) > 0 then
    raise exception 'Un jugador está en dos grupos' using errcode = '22023';
  end if;
  if (select count(*) - count(distinct (x ->> 'number')::int) from jsonb_array_elements(p_groups) x) > 0 then
    raise exception 'Dos grupos con el mismo número' using errcode = '22023';
  end if;

  set constraints public.groups_round_id_number_key deferred;
  for g in select * from jsonb_array_elements(p_groups) loop
    members := array(select v::uuid from jsonb_array_elements_text(coalesce(g -> 'player_ids', '[]'::jsonb)) v);
    gid := null;
    if (g ->> 'id') is not null then
      select id into gid from public.groups where id = (g ->> 'id')::uuid and round_id = p_round_id and not (id = any(kept));
    end if;
    if gid is null and cardinality(members) > 0 then
      -- No id: the existing group that keeps a strict majority of these members is the same group.
      select gr.id into gid
      from public.groups gr
      where gr.round_id = p_round_id and not (gr.id = any(kept))
        and (select count(*) from public.group_members m where m.group_id = gr.id and m.player_id = any(members)) * 2 > cardinality(members)
      order by (select count(*) from public.group_members m where m.group_id = gr.id and m.player_id = any(members)) desc, gr.number
      limit 1;
    end if;
    if gid is null then
      insert into public.groups (round_id, number, tee_time, start_hole)
      values (p_round_id, (g ->> 'number')::int, nullif(g ->> 'tee_time', '')::time, coalesce((g ->> 'start_hole')::int, 1))
      returning id into gid;
    else
      update public.groups
      set number = (g ->> 'number')::int, tee_time = nullif(g ->> 'tee_time', '')::time, start_hole = coalesce((g ->> 'start_hole')::int, 1)
      where id = gid;
    end if;
    kept := kept || gid;
    delete from public.group_members m where m.group_id = gid and not (m.player_id = any(members));
    insert into public.group_members (group_id, player_id) select gid, x from unnest(members) x on conflict do nothing;
    -- An answer naming someone who left the group is void.
    delete from public.snake_tiebreaks tb where tb.group_id = gid and not (tb.last_holed_player_id = any(members));
    result := result || jsonb_build_object('number', (g ->> 'number')::int, 'id', gid);
  end loop;
  delete from public.groups where round_id = p_round_id and not (id = any(kept));
  return result;
end;
$$;
revoke execute on function public.upsert_groups(uuid, jsonb) from public, anon;
grant execute on function public.upsert_groups(uuid, jsonb) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Restore a backup of the same tournament in one transaction
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

  -- Tenant: every row of the backup belongs to this tournament.
  if exists (select 1 from r_tournaments where id is distinct from p_tournament_id)
     or exists (select 1 from r_players where tournament_id is distinct from p_tournament_id)
     or exists (select 1 from r_rounds where tournament_id is distinct from p_tournament_id)
     or exists (select 1 from r_pairs where tournament_id is distinct from p_tournament_id)
     or exists (select 1 from r_calcutta_lots where tournament_id is distinct from p_tournament_id)
     or exists (select 1 from r_payments where tournament_id is distinct from p_tournament_id) then
    raise exception 'El respaldo tiene filas de otro torneo' using errcode = '22023';
  end if;
  if exists (select 1 from r_players where id is null) or exists (select 1 from r_rounds where id is null)
     or exists (select 1 from r_pairs where id is null) or exists (select 1 from r_groups where id is null)
     or exists (select 1 from r_calcutta_lots where id is null) then
    raise exception 'El respaldo está incompleto (filas sin id)' using errcode = '22023';
  end if;
  -- References: everything points at rows the backup also carries.
  if exists (select 1 from r_groups g where not exists (select 1 from r_rounds r where r.id = g.round_id))
     or exists (select 1 from r_group_members m where not exists (select 1 from r_groups g where g.id = m.group_id) or not exists (select 1 from r_players p where p.id = m.player_id))
     or exists (select 1 from r_round_tees x where not exists (select 1 from r_rounds r where r.id = x.round_id) or not exists (select 1 from r_players p where p.id = x.player_id))
     or exists (select 1 from r_scores s where not exists (select 1 from r_rounds r where r.id = s.round_id) or not exists (select 1 from r_players p where p.id = s.player_id))
     or exists (select 1 from r_snake_tiebreaks x where not exists (select 1 from r_rounds r where r.id = x.round_id) or not exists (select 1 from r_groups g where g.id = x.group_id) or not exists (select 1 from r_players p where p.id = x.last_holed_player_id))
     or exists (select 1 from r_card_signatures x where not exists (select 1 from r_rounds r where r.id = x.round_id) or not exists (select 1 from r_pairs p where p.id = x.pair_id))
     or exists (select 1 from r_handicap_overrides x where not exists (select 1 from r_rounds r where r.id = x.round_id) or not exists (select 1 from r_players p where p.id = x.player_id))
     or exists (select 1 from r_pairs x where not exists (select 1 from r_players p where p.id = x.player1_id) or not exists (select 1 from r_players p where p.id = x.player2_id))
     or exists (select 1 from r_calcutta_lots x where not exists (select 1 from r_players p where p.id = x.player_id) or (x.owner_id is not null and not exists (select 1 from r_players p where p.id = x.owner_id)))
     or exists (select 1 from r_calcutta_bids x where not exists (select 1 from r_calcutta_lots l where l.id = x.lot_id) or not exists (select 1 from r_players p where p.id = x.bidder_id))
     or exists (select 1 from r_calcutta_buybacks x where not exists (select 1 from r_calcutta_lots l where l.id = x.lot_id))
     or exists (select 1 from r_payments x where (x.from_player_id is not null and not exists (select 1 from r_players p where p.id = x.from_player_id)) or (x.to_player_id is not null and not exists (select 1 from r_players p where p.id = x.to_player_id))) then
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

  -- Wipe dependents (players and rounds are upserted so PINs and device links survive).
  update public.tournaments set current_round_id = null, banker_player_id = null where id = p_tournament_id;
  delete from public.payments where tournament_id = p_tournament_id;
  delete from public.calcutta_lots where tournament_id = p_tournament_id;
  delete from public.card_signatures where round_id in (select id from public.rounds where tournament_id = p_tournament_id);
  delete from public.handicap_overrides where round_id in (select id from public.rounds where tournament_id = p_tournament_id);
  delete from public.snake_tiebreaks where round_id in (select id from public.rounds where tournament_id = p_tournament_id);
  delete from public.scores where round_id in (select id from public.rounds where tournament_id = p_tournament_id);
  delete from public.round_tees where round_id in (select id from public.rounds where tournament_id = p_tournament_id);
  delete from public.groups where round_id in (select id from public.rounds where tournament_id = p_tournament_id);
  delete from public.pairs where tournament_id = p_tournament_id;

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

  insert into public.groups (id, round_id, number, tee_time, start_hole) select id, round_id, number, tee_time, coalesce(start_hole, 1) from r_groups;
  insert into public.group_members (group_id, player_id) select group_id, player_id from r_group_members on conflict do nothing;
  insert into public.round_tees (round_id, player_id, tee_id) select round_id, player_id, tee_id from r_round_tees on conflict do nothing;
  insert into public.pairs (id, tournament_id, name, player1_id, player2_id, kind, picked_by_honoree, drawn_at)
  select id, p_tournament_id, name, player1_id, player2_id, kind, coalesce(picked_by_honoree, false), drawn_at from r_pairs;
  insert into public.scores (id, round_id, player_id, hole, strokes, putts, picked_up, entered_by, client_ts, updated_at, disputed, previous, reason)
  select id, round_id, player_id, hole, strokes, putts, picked_up, entered_by, client_ts, updated_at, false, null, null from r_scores;
  insert into public.snake_tiebreaks (round_id, group_id, hole, last_holed_player_id, decided_by, created_at)
  select round_id, group_id, hole, last_holed_player_id, decided_by, coalesce(created_at, now()) from r_snake_tiebreaks on conflict do nothing;
  insert into public.card_signatures (round_id, pair_id, signed_by, signed_at)
  select round_id, pair_id, signed_by, coalesce(signed_at, now()) from r_card_signatures on conflict do nothing;
  insert into public.handicap_overrides (round_id, player_id, playing_hcp, reason, "by", at)
  select round_id, player_id, playing_hcp, reason, "by", coalesce(at, now()) from r_handicap_overrides on conflict do nothing;
  insert into public.calcutta_lots (id, tournament_id, player_id, lot_number, status, price, owner_id, sold_at)
  select id, p_tournament_id, player_id, lot_number, coalesce(status, 'pending'), price, owner_id, sold_at from r_calcutta_lots;
  insert into public.calcutta_bids (id, lot_id, bidder_id, amount, created_at)
  select coalesce(id, gen_random_uuid()), lot_id, bidder_id, amount, coalesce(created_at, now()) from r_calcutta_bids;
  insert into public.calcutta_buybacks (lot_id, pct, amount, paid) select lot_id, pct, amount, coalesce(paid, false) from r_calcutta_buybacks on conflict do nothing;
  insert into public.payments (id, tournament_id, from_player_id, to_player_id, amount, kind, paid, note, created_at)
  select coalesce(id, gen_random_uuid()), p_tournament_id, from_player_id, to_player_id, amount, kind, coalesce(paid, false), note, coalesce(created_at, now()) from r_payments;

  update public.tournaments t
  set name = coalesce(r.name, t.name), tagline = r.tagline, logo_url = r.logo_url, accent_color = r.accent_color,
      status = coalesce(r.status, t.status), settings = coalesce(r.settings, t.settings),
      timezone = coalesce(r.timezone, t.timezone), currency = coalesce(r.currency, t.currency),
      current_round_id = case when exists (select 1 from r_rounds x where x.id = r.current_round_id) then r.current_round_id end,
      banker_player_id = case when exists (select 1 from r_players x where x.id = r.banker_player_id) then r.banker_player_id end
  from r_tournaments r
  where t.id = p_tournament_id;

  select count(*) into n_players from r_players;
  select count(*) into n_rounds from r_rounds;
  select count(*) into n_scores from r_scores;
  return jsonb_build_object('players', n_players, 'rounds', n_rounds, 'scores', n_scores);
end;
$$;
revoke execute on function public.restore_tournament(uuid, jsonb) from public, anon;
grant execute on function public.restore_tournament(uuid, jsonb) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Payments: one row per (tournament, kind, from, to)
-- ---------------------------------------------------------------------------
update public.payments p
set paid = true
where not p.paid and exists (
  select 1 from public.payments q
  where q.tournament_id = p.tournament_id and q.kind = p.kind
    and q.from_player_id is not distinct from p.from_player_id and q.to_player_id is not distinct from p.to_player_id and q.paid
);
delete from public.payments p
where exists (
  select 1 from public.payments q
  where q.tournament_id = p.tournament_id and q.kind = p.kind
    and q.from_player_id is not distinct from p.from_player_id and q.to_player_id is not distinct from p.to_player_id
    and (q.created_at > p.created_at or (q.created_at = p.created_at and q.id > p.id))
);
alter table public.payments add constraint payments_flow_key unique nulls not distinct (tournament_id, kind, from_player_id, to_player_id);

create or replace function public.set_payment_paid(p_tournament_id uuid, p_kind text, p_from uuid, p_to uuid, p_amount integer, p_paid boolean, p_note text default null)
returns void
language plpgsql volatile security definer
set search_path = public
as $$
begin
  if not public.is_tournament_organizer(p_tournament_id) then
    raise exception 'Solo el Comité puede marcar pagos' using errcode = '42501';
  end if;
  if (p_from is not null and public.player_tournament_id(p_from) is distinct from p_tournament_id)
     or (p_to is not null and public.player_tournament_id(p_to) is distinct from p_tournament_id) then
    raise exception 'Ese jugador no es de este torneo' using errcode = '22023';
  end if;
  insert into public.payments (tournament_id, kind, from_player_id, to_player_id, amount, paid, note)
  values (p_tournament_id, p_kind, p_from, p_to, p_amount, p_paid, p_note)
  on conflict on constraint payments_flow_key do update set paid = excluded.paid, amount = excluded.amount, note = excluded.note;
end;
$$;
revoke execute on function public.set_payment_paid(uuid, text, uuid, uuid, integer, boolean, text) from public, anon;
grant execute on function public.set_payment_paid(uuid, text, uuid, uuid, integer, boolean, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. PIN lockout per device (5 / 5 min) before the player lock (15 / 15 min)
-- ---------------------------------------------------------------------------
create table if not exists public.pin_attempts (
  auth_user_id uuid primary key references auth.users (id) on delete cascade,
  failed_attempts integer not null default 0,
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.pin_attempts enable row level security;
revoke all on public.pin_attempts from anon, authenticated;

create or replace function public.claim_player(p_player_id uuid, p_pin text)
returns jsonb
language plpgsql volatile security definer
set search_path = public, extensions
as $$
declare
  pp public.player_pins;
  pl public.players;
  dev public.pin_attempts;
  dev_max constant int := 5;
  dev_lock constant interval := interval '5 minutes';
  pl_max constant int := 15;
  pl_lock constant interval := interval '15 minutes';
begin
  if auth.uid() is null then
    raise exception 'Sin sesión' using errcode = '42501';
  end if;
  insert into public.pin_attempts (auth_user_id) values (auth.uid()) on conflict (auth_user_id) do nothing;
  select * into dev from public.pin_attempts where auth_user_id = auth.uid() for update;
  if dev.locked_until is not null and dev.locked_until <= now() then
    update public.pin_attempts set failed_attempts = 0, locked_until = null, updated_at = now() where auth_user_id = auth.uid();
    dev.failed_attempts := 0;
    dev.locked_until := null;
  end if;
  if dev.locked_until is not null and dev.locked_until > now() then
    return jsonb_build_object('ok', false, 'reason', 'locked', 'lockedUntil', dev.locked_until);
  end if;

  select * into pl from public.players where id = p_player_id;
  if pl.id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  select * into pp from public.player_pins where player_id = p_player_id for update;
  if pp.player_id is null then
    return jsonb_build_object('ok', false, 'reason', 'no_pin');
  end if;
  if pp.locked_until is not null and pp.locked_until <= now() then
    update public.player_pins set failed_attempts = 0, locked_until = null where player_id = p_player_id;
    pp.failed_attempts := 0;
    pp.locked_until := null;
  end if;
  if pp.locked_until is not null and pp.locked_until > now() then
    return jsonb_build_object('ok', false, 'reason', 'locked', 'lockedUntil', pp.locked_until);
  end if;

  if pp.pin_hash = crypt(p_pin, pp.pin_hash) then
    update public.player_pins set failed_attempts = 0, locked_until = null where player_id = p_player_id;
    update public.pin_attempts set failed_attempts = 0, locked_until = null, updated_at = now() where auth_user_id = auth.uid();
    insert into public.device_sessions (auth_user_id, player_id, tournament_id)
    values (auth.uid(), pl.id, pl.tournament_id)
    on conflict (auth_user_id) do update set player_id = excluded.player_id, tournament_id = excluded.tournament_id, created_at = now();
    return jsonb_build_object('ok', true, 'playerId', pl.id, 'tournamentId', pl.tournament_id);
  end if;

  update public.pin_attempts
  set failed_attempts = dev.failed_attempts + 1,
      locked_until = case when dev.failed_attempts + 1 >= dev_max then now() + dev_lock end,
      updated_at = now()
  where auth_user_id = auth.uid();
  update public.player_pins
  set failed_attempts = pp.failed_attempts + 1,
      locked_until = case when pp.failed_attempts + 1 >= pl_max then now() + pl_lock end
  where player_id = p_player_id;
  if pp.failed_attempts + 1 >= pl_max then
    return jsonb_build_object('ok', false, 'reason', 'locked', 'lockedUntil', now() + pl_lock);
  end if;
  if dev.failed_attempts + 1 >= dev_max then
    return jsonb_build_object('ok', false, 'reason', 'locked', 'lockedUntil', now() + dev_lock);
  end if;
  return jsonb_build_object('ok', false, 'reason', 'wrong_pin', 'attemptsLeft', least(dev_max - (dev.failed_attempts + 1), pl_max - (pp.failed_attempts + 1)));
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Scores: Comité corrections through RPCs; players write only the card
-- ---------------------------------------------------------------------------
-- The Comité RPCs mark their transaction; the trigger trusts only that mark.
create or replace function public.scores_detect_dispute()
returns trigger
language plpgsql
as $$
begin
  if coalesce(current_setting('cardi.comite', true), '') = '1' then
    new.disputed := false;
    new.previous := null;
    return new;
  end if;
  -- Everyone else: no reason, and the flags are not theirs to set. A different
  -- device (or anyone after a Comité correction, which carries a reason and
  -- may have no device) changing the values is a discrepancy.
  new.reason := null;
  new.disputed := old.disputed;
  new.previous := old.previous;
  if (new.strokes is distinct from old.strokes or new.putts is distinct from old.putts or new.picked_up <> old.picked_up)
     and new.entered_by is not null and new.entered_by is distinct from old.entered_by
     and (old.entered_by is not null or old.reason is not null) then
    new.disputed := true;
    new.previous := jsonb_build_object('strokes', old.strokes, 'putts', old.putts, 'picked_up', old.picked_up,
                                       'entered_by', old.entered_by, 'updated_at', old.updated_at);
  end if;
  return new;
end;
$$;

-- A player's insert never carries a reason or flags either.
create or replace function public.scores_clean_insert()
returns trigger
language plpgsql
as $$
begin
  if coalesce(current_setting('cardi.comite', true), '') <> '1' then
    new.reason := null;
    new.disputed := false;
    new.previous := null;
  end if;
  return new;
end;
$$;
drop trigger if exists scores_clean_insert on public.scores;
create trigger scores_clean_insert before insert on public.scores
  for each row execute function public.scores_clean_insert();

revoke insert, update on public.scores from authenticated;
grant insert (id, round_id, player_id, hole, strokes, putts, picked_up, entered_by, client_ts) on public.scores to authenticated;
grant update (round_id, player_id, hole, strokes, putts, picked_up, entered_by, client_ts) on public.scores to authenticated;

create or replace function public.admin_save_score(p_round_id uuid, p_player_id uuid, p_hole integer, p_strokes integer, p_putts integer, p_picked_up boolean, p_reason text default null)
returns void
language plpgsql volatile security definer
set search_path = public
as $$
declare
  tid uuid;
  r text;
begin
  tid := public.round_tournament_id(p_round_id);
  if tid is null or not public.is_tournament_organizer(tid) then
    raise exception 'Solo el Comité puede corregir tarjetas' using errcode = '42501';
  end if;
  if public.player_tournament_id(p_player_id) is distinct from tid then
    raise exception 'Ese jugador no es de este torneo' using errcode = '22023';
  end if;
  r := nullif(btrim(coalesce(p_reason, '')), '');
  if public.card_is_signed(p_round_id, p_player_id) and (r is null or length(r) < 3) then
    raise exception 'La tarjeta está firmada: la corrección necesita razón' using errcode = '22023';
  end if;
  if not p_picked_up and (p_strokes is null or p_strokes < 1 or p_strokes > 15) then
    raise exception 'Los golpes van de 1 a 15' using errcode = '22023';
  end if;
  if p_putts is not null and (p_putts < 0 or p_putts > 15 or (not p_picked_up and p_putts > p_strokes)) then
    raise exception 'Los putts no pueden ser más que los golpes' using errcode = '22023';
  end if;
  perform set_config('cardi.comite', '1', true);
  insert into public.scores (round_id, player_id, hole, strokes, putts, picked_up, entered_by, client_ts, reason, disputed, previous)
  values (p_round_id, p_player_id, p_hole, case when p_picked_up then null else p_strokes end, p_putts, p_picked_up, public.current_player_id(), now(), coalesce(r, 'Corrección del Comité'), false, null)
  on conflict (round_id, player_id, hole) do update
    set strokes = excluded.strokes, putts = excluded.putts, picked_up = excluded.picked_up, entered_by = excluded.entered_by,
        client_ts = excluded.client_ts, reason = excluded.reason, disputed = false, previous = null;
end;
$$;
revoke execute on function public.admin_save_score(uuid, uuid, integer, integer, integer, boolean, text) from public, anon;
grant execute on function public.admin_save_score(uuid, uuid, integer, integer, integer, boolean, text) to authenticated, service_role;

-- keep = true: current values stand; false: the previous values come back.
create or replace function public.resolve_score_dispute(p_round_id uuid, p_player_id uuid, p_hole integer, p_keep boolean default true)
returns void
language plpgsql volatile security definer
set search_path = public
as $$
declare
  tid uuid;
  s public.scores;
begin
  tid := public.round_tournament_id(p_round_id);
  if tid is null or not public.is_tournament_organizer(tid) then
    raise exception 'Solo el Comité puede resolver discrepancias' using errcode = '42501';
  end if;
  select * into s from public.scores where round_id = p_round_id and player_id = p_player_id and hole = p_hole for update;
  if s.id is null then
    raise exception 'Ese hoyo no tiene captura' using errcode = '22023';
  end if;
  perform set_config('cardi.comite', '1', true);
  if p_keep or s.previous is null then
    update public.scores set disputed = false, previous = null, reason = 'Discrepancia: se conserva el valor actual' where id = s.id;
  else
    update public.scores
    set strokes = (s.previous ->> 'strokes')::int, putts = (s.previous ->> 'putts')::int, picked_up = coalesce((s.previous ->> 'picked_up')::boolean, false),
        entered_by = public.current_player_id(), client_ts = now(), disputed = false, previous = null,
        reason = 'Discrepancia: se restaura el valor anterior'
    where id = s.id;
  end if;
end;
$$;
revoke execute on function public.resolve_score_dispute(uuid, uuid, integer, boolean) from public, anon;
grant execute on function public.resolve_score_dispute(uuid, uuid, integer, boolean) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 7. Courses: admin players may create; delete guarded; tees in use stay
-- ---------------------------------------------------------------------------
create or replace function public.can_manage_courses()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select auth.uid() is not null and (not coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) or public.is_admin_player())
$$;

alter table public.courses alter column created_by set default auth.uid();
drop policy if exists courses_insert on public.courses;
create policy courses_insert on public.courses for insert with check (public.can_manage_courses());

drop policy if exists assets_member_write on storage.objects;
create policy assets_member_write on storage.objects for insert
  with check (
    bucket_id = 'tournament-assets' and auth.uid() is not null and (
      (split_part(name, '/', 1) = 'courses' and public.can_manage_courses())
      or public.is_tournament_member(nullif(split_part(name, '/', 1), '')::uuid)
    )
  );

create or replace function public.delete_course(p_course_id uuid)
returns void
language plpgsql volatile security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.courses where id = p_course_id) then
    raise exception 'Ese campo ya no existe' using errcode = '22023';
  end if;
  if not exists (select 1 from public.courses where id = p_course_id and created_by = auth.uid()) then
    raise exception 'Solo quien creó el campo puede borrarlo' using errcode = '42501';
  end if;
  if exists (select 1 from public.rounds where course_id = p_course_id) then
    raise exception 'Este campo está en uso en una ronda; quítalo de la ronda primero' using errcode = '22023';
  end if;
  delete from public.courses where id = p_course_id;
end;
$$;
revoke execute on function public.delete_course(uuid) from public, anon;
grant execute on function public.delete_course(uuid) to authenticated, service_role;

create or replace function public.tees_guard_delete()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.round_tees where tee_id = old.id) then
    raise exception 'Ese tee lo juega alguien en una ronda; cámbialo primero' using errcode = '22023';
  end if;
  return old;
end;
$$;
drop trigger if exists tees_guard on public.tees;
create trigger tees_guard before delete on public.tees
  for each row execute function public.tees_guard_delete();

-- ---------------------------------------------------------------------------
-- 8. Signatures and tiebreaks: what a player may write
-- ---------------------------------------------------------------------------
drop policy if exists card_signatures_insert on public.card_signatures;
create policy card_signatures_insert on public.card_signatures for insert
  with check (
    public.is_tournament_organizer(public.round_tournament_id(round_id))
    or (
      public.round_is_live(round_id)
      and signed_by = public.current_player_id()
      and exists (
        select 1 from public.pairs p
        where p.id = pair_id and p.tournament_id = public.round_tournament_id(round_id)
          and public.shares_group(round_id, p.player1_id) and public.shares_group(round_id, p.player2_id)
          and public.current_player_id() not in (p.player1_id, p.player2_id)
      )
    )
  );

drop policy if exists snake_tiebreaks_write on public.snake_tiebreaks;
create policy snake_tiebreaks_write on public.snake_tiebreaks for all
  using (
    public.is_tournament_organizer(public.round_tournament_id(round_id))
    or exists (select 1 from public.group_members m where m.group_id = snake_tiebreaks.group_id and m.player_id = public.current_player_id())
  )
  with check (
    public.is_tournament_organizer(public.round_tournament_id(round_id))
    or (
      exists (select 1 from public.groups g where g.id = snake_tiebreaks.group_id and g.round_id = snake_tiebreaks.round_id)
      and exists (select 1 from public.group_members m where m.group_id = snake_tiebreaks.group_id and m.player_id = public.current_player_id())
      and exists (select 1 from public.group_members m where m.group_id = snake_tiebreaks.group_id and m.player_id = snake_tiebreaks.last_holed_player_id)
      and decided_by = public.current_player_id()
    )
  );

-- ---------------------------------------------------------------------------
-- 9. Hygiene: migrations table, lookup needs a session, slug trim
-- ---------------------------------------------------------------------------
alter table public._migrations enable row level security;
revoke all on public._migrations from anon, authenticated;

create or replace function public.lookup_tournament(p_code text)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  t public.tournaments;
begin
  if auth.uid() is null then
    raise exception 'Sin sesión' using errcode = '42501';
  end if;
  select * into t from public.tournaments
  where join_code = upper(trim(p_code)) or slug = lower(trim(p_code))
  limit 1;
  if t.id is null then
    return null;
  end if;
  return jsonb_build_object(
    'id', t.id,
    'slug', t.slug,
    'name', t.name,
    'tagline', t.tagline,
    'logoUrl', t.logo_url,
    'accentColor', t.accent_color,
    'status', t.status,
    'joinCode', case when public.is_tournament_member(t.id) then t.join_code end,
    'players', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'displayName', p.display_name, 'fullName', p.full_name,
        'tier', p.tier, 'avatarUrl', p.avatar_url, 'isHonoree', p.is_honoree,
        'hasPin', exists (select 1 from public.player_pins pp where pp.player_id = p.id)
      ) order by p.sort_order, p.display_name)
      from public.players p where p.tournament_id = t.id
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.create_tournament(p_name text, p_settings jsonb, p_slug text default null, p_tagline text default null)
returns public.tournaments
language plpgsql volatile security definer
set search_path = public
as $$
declare
  t public.tournaments;
  base_slug text;
  final_slug text;
  n int := 0;
begin
  if auth.uid() is null or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'Solo un organizador con cuenta puede crear torneos' using errcode = '42501';
  end if;
  p_name := btrim(coalesce(p_name, ''));
  if p_name = '' then
    raise exception 'El torneo necesita nombre' using errcode = '22023';
  end if;
  insert into public.organizers (auth_user_id, display_name)
  values (auth.uid(), coalesce(auth.jwt() -> 'user_metadata' ->> 'display_name', auth.jwt() ->> 'email'))
  on conflict (auth_user_id) do nothing;

  base_slug := coalesce(nullif(public.slugify(p_slug), ''), nullif(public.slugify(p_name), ''), 'torneo');
  base_slug := coalesce(nullif(rtrim(left(base_slug, 32), '-'), ''), 'torneo');
  final_slug := base_slug;
  while exists (select 1 from public.tournaments where slug = final_slug) loop
    n := n + 1;
    final_slug := base_slug || '-' || n;
  end loop;

  insert into public.tournaments (slug, name, tagline, join_code, settings, created_by)
  values (final_slug, p_name, nullif(btrim(coalesce(p_tagline, '')), ''), public.generate_join_code(), p_settings, auth.uid())
  returning * into t;

  insert into public.tournament_organizers (tournament_id, auth_user_id, role) values (t.id, auth.uid(), 'owner');
  return t;
end;
$$;

-- ---------------------------------------------------------------------------
-- 10. Join code rotation
-- ---------------------------------------------------------------------------
create or replace function public.rotate_join_code(p_tournament_id uuid)
returns text
language plpgsql volatile security definer
set search_path = public
as $$
declare
  code text;
begin
  if not public.is_tournament_organizer(p_tournament_id) then
    raise exception 'Solo el Comité puede cambiar el código' using errcode = '42501';
  end if;
  code := public.generate_join_code();
  update public.tournaments set join_code = code where id = p_tournament_id;
  return code;
end;
$$;
revoke execute on function public.rotate_join_code(uuid) from public, anon;
grant execute on function public.rotate_join_code(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 11. The draw: pairs + round-1 groups + status in one transaction
-- ---------------------------------------------------------------------------
-- p_pairs: [{ name?, player1_id, player2_id, kind?, picked_by_honoree? }]
-- p_round1_groups: same shape as upsert_groups, or null to leave groups alone.
create or replace function public.save_draw(p_tournament_id uuid, p_pairs jsonb, p_round1_groups jsonb default null, p_go_live boolean default false)
returns jsonb
language plpgsql volatile security definer
set search_path = public
as $$
declare
  round1 uuid;
  groups jsonb := '[]'::jsonb;
begin
  if not public.is_tournament_organizer(p_tournament_id) then
    raise exception 'Solo el Comité puede hacer el sorteo' using errcode = '42501';
  end if;
  if p_pairs is null or jsonb_typeof(p_pairs) <> 'array' then
    raise exception 'Parejas inválidas' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.card_signatures s
    join public.rounds r on r.id = s.round_id
    where r.tournament_id = p_tournament_id
  ) then
    raise exception 'Ya hay tarjetas firmadas; el sorteo no se puede rehacer' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_pairs) x
    left join public.players a on a.id = (x ->> 'player1_id')::uuid and a.tournament_id = p_tournament_id
    left join public.players b on b.id = (x ->> 'player2_id')::uuid and b.tournament_id = p_tournament_id
    where a.id is null or b.id is null or a.id = b.id
  ) then
    raise exception 'Hay una pareja con un jugador que no es de este torneo' using errcode = '22023';
  end if;

  delete from public.pairs where tournament_id = p_tournament_id;
  insert into public.pairs (tournament_id, name, player1_id, player2_id, kind, picked_by_honoree, drawn_at)
  select p_tournament_id, nullif(btrim(coalesce(x ->> 'name', '')), ''), (x ->> 'player1_id')::uuid, (x ->> 'player2_id')::uuid,
         nullif(x ->> 'kind', ''), coalesce((x ->> 'picked_by_honoree')::boolean, false), now()
  from jsonb_array_elements(p_pairs) x;

  if p_round1_groups is not null then
    select id into round1 from public.rounds where tournament_id = p_tournament_id and number = 1;
    if round1 is not null then
      groups := public.upsert_groups(round1, p_round1_groups);
    end if;
  end if;
  if p_go_live then
    update public.tournaments set status = 'live' where id = p_tournament_id and status = 'auction';
  end if;
  return jsonb_build_object('pairs', (select count(*) from public.pairs where tournament_id = p_tournament_id), 'groups', groups);
end;
$$;
revoke execute on function public.save_draw(uuid, jsonb, jsonb, boolean) from public, anon;
grant execute on function public.save_draw(uuid, jsonb, jsonb, boolean) to authenticated, service_role;
