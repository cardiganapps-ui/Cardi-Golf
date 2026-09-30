-- V11 setup on my own harness db (v11_verify): a third player in group_a1, round live, five devices.
\set ON_ERROR_STOP 1
\set QUIET 1
select id as org_a from harness.seed where key = 'org_a' \gset
select id as t_a from harness.seed where key = 'tournament_a' \gset
select id as p_a1 from harness.seed where key = 'player_a1' \gset
select id as p_a2 from harness.seed where key = 'player_a2' \gset
select id as r_a1 from harness.seed where key = 'round_a1' \gset
begin;
select set_config('request.jwt.claims', harness.claims(:'org_a'), true) \g /dev/null
set local role authenticated;
insert into public.players (tournament_id, full_name, display_name, sort_order) values (:'t_a', 'Caro Alfa', 'Caro', 2) returning id as p_a3 \gset
select public.set_player_pin(:'p_a3', '1234') \g /dev/null
select public.upsert_groups(:'r_a1', jsonb_build_array(jsonb_build_object('number', 1, 'tee_time', '09:00', 'start_hole', 1, 'player_ids', jsonb_build_array(:'p_a1', :'p_a2', :'p_a3')))) \g /dev/null
update public.rounds set status = 'live' where id = :'r_a1';
commit;
insert into harness.seed (key, id, note) values ('v11_player_a3', :'p_a3', 'V11: Caro (A), PIN 1234, in group_a1');
-- Devices: Ana's second phone, Beto's two phones, Caro's phone (Ana's first phone is the seed's dev_a).
insert into auth.users (id, raw_app_meta_data, raw_user_meta_data, is_anonymous) values
  ('a2a2a2a2-0000-4000-8000-00000000a2a2', '{"provider":"anonymous","providers":["anonymous"]}', '{}', true),
  ('b1b1b1b1-0000-4000-8000-00000000b1b1', '{"provider":"anonymous","providers":["anonymous"]}', '{}', true),
  ('b2b2b2b2-0000-4000-8000-00000000b2b2', '{"provider":"anonymous","providers":["anonymous"]}', '{}', true),
  ('c1c1c1c1-0000-4000-8000-00000000c1c1', '{"provider":"anonymous","providers":["anonymous"]}', '{}', true);
insert into harness.seed (key, id, note) values
  ('v11_dev_a2', 'a2a2a2a2-0000-4000-8000-00000000a2a2', 'V11: Ana second device'),
  ('v11_dev_b1', 'b1b1b1b1-0000-4000-8000-00000000b1b1', 'V11: Beto device 1'),
  ('v11_dev_b2', 'b2b2b2b2-0000-4000-8000-00000000b2b2', 'V11: Beto device 2'),
  ('v11_dev_c1', 'c1c1c1c1-0000-4000-8000-00000000c1c1', 'V11: Caro device');
begin; select set_config('request.jwt.claims', harness.claims('a2a2a2a2-0000-4000-8000-00000000a2a2'), true) \g /dev/null
set local role authenticated; select public.claim_player(:'p_a1', '1234')::text as c \gset
commit; select harness.assert((:'c'::jsonb->>'ok')::boolean, 'claim a2 ' || :'c') \g /dev/null
begin; select set_config('request.jwt.claims', harness.claims('b1b1b1b1-0000-4000-8000-00000000b1b1'), true) \g /dev/null
set local role authenticated; select public.claim_player(:'p_a2', '1234')::text as c \gset
commit; select harness.assert((:'c'::jsonb->>'ok')::boolean, 'claim b1 ' || :'c') \g /dev/null
begin; select set_config('request.jwt.claims', harness.claims('b2b2b2b2-0000-4000-8000-00000000b2b2'), true) \g /dev/null
set local role authenticated; select public.claim_player(:'p_a2', '1234')::text as c \gset
commit; select harness.assert((:'c'::jsonb->>'ok')::boolean, 'claim b2 ' || :'c') \g /dev/null
begin; select set_config('request.jwt.claims', harness.claims('c1c1c1c1-0000-4000-8000-00000000c1c1'), true) \g /dev/null
set local role authenticated; select public.claim_player(:'p_a3', '1234')::text as c \gset
commit; select harness.assert((:'c'::jsonb->>'ok')::boolean, 'claim c1 ' || :'c') \g /dev/null
\unset QUIET
select key, id, note from harness.seed where key like 'v11%' or key in ('dev_a','player_a1','player_a2','round_a1') order by key;
select d.auth_user_id, p.display_name from public.device_sessions d join public.players p on p.id = d.player_id order by 2, 1;
select status from public.rounds where id = :'r_a1';
