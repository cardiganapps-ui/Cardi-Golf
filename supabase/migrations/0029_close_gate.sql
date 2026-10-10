-- Polo · 0029 · «Cerrar torneo» on the server (MONEY-05)
--
-- Since PR #104 and #108 the Comité's screens refuse Terminado, «Publicar
-- resultados» and a Ronda rápida's «Terminar y publicar» while something is
-- still open (src/engine/close.ts). That gate ran only on the phone: an older
-- bundle, a direct API call or a second phone with a stale board could mark a
-- tournament Terminado, or publish its results, with a day still open or a
-- hole the server kept for the Comité nobody had looked at.
--
-- The client's gate runs the whole engine, which the database can't. The
-- server takes only the blockers SQL decides exactly as the client does, so
-- the two never disagree in the direction that stops a close the phone
-- allows:
--   a. Days: every day the settings plan exists (`settings.rounds`, as the
--      engine's «play is over» reads it, MONEY-06) and none is live or
--      scheduled. The same two lists as `openDays` in
--      src/engine/core/unassigned.ts: the days missing (the lowest numbers
--      nobody created, as many as the count falls short) and the days open.
--   b. «Pendientes de revisar»: an open row of rejected_writes that
--      `rejected_write_listed` (0028) lists, the same rows the client counts
--      through rejected_inbox. A conflict or an untouched default over a
--      score never blocks, as on the phone.
-- Left to the client, because only the engine knows them: unanswered snake
-- tiebreaks (which holes tie depends on what the engine counts as played, its
-- threshold and pick-up rule, and only the first one per group), money «por
-- asignar» and unpayable assignments (bucket amounts), and unsigned cards
-- (which cards the pairs game signs). Lots never auctioned only warn on the
-- phone (MONEY-11, Diego's open question), so the server does not block on
-- them either.
--
--   1. close_blockers(tid): the open items, as a list ([] when the tournament
--      can close). Internal: the trigger and publish_tournament_results call
--      it; no client role may.
--   2. A trigger on tournaments refuses a change into `finished` (from any
--      other status, an insert included) while the list is not empty: 22023
--      with one Spanish sentence per item, the same as the phone's sheet.
--      Leaving Terminado, and any other change of a Terminado tournament,
--      stays free. Everyone meets it: the Comité, an admin player, the
--      platform admin (who also keeps meeting Protegido's own rules), the
--      service role.
--   3. publish_tournament_results refuses the same way (it already refused a
--      tournament not Terminado): a tournament marked Terminado before this
--      migration, or one whose day was reopened since, publishes only once
--      it is settled.
--   4. restore_tournament writes the backup's status as it was: a Terminado
--      backup comes back Terminado. It marks its own transaction
--      (`cardi.restore`, transaction-local, set only around that one update)
--      and the trigger lets that write through. Its body is 0027's.
--
-- Escape hatch: none. Each server blocker has a way out the Comité already
-- has: a day is created, finished or cancelled in Rondas (or the number of
-- days lowered in Torneo), and every row the inbox lists can be dismissed
-- with a reason (resolve_rejected_write's 'dismiss' checks nothing on the
-- card unless the Comité sends what it saw), whatever the day's status.
--
-- Deploy order: harmless to the bundle on main, which already refuses on the
-- phone everything this refuses, and to older ones, which read the refusal
-- through humanError (a 22023 sentence in Spanish passes as written). It can
-- reach production before or after the bundle that carries it.

-- ---------------------------------------------------------------------------
-- 1. What still holds the close
-- ---------------------------------------------------------------------------
/**
 * The tournament's open items the server can decide, in the phone's order:
 *   [{ kind: 'missingRounds', days: [2] },
 *    { kind: 'openRounds', days: [1] },
 *    { kind: 'rejectedWrites', count: 3 }]
 * Empty when it can close (or when there is no such tournament). Planned days
 * are `settings.rounds` when it is a whole number from 1 to 10, as the
 * settings schema takes it; anything else is a settings object the phone can't
 * load, and plans nothing here.
 */
create or replace function public.close_blockers(p_tournament_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  s jsonb;
  planned int := 0;
  made int;
  missing jsonb;
  open_days jsonb;
  kept int;
  out jsonb := '[]'::jsonb;
begin
  select t.settings into s from public.tournaments t where t.id = p_tournament_id;
  if not found then
    return out;
  end if;
  if jsonb_typeof(s -> 'rounds') = 'number'
     and (s ->> 'rounds')::numeric = trunc((s ->> 'rounds')::numeric)
     and (s ->> 'rounds')::numeric between 1 and 10 then
    -- Through numeric: a whole number written as 2.0 (a hand edit) is 2 here as on the phone, never a cast error.
    planned := (s ->> 'rounds')::numeric::int;
  end if;
  select count(*) into made from public.rounds r where r.tournament_id = p_tournament_id;
  -- The lowest numbers nobody created, as many as the count falls short (openDays).
  if made < planned then
    select jsonb_agg(d order by d) into missing from (
      select d from generate_series(1, planned) d
      where not exists (select 1 from public.rounds r where r.tournament_id = p_tournament_id and r.number = d)
      order by d
      limit planned - made
    ) x;
    out := out || jsonb_build_array(jsonb_build_object('kind', 'missingRounds', 'days', missing));
  end if;
  select jsonb_agg(r.number order by r.number) into open_days
  from public.rounds r where r.tournament_id = p_tournament_id and r.status in ('live', 'scheduled');
  if open_days is not null then
    out := out || jsonb_build_array(jsonb_build_object('kind', 'openRounds', 'days', open_days));
  end if;
  select count(*) into kept from public.rejected_writes w
  where w.tournament_id = p_tournament_id and w.status = 'open' and public.rejected_write_listed(w);
  if kept > 0 then
    out := out || jsonb_build_array(jsonb_build_object('kind', 'rejectedWrites', 'count', kept));
  end if;
  return out;
end;
$$;
revoke execute on function public.close_blockers(uuid) from public, anon, authenticated;

/**
 * The refusal people read: what was refused, then one sentence per item, the
 * same as the phone's «Antes de cerrar el torneo» sheet (t.closeGate in
 * src/i18n/es-MX.ts; the test server builds it from those lines and
 * cases/serverRules.json pins both to this text).
 */
create or replace function public.close_blockers_text(p_blockers jsonb, p_publish boolean)
returns text
language plpgsql immutable
set search_path = public
as $$
declare
  b jsonb;
  k text;
  days text[];
  n int;
  list text;
  parts text[] := array[case when p_publish then 'Todavía no se pueden publicar los resultados.' else 'Todavía no se puede marcar Terminado.' end];
begin
  for b in select value from jsonb_array_elements(coalesce(p_blockers, '[]'::jsonb)) loop
    k := b ->> 'kind';
    if k in ('missingRounds', 'openRounds') then
      days := array(select jsonb_array_elements_text(b -> 'days'));
      n := coalesce(array_length(days, 1), 0);
      -- «1 y 2», «1, 2 y 3» (andList: a day's number never takes «e»).
      list := case when n <= 1 then coalesce(days[1], '') else array_to_string(days[1:n - 1], ', ') || ' y ' || days[n] end;
      if k = 'missingRounds' then
        parts := parts || ((case when n = 1 then 'El día ' || list || ' no está creado' else 'Los días ' || list || ' no están creados' end)
          || ': créalo y juégalo o cancélalo en Comité, sección Rondas, o baja el número de rondas en Comité, sección Torneo.');
      else
        parts := parts || ((case when n = 1 then 'El día ' || list || ' sigue abierto' else 'Los días ' || list || ' siguen abiertos' end)
          || ': termínalo o cancélalo en Comité, sección Rondas.');
      end if;
    elsif k = 'rejectedWrites' then
      n := (b ->> 'count')::int;
      parts := parts || ((case when n = 1 then 'Un hoyo que el servidor no tomó sigue sin revisar: aplícalo o descártalo'
        else n || ' hoyos que el servidor no tomó siguen sin revisar: aplícalos o descártalos' end)
        || ' en Comité, sección Tarjetas, «Pendientes de revisar».');
    end if;
  end loop;
  return array_to_string(parts, ' ');
end;
$$;
revoke execute on function public.close_blockers_text(jsonb, boolean) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Terminado waits for them
-- ---------------------------------------------------------------------------
/**
 * After the row is written, so the check reads the tournament as the
 * statement leaves it (a settings change in the same update counts). Only a
 * change into `finished`: leaving it, or editing a Terminado tournament, is
 * never refused. restore_tournament's own write of the backup's status passes
 * (`cardi.restore`, set only around it).
 */
create or replace function public.tournaments_close_gate()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  b jsonb;
begin
  if new.status is distinct from 'finished' or (tg_op = 'UPDATE' and old.status = 'finished') then
    return null;
  end if;
  if coalesce(current_setting('cardi.restore', true), '') = '1' then
    return null;
  end if;
  b := public.close_blockers(new.id);
  if jsonb_array_length(b) > 0 then
    raise exception '%', public.close_blockers_text(b, false) using errcode = '22023';
  end if;
  return null;
end;
$$;
revoke execute on function public.tournaments_close_gate() from public, anon, authenticated;
drop trigger if exists tournaments_close_gate on public.tournaments;
create trigger tournaments_close_gate after insert or update of status on public.tournaments
  for each row execute function public.tournaments_close_gate();

-- ---------------------------------------------------------------------------
-- 3. Publishing waits for them too (0015's function plus the check)
-- ---------------------------------------------------------------------------
create or replace function public.publish_tournament_results(p_tournament_id uuid, p_rows jsonb, p_currency text)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  t public.tournaments;
  n int;
  f int;
  b jsonb;
begin
  select * into t from public.tournaments where id = p_tournament_id;
  if t.id is null or not public.is_tournament_organizer(t.id) then
    raise exception 'Solo el Comité publica resultados' using errcode = '42501';
  end if;
  if t.status <> 'finished' then
    raise exception 'El torneo todavía no termina' using errcode = '22023';
  end if;
  -- Terminado before 0029, or a day reopened since: the results wait until it is settled.
  b := public.close_blockers(t.id);
  if jsonb_array_length(b) > 0 then
    raise exception '%', public.close_blockers_text(b, true) using errcode = '22023';
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array' then
    raise exception 'Resultados inválidos' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_rows) as x("playerId" uuid)
    where x."playerId" is null or public.player_tournament_id(x."playerId") is distinct from t.id
  ) then
    raise exception 'Un jugador no es de este torneo' using errcode = '22023';
  end if;

  perform public.refresh_round_results(r.id) from public.rounds r where r.tournament_id = t.id and r.status = 'finished';

  delete from public.tournament_results where tournament_id = t.id;
  delete from public.tournament_money where tournament_id = t.id;
  select count(*) filter (where x.rank is not null) into f from jsonb_to_recordset(p_rows) as x(rank int);
  insert into public.tournament_results (tournament_id, player_id, rank, rank_label, field, points, per_round, awards)
  select t.id, x."playerId", x.rank, x."rankLabel", f, x.points, coalesce(x."perRound", '{}'), coalesce(x.awards, '{}')
  from jsonb_to_recordset(p_rows) as x("playerId" uuid, rank int, "rankLabel" text, points int, "perRound" int[], awards text[]);
  get diagnostics n = row_count;
  insert into public.tournament_money (tournament_id, player_id, net, currency)
  select t.id, x."playerId", x.net, coalesce(nullif(p_currency, ''), 'MXN')
  from jsonb_to_recordset(p_rows) as x("playerId" uuid, net int)
  where x.net is not null;
  return jsonb_build_object('players', n, 'field', f);
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. A restore writes the backup's status as it was (0027's function, the
--    status write marked)
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
     or exists (select 1 from r_game_results where tournament_id is distinct from p_tournament_id) then
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
  insert into public.money_adjustments (id, tournament_id, source_key, kind, to_player_id, amount, reason, call_id, created_by, created_at, voided_at, voided_by, void_reason)
  select coalesce(id, gen_random_uuid()), p_tournament_id, source_key, kind, to_player_id, amount, reason, call_id, created_by, coalesce(created_at, now()), voided_at, voided_by, void_reason from r_money_adjustments;
  insert into public.game_entries (tournament_id, game_id, player_id, created_at)
  select p_tournament_id, game_id, player_id, coalesce(created_at, now()) from r_game_entries on conflict do nothing;
  insert into public.game_results (tournament_id, game_id, player_id, share, created_at)
  select p_tournament_id, game_id, player_id, coalesce(share, 1), coalesce(created_at, now()) from r_game_results on conflict do nothing;
  insert into public.hole_awards (round_id, group_id, hole, game_id, player_id, decided_by, created_at)
  select round_id, group_id, hole, game_id, player_id, decided_by, coalesce(created_at, now()) from r_hole_awards on conflict do nothing;

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
