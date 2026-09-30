\set ON_ERROR_STOP 1
select pg_sleep(0.5) \g /dev/null
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', md5('org')::uuid, 'role', 'authenticated', 'is_anonymous', false)::text, true) \g /dev/null
select 'B: correcting J4 hole 6 at ' || clock_timestamp()::time;
select public.admin_save_score(md5('r1:t12')::uuid, md5('p:t12:4')::uuid, 6, 7, 2, false, 'race B');
commit;
select 'B: committed at ' || clock_timestamp()::time;
