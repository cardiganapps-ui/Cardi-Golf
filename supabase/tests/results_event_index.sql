-- MONEY-22 (0047): a finished round's results come from the index the event
-- gave the player, never the profile's index of the moment, so the same card
-- gives the same adjusted gross and differential however often it is
-- refreshed. On the two-tenant seed: org_a's account is Ana's confirmed
-- profile in tournament A; Beto plays off a manual base. Rolled back at the
-- end; prints one «ok» line per check.
\set ON_ERROR_STOP 1
\set QUIET 1
\pset tuples_only on
\pset format unaligned
select id as org_a from harness.seed where key = 'org_a' \gset
select id as t_a from harness.seed where key = 'tournament_a' \gset
select id as ana from harness.seed where key = 'player_a1' \gset
select id as beto from harness.seed where key = 'player_a2' \gset
select id as r_a from harness.seed where key = 'round_a1' \gset
begin;

create function pg_temp.res(p uuid) returns text language sql as $$
  select course_hcp || ':' || ags || ':' || differential from public.round_results where round_id = (select id from harness.seed where key = 'round_a1') and player_id = p
$$;
create function pg_temp.rows() returns jsonb language sql as $$
  select jsonb_agg(to_jsonb(x) - 'created_at' - 'updated_at' order by player_id) from public.round_results x where round_id = (select id from harness.seed where key = 'round_a1')
$$;

-- A rated par 72 (72.0 / 113), every hole a par 4, the stroke index the hole's number.
insert into public.courses (id, name, source) values ('c0000000-0000-4000-8000-000000000471', 'Campo 0047', 'manual');
insert into public.tees (id, course_id, name, rating, slope, par_total) values ('c0000000-0000-4000-8000-000000000472', 'c0000000-0000-4000-8000-000000000471', 'Blancas', 72.0, 113, 72);
insert into public.holes (tee_id, number, par, stroke_index) select 'c0000000-0000-4000-8000-000000000472', h, 4, h from generate_series(1, 18) h;
update public.rounds set course_id = 'c0000000-0000-4000-8000-000000000471', status = 'live' where id = :'r_a';

-- Ana: her account's profile, confirmed, with a manual index of 20.0; the Comité gave her 12.0 for this event.
insert into public.profiles (id, handle, display_name, index_source, manual_index) values (:'org_a', 'ana_0047', 'Ana', 'manual', 20.0);
update public.players set profile_id = :'org_a', profile_status = 'confirmed', handicap_source = 'index', handicap_index = 12.0, base_hcp = 12.0 where id = :'ana';
update public.players set handicap_source = 'manual', handicap_index = null, base_hcp = 9 where id = :'beto';
-- Eights everywhere for Ana, so net double bogey caps every hole; fives for Beto.
insert into public.scores (round_id, player_id, hole, strokes, putts, picked_up)
select :'r_a', p, h, case when p = :'ana'::uuid then 8 else 5 end, 2, false from unnest(array[:'ana', :'beto']::uuid[]) p, generate_series(1, 18) h;
update public.rounds set status = 'finished' where id = :'r_a';

-- 1. The event's index, not the profile's: course handicap 12, so 7 on the twelve hardest holes and 6 on the rest.
select harness.check(pg_temp.res(:'ana') = '12:120:48.0', 'Ana''s round is scored off the 12.0 the event gave her, not her profile''s 20.0: ' || coalesce(pg_temp.res(:'ana'), 'none'));
-- A manual base is a course handicap as it stands (§13b-D): 9, so the fives (90) stand.
select harness.check(pg_temp.res(:'beto') = '9:90:18.0', 'a manual base is the course handicap: ' || coalesce(pg_temp.res(:'beto'), 'none'));

-- 2. The profile's index moves; the round does not, however often it is rebuilt.
create temp table first on commit drop as select pg_temp.rows() as r;
update public.profiles set manual_index = 5.0 where id = :'org_a';
select public.refresh_round_results(:'r_a') \g /dev/null
select harness.check(pg_temp.rows() = (select r from first), 'a refresh after the profile''s index moved gives the same results, row for row');
update public.profiles set index_source = 'polo', polo_index = 30.0 where id = :'org_a';
select public.refresh_round_results(:'r_a') \g /dev/null
select public.refresh_round_results(:'r_a') \g /dev/null
select harness.check(pg_temp.rows() = (select r from first), 'and after it moved to a Polo index, twice over');

-- 3. A correction of the event's own handicap is an input of the round: the next rebuild follows it.
update public.players set handicap_index = 14.0, base_hcp = 14.0 where id = :'ana';
select public.refresh_round_results(:'r_a') \g /dev/null
select harness.check(pg_temp.res(:'ana') = '14:122:50.0', 'the Comité''s correction of the event''s index re-scores the round: ' || coalesce(pg_temp.res(:'ana'), 'none'));

-- 4. A card correction re-scores it as before, still off the event's index.
update public.scores set strokes = 4 where round_id = :'r_a' and player_id = :'ana' and hole = 18;
select harness.check(pg_temp.res(:'ana') = '14:120:48.0', 'a corrected hole re-scores it off the same index: ' || coalesce(pg_temp.res(:'ana'), 'none'));

rollback;
