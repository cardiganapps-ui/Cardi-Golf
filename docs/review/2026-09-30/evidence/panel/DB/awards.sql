-- DB-04: the Comité rules the disputed hole 3 (group 1 claimed J1, group 2 claimed J5) for J5,
-- exactly as src/data/api.ts adminSetAwards does it: delete group-less rows, insert group_id null.
\set ON_ERROR_STOP 0
\pset footer off
select md5('org')::uuid as org, md5('r1:t12')::uuid as r1 \gset
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'org', 'role', 'authenticated', 'is_anonymous', false)::text, true);
select a.hole, p.display_name, a.group_id is null as comite from public.hole_awards a join public.players p on p.id = a.player_id where a.round_id = :'r1' and a.game_id = 'ctp' order by 1, 2;
delete from public.hole_awards where round_id = :'r1' and game_id = 'ctp' and hole = 3 and group_id is null;
insert into public.hole_awards (round_id, group_id, hole, game_id, player_id, decided_by) values (:'r1', null, 3, 'ctp', md5('p:t12:5')::uuid, null);
rollback;
