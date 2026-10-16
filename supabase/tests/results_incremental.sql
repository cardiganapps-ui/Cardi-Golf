-- A correction on a finished round rebuilds that player's result and moves his profile once (0066, DB-21).
-- On the two-tenant seed: tournament A gets four more players (six in all) on a rated 18-hole course, four of
-- them confirmed profiles, Ana's and Beto's in an active rivalry; every hole played, the day finished. The
-- function counts come from pg_stat_xact_user_functions (track_functions = all), taken around each step.
-- Then every result and every profile's index after a series of incremental rebuilds is compared with what a
-- rebuild of the whole round from nothing gives (the path before 0066). Rolled back; one «ok» line per check.
\set ON_ERROR_STOP 1
\set QUIET 1
\pset tuples_only on
\pset format unaligned
set track_functions = 'all';
select id as org_a from harness.seed where key = 'org_a' \gset
select id as t_a from harness.seed where key = 'tournament_a' \gset
select id as ana from harness.seed where key = 'player_a1' \gset
select id as beto from harness.seed where key = 'player_a2' \gset
select id as r_a from harness.seed where key = 'round_a1' \gset
begin;

-- Calls of a function in this transaction so far.
create function pg_temp.calls(fn text) returns bigint language sql as $$
  select coalesce(sum(calls), 0)::bigint from pg_stat_xact_user_functions where schemaname = 'public' and funcname = fn
$$;
create temp table mark (fn text primary key, n bigint);
create function pg_temp.mark() returns void language sql as $$
  delete from mark;
  insert into mark select f, pg_temp.calls(f) from unnest(array['rebuild_round_results', 'recompute_profile_index', 'recompute_rivalries_of', 'recompute_rivalry']) f;
$$;
create function pg_temp.since(fn text) returns bigint language sql as $$ select pg_temp.calls(fn) - (select n from mark where mark.fn = since.fn) $$;
-- The round's results without the moment they were written, and the four profiles' indexes.
create function pg_temp.results() returns jsonb language sql as $$
  select coalesce(jsonb_agg(to_jsonb(x) - 'computed_at' order by player_id), '[]'::jsonb) from public.round_results x where round_id = (select id from harness.seed where key = 'round_a1')
$$;
create function pg_temp.indexes() returns jsonb language sql as $$
  select jsonb_agg(jsonb_build_array(id, polo_index, polo_index_rounds) order by id) from public.profiles where handle like 'r0066_%'
$$;
create function pg_temp.rivalry() returns jsonb language sql as $$
  select jsonb_agg(jsonb_build_array(r.strokes, (select count(*) from public.rivalry_rounds rr where rr.rivalry_id = r.id)) order by r.id) from public.rivalries r
$$;

