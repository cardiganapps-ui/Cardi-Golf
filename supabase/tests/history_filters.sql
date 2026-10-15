-- TRUST-19 (0063): the Comité narrows Historial to a player, a day, a hole, its own corrections or the Admin de
-- Polo, on the server, so paging stays exact; and the images name no account. On the two-tenant seed: org_a runs
-- tournament A (Ana and Beto in group 1 of day 1), dev_a is Ana's phone. Rolled back at the end.
\set ON_ERROR_STOP 1
\set QUIET 1
\pset tuples_only on
\pset format unaligned
select id as org_a from harness.seed where key = 'org_a' \gset
select id as dev_a from harness.seed where key = 'dev_a' \gset
select id as t_a from harness.seed where key = 'tournament_a' \gset
select id as ana from harness.seed where key = 'player_a1' \gset
select id as beto from harness.seed where key = 'player_a2' \gset
select id as r1 from harness.seed where key = 'round_a1' \gset
begin;

create function pg_temp.as_user(uid uuid, q text) returns text language plpgsql as $$
declare
  r text;
begin
  perform set_config('request.jwt.claims', harness.claims(uid), true);
  perform set_config('cardi.comite', '', true);
  set local role authenticated;
  execute q into r;
  reset role;
  return coalesce(r, '');
exception when others then
  reset role;
  return sqlstate || ' ' || sqlerrm;
end $$;
-- An entry's row: what it left, or what a delete removed (an image the entry lacks is JSON null, not SQL null).
create function pg_temp.rec(x jsonb) returns jsonb language sql as $$ select coalesce(nullif(x -> 'after', 'null'::jsonb), x -> 'before') $$;
-- The Comité's history with a filter, as jsonb.
create function pg_temp.hist(filter jsonb, lim int default 200, before bigint default null) returns jsonb language sql as $$
  select pg_temp.as_user((select id from harness.seed where key = 'org_a'),
    format('select public.tournament_audit(%L, %s, %s, %L)::text', (select id from harness.seed where key = 'tournament_a'),
      coalesce(before::text, 'null'), lim, filter::text))::jsonb
$$;
create function pg_temp.save(round uuid, hole int, entries jsonb) returns text language sql as $$
  select pg_temp.as_user((select id from harness.seed where key = 'dev_a'), format('select public.save_hole(%L::jsonb)::text',
    jsonb_build_object('round_id', round, 'hole', hole, 'mutation_id', gen_random_uuid(), 'entries', entries)))
$$;
create function pg_temp.entry(p uuid, strokes int) returns jsonb language sql as $$
  select jsonb_build_object('player_id', p, 'fields', jsonb_build_object('strokes', strokes, 'putts', 2), 'base', '{}'::jsonb)
$$;

-- Day 1: Ana's phone saves holes 3 and 7 for both; the Comité corrects Ana's 7 and deletes Beto's 3.
update public.rounds set status = 'live' where id = :'r1';
select pg_temp.save(:'r1', 3, jsonb_build_array(pg_temp.entry(:'ana', 5), pg_temp.entry(:'beto', 6))) \g /dev/null
select pg_temp.save(:'r1', 7, jsonb_build_array(pg_temp.entry(:'ana', 4), pg_temp.entry(:'beto', 5))) \g /dev/null
select pg_temp.as_user(:'org_a', format('select public.admin_save_score(%L, %L, 7, 5, 2, false, %L)::text', :'r1', :'ana', 'Era un 5')) \g /dev/null
select pg_temp.as_user(:'org_a', format('delete from public.scores where round_id = %L and player_id = %L and hole = 3 returning hole::text', :'r1', :'beto')) \g /dev/null
-- Day 2, written as a script would: its own scores, of the same holes.
insert into public.rounds (tournament_id, number, course_id, holes, status)
  select tournament_id, 2, course_id, holes, 'live' from public.rounds where id = :'r1' returning id as r2 \gset
insert into public.scores (round_id, player_id, hole, strokes, putts, picked_up) values (:'r2', :'ana', 7, 6, 2, false), (:'r2', :'beto', 7, 4, 1, false);
-- One change the Admin de Polo made (marked as 0021 marks it).
update public.audit_log set actor_platform = true
  where id = (select max(id) from public.audit_log where tournament_id = :'t_a' and table_name = 'scores' and (after ->> 'player_id') = :'beto' and (after ->> 'round_id') = :'r2');

select pg_temp.hist('{}'::jsonb) as all_ \gset
select harness.check(jsonb_array_length(:'all_'::jsonb) >= 10, 'no filter: the whole history, as before: ' || jsonb_array_length(:'all_'::jsonb));

-- 1. A player: his rows and his own row, nobody else's.
select pg_temp.hist(jsonb_build_object('player', :'ana')) as h \gset
select harness.check(jsonb_array_length(:'h'::jsonb) > 0 and (select bool_and(pg_temp.rec(x) ->> 'player_id' = :'ana' or (x ->> 'table' = 'players' and x ->> 'rowId' = :'ana'))
    from jsonb_array_elements(:'h'::jsonb) x), 'player: only Ana''s rows');
select harness.check((select count(*) from jsonb_array_elements(:'all_'::jsonb) x where x ->> 'table' = 'scores' and pg_temp.rec(x) ->> 'player_id' = :'ana')
  = (select count(*) from jsonb_array_elements(:'h'::jsonb) x where x ->> 'table' = 'scores'), 'player: every one of Ana''s scores');

