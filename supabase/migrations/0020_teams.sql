-- Teams of more than two.
--
-- `pairs` has player1_id and player2_id, which is exactly right for the
-- pairs game and for a fourball, and cannot express a scramble foursome.
-- A team format may have any team size, so teams get their own table and
-- `pairs` stays what it is: the pairs game's own draw.
--
-- Integrity without triggers: a team member's tournament must match both its
-- team's and its player's, and a player may be on at most one team per
-- tournament. Both composite foreign keys need a unique index on the parent's
-- (id, tournament_id), which is what the two indexes below are for.

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  name text,
  -- The team's place in the draw order; also what an unnamed team is called.
  number int not null,
  drawn_at timestamptz,
  unique (tournament_id, number)
);
create index if not exists teams_tournament_idx on public.teams (tournament_id);
create unique index if not exists teams_id_tournament_uk on public.teams (id, tournament_id);
create unique index if not exists players_id_tournament_uk on public.players (id, tournament_id);

create table if not exists public.team_members (
  team_id uuid not null,
  player_id uuid not null,
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  primary key (team_id, player_id),
  -- One team per player per tournament.
  unique (tournament_id, player_id),
  foreign key (team_id, tournament_id) references public.teams (id, tournament_id) on delete cascade,
  foreign key (player_id, tournament_id) references public.players (id, tournament_id) on delete cascade
);
create index if not exists team_members_player_idx on public.team_members (player_id);

alter table public.teams enable row level security;
alter table public.team_members enable row level security;

drop policy if exists teams_read on public.teams;
create policy teams_read on public.teams for select using (public.is_tournament_member(tournament_id));
drop policy if exists teams_write on public.teams;
create policy teams_write on public.teams for all
  using (public.is_tournament_organizer(tournament_id)) with check (public.is_tournament_organizer(tournament_id));

drop policy if exists team_members_read on public.team_members;
create policy team_members_read on public.team_members for select using (public.is_tournament_member(tournament_id));
drop policy if exists team_members_write on public.team_members;
create policy team_members_write on public.team_members for all
  using (public.is_tournament_organizer(tournament_id)) with check (public.is_tournament_organizer(tournament_id));

grant select on public.teams, public.team_members to anon, authenticated;
grant insert, update, delete on public.teams, public.team_members to authenticated;

-- ---------------------------------------------------------------------------
-- The draw, in one transaction. Same guards as save_draw: the Comité only,
-- and never once a card has been signed.
-- ---------------------------------------------------------------------------
create or replace function public.save_teams(p_tournament_id uuid, p_teams jsonb)
returns jsonb
language plpgsql volatile security definer
set search_path = public
as $$
declare
  t jsonb;
  new_id uuid;
  n int := 0;
begin
  if not public.is_tournament_organizer(p_tournament_id) then
    raise exception 'Solo el Comité puede hacer el sorteo' using errcode = '42501';
  end if;
  if p_teams is null or jsonb_typeof(p_teams) <> 'array' then
    raise exception 'Equipos inválidos' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.card_signatures s
    join public.rounds r on r.id = s.round_id
    where r.tournament_id = p_tournament_id
  ) then
    raise exception 'Ya hay tarjetas firmadas; el sorteo no se puede rehacer' using errcode = '22023';
  end if;
  -- Every named player must belong to this tournament, and to one team only.
  if exists (
    select 1
    from jsonb_array_elements(p_teams) x,
         lateral jsonb_array_elements_text(coalesce(x -> 'player_ids', '[]'::jsonb)) pid
    left join public.players p on p.id = pid::uuid and p.tournament_id = p_tournament_id
    where p.id is null
  ) then
    raise exception 'Hay un equipo con un jugador que no es de este torneo' using errcode = '22023';
  end if;
  if exists (
    select pid from jsonb_array_elements(p_teams) x,
         lateral jsonb_array_elements_text(coalesce(x -> 'player_ids', '[]'::jsonb)) pid
    group by pid having count(*) > 1
  ) then
    raise exception 'Un jugador no puede estar en dos equipos' using errcode = '22023';
  end if;

  delete from public.teams where tournament_id = p_tournament_id;
  for t in select * from jsonb_array_elements(p_teams) loop
    n := n + 1;
    insert into public.teams (tournament_id, name, number, drawn_at)
    values (p_tournament_id, nullif(btrim(coalesce(t ->> 'name', '')), ''), n, now())
    returning id into new_id;
    insert into public.team_members (team_id, player_id, tournament_id)
    select new_id, pid::uuid, p_tournament_id
    from jsonb_array_elements_text(coalesce(t -> 'player_ids', '[]'::jsonb)) pid;
  end loop;

  return jsonb_build_object('teams', n);
end;
$$;
revoke execute on function public.save_teams(uuid, jsonb) from public, anon;
grant execute on function public.save_teams(uuid, jsonb) to authenticated, service_role;

-- Renaming a team is its own small write, like renaming a pair.
create or replace function public.rename_team(p_team_id uuid, p_name text)
returns void
language plpgsql volatile security definer
set search_path = public
as $$
declare
  tid uuid;
begin
  select tournament_id into tid from public.teams where id = p_team_id;
  if tid is null then
    raise exception 'Equipo no encontrado' using errcode = '22023';
  end if;
  if not public.is_tournament_organizer(tid) then
    raise exception 'Solo el Comité puede renombrar un equipo' using errcode = '42501';
  end if;
  update public.teams set name = nullif(btrim(coalesce(p_name, '')), '') where id = p_team_id;
end;
$$;
revoke execute on function public.rename_team(uuid, text) from public, anon;
grant execute on function public.rename_team(uuid, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- restore_tournament, carrying the two new tables.
--
-- It names every table explicitly, so a table it does not know about is a
-- table a restore silently drops. This is 0010's function with teams and
-- team_members added in the five places that matter: the temp table, the
-- tenant check, the reference check, the wipe and the insert. An older
-- backup, with no `teams` key, restores exactly as before.
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

  -- Tenant: every row of the backup belongs to this tournament.
  if exists (select 1 from r_tournaments where id is distinct from p_tournament_id)
     or exists (select 1 from r_players where tournament_id is distinct from p_tournament_id)
     or exists (select 1 from r_rounds where tournament_id is distinct from p_tournament_id)
     or exists (select 1 from r_pairs where tournament_id is distinct from p_tournament_id)
     or exists (select 1 from r_teams where tournament_id is distinct from p_tournament_id)
     or exists (select 1 from r_team_members where tournament_id is distinct from p_tournament_id)
     or exists (select 1 from r_calcutta_lots where tournament_id is distinct from p_tournament_id)
     or exists (select 1 from r_payments where tournament_id is distinct from p_tournament_id) then
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
