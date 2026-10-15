-- TRUST-08 (0058): finding people is opt-in, and search can't read out the directory. Rolled back at the end;
-- prints one «ok» line per check.
\set ON_ERROR_STOP 1
\set QUIET 1
\pset tuples_only on
\pset format unaligned
\set me '00000058-0000-4000-8000-000000000001'
\set open '00000058-0000-4000-8000-000000000002'
\set hidden '00000058-0000-4000-8000-000000000003'
\set friend '00000058-0000-4000-8000-000000000004'
\set fresh '00000058-0000-4000-8000-000000000005'
begin;

insert into auth.users (id, email, email_confirmed_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data, is_anonymous)
select u::uuid, 'disc' || right(u, 1) || '@polo.test', now(), now(), '{"provider":"email","providers":["email"]}', '{}', false
from unnest(array[:'me', :'open', :'hidden', :'friend', :'fresh']) u;
-- Everyone named Zacarías, so two letters match them all.
insert into public.profiles (id, handle, display_name, home_club, city, discoverable) values
  (:'me', 'yo58', 'Yo Mismo', null, null, false),
  (:'open', 'zacarias.abierto', 'Zacarías Abierto', 'Club Abierto', 'Cabo', true),
  (:'hidden', 'zacarias.oculto', 'Zacarías Oculto', 'Club Oculto', 'Cabo', false),
  (:'friend', 'zacarias.amigo', 'Zacarías Amigo', 'Club Amigo', 'Cabo', false);
insert into public.friendships (a, b, status, responded_at) values (:'me', :'friend', 'accepted', now());

create function pg_temp.search(uid uuid, q text) returns jsonb language plpgsql as $$
declare
  r jsonb;
begin
  perform set_config('request.jwt.claims', harness.claims(uid), true);
  set local role authenticated;
  r := public.search_profiles(q);
  reset role;
  return r;
end $$;

-- 1. A profile made now starts out of search.
select harness.check((select column_default from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'discoverable') = 'false',
  'a new profile starts out of search');

-- 2. Two letters: only the people I know, with their club.
select pg_temp.search(:'me', 'za') as two \gset
select harness.check(jsonb_array_length(:'two'::jsonb) = 1 and (:'two'::jsonb -> 0 ->> 'handle') = 'zacarias.amigo' and (:'two'::jsonb -> 0 ->> 'homeClub') = 'Club Amigo',
  'two letters find only a friend, with his club');

-- 3. Three letters: the friend and the stranger who chose to be found, the stranger without club or city; never the hidden one.
select pg_temp.search(:'me', 'zac') as three \gset
select harness.check(
  (select array_agg(h ->> 'handle' order by h ->> 'handle') from jsonb_array_elements(:'three'::jsonb) h) = array['zacarias.abierto', 'zacarias.amigo']
  and (select (h ->> 'homeClub') is null and (h ->> 'city') is null from jsonb_array_elements(:'three'::jsonb) h where h ->> 'handle' = 'zacarias.abierto')
  and (:'three'::jsonb -> 0 ->> 'handle') = 'zacarias.amigo',
  'three letters add the stranger who chose to be found, with no club or city, after the people I know; never the hidden one');

-- 4. At most ten strangers per search.
insert into auth.users (id, email, email_confirmed_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data, is_anonymous)
select ('00000058-0000-4000-8000-0000000001' || lpad(i::text, 2, '0'))::uuid, 'many' || i || '@polo.test', now(), now(), '{"provider":"email","providers":["email"]}', '{}', false
from generate_series(1, 15) i;
insert into public.profiles (id, handle, display_name, discoverable)
select ('00000058-0000-4000-8000-0000000001' || lpad(i::text, 2, '0'))::uuid, 'zacarias' || i, 'Zacarías ' || i, true from generate_series(1, 15) i;
select pg_temp.search(:'me', 'zac') as many \gset
select harness.check(jsonb_array_length(:'many'::jsonb) = 11, 'ten strangers at most, plus the friend');

rollback;
