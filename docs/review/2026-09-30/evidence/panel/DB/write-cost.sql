-- Cost of one write, with the functions it runs (track_functions) and what it writes.
\pset footer off
set track_functions = 'all';
select md5('dev12')::uuid as dev12, md5('org')::uuid as org,
       md5('r2:t12')::uuid as a2, md5('r1:t12')::uuid as a1, md5('r1:t60')::uuid as b1,
       md5('p:t12:3')::uuid as a_p3, md5('p:t60:3')::uuid as b_p3 \gset
-- (1) a player's upsert on a live round (PostgREST shape)
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'dev12', 'role', 'authenticated', 'is_anonymous', true)::text, true) \g /dev/null
set local statement_timeout = '8s';
explain (analyze, costs off, summary on) insert into public.scores (round_id, player_id, hole, strokes, putts, picked_up, entered_by, client_ts)
values (:'a2', :'a_p3', 5, 4, 2, false, md5('p:t12:2')::uuid, now())
on conflict (round_id, player_id, hole) do update set strokes = excluded.strokes, putts = excluded.putts, picked_up = excluded.picked_up, entered_by = excluded.entered_by, client_ts = excluded.client_ts;
reset role;
select '(1) player upsert, live round' as step, sum(calls) as fn_calls, count(*) as distinct_fns from pg_stat_xact_user_functions where calls > 0;
rollback;
-- (2) Comité correction on the FINISHED round, 12 players (signed card → reason)
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'org', 'role', 'authenticated', 'is_anonymous', false)::text, true) \g /dev/null
set local statement_timeout = '8s';
\timing on
select public.admin_save_score(:'a1', :'a_p3', 5, 6, 2, false, 'panel: correction');
\timing off
reset role;
select '(2) Comité fix, finished round, 12 linked' as step, sum(calls) as fn_calls from pg_stat_xact_user_functions where calls > 0;
select funcname, calls from pg_stat_xact_user_functions where funcname in ('refresh_round_results','recompute_profile_index','recompute_rivalry','recompute_rivalries_of','notify','audit_row') order by 1;
rollback;
-- (3) the same on the 60-player tournament
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'org', 'role', 'authenticated', 'is_anonymous', false)::text, true) \g /dev/null
set local statement_timeout = '8s';
\timing on
select public.admin_save_score(:'b1', :'b_p3', 5, 6, 2, false, 'panel: correction');
\timing off
reset role;
select '(3) Comité fix, finished round, 60 linked' as step, sum(calls) as fn_calls from pg_stat_xact_user_functions where calls > 0;
select funcname, calls from pg_stat_xact_user_functions where funcname in ('refresh_round_results','recompute_profile_index','recompute_rivalry','recompute_rivalries_of','notify','audit_row') order by 1;
rollback;
