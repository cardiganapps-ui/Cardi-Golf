-- Polo · 0027 · money the Comité assigns (MONEY-05)
--
-- The rules leave some money to «el Comité decide»: a cancelled round's
-- prizes, Calcutta places nobody fills, a pot from the inscriptions nobody
-- wins, places beyond the field, snake money held by an unanswered tiebreak,
-- a contest in dispute. The engine kept it with the bank and nothing could
-- move it, so a finished tournament showed «Por asignar» forever.
--
-- money_adjustments holds the Comité's decisions: each row gives part of one
-- unassigned bucket (`source_key`, the engine's stable id for it) to a player
-- (`award`, `refund`) or to the house (`house`), with a reason. Rows are never
-- edited or deleted by the app: a wrong one is voided (`void_adjustment`),
-- with a reason, and the money goes back to the bucket.
--
-- The server cannot know a bucket's amount (the engine computes it from the
-- whole tournament), so the client and the engine check amounts: an
-- assignment over what is left, or for a bucket that no longer exists, is
-- never paid and is flagged until it is voided. The server holds the shape,
-- the tenant, the reason and the sign.
--
--   1. The table: members read it, nobody writes it directly.
--   2. assign_unassigned(tournament, source_key, entries, reason): one
--      assignment, every row in one statement; void_adjustment(id, reason)
--      voids the assignment the row belongs to (every row its call wrote).
--   3. Audited like the other money tables, and published to Realtime.
--   4. restore_tournament carries it (0025's body plus this table).

-- ---------------------------------------------------------------------------
-- 1. The table
-- ---------------------------------------------------------------------------
create table if not exists public.money_adjustments (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  source_key text not null check (char_length(source_key) between 1 and 120),
  kind text not null check (kind in ('award', 'refund', 'house')),
  to_player_id uuid references public.players (id) on delete cascade,
  amount integer not null check (amount > 0),
  reason text not null check (char_length(btrim(reason)) between 3 and 500),
  created_by uuid,
  created_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by uuid,
  void_reason text,
  -- The house takes no player; an award or a refund always names one.
  constraint money_adjustments_player check ((kind = 'house') = (to_player_id is null)),
  -- Voided with a reason, or not voided at all.
  constraint money_adjustments_void check ((voided_at is null) = (void_reason is null))
);
create index if not exists money_adjustments_tournament_idx on public.money_adjustments (tournament_id, source_key);
create index if not exists money_adjustments_player_idx on public.money_adjustments (to_player_id);

alter table public.money_adjustments enable row level security;
drop policy if exists money_adjustments_read on public.money_adjustments;
create policy money_adjustments_read on public.money_adjustments for select to authenticated
  using (public.is_tournament_member(tournament_id));
-- Written only by the two functions below.
revoke all on public.money_adjustments from public, anon, authenticated;
grant select on public.money_adjustments to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Assign and void
-- ---------------------------------------------------------------------------
create or replace function public.assign_unassigned(p_tournament_id uuid, p_source_key text, p_entries jsonb, p_reason text)
returns jsonb
language plpgsql volatile security definer
set search_path = public
as $$
declare
  e jsonb;
  k text;
  pid uuid;
  why text := btrim(coalesce(p_reason, ''));
  src text := btrim(coalesce(p_source_key, ''));
  n int;
begin
  if p_tournament_id is null or not public.is_tournament_organizer(p_tournament_id) then
    raise exception 'Solo el Comité puede asignar el dinero por asignar' using errcode = '42501';
  end if;
  if char_length(why) < 3 then
    raise exception 'Escribe el motivo, al menos 3 letras' using errcode = '22023';
  end if;
  if char_length(why) > 500 then
    raise exception 'El motivo es muy largo: 500 letras como máximo' using errcode = '22023';
  end if;
  if src = '' or char_length(src) > 120 then
    raise exception 'Falta de qué dinero sale la asignación' using errcode = '22023';
  end if;
  if jsonb_typeof(p_entries) is distinct from 'array' or jsonb_array_length(p_entries) = 0 then
    raise exception 'No hay nada que asignar' using errcode = '22023';
  end if;
  if jsonb_array_length(p_entries) > 200 then
    raise exception 'Demasiadas líneas en una sola asignación' using errcode = '22023';
  end if;

  for e in select x from jsonb_array_elements(p_entries) x loop
    if jsonb_typeof(e) is distinct from 'object' then
      raise exception 'Cada línea de la asignación lleva tipo, jugador y cantidad' using errcode = '22023';
    end if;
    k := e ->> 'kind';
    if k is null or k not in ('award', 'refund', 'house') then
      raise exception 'Cada línea se da a un jugador, se devuelve o va a la casa' using errcode = '22023';
    end if;
    -- Whole pesos, above zero.
    if jsonb_typeof(e -> 'amount') is distinct from 'number' or (e ->> 'amount')::numeric <> trunc((e ->> 'amount')::numeric)
       or (e ->> 'amount')::numeric <= 0 or (e ->> 'amount')::numeric > 100000000 then
      raise exception 'Cada cantidad es un número entero de pesos, mayor que cero' using errcode = '22023';
    end if;
    if k = 'house' then
      if e ? 'to_player_id' and jsonb_typeof(e -> 'to_player_id') <> 'null' then
        raise exception 'Lo que va a la casa no lleva jugador' using errcode = '22023';
      end if;
    else
      pid := public.try_uuid(e ->> 'to_player_id');
      if pid is null or not exists (select 1 from public.players p where p.id = pid and p.tournament_id = p_tournament_id) then
        raise exception 'Ese jugador no es de este torneo' using errcode = '22023';
      end if;
    end if;
  end loop;

  insert into public.money_adjustments (tournament_id, source_key, kind, to_player_id, amount, reason, created_by)
  select p_tournament_id, src, x ->> 'kind',
         case when x ->> 'kind' = 'house' then null else (x ->> 'to_player_id')::uuid end,
         (x ->> 'amount')::int, why, auth.uid()
  from jsonb_array_elements(p_entries) x;
  get diagnostics n = row_count;
  return jsonb_build_object('assigned', n);
end;
$$;
revoke execute on function public.assign_unassigned(uuid, text, jsonb, text) from public, anon;
grant execute on function public.assign_unassigned(uuid, text, jsonb, text) to authenticated;

-- One call is one assignment (a refund to six players is six rows): voiding
-- any of its rows voids all of them, so a bucket never comes back half.
create or replace function public.void_adjustment(p_id uuid, p_reason text)
returns jsonb
language plpgsql volatile security definer
set search_path = public
as $$
declare
  r public.money_adjustments;
  why text := btrim(coalesce(p_reason, ''));
  n int;
begin
  select * into r from public.money_adjustments where id = p_id;
  -- Someone outside the Comité learns nothing, not even whether the row exists.
  if not found or not public.is_tournament_organizer(r.tournament_id) then
    raise exception 'Solo el Comité puede anular una asignación' using errcode = '42501';
  end if;
  if r.voided_at is not null then
    raise exception 'Esa asignación ya estaba anulada' using errcode = '22023';
  end if;
  if char_length(why) < 3 then
    raise exception 'Escribe el motivo, al menos 3 letras' using errcode = '22023';
  end if;
  if char_length(why) > 500 then
    raise exception 'El motivo es muy largo: 500 letras como máximo' using errcode = '22023';
  end if;
  update public.money_adjustments
  set voided_at = now(), voided_by = auth.uid(), void_reason = why
  where tournament_id = r.tournament_id and source_key = r.source_key and created_at = r.created_at
    and created_by is not distinct from r.created_by and voided_at is null;
  get diagnostics n = row_count;
  return jsonb_build_object('voided', n);
end;
$$;
revoke execute on function public.void_adjustment(uuid, text) from public, anon;
grant execute on function public.void_adjustment(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Audit, realtime
-- ---------------------------------------------------------------------------
drop trigger if exists money_adjustments_audit on public.money_adjustments;
create trigger money_adjustments_audit after insert or update or delete on public.money_adjustments
  for each row execute function public.audit_row();

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'money_adjustments') then
    alter publication supabase_realtime add table public.money_adjustments;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Restore carries the Comité's assignments (0025's function plus them)