-- 2. A day: its rows and the day itself.
select pg_temp.hist(jsonb_build_object('round', :'r2')) as h \gset
select harness.check(jsonb_array_length(:'h'::jsonb) = 3 and (select bool_and(pg_temp.rec(x) ->> 'round_id' = :'r2' or (x ->> 'table' = 'rounds' and x ->> 'rowId' = :'r2'))
    from jsonb_array_elements(:'h'::jsonb) x), 'round: day 2''s two scores and the day itself: ' || jsonb_array_length(:'h'::jsonb));

-- 3. A hole: only rows of that hole.
select pg_temp.hist('{"hole": 7}'::jsonb) as h \gset
select harness.check(jsonb_array_length(:'h'::jsonb) = 5 and (select bool_and(x ->> 'table' = 'scores' and pg_temp.rec(x) ->> 'hole' = '7')
    from jsonb_array_elements(:'h'::jsonb) x), 'hole: the five writes of hole 7, both days (two captures each, one correction): ' || jsonb_array_length(:'h'::jsonb));

-- 4. Together: Ana's hole 7 on day 1 is her phone's 4, then the Comité's 5.
select pg_temp.hist(jsonb_build_object('player', :'ana', 'round', :'r1', 'hole', 7)) as h \gset
select harness.check((select string_agg(concat_ws('/', x ->> 'action', x -> 'after' ->> 'strokes', x ->> 'reason'), ' | ' order by (x ->> 'id')::bigint)
    from jsonb_array_elements(:'h'::jsonb) x) = 'INSERT/4 | UPDATE/5/Era un 5', 'player, day and hole: one hole''s story');

-- 5. The Comité's corrections: a reason of its own, or a hole it deleted; never a phone's save.
select pg_temp.hist('{"corrections": true}'::jsonb) as h \gset
select harness.check((select string_agg(concat_ws('/', x ->> 'action', pg_temp.rec(x) ->> 'hole'), ' | ' order by (x ->> 'id')::bigint)
    from jsonb_array_elements(:'h'::jsonb) x) = 'UPDATE/7 | DELETE/3', 'corrections: Ana''s 7 corrected and Beto''s 3 deleted, nothing else');

-- 6. The Admin de Polo, over the whole history (it used to filter only the pages already read).
select pg_temp.hist('{"platform": true}'::jsonb) as h \gset
select harness.check(jsonb_array_length(:'h'::jsonb) = 1 and (:'h'::jsonb -> 0 ->> 'platform')::boolean, 'platform: the one change the Admin de Polo made');

-- 7. Paging under a filter is exact: one at a time, by id, the same rows as at once.
select pg_temp.hist('{"hole": 7}'::jsonb) as whole \gset
create temp table walked (id bigint);
do $$
declare
  last bigint := null;
  page jsonb;
begin
  for i in 1..20 loop
    page := pg_temp.hist('{"hole": 7}'::jsonb, 1, last);
    exit when jsonb_array_length(page) = 0;
    last := (page -> 0 ->> 'id')::bigint;
    insert into walked values (last);
  end loop;
end $$;
select harness.check((select array_agg(id order by id desc) from walked) = (select array_agg((x ->> 'id')::bigint order by (x ->> 'id')::bigint desc) from jsonb_array_elements(:'whole'::jsonb) x),
  'a filtered history paged one by one is the same history');

-- 8. A filter it can't read is no filter, and a call without one is the old call.
select harness.check(pg_temp.hist('{"player": "nadie", "hole": "siete", "round": 3}'::jsonb) = :'all_'::jsonb
  and pg_temp.hist('"no es un objeto"'::jsonb) = :'all_'::jsonb, 'a filter it can''t read returns the whole history, never an error');
select pg_temp.as_user(:'org_a', format('select public.tournament_audit(%L, null, 200)::text', :'t_a')) as old \gset
select harness.check(:'old'::jsonb = :'all_'::jsonb, 'the three-argument call answers as before');
select harness.check((select count(*) = 1 from pg_proc where proname = 'tournament_audit' and pronamespace = 'public'::regnamespace), 'one tournament_audit: PostgREST never meets two');

-- 9. No account in any image: the tournament's creator and a money decision's author stay out.
update public.tournaments set tagline = 'Historial sin cuentas' where id = :'t_a';
insert into public.money_adjustments (tournament_id, source_key, kind, to_player_id, amount, reason, call_id, created_by)
  values (:'t_a', 'pool', 'award', :'ana', 100, 'Prueba de historial', gen_random_uuid(), :'org_a');
select pg_temp.hist('{}'::jsonb)::text as everything \gset
select harness.check(position(:'org_a' in :'everything') = 0 and position(:'dev_a' in :'everything') = 0
    and position('"created_by"' in :'everything') = 0 and position('"profile_id"' in :'everything') = 0,
  'the history names no account: not the creator, a decision''s author or a profile link');

-- 10. Still the Comité's only.
select harness.check(pg_temp.as_user(:'dev_a', format('select public.tournament_audit(%L, null, 50, %L)::text', :'t_a', '{}')) like '42501%', 'a player''s phone cannot read it');
select harness.check(not has_function_privilege('anon', 'public.tournament_audit(uuid, bigint, integer, jsonb)', 'execute'), 'nor a browser with no session');

rollback;
