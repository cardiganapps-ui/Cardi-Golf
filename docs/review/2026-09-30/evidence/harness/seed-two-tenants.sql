-- ===========================================================================
-- Polo harness seed: two tenants, created the way the app creates them.
--   psql -h 127.0.0.1 -p 5433 -U postgres -X -v ON_ERROR_STOP=1 -d <db> -f seed-two-tenants.sql
-- (bootstrap.sh <db> --seed does exactly that). Run once per database.
--
-- Mirrors src/data/api.ts and scripts/rls-test.mjs: each step runs as the
-- user who does it in the app (role authenticated + that user's JWT claims):
--   organizer  → create_tournament(name, settings)       (RPC)
--              → insert into players ... returning id      (table, under RLS)
--              → set_player_pin(player, '1234')             (RPC)
--              → insert into rounds ... returning id       (table, under RLS)
--              → upsert_groups(round, [{number, player_ids}]) (RPC)
--   anonymous device → claim_player(player, '1234')         (RPC)
-- Settings = scripts/fixtures/settings-minimal.json (as used by rls-test.mjs).
-- Auth users are inserted directly (that is GoTrue's job; there is no GoTrue).
-- All ids end up in harness.seed:  select * from harness.seed order by key;
-- ===========================================================================
\set ON_ERROR_STOP 1
\set QUIET 1
\pset footer off

\set settings '{"modules":{"individual":{"enabled":true,"label":"Individual","format":"stableford"},"bestRound":{"enabled":false,"label":"Mejor ronda"},"pairs":{"enabled":false,"label":"Parejas","pairing":[],"honoreePicks":false},"snake":{"enabled":false,"label":"La Víbora","puttsThreshold":3},"fewestPutts":{"enabled":false,"label":"Menos putts"},"auction":{"enabled":false,"label":"La Calcutta"}},"tiers":[],"rounds":1,"groupSize":4,"labels":{"lastPlace":"Último lugar","honoree":"Homenajeado"},"entryFee":500,"handicap":{"allowance":0.8,"cap":54,"rounding":"halfUp","perRoundSlope":false,"estimateWeights":[0.45,0.4,0.15]},"day2Cut":{"threshold":36,"pointsPerStroke":2,"maxStrokes":4},"prizes":{"stableford":[2500,1000,500],"pairs":[],"bestRoundPerDay":0,"snakePerSurvivor":0,"fewestPutts":0},"auction":{"openingBid":250,"increment":250,"maxPlayersPerOwner":3,"selfOwnedCountsTowardMax":true,"guestsCanBid":false,"buybackMaxPct":50,"payout":[{"slot":"place","place":1,"share":0.55},{"slot":"place","place":2,"share":0.2},{"slot":"bestOfTier","tier":"C","share":0.1},{"slot":"bestOfTier","tier":"D","share":0.1},{"slot":"lastPlace","share":0.05}]},"pickupPuttsForFewestPutts":3,"tieFallback":"split","spectatorLink":false,"timezone":"America/Mazatlan","currency":"MXN"}'

-- Fixed, recognizable auth ids (tournament/player/round/group ids are random, as in the app).
\set org_a   'aaaaaaaa-aaaa-4aaa-8aaa-00000000000a'
\set org_b   'bbbbbbbb-bbbb-4bbb-8bbb-00000000000b'
\set dev_a   'dddddddd-dddd-4ddd-8ddd-00000000000d'
\set dev_x   'eeeeeeee-eeee-4eee-8eee-00000000000e'
\set padmin  'ffffffff-ffff-4fff-8fff-00000000000f'

-- JWT claims, shaped like Supabase's (anonymous sign-ins are role "authenticated" + is_anonymous).
\set jwt_org_a '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-00000000000a","role":"authenticated","aud":"authenticated","email":"org-a@polo.test","is_anonymous":false,"user_metadata":{"display_name":"Organizadora A"},"app_metadata":{"provider":"email","providers":["email"]}}'
\set jwt_org_b '{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-00000000000b","role":"authenticated","aud":"authenticated","email":"org-b@polo.test","is_anonymous":false,"user_metadata":{"display_name":"Organizador B"},"app_metadata":{"provider":"email","providers":["email"]}}'
\set jwt_dev_a '{"sub":"dddddddd-dddd-4ddd-8ddd-00000000000d","role":"authenticated","aud":"authenticated","is_anonymous":true,"user_metadata":{},"app_metadata":{"provider":"anonymous","providers":["anonymous"]}}'

-- ---------------------------------------------------------------------------
-- 0. Harness bookkeeping (schema harness: never granted to the API roles)
-- ---------------------------------------------------------------------------
create schema harness;
revoke all on schema harness from public;
create table harness.seed (key text primary key, id uuid not null, note text);
create function harness.assert(ok boolean, msg text)
returns void language plpgsql as $$
begin
  if ok is distinct from true then
    raise exception 'ASSERTION FAILED: %', msg;
  end if;
end
$$;
-- Same, but returns a printable 'ok - <msg>' line (for test scripts).
create function harness.check(ok boolean, msg text)
returns text language plpgsql as $$
begin
  if ok is distinct from true then
    raise exception 'CHECK FAILED: %', msg;
  end if;
  return 'ok - ' || msg;
end
$$;
-- The JWT claims PostgREST would set for a harness user (anonymous device or account).
create function harness.claims(uid uuid)
returns text language sql stable as $$
  select json_build_object(
    'sub', u.id, 'role', 'authenticated', 'aud', 'authenticated',
    'email', coalesce(u.email, ''), 'is_anonymous', u.is_anonymous,
    'user_metadata', coalesce(u.raw_user_meta_data, '{}'::jsonb),
    'app_metadata', coalesce(u.raw_app_meta_data, '{}'::jsonb))::text
  from auth.users u where u.id = uid
$$;

-- ---------------------------------------------------------------------------
-- 1. Accounts (what GoTrue would have inserted). Emails are fictitious.
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, encrypted_password, email_confirmed_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data, is_anonymous)
values
  (:'org_a', 'org-a@polo.test', null, now(), now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Organizadora A"}', false),
  (:'org_b', 'org-b@polo.test', null, now(), now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Organizador B"}', false),
  (:'dev_a', null, null, null, now(), '{"provider":"anonymous","providers":["anonymous"]}', '{}', true),
  (:'dev_x', null, null, null, now(), '{"provider":"anonymous","providers":["anonymous"]}', '{}', true),
  (:'padmin', 'admin@polo.test', null, now(), now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Admin Harness"}', false);
insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at)
values
  (:'org_a', :'org_a', jsonb_build_object('sub', :'org_a', 'email', 'org-a@polo.test', 'email_verified', true), 'email', now()),
  (:'org_b', :'org_b', jsonb_build_object('sub', :'org_b', 'email', 'org-b@polo.test', 'email_verified', true), 'email', now()),
  (:'padmin', :'padmin', jsonb_build_object('sub', :'padmin', 'email', 'admin@polo.test', 'email_verified', true), 'email', now());
-- The platform admin is seeded by 0021 from one real email; here a fictitious one.
insert into public.platform_admins (auth_user_id, note) values (:'padmin', 'harness platform admin (fictitious)');

-- ---------------------------------------------------------------------------
-- 2. Organizer A: tournament, two players with PIN 1234, round 1, group 1
-- ---------------------------------------------------------------------------
begin;
select set_config('request.jwt.claims', :'jwt_org_a', true) \g /dev/null
set local role authenticated;
select id as t_a, slug as t_a_slug, join_code as t_a_code
  from public.create_tournament('Seed Torneo A', :'settings'::jsonb) \gset
insert into public.players (tournament_id, full_name, display_name, sort_order)
  values (:'t_a', 'Ana Alfa', 'Ana', 0) returning id as p_a1 \gset
insert into public.players (tournament_id, full_name, display_name, sort_order)
  values (:'t_a', 'Beto Alfa', 'Beto', 1) returning id as p_a2 \gset
select public.set_player_pin(:'p_a1', '1234') \g /dev/null
select public.set_player_pin(:'p_a2', '1234') \g /dev/null
insert into public.rounds (tournament_id, number, holes)
  values (:'t_a', 1, 18) returning id as r_a1 \gset
select public.upsert_groups(:'r_a1', jsonb_build_array(jsonb_build_object(
  'number', 1, 'tee_time', '09:00', 'start_hole', 1, 'player_ids', jsonb_build_array(:'p_a1', :'p_a2')))) -> 0 ->> 'id' as g_a1 \gset
commit;

-- ---------------------------------------------------------------------------
-- 3. Organizer B: the same, in its own tenant
-- ---------------------------------------------------------------------------
begin;
select set_config('request.jwt.claims', :'jwt_org_b', true) \g /dev/null
set local role authenticated;
select id as t_b, slug as t_b_slug, join_code as t_b_code
  from public.create_tournament('Seed Torneo B', :'settings'::jsonb) \gset
insert into public.players (tournament_id, full_name, display_name, sort_order)
  values (:'t_b', 'Carla Beta', 'Carla', 0) returning id as p_b1 \gset
insert into public.players (tournament_id, full_name, display_name, sort_order)
  values (:'t_b', 'Dani Beta', 'Dani', 1) returning id as p_b2 \gset
select public.set_player_pin(:'p_b1', '1234') \g /dev/null
select public.set_player_pin(:'p_b2', '1234') \g /dev/null
insert into public.rounds (tournament_id, number, holes)
  values (:'t_b', 1, 18) returning id as r_b1 \gset
select public.upsert_groups(:'r_b1', jsonb_build_array(jsonb_build_object(
  'number', 1, 'tee_time', '09:00', 'start_hole', 1, 'player_ids', jsonb_build_array(:'p_b1', :'p_b2')))) -> 0 ->> 'id' as g_b1 \gset
commit;

-- ---------------------------------------------------------------------------
-- 4. An anonymous device claims Ana (tournament A) with her PIN
-- ---------------------------------------------------------------------------
begin;
select set_config('request.jwt.claims', :'jwt_dev_a', true) \g /dev/null
set local role authenticated;
select public.claim_player(:'p_a1', '1234')::text as claim \gset
commit;
select harness.assert((:'claim'::jsonb ->> 'ok')::boolean, 'claim_player failed: ' || :'claim') \g /dev/null

-- ---------------------------------------------------------------------------
-- 5. Record and print
-- ---------------------------------------------------------------------------
insert into harness.seed (key, id, note) values
  ('org_a',       :'org_a',  'organizer A (auth user, org-a@polo.test), owner of tournament A'),
  ('org_b',       :'org_b',  'organizer B (auth user, org-b@polo.test), owner of tournament B'),
  ('dev_a',       :'dev_a',  'anonymous device that claimed player_a1 (Ana) with PIN 1234'),
  ('dev_x',       :'dev_x',  'anonymous device with no claim (reads nothing)'),
  ('platform_admin', :'padmin', 'EXTRA: platform admin account (admin@polo.test)'),
  ('tournament_a', :'t_a',   'Seed Torneo A, slug ' || :'t_a_slug' || ', join code ' || :'t_a_code'),
  ('tournament_b', :'t_b',   'Seed Torneo B, slug ' || :'t_b_slug' || ', join code ' || :'t_b_code'),
  ('player_a1',   :'p_a1',   'Ana (A), PIN 1234, claimed by dev_a'),
  ('player_a2',   :'p_a2',   'Beto (A), PIN 1234'),
  ('player_b1',   :'p_b1',   'Carla (B), PIN 1234'),
  ('player_b2',   :'p_b2',   'Dani (B), PIN 1234'),
  ('round_a1',    :'r_a1',   'tournament A round 1 (status scheduled, 18 holes, no course)'),
  ('round_b1',    :'r_b1',   'tournament B round 1 (status scheduled, 18 holes, no course)'),
  ('group_a1',    :'g_a1',   'round_a1 group 1: Ana + Beto, 09:00, hole 1'),
  ('group_b1',    :'g_b1',   'round_b1 group 1: Carla + Dani, 09:00, hole 1');

\unset QUIET
\echo
\echo 'Polo harness seed: two tenants'
select key, id, note from harness.seed order by key;
