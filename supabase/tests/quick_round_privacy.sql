-- TRUST-23 (0060): a Ronda rápida copies only what a friend shows anyone in it, and «No soy yo» takes his photo
-- back. Rolled back at the end; prints one «ok» line per check.
\set ON_ERROR_STOP 1
\set QUIET 1
\pset tuples_only on
\pset format unaligned
select id as t_b from harness.seed where key = 'tournament_b' \gset
\set me '00000060-0000-4000-8000-000000000001'
\set hidden '00000060-0000-4000-8000-000000000002'
\set open '00000060-0000-4000-8000-000000000003'
begin;
select settings::text as quick_settings from public.tournaments where id = :'t_b' \gset
insert into public.courses (id, name) values ('00000060-0000-4000-8000-0000000000c1', 'Campo privado');
insert into public.tees (id, course_id, name, rating, slope, par_total) values ('00000060-0000-4000-8000-0000000000e1', '00000060-0000-4000-8000-0000000000c1', 'Blancas', 72, 113, 72);
insert into public.holes (tee_id, number, par, stroke_index) select '00000060-0000-4000-8000-0000000000e1', n, 4, n from generate_series(1, 18) n;
insert into auth.users (id, email, email_confirmed_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data, is_anonymous)
select u::uuid, 'q' || right(u, 1) || '@polo.test', now(), now(), '{"provider":"email","providers":["email"]}', '{}', false
from unnest(array[:'me', :'hidden', :'open']) u;
insert into public.profiles (id, handle, display_name, full_name, avatar_url, discoverable) values
  (:'me', 'creador60', 'Creador', 'Creador Completo', 'https://img.test/creador.png', false),
  (:'hidden', 'oculto60', 'Oculto', 'Nombre Privado Completo', 'https://img.test/oculto.png', false),
  (:'open', 'abierto60', 'Abierto', 'Abierto Completo', 'https://img.test/abierto.png', true);
insert into public.friendships (a, b, status, responded_at) values (:'me', :'hidden', 'accepted', now()), (:'me', :'open', 'accepted', now());

select set_config('request.jwt.claims', harness.claims(:'me'), true) \g /dev/null
set local role authenticated;
select public.create_quick_round(jsonb_build_object('name', 'Rápida privada', 'settings', :'quick_settings'::jsonb, 'courseId', '00000060-0000-4000-8000-0000000000c1',
  'teeId', '00000060-0000-4000-8000-0000000000e1', 'date', current_date, 'players', jsonb_build_array(
    jsonb_build_object('kind', 'me'), jsonb_build_object('kind', 'friend', 'handle', 'oculto60'), jsonb_build_object('kind', 'friend', 'handle', 'abierto60')))) ->> 'id' as q \gset
reset role;

-- 1. The creator keeps his own names and photo.
select harness.check((select full_name = 'Creador Completo' and avatar_url = 'https://img.test/creador.png' from public.players where tournament_id = :'q' and profile_id = :'me'),
  'the creator comes in with his own full name and photo');
-- 2. A friend with a hidden card: his short name, no full name, no photo.
select harness.check((select full_name = 'Oculto' and display_name = 'Oculto' and avatar_url is null from public.players where tournament_id = :'q' and profile_id = :'hidden'),
  'a friend with a hidden profile comes in with his short name only: no private full name, no photo');
select harness.check(not exists (select 1 from public.players where tournament_id = :'q' and full_name like '%Privado%'), 'his full name is nowhere in the round');
-- 3. A friend with a public card: his short name and the photo his card shows anyone.
select harness.check((select full_name = 'Abierto' and avatar_url = 'https://img.test/abierto.png' from public.players where tournament_id = :'q' and profile_id = :'open'),
  'a friend with a public card comes in with his short name and his card''s photo');

-- 4. «No soy yo» on the pending link: the player keeps its name and loses his photo.
select id as open_player from public.players where tournament_id = :'q' and profile_id = :'open' \gset
select set_config('request.jwt.claims', harness.claims(:'open'), true) \g /dev/null
set local role authenticated;
select public.unlink_my_profile(:'open_player')::text as unlinked \gset
reset role;
select harness.check(:'unlinked' = 'true' and (select profile_id is null and avatar_url is null and display_name = 'Abierto' from public.players where id = :'open_player'),
  '«No soy yo» on a pending link takes his photo off the player, which keeps its name');

rollback;
