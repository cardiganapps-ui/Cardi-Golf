\set ON_ERROR_STOP 1
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', md5('org')::uuid, 'role', 'authenticated', 'is_anonymous', false)::text, true) \g /dev/null
select 'A: correcting J3 hole 5 at ' || clock_timestamp()::time;
select public.admin_save_score(md5('r1:t12')::uuid, md5('p:t12:3')::uuid, 5, 6, 2, false, 'race A');
select 'A: holding its transaction open 2 s' , pg_sleep(2);
commit;
select 'A: committed at ' || clock_timestamp()::time;
