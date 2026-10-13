-- DB-03, DB-04 (0042): a Comité ruling on a hole contest is its own row
-- (source 'comite'), beside the groups' claims (source 'group'). Each step
-- runs as the user who does it in the app, on the two-tenant seed: org_a runs
-- tournament A (round 1, Ana and Beto in group 1); Ceci joins it in a group
-- of her own. Rolled back at the end; prints one «ok» line per check.
\set ON_ERROR_STOP 1
\set QUIET 1
\pset tuples_only on
\pset format unaligned
select id as org_a from harness.seed where key = 'org_a' \gset
select id as t_a from harness.seed where key = 'tournament_a' \gset
select id as ana from harness.seed where key = 'player_a1' \gset
select id as beto from harness.seed where key = 'player_a2' \gset
select id as r1 from harness.seed where key = 'round_a1' \gset
select id as g1 from harness.seed where key = 'group_a1' \gset
begin;

-- A statement as the caller: how many rows it changed, or the SQLSTATE and the message.
create function pg_temp.try(q text) returns text language plpgsql as $$
declare
  n int;
begin
  execute q;
  get diagnostics n = row_count;
  return n::text;
exception when others then
  return sqlstate || ' ' || sqlerrm;
end $$;
grant execute on function pg_temp.try(text) to authenticated;
-- Hole h of «Más cerca»: who holds a row, and whose row it is.
create function pg_temp.rows(h int) returns text language sql as $$
  select coalesce(string_agg(p.display_name || ':' || a.source, ' ' order by p.display_name, a.source), '-')
  from public.hole_awards a join public.players p on p.id = a.player_id
  where a.round_id = (select id from harness.seed where key = 'round_a1') and a.game_id = 'closest' and a.hole = h
$$;

-- Ceci, in group 2.
insert into public.players (tournament_id, full_name, display_name, sort_order) values (:'t_a', 'Ceci Alfa', 'Ceci', 2) returning id as ceci \gset
select set_config('request.jwt.claims', harness.claims(:'org_a'), true) \g /dev/null
set local role authenticated;
select public.upsert_groups(:'r1', jsonb_build_array(
  jsonb_build_object('id', :'g1', 'number', 1, 'tee_time', '09:00', 'start_hole', 1, 'player_ids', jsonb_build_array(:'ana', :'beto')),
  jsonb_build_object('number', 2, 'tee_time', '09:10', 'start_hole', 1, 'player_ids', jsonb_build_array(:'ceci')))) -> 1 ->> 'id' as g2 \gset
reset role;

-- Hole 3 disputed: group 1 says Ana, group 2 says Ceci. Hole 7: group 1 says Beto.
insert into public.hole_awards (round_id, group_id, hole, game_id, player_id, decided_by) values
  (:'r1', :'g1', 3, 'closest', :'ana', :'ana'),
  (:'r1', :'g2', 3, 'closest', :'ceci', :'ceci'),
  (:'r1', :'g1', 7, 'closest', :'beto', :'ana');

-- 1. Whose row it is follows the group, and nobody writes it otherwise
select harness.check(pg_temp.rows(3) = 'Ana:group Ceci:group', 'a group''s claim reads as the group''s: ' || pg_temp.rows(3));
select set_config('request.jwt.claims', harness.claims(:'org_a'), true) \g /dev/null
set local role authenticated;
select pg_temp.try(format('insert into public.hole_awards (round_id, group_id, hole, game_id, player_id, decided_by, source) values (%L, %L, 9, %L, %L, %L, %L)', :'r1', :'g1', 'closest', :'ana', :'ana', 'comite')) as out \gset
reset role;
select harness.check(:'out' like '428C9 %', 'a writer cannot say whose row it is (428C9): ' || :'out');
select harness.check((select pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.hole_awards'::regclass and contype = 'p') = 'PRIMARY KEY (round_id, game_id, hole, player_id, source)', 'the key takes whose row it is');

-- 2. DB-04: the Comité rules the disputed hole for Ceci, as Comité › Tarjetas does it
select set_config('request.jwt.claims', harness.claims(:'org_a'), true) \g /dev/null
set local role authenticated;
select pg_temp.try(format('delete from public.hole_awards where round_id = %L and game_id = %L and hole = 3 and group_id is null', :'r1', 'closest')) as cleared \gset
select pg_temp.try(format('insert into public.hole_awards (round_id, group_id, hole, game_id, player_id, decided_by) values (%L, null, 3, %L, %L, %L)', :'r1', 'closest', :'ceci', :'ana')) as out \gset
reset role;
select harness.check(:'cleared' = '0' and :'out' = '1', 'a ruling for a player a group claimed goes in (it hit 23505): ' || :'out');
select harness.check(pg_temp.rows(3) = 'Ana:group Ceci:comite Ceci:group', 'beside both claims: ' || pg_temp.rows(3));

-- 3. «Quitar decisión del Comité» takes the ruling only: the claims count again
select set_config('request.jwt.claims', harness.claims(:'org_a'), true) \g /dev/null
set local role authenticated;
select pg_temp.try(format('delete from public.hole_awards where round_id = %L and game_id = %L and hole = 3 and group_id is null', :'r1', 'closest')) as out \gset
reset role;
select harness.check(:'out' = '1' and pg_temp.rows(3) = 'Ana:group Ceci:group', 'clearing the ruling leaves the dispute as it was: ' || pg_temp.rows(3));

-- 4. DB-03: the Comité dissolves group 2 (Ceci joins group 1)
select set_config('request.jwt.claims', harness.claims(:'org_a'), true) \g /dev/null
set local role authenticated;
select public.upsert_groups(:'r1', jsonb_build_array(
  jsonb_build_object('id', :'g1', 'number', 1, 'tee_time', '09:00', 'start_hole', 1, 'player_ids', jsonb_build_array(:'ana', :'beto', :'ceci')))) \g /dev/null
reset role;
select harness.check(not exists (select 1 from public.groups where id = :'g2'), 'group 2 is gone');
select harness.check(pg_temp.rows(3) = 'Ana:group', 'its claim went with it, never a ruling for the whole field: ' || pg_temp.rows(3));
select harness.check(pg_temp.rows(7) = 'Beto:group', 'the claims of the group that stays stand: ' || pg_temp.rows(7));
select harness.check(not exists (select 1 from public.hole_awards where round_id = :'r1' and source = 'comite'), 'and no ruling appeared');

-- 5. A ruling outlives the groups: it belongs to no group
select set_config('request.jwt.claims', harness.claims(:'org_a'), true) \g /dev/null
set local role authenticated;
select pg_temp.try(format('insert into public.hole_awards (round_id, group_id, hole, game_id, player_id, decided_by) values (%L, null, 7, %L, %L, %L)', :'r1', 'closest', :'beto', :'ana')) as out \gset
select public.upsert_groups(:'r1', '[]'::jsonb) \g /dev/null
reset role;
select harness.check(:'out' = '1' and pg_temp.rows(7) = 'Beto:comite', 'every group deleted: the claims go, the Comité''s ruling stays: ' || pg_temp.rows(7));

-- 6. Realtime's delete event names whose row it was (the key is the replica identity)
select harness.check((select relreplident from pg_class where oid = 'public.hole_awards'::regclass) = 'd', 'deletes are published by the key, which carries it');

rollback;
