-- DB-03 via Comité › Grupos: save round 1's groups without group 2 (its players moved to group 1).
\set ON_ERROR_STOP 1
\pset footer off
select md5('org')::uuid as org, md5('r1:t12')::uuid as r1 \gset
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'org', 'role', 'authenticated', 'is_anonymous', false)::text, true) \g /dev/null
select 'before' as t, a.hole, p.display_name, case when a.group_id is null then 'COMITE' else 'grupo ' || g.number end as source
from public.hole_awards a join public.players p on p.id = a.player_id left join public.groups g on g.id = a.group_id where a.round_id = :'r1' order by 2, 3;
select public.upsert_groups(:'r1', jsonb_build_array(
  jsonb_build_object('id', md5('g1:t12:1')::uuid, 'number', 1, 'start_hole', 1, 'player_ids', jsonb_build_array(md5('p:t12:1')::uuid, md5('p:t12:2')::uuid, md5('p:t12:3')::uuid, md5('p:t12:4')::uuid, md5('p:t12:5')::uuid, md5('p:t12:6')::uuid)),
  jsonb_build_object('id', md5('g1:t12:3')::uuid, 'number', 2, 'start_hole', 1, 'player_ids', jsonb_build_array(md5('p:t12:7')::uuid, md5('p:t12:8')::uuid, md5('p:t12:9')::uuid, md5('p:t12:10')::uuid, md5('p:t12:11')::uuid, md5('p:t12:12')::uuid))
)) \g /dev/null
select 'after' as t, a.hole, p.display_name, case when a.group_id is null then 'COMITE' else 'grupo ' || g.number end as source
from public.hole_awards a join public.players p on p.id = a.player_id left join public.groups g on g.id = a.group_id where a.round_id = :'r1' order by 2, 3;
rollback;
