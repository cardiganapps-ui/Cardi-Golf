-- Comité › Rondas › delete a round (api.ts deleteRound) on panel-t12, then read the tournament's
-- Historial exactly as the app does (tournament_audit RPC).
\pset footer off
select md5('org')::uuid as org, md5('t:t12')::uuid as tid, md5('r2:t12')::uuid as r2 \gset
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'org', 'role', 'authenticated', 'is_anonymous', false)::text, true) \g /dev/null
delete from public.rounds where id = :'r2';
select 'Historial (tournament_audit, 200 newest)' as what, x ->> 'table' as tbl, x ->> 'action' as action, count(*)
from jsonb_array_elements(public.tournament_audit(:'tid', null, 200)) x where x ->> 'action' = 'DELETE' group by 2, 3 order by 2;
reset role;
select 'audit_log rows written by the delete' as what, table_name, count(*) filter (where tournament_id is null) as tournament_null, count(*) filter (where tournament_id is not null) as tournament_set
from public.audit_log where action = 'DELETE' and at = now() group by table_name order by 2;
rollback;
