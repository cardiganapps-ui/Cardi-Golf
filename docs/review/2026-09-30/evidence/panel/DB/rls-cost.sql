-- DB RLS cost: the client's scores read (tournamentStore inList('scores','round_id', roundIds), page 0-999)
\pset footer off
set track_functions = 'all';
select md5('dev12')::uuid as dev12, md5('dev60')::uuid as dev60, md5('r1:t12')::uuid as a1, md5('r2:t12')::uuid as a2, md5('r1:t60')::uuid as b1, md5('r2:t60')::uuid as b2 \gset
-- t12 as a PIN-claimed player
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'dev12', 'role', 'authenticated', 'is_anonymous', true)::text, true) \g /dev/null
explain (analyze, costs off, timing on, summary on) select * from public.scores where round_id in (:'a1', :'a2') order by round_id, player_id, hole limit 1000;
reset role;
select 't12 player' as who, funcname, calls from pg_stat_xact_user_functions where calls > 0 order by calls desc limit 8;
rollback;
-- t60 as a PIN-claimed player
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'dev60', 'role', 'authenticated', 'is_anonymous', true)::text, true) \g /dev/null
explain (analyze, costs off, timing on, summary on) select * from public.scores where round_id in (:'b1', :'b2') order by round_id, player_id, hole limit 1000;
reset role;
select 't60 player' as who, funcname, calls from pg_stat_xact_user_functions where calls > 0 order by calls desc limit 8;
rollback;
-- same read without RLS (postgres), for the overhead
explain (analyze, costs off, timing on, summary on) select * from public.scores where round_id in (:'b1', :'b2') order by round_id, player_id, hole limit 1000;
