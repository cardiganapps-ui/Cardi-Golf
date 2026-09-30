-- DB-11: two phones of R2 group 1 (players J1 and J2) write player J3's hole 10.
\set ON_ERROR_STOP 1
\pset footer off
select md5('r2:t12')::uuid as r2, md5('p:t12:1')::uuid as p1, md5('p:t12:2')::uuid as p2, md5('p:t12:3')::uuid as p3,
       md5('dev12')::uuid as dev2, md5('dev12-p1')::uuid as dev1, md5('t:t12')::uuid as tid \gset
begin;
insert into auth.users (id, is_anonymous) values (:'dev1', true);
insert into public.device_sessions (auth_user_id, player_id, tournament_id) values (:'dev1', :'p1', :'tid');
-- Phone of J1 writes J3's hole 10 (PostgREST upsert shape, column grants apply).
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'dev1', 'role', 'authenticated', 'is_anonymous', true)::text, true) \g /dev/null
insert into public.scores (round_id, player_id, hole, strokes, putts, picked_up, entered_by, client_ts)
values (:'r2', :'p3', 10, 5, 2, false, :'p1', now())
on conflict (round_id, player_id, hole) do update set strokes = excluded.strokes, putts = excluded.putts, picked_up = excluded.picked_up, entered_by = excluded.entered_by, client_ts = excluded.client_ts;
-- Phone of J2 overwrites with 7 strokes but says entered_by = J1.
select set_config('request.jwt.claims', json_build_object('sub', :'dev2', 'role', 'authenticated', 'is_anonymous', true)::text, true) \g /dev/null
insert into public.scores (round_id, player_id, hole, strokes, putts, picked_up, entered_by, client_ts)
values (:'r2', :'p3', 10, 7, 2, false, :'p1', now())
on conflict (round_id, player_id, hole) do update set strokes = excluded.strokes, putts = excluded.putts, picked_up = excluded.picked_up, entered_by = excluded.entered_by, client_ts = excluded.client_ts;
reset role;
select 'spoofed entered_by' as case_, s.strokes, s.disputed, (select display_name from public.players where id = s.entered_by) as entered_by,
       (select display_name from public.players where id = a.actor_player_id) as audit_actor
from public.scores s
cross join lateral (select actor_player_id from public.audit_log where table_name = 'scores' and row_id = s.id::text order by id desc limit 1) a
where s.round_id = :'r2' and s.player_id = :'p3' and s.hole = 10;
-- Control: J2's phone tells the truth → flagged.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'dev2', 'role', 'authenticated', 'is_anonymous', true)::text, true) \g /dev/null
insert into public.scores (round_id, player_id, hole, strokes, putts, picked_up, entered_by, client_ts)
values (:'r2', :'p3', 10, 6, 2, false, :'p2', now())
on conflict (round_id, player_id, hole) do update set strokes = excluded.strokes, putts = excluded.putts, picked_up = excluded.picked_up, entered_by = excluded.entered_by, client_ts = excluded.client_ts;
reset role;
select 'honest entered_by' as case_, s.strokes, s.disputed, (select display_name from public.players where id = s.entered_by) as entered_by from public.scores s
where s.round_id = :'r2' and s.player_id = :'p3' and s.hole = 10;
rollback;
