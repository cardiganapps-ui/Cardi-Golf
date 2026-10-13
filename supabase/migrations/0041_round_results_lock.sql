-- Cardi-Golf · 0041 · Round results rebuilt one at a time, and never without a score in flight (DB-14).
--
-- refresh_round_results (0015) deletes a round's results and inserts them
-- again, and nothing serialized two rebuilds of the same round: two
-- corrections to a finished round at once (admin_save_score twice, or one
-- and a phone's last hole) made the second fail with a duplicate key
-- (23505), its correction lost. And the score trigger read the round's
-- status from its own snapshot: a score saved while «Terminar ronda»
-- committed saw the round live and rebuilt nothing, while the finish's
-- rebuild could not see the score yet, so the results (the published
-- history, the Polo index, the rivalries) went without it until the next
-- write to that round.
--
-- - refresh_round_results takes a transaction lock on its round first;
--   the body is otherwise 0015's.
-- - The score trigger reads each round's status FOR SHARE: a score written
--   while a finish is on its way waits for it and then sees the round
--   finished, and a finish waits for the scores already written in a
--   transaction that has not committed, then rebuilds with them.
-- supabase/tests/race_round_results.sh runs both interleavings.

create or replace function public.refresh_round_results(p_round uuid)
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
  -- One rebuild of a round at a time: a second one waits for the first to
  -- commit and then sees its rows, so its delete takes them and its inserts
  -- never meet them (23505, DB-14).
  perform pg_advisory_xact_lock(hashtextextended('round_results:' || p_round::text, 0));
  select * into r from public.rounds where id = p_round;
  delete from public.round_results where round_id = p_round;
  if r.id is null or r.status <> 'finished' then
    return;
  end if;
  select name into cname from public.courses where id = r.course_id;
  for pl in
    select p.* from public.players p
    where p.tournament_id = r.tournament_id
      and exists (select 1 from public.scores s where s.round_id = r.id and s.player_id = p.id)
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

    -- WHS course handicap on that tee: the profile's index if it has one, else the tournament's index.
    idx := null;
    if pl.profile_status = 'confirmed' then
      select case when pr.index_source = 'manual' then pr.manual_index else pr.polo_index end into idx from public.profiles pr where pr.id = pl.profile_id;
    end if;
    if idx is null and pl.handicap_source in ('index', 'estimate') then
      idx := coalesce(pl.handicap_index, pl.base_hcp);
    end if;
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
    );
  end loop;
end;
$$;


create or replace function public.scores_refresh_results()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  rid uuid;
  st text;
begin
  for rid in select distinct c.round_id from changed c loop
    -- FOR SHARE: wait for a status change on its way, and hold the next one until this commits.
    select status into st from public.rounds where id = rid for share;
    if st = 'finished' then
      perform public.refresh_round_results(rid);
    end if;
  end loop;
  return null;
end;
$$;
