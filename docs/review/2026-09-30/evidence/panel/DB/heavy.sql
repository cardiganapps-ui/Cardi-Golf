-- Heavy Comité operations on the 60-player tournament, as the organizer, statement_timeout 8s.
\pset footer off
select md5('org')::uuid as org, md5('t:t60')::uuid as tid \gset
update public.rounds set status = 'finished' where tournament_id = :'tid';
update public.tournaments set status = 'finished' where id = :'tid';
\echo '--- publish_tournament_results (60 rows)'
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'org', 'role', 'authenticated', 'is_anonymous', false)::text, true) \g /dev/null
set local statement_timeout = '8s';
\timing on
select public.publish_tournament_results(:'tid',
  (select jsonb_agg(jsonb_build_object('playerId', p.id, 'rank', p.sort_order, 'rankLabel', p.sort_order::text, 'points', 70 - p.sort_order, 'perRound', jsonb_build_array(36, 34), 'awards', '[]'::jsonb, 'net', 100 - p.sort_order))
   from public.players p where p.tournament_id = :'tid'), 'MXN');
\timing off
commit;
\echo '--- delete the tournament (owner), cascade + audit'
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'org', 'role', 'authenticated', 'is_anonymous', false)::text, true) \g /dev/null
set local statement_timeout = '8s';
\timing on
delete from public.tournaments where id = :'tid';
\timing off
reset role;
select 'audit rows written by the delete' as what, count(*) filter (where tournament_id = :'tid') as with_tournament,
       count(*) filter (where tournament_id is null) as orphaned_null_tournament,
       string_agg(distinct table_name, ',') filter (where tournament_id is null) as orphaned_tables
from public.audit_log where action = 'DELETE' and at = now();
rollback;