-- A rated par 72 (71.0 / 120), every hole a par 4, the stroke index the hole's number.
insert into public.courses (id, name, source) values ('c0000000-0000-4000-8000-000000000661', 'Campo 0066', 'manual');
insert into public.tees (id, course_id, name, rating, slope, par_total) values ('c0000000-0000-4000-8000-000000000662', 'c0000000-0000-4000-8000-000000000661', 'Blancas', 71.0, 120, 72);
insert into public.holes (tee_id, number, par, stroke_index) select 'c0000000-0000-4000-8000-000000000662', h, 4, h from generate_series(1, 18) h;
update public.rounds set course_id = 'c0000000-0000-4000-8000-000000000661', status = 'live' where id = :'r_a';
insert into public.players (tournament_id, full_name, display_name, sort_order, handicap_source, base_hcp)
select :'t_a', 'Jugador ' || n, 'J' || n, 10 + n, 'manual', 8 + n from generate_series(3, 6) n;
-- Four accounts, four confirmed profiles: Ana, Beto and two of the new four.
insert into auth.users (id, email, is_anonymous) select ('d0000000-0000-4000-8000-00000000066' || n)::uuid, 'r0066-' || n || '@polo.test', false from generate_series(1, 4) n;
insert into public.profiles (id, handle, display_name) select ('d0000000-0000-4000-8000-00000000066' || n)::uuid, 'r0066_' || n, 'R' || n from generate_series(1, 4) n;
update public.players p set profile_id = x.pid, profile_status = 'confirmed', handicap_source = 'index', handicap_index = x.idx, base_hcp = x.idx
from (values (:'ana'::uuid, 'd0000000-0000-4000-8000-000000000661'::uuid, 12.0), (:'beto'::uuid, 'd0000000-0000-4000-8000-000000000662'::uuid, 18.0)) x(id, pid, idx)
where p.id = x.id;
update public.players p set profile_id = ('d0000000-0000-4000-8000-00000000066' || (p.sort_order - 10))::uuid, profile_status = 'confirmed'
where p.tournament_id = :'t_a' and p.sort_order in (13, 14);
insert into public.rivalries (a, b, status, start_strokes, strokes, started_at)
values ('d0000000-0000-4000-8000-000000000661', 'd0000000-0000-4000-8000-000000000662', 'active', 0, 0, now() - interval '1 day');
-- Every hole played: fives, with a six on each player's hardest holes, and a pick-up for J5 on the 9th.
insert into public.scores (round_id, player_id, hole, strokes, putts, picked_up)
select :'r_a', p.id, h, case when h <= p.sort_order % 4 + 2 then 6 else 5 end, 2, false
from public.players p, generate_series(1, 18) h where p.tournament_id = :'t_a';
update public.scores set strokes = null, picked_up = true where round_id = :'r_a' and hole = 9 and player_id = (select id from public.players where tournament_id = :'t_a' and sort_order = 15);
update public.rounds set status = 'finished' where id = :'r_a';
-- Two more days on the same course, all fives, so each profile has the three differentials an index needs.
insert into public.rounds (tournament_id, number, holes, course_id, status, date)
select :'t_a', n, 18, 'c0000000-0000-4000-8000-000000000661', 'live', date '2027-04-08' + n from generate_series(2, 3) n;
insert into public.scores (round_id, player_id, hole, strokes, putts, picked_up)
select r.id, p.id, h, 5 + (h % 2) * (r.number - 2), 2, false
from public.rounds r join public.players p on p.tournament_id = r.tournament_id, generate_series(1, 18) h where r.tournament_id = :'t_a' and r.number in (2, 3);
update public.rounds set status = 'finished' where tournament_id = :'t_a' and number in (2, 3);
select harness.check((select count(*) from public.round_results where round_id = :'r_a') = 6, 'six results once the day is finished');
select harness.check((select count(*) from public.profiles where handle like 'r0066_%' and polo_index_rounds = 3 and polo_index is not null) = 4, 'four profiles, each with an index of three rounds');

-- 1. One correction of Ana's card: her result alone, her profile's index and rivalries once.
select set_config('request.jwt.claims', harness.claims(:'org_a'), true) \g /dev/null
select pg_temp.mark() \g /dev/null
create temp table before_rows on commit drop as select to_jsonb(x) - 'computed_at' as r, x.computed_at from public.round_results x where round_id = :'r_a' and player_id <> :'ana';
set local role authenticated;
select public.admin_save_score(:'r_a', :'ana', 7, 4, 2, false, 'Era un par') \g /dev/null
reset role;
select harness.check(pg_temp.since('rebuild_round_results') = 1, 'one rebuild for one correction: ' || pg_temp.since('rebuild_round_results'));
select harness.check(pg_temp.since('recompute_profile_index') = 1, 'Ana''s profile''s index recomputed once (it was once per player and again for the delete): ' || pg_temp.since('recompute_profile_index'));
select harness.check(pg_temp.since('recompute_rivalries_of') = 1 and pg_temp.since('recompute_rivalry') = 1, 'and her one rivalry replayed once: ' || pg_temp.since('recompute_rivalries_of') || ', ' || pg_temp.since('recompute_rivalry'));
select harness.check(not exists (select 1 from before_rows b join public.round_results x on x.round_id = :'r_a' and to_jsonb(x) ->> 'player_id' = b.r ->> 'player_id'
    where x.computed_at <> b.computed_at or to_jsonb(x) - 'computed_at' <> b.r), 'nobody else''s result was written');
