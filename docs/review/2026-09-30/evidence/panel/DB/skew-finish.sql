-- ...while the Comité presses «Terminar ronda» (setRoundStatus → update rounds).
\set ON_ERROR_STOP 1
select pg_sleep(0.5) \g /dev/null
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', md5('org')::uuid, 'role', 'authenticated', 'is_anonymous', false)::text, true) \g /dev/null
update public.rounds set status = 'finished' where id = md5('r2:t12')::uuid;
commit;
select 'finish txn: committed ' || clock_timestamp()::time;
