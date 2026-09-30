-- Repro (harness, seeded db; rolled back): a group mate's device can replace
-- another player's score WITHOUT the discrepancy flag by DELETE + INSERT,
-- while the same change through UPDATE/upsert is flagged (0010 scores_detect_dispute).
--   psql -h 127.0.0.1 -p 5433 -U postgres -X -v ON_ERROR_STOP=1 -d <seeded db> -f scores-delete-bypass.sql
\set ON_ERROR_STOP 1
\set QUIET 1
\pset tuples_only on
\pset format unaligned
select id as org_a from harness.seed where key = 'org_a' \gset
select id as dev_a from harness.seed where key = 'dev_a' \gset
select id as p_a1 from harness.seed where key = 'player_a1' \gset
select id as p_a2 from harness.seed where key = 'player_a2' \gset
select id as r_a1 from harness.seed where key = 'round_a1' \gset
begin;
-- Beto's own phone (a second anonymous device) claims Beto.
insert into auth.users (id, is_anonymous) values ('dddddddd-0000-4000-8000-0000000000b2', true);
select set_config('request.jwt.claims', harness.claims('dddddddd-0000-4000-8000-0000000000b2'), true) \g /dev/null
set local role authenticated;
select (public.claim_player(:'p_a2', '1234') ->> 'ok') as ok_b \gset
reset role;
-- The round goes live (organizer A).
select set_config('request.jwt.claims', harness.claims(:'org_a'), true) \g /dev/null
set local role authenticated;
update public.rounds set status = 'live' where id = :'r_a1';
reset role;
-- Beto's phone enters his holes 1 and 2: 5 strokes each.
select set_config('request.jwt.claims', harness.claims('dddddddd-0000-4000-8000-0000000000b2'), true) \g /dev/null
set local role authenticated;
insert into public.scores (round_id, player_id, hole, strokes, putts, picked_up, entered_by, client_ts)
values (:'r_a1', :'p_a2', 1, 5, 2, false, :'p_a2', now()), (:'r_a1', :'p_a2', 2, 5, 2, false, :'p_a2', now());
reset role;
-- Ana's phone (dev_a) changes Beto's hole 1 the way the app writes (upsert) → flagged.
select set_config('request.jwt.claims', harness.claims(:'dev_a'), true) \g /dev/null
set local role authenticated;
insert into public.scores (round_id, player_id, hole, strokes, putts, picked_up, entered_by, client_ts)
values (:'r_a1', :'p_a2', 1, 3, 1, false, :'p_a1', now())
on conflict (round_id, player_id, hole) do update
  set strokes = excluded.strokes, putts = excluded.putts, picked_up = excluded.picked_up, entered_by = excluded.entered_by, client_ts = excluded.client_ts;
-- ... and Beto's hole 2 by DELETE + INSERT → not flagged.
delete from public.scores where round_id = :'r_a1' and player_id = :'p_a2' and hole = 2;
insert into public.scores (round_id, player_id, hole, strokes, putts, picked_up, entered_by, client_ts)
values (:'r_a1', :'p_a2', 2, 3, 1, false, :'p_a1', now());
reset role;
select 'claim Beto: ' || :'ok_b';
select format('hole %s: strokes %s, entered_by %s, disputed %s, previous %s', hole, strokes,
              case entered_by when :'p_a1' then 'Ana''s phone' else 'Beto''s phone' end, disputed, coalesce(previous::text, 'null'))
from public.scores where round_id = :'r_a1' and player_id = :'p_a2' order by hole;
select 'audit rows for hole 2: ' || string_agg(action, ', ' order by id) from public.audit_log
where table_name = 'scores' and after ->> 'hole' = '2' or (table_name = 'scores' and before ->> 'hole' = '2');
select harness.check((select disputed from public.scores where round_id = :'r_a1' and player_id = :'p_a2' and hole = 1),
  'control: an upsert over another device''s score is flagged disputed');
select harness.check((select not disputed and previous is null from public.scores where round_id = :'r_a1' and player_id = :'p_a2' and hole = 2),
  'BYPASS: delete + insert of the same change leaves disputed = false, previous = null');
rollback;