-- ---------------------------------------------------------------------------
-- In the same five places as every table: the temp table, the tenant check,
-- the reference check (the player must come back too), the wipe and the
-- insert (after the players).
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
     or exists (select 1 from r_game_results where tournament_id is distinct from p_tournament_id) then
    raise exception 'El respaldo tiene filas de otro torneo' using errcode = '22023';
  end if;
  if exists (select 1 from r_players where id is null) or exists (select 1 from r_rounds where id is null)
     or exists (select 1 from r_pairs where id is null) or exists (select 1 from r_groups where id is null)
     or exists (select 1 from r_teams where id is null)
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

  insert into public.groups (id, round_id, number, tee_time, start_hole) select id, round_id, number, tee_time, coalesce(start_hole, 1) from r_groups;
  insert into public.group_members (group_id, player_id) select group_id, player_id from r_group_members on conflict do nothing;
  insert into public.round_tees (round_id, player_id, tee_id) select round_id, player_id, tee_id from r_round_tees on conflict do nothing;
  insert into public.pairs (id, tournament_id, name, player1_id, player2_id, kind, picked_by_honoree, drawn_at)
  select id, p_tournament_id, name, player1_id, player2_id, kind, coalesce(picked_by_honoree, false), drawn_at from r_pairs;
  insert into public.teams (id, tournament_id, name, number, drawn_at)
  select id, p_tournament_id, name, coalesce(number, 1), drawn_at from r_teams;
  insert into public.team_members (team_id, player_id, tournament_id)
  select team_id, player_id, p_tournament_id from r_team_members on conflict do nothing;
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
  insert into public.money_adjustments (id, tournament_id, source_key, kind, to_player_id, amount, reason, created_by, created_at, voided_at, voided_by, void_reason)
  select coalesce(id, gen_random_uuid()), p_tournament_id, source_key, kind, to_player_id, amount, reason, created_by, coalesce(created_at, now()), voided_at, voided_by, void_reason from r_money_adjustments;
  insert into public.game_entries (tournament_id, game_id, player_id, created_at)
  select p_tournament_id, game_id, player_id, coalesce(created_at, now()) from r_game_entries on conflict do nothing;
  insert into public.game_results (tournament_id, game_id, player_id, share, created_at)
  select p_tournament_id, game_id, player_id, coalesce(share, 1), coalesce(created_at, now()) from r_game_results on conflict do nothing;
  insert into public.hole_awards (round_id, group_id, hole, game_id, player_id, decided_by, created_at)
  select round_id, group_id, hole, game_id, player_id, decided_by, coalesce(created_at, now()) from r_hole_awards on conflict do nothing;

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
