-- 0066: a correction on a finished round rebuilds that player's result, and moves each profile once (DB-21).
--
-- A score saved on a finished round (admin_save_score, «Aplicar» in Pendientes, a discrepancy resolved) ran
-- refresh_round_results (0015, 0041, 0047), which deleted every result of the round and inserted them again one
-- player at a time. round_results' statement triggers (0016) then replayed the Polo index and the rivalries of
-- every linked profile of the round for the delete, and again for each insert: one correction on a 12-player
-- round was 24 index recomputes and 24 rivalry replays, 120 of each on a 60-player one.
--   1. rebuild_round_results(round, players) rebuilds the results of those players only (null: the whole round),
--      by upsert: a row that reads as it already does is not written at all, and one that changed is one update.
--      A player with no hole of the day left loses his row; a round no longer finished loses them all. The same
--      transaction lock on the round as 0041, so two rebuilds of one round still run one after the other, and the
--      same course handicap as 0047, from the index the event gave the player.
--   2. refresh_round_results(round) is that rebuild for the whole round, as every caller (a day finished or
--      reopened, «Publicar resultados», a course's card fixed) always meant.
--   3. The score triggers rebuild only the players whose holes the statement wrote, on each finished round it
--      touched, and an update counts the rows' old round and player as well as their new ones.
-- So one correction is one result row written, and its profile's index and rivalries replayed once. A row's
-- computed_at moves only when the row changes (the index's last tie-break between two rounds of one profile played
-- the same day with the same number used to move with every rebuild of either).

create or replace function public.rebuild_round_results(p_round uuid, p_players uuid[])
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  r public.rounds;
  pl record;
  t public.tees;
  cname text;
  tee uuid;
  idx numeric;
  ch int;
  par18 int;
  agg record;
begin
  -- One rebuild of a round at a time (0041, DB-14): a second one waits for the first to commit and then sees
  -- its rows. A rebuild of some players takes the same lock as one of the whole round.
  perform pg_advisory_xact_lock(hashtextextended('round_results:' || p_round::text, 0));
  select * into r from public.rounds where id = p_round;
  if r.id is null or r.status <> 'finished' then
    delete from public.round_results where round_id = p_round and (p_players is null or player_id = any(p_players));
    return;
  end if;
  -- A player with no hole of the day left has no result of it.
  delete from public.round_results rr
  where rr.round_id = p_round and (p_players is null or rr.player_id = any(p_players))
    and not exists (select 1 from public.scores s where s.round_id = p_round and s.player_id = rr.player_id);
  select name into cname from public.courses where id = r.course_id;
  for pl in
    select p.* from public.players p
    where p.tournament_id = r.tournament_id
      and (p_players is null or p.id = any(p_players))
      and exists (select 1 from public.scores s where s.round_id = r.id and s.player_id = p.id)
    order by p.id
  loop
    -- The tee played, exactly as the engine picks it (teeForPlayerRound).
    tee := coalesce(
      (select rt.tee_id from public.round_tees rt where rt.round_id = r.id and rt.player_id = pl.id),
      (select x.id from public.tees x where x.id = pl.default_tee_id and (r.course_id is null or x.course_id = r.course_id)),
      (select x.id from public.tees x where x.course_id = r.course_id order by x.sort_order, x.name, x.id limit 1)
    );
    t := null;
    select * into t from public.tees where id = tee;
    select coalesce(sum(h.par), 0) into par18 from public.holes h where h.tee_id = t.id and h.number <= 18;

    -- WHS course handicap on that tee, from the index this event gave the player (MONEY-22): the Comité's,
    -- or the one a Ronda rápida took from his profile when it was made. Never the profile's index of today,
    -- which moves after the round: every refresh rewrote the differential with it.
    idx := case when pl.handicap_source in ('index', 'estimate') then coalesce(pl.handicap_index, pl.base_hcp) end;
    if idx is not null and t.slope is not null and t.rating is not null and par18 > 0 then
      ch := public.whs_course_hcp(round(idx * 10)::int, t.slope, round(t.rating * 10)::int, par18);
    else
      -- A manual handicap is already a course handicap (§13b-D).
      ch := round(coalesce(idx, pl.base_hcp))::int;
    end if;

    select
      count(*) filter (where s.strokes is not null or s.picked_up) as thru,
      count(*) as tee_holes,
      sum(case when s.picked_up then h.par + 2 + public.whs_strokes(ch, h.stroke_index) else least(s.strokes, h.par + 2 + public.whs_strokes(ch, h.stroke_index)) end) as ags,
      sum(s.strokes) filter (where not s.picked_up) as gross,
      bool_or(coalesce(s.picked_up, false)) as any_pick,
      sum(h.par) as par,
      sum(s.putts) as putts,
      count(*) filter (where not s.picked_up and s.strokes - h.par <= -2) as eagles,
      count(*) filter (where not s.picked_up and s.strokes - h.par = -1) as birdies,
      count(*) filter (where not s.picked_up and s.strokes = h.par) as pars,
      count(*) filter (where not s.picked_up and s.strokes - h.par = 1) as bogeys,
      count(*) filter (where not s.picked_up and s.strokes - h.par >= 2) as doubles,
      count(*) filter (where s.picked_up) as pickups,
      coalesce(jsonb_agg(jsonb_build_array(h.number, h.par, h.stroke_index, s.strokes, s.putts, coalesce(s.picked_up, false)) order by h.number), '[]'::jsonb) as detail
    into agg
    from public.holes h
    left join public.scores s on s.round_id = r.id and s.player_id = pl.id and s.hole = h.number
    where h.tee_id = t.id and h.number <= r.holes;

    insert into public.round_results (
      round_id, player_id, tournament_id, played_on, round_number, holes, thru, complete, tee_id, tee_name, course_name, rating, slope, par, course_hcp,
      gross, ags, differential, putts, eagles, birdies, pars, bogeys, doubles, pickups, detail
    ) values (
      r.id, pl.id, r.tournament_id, r.date, r.number, r.holes, coalesce(agg.thru, 0),
      coalesce(agg.thru, 0) = r.holes and coalesce(agg.tee_holes, 0) = r.holes,
      t.id, t.name, cname, t.rating, t.slope, agg.par, ch,
      case when coalesce(agg.thru, 0) = r.holes and agg.tee_holes = r.holes and not agg.any_pick then agg.gross end,
      case when coalesce(agg.thru, 0) = r.holes and agg.tee_holes = r.holes then agg.ags end,
      -- A differential needs a complete 18-hole round on a rated tee.
      case when r.holes = 18 and coalesce(agg.thru, 0) = 18 and agg.tee_holes = 18 and t.rating is not null and t.slope is not null
        then public.whs_diff10(agg.ags::int, round(t.rating * 10)::int, t.slope) / 10.0 end,
      agg.putts, coalesce(agg.eagles, 0), coalesce(agg.birdies, 0), coalesce(agg.pars, 0), coalesce(agg.bogeys, 0), coalesce(agg.doubles, 0), coalesce(agg.pickups, 0),
      coalesce(agg.detail, '[]'::jsonb)
    )
    -- A row that reads as it already does is not written, so nothing downstream moves for it.
    on conflict (round_id, player_id) do update set
      tournament_id = excluded.tournament_id,
      played_on = excluded.played_on,
      round_number = excluded.round_number,
      holes = excluded.holes,
      thru = excluded.thru,
      complete = excluded.complete,
      tee_id = excluded.tee_id,
      tee_name = excluded.tee_name,
      course_name = excluded.course_name,
      rating = excluded.rating,
      slope = excluded.slope,
      par = excluded.par,
      course_hcp = excluded.course_hcp,
      gross = excluded.gross,
      ags = excluded.ags,
      differential = excluded.differential,
      putts = excluded.putts,
      eagles = excluded.eagles,
      birdies = excluded.birdies,
      pars = excluded.pars,
      bogeys = excluded.bogeys,
      doubles = excluded.doubles,
      pickups = excluded.pickups,
      detail = excluded.detail,
      computed_at = now()
    where (round_results.tournament_id, round_results.played_on, round_results.round_number, round_results.holes, round_results.thru, round_results.complete, round_results.tee_id, round_results.tee_name, round_results.course_name, round_results.rating, round_results.slope, round_results.par, round_results.course_hcp, round_results.gross, round_results.ags, round_results.differential, round_results.putts, round_results.eagles, round_results.birdies, round_results.pars, round_results.bogeys, round_results.doubles, round_results.pickups, round_results.detail)
      is distinct from (excluded.tournament_id, excluded.played_on, excluded.round_number, excluded.holes, excluded.thru, excluded.complete, excluded.tee_id, excluded.tee_name, excluded.course_name, excluded.rating, excluded.slope, excluded.par, excluded.course_hcp, excluded.gross, excluded.ags, excluded.differential, excluded.putts, excluded.eagles, excluded.birdies, excluded.pars, excluded.bogeys, excluded.doubles, excluded.pickups, excluded.detail);
  end loop;
end;
$$;comment on function public.rebuild_round_results(uuid, uuid[]) is
  'Internal: the finished round''s results of those players (null: all of them), each written only when it changed (DB-21).';
revoke execute on function public.rebuild_round_results(uuid, uuid[]) from public, anon, authenticated;

create or replace function public.refresh_round_results(p_round uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  perform public.rebuild_round_results(p_round, null);
end;
$$;

-- The players' results of a round the statement wrote, if the round is finished.
create or replace function public.rebuild_finished_round(p_round uuid, p_players uuid[])
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  st text;
begin
  -- FOR SHARE: wait for a status change on its way, and hold the next one until this commits (0041).
  select status into st from public.rounds where id = p_round for share;
  if st = 'finished' then
    perform public.rebuild_round_results(p_round, p_players);
  end if;
end;
$$;
revoke execute on function public.rebuild_finished_round(uuid, uuid[]) from public, anon, authenticated;

-- 0041's body, by the players each round's statement wrote. The update trigger also sees the rows as they were
-- (scores_before): a score moved to another player or day leaves a result to rebuild where it was. Each transition
-- table is named only in the branch whose trigger has it.
create or replace function public.scores_refresh_results()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  rid uuid;
  pids uuid[];
begin
  if tg_op = 'UPDATE' then
    for rid, pids in
      select y.round_id, array_agg(distinct y.player_id) from (select round_id, player_id from changed union all select round_id, player_id from scores_before) y
      group by y.round_id order by y.round_id
    loop
      perform public.rebuild_finished_round(rid, pids);
    end loop;
  else
    for rid, pids in select c.round_id, array_agg(distinct c.player_id) from changed c group by c.round_id order by c.round_id loop
      perform public.rebuild_finished_round(rid, pids);
    end loop;
  end if;
  return null;
end;
$$;

drop trigger scores_results_upd on public.scores;
create trigger scores_results_upd after update on public.scores
  referencing old table as scores_before new table as changed
  for each statement execute function public.scores_refresh_results();