select harness.check((select detail -> 6 ->> 3 from public.round_results where round_id = :'r_a' and player_id = :'ana') = '4', 'and Ana''s holds the corrected hole');

-- 2. A correction that leaves the card as it was moves nothing.
select pg_temp.mark() \g /dev/null
set local role authenticated;
select public.admin_save_score(:'r_a', :'beto', 1, (select strokes from public.scores where round_id = :'r_a' and player_id = :'beto' and hole = 1), 2, false, 'Revisado') \g /dev/null
reset role;
select harness.check(pg_temp.since('rebuild_round_results') = 1 and pg_temp.since('recompute_profile_index') = 0 and pg_temp.since('recompute_rivalries_of') = 0,
  'a hole saved as it was rebuilds Beto''s result, finds it unchanged, and replays nothing');

-- 3. A statement of many holes of two players: two results, two profiles, each once.
select pg_temp.mark() \g /dev/null
update public.scores set strokes = 4 where round_id = :'r_a' and hole in (16, 17, 18) and player_id in (:'ana', :'beto');
select harness.check(pg_temp.since('rebuild_round_results') = 1 and pg_temp.since('recompute_profile_index') = 2 and pg_temp.since('recompute_rivalries_of') = 2,
  'six holes of two players in one statement: one rebuild, each profile once: ' || pg_temp.since('recompute_profile_index'));

-- 4. Whatever the order of corrections, the results are the whole round's, rebuilt from nothing.
update public.scores set picked_up = true, strokes = null where round_id = :'r_a' and player_id = :'ana' and hole = 2;
-- A hole moved from J6 to J3 (an update's old player is rebuilt too): J3's 3rd is deleted first.
delete from public.scores where round_id = :'r_a' and hole = 3 and player_id = (select id from public.players where tournament_id = :'t_a' and sort_order = 13);
update public.scores set player_id = (select id from public.players where tournament_id = :'t_a' and sort_order = 13)
where round_id = :'r_a' and hole = 3 and player_id = (select id from public.players where tournament_id = :'t_a' and sort_order = 16);
-- J4 loses every hole of the day: no result.
delete from public.scores where round_id = :'r_a' and player_id = (select id from public.players where tournament_id = :'t_a' and sort_order = 14);
select harness.check((select count(*) from public.round_results where round_id = :'r_a') = 5, 'a player with no hole left has no result');
create temp table inc on commit drop as select pg_temp.results() as r, pg_temp.indexes() as i, pg_temp.rivalry() as v;
-- The path before 0066: every row of the round deleted, then rebuilt.
delete from public.round_results where round_id = :'r_a';
select public.refresh_round_results(:'r_a') \g /dev/null
select harness.check((select r from inc) = pg_temp.results(), 'every result after the incremental rebuilds is what a rebuild from nothing gives');
select harness.check((select i from inc) = pg_temp.indexes(), 'and so is every profile''s index: ' || pg_temp.indexes()::text);
select harness.check((select count(*) from jsonb_array_elements((select i from inc)) e where e -> 1 <> 'null'::jsonb) = 3, 'three of them an index (J4 lost the day''s round): ' || (select i from inc)::text);
select harness.check((select v from inc) = pg_temp.rivalry(), 'and the rivalry');
select harness.check((select r from inc) <> '[]'::jsonb and jsonb_array_length((select r from inc)) = 5, 'five results compared');

-- 5. The day reopened takes every result; finished again, they come back as they were.
update public.rounds set status = 'live' where id = :'r_a';
select harness.check((select count(*) from public.round_results where round_id = :'r_a') = 0, 'a reopened day has no results');
update public.rounds set status = 'finished' where id = :'r_a';
select harness.check((select r from inc) = pg_temp.results(), 'finished again, the same results');

rollback;
