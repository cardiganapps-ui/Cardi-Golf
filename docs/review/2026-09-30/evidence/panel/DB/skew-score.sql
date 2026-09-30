-- An admin phone's pending score for the LIVE round 2 (J5, hole 1: 4 → 9) is in flight...
\set ON_ERROR_STOP 1
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', md5('org')::uuid, 'role', 'authenticated', 'is_anonymous', false)::text, true) \g /dev/null
insert into public.scores (round_id, player_id, hole, strokes, putts, picked_up, entered_by, client_ts)
values (md5('r2:t12')::uuid, md5('p:t12:5')::uuid, 1, 9, 2, false, null, now())
on conflict (round_id, player_id, hole) do update set strokes = excluded.strokes, putts = excluded.putts, picked_up = excluded.picked_up, client_ts = excluded.client_ts;
select 'score txn: written, commits in 2 s', pg_sleep(2);
commit;
select 'score txn: committed ' || clock_timestamp()::time;
