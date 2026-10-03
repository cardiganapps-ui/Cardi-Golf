-- ===========================================================================
-- Polo harness self-test. Needs a SEEDED database; changes nothing (one
-- transaction, rolled back at the end).
--   psql -h 127.0.0.1 -p 5433 -U postgres -X -v ON_ERROR_STOP=1 -d <db> -f selftest.sql
-- Pattern used throughout (copy it for your own probes):
--   select set_config('request.jwt.claims', harness.claims('<auth uid>'), true);  -- as postgres
--   set local role authenticated;   -- or anon (no claims) / service_role
--   <query> \gset                   -- capture while impersonating
--   reset role;                     -- back to postgres
--   select harness.check(<condition on the captured values>, '<what it proves>');
-- ===========================================================================
\set ON_ERROR_STOP 1
\set QUIET 1
\pset tuples_only on
\pset format unaligned

select id as org_a from harness.seed where key = 'org_a' \gset
select id as org_b from harness.seed where key = 'org_b' \gset
select id as dev_a from harness.seed where key = 'dev_a' \gset
select id as dev_x from harness.seed where key = 'dev_x' \gset
select id as t_a from harness.seed where key = 'tournament_a' \gset
select id as t_b from harness.seed where key = 'tournament_b' \gset
select id as p_a1 from harness.seed where key = 'player_a1' \gset
select id as p_a2 from harness.seed where key = 'player_a2' \gset
select id as p_b1 from harness.seed where key = 'player_b1' \gset
select id as r_a1 from harness.seed where key = 'round_a1' \gset
select join_code as code_a from public.tournaments where id = :'t_a' \gset

begin;

-- 1. anon: the public key with no session
select set_config('request.jwt.claims', '', true) \g /dev/null
set local role anon;
select count(*) as n from public.players \gset
select count(*) as nt from public.tournaments \gset
reset role;
select harness.check(:n = 0 and :nt = 0, 'anon (no session) reads 0 players and 0 tournaments');
select set_config('harness.code', :'code_a', true) \g /dev/null
set local role anon;
do $$ begin
  perform public.lookup_tournament(current_setting('harness.code'));
  perform set_config('harness.out', 'no error', true);
exception when others then
  perform set_config('harness.out', sqlstate, true);
end $$;
reset role;
select harness.check(current_setting('harness.out') = '42501', 'anon cannot call lookup_tournament (42501 Sin sesión)');

-- 2. an anonymous device with no claim
select set_config('request.jwt.claims', harness.claims(:'dev_x'), true) \g /dev/null
set local role authenticated;
select count(*) as n from public.players \gset
select count(*) as nt from public.tournaments \gset
select public.lookup_tournament(:'code_a')::text as grid \gset
reset role;
select harness.check(:n = 0 and :nt = 0, 'anonymous device without a claim reads 0 players and 0 tournaments');
select harness.check(jsonb_array_length(:'grid'::jsonb -> 'players') = 2 and (:'grid'::jsonb ->> 'joinCode') is null,
  'but lookup_tournament(join code) shows it the face grid (2 players) without the join code');

-- 3. the device that claimed Ana (tournament A)
select set_config('request.jwt.claims', harness.claims(:'dev_a'), true) \g /dev/null
set local role authenticated;
select count(*) as nt, bool_and(id = :'t_a') as only_a from public.tournaments \gset
select count(*) as na from public.players where tournament_id = :'t_a' \gset
select count(*) as nb from public.players where tournament_id = :'t_b' \gset
select public.my_membership(:'t_a') ->> 'playerId' as me \gset
select count(*) as npins from public.player_pins \gset
reset role;
select harness.check(:nt = 1 and :'only_a'::boolean, 'claimed device reads exactly tournament A');
select harness.check(:na = 2 and :nb = 0, 'claimed device reads A''s 2 players and none of B''s');
select harness.check(:'me' = :'p_a1', 'my_membership(A).playerId is Ana');
select harness.check(:npins = 0, 'player_pins returns no rows to a device (RLS, no policy)');

-- 4. organizer A
select set_config('request.jwt.claims', harness.claims(:'org_a'), true) \g /dev/null
set local role authenticated;
select count(*) as nt, bool_and(id = :'t_a') as only_a from public.tournaments \gset
select count(*) as nb from public.players where tournament_id = :'t_b' \gset
select public.my_tournament_role(:'t_a') as role_a, public.my_tournament_role(:'t_b') as role_b \gset
reset role;
select harness.check(:nt = 1 and :'only_a'::boolean and :nb = 0, 'organizer A reads tournament A only, no players of B');
select harness.check(:'role_a' = 'owner' and :'role_b' = 'none', 'my_tournament_role: owner of A, none of B');
select set_config('harness.t_b', :'t_b', true) \g /dev/null
set local role authenticated;
do $$ begin
  insert into public.players (tournament_id, full_name, display_name) values (current_setting('harness.t_b')::uuid, 'Intruso', 'Intruso');
  perform set_config('harness.out', 'no error', true);
exception when others then
  perform set_config('harness.out', sqlstate, true);
end $$;
reset role;
select harness.check(current_setting('harness.out') = '42501', 'organizer A cannot add a player to tournament B (RLS 42501)');

-- 5. scores: the round goes live (organizer A), then the device writes its group's card
select set_config('request.jwt.claims', harness.claims(:'org_a'), true) \g /dev/null
set local role authenticated;
update public.rounds set status = 'live' where id = :'r_a1';
reset role;
select set_config('request.jwt.claims', harness.claims(:'dev_a'), true) \g /dev/null
set local role authenticated;
insert into public.scores (round_id, player_id, hole, strokes, putts, picked_up, entered_by, client_ts)
  values (:'r_a1', :'p_a2', 1, 5, 2, false, :'p_a1', now());
select set_config('harness.p_b1', :'p_b1', true) \g /dev/null
select set_config('harness.r_a1', :'r_a1', true) \g /dev/null
do $$ begin
  insert into public.scores (round_id, player_id, hole, strokes, putts, picked_up)
  values (current_setting('harness.r_a1')::uuid, current_setting('harness.p_b1')::uuid, 1, 4, 2, false);
  perform set_config('harness.out', 'no error', true);
exception when others then
  perform set_config('harness.out', sqlstate, true);
end $$;
reset role;
select harness.check(true, 'the device writes a score for its group mate in a live round');
select harness.check(current_setting('harness.out') = '42501', 'but not for a player of another tournament (42501)');

-- 6. service_role bypasses RLS; the API roles cannot read auth.users
set local role service_role;
select count(*) as nt from public.tournaments \gset
reset role;
select harness.check(:nt = 2, 'service_role (BYPASSRLS) reads both tournaments');
select set_config('request.jwt.claims', harness.claims(:'org_a'), true) \g /dev/null
set local role authenticated;
do $$ begin
  perform count(*) from auth.users;
  perform set_config('harness.out', 'no error', true);
exception when others then
  perform set_config('harness.out', sqlstate, true);
end $$;
reset role;
select harness.check(current_setting('harness.out') = '42501', 'authenticated has no privilege on auth.users (42501)');

-- 7. push: a notification to a profile with a subscription posts one pg_net request (captured)
select vault.create_secret('https://harness.invalid/api/push-dispatch', 'push_dispatch_url') \g /dev/null
select vault.create_secret('harness-dispatch-secret', 'push_dispatch_secret') \g /dev/null
select set_config('request.jwt.claims', harness.claims(:'org_a'), true) \g /dev/null
set local role authenticated;
select public.ensure_my_profile() \g /dev/null
select public.save_push_subscription('https://push.example.test/harness-selftest', 'p256dh-x', 'auth-y', 'selftest') \g /dev/null
reset role;
select count(*) as n0 from net.harness_requests \gset
select public.notify(:'org_a', 'harness_probe', 'harness_probe:selftest', null, '{}'::jsonb) \g /dev/null
select count(*) - :n0 as n_new from net.harness_requests \gset
select url, headers ->> 'Authorization' as auth, body -> 'subscriptions' -> 0 ->> 'endpoint' as endpoint, body -> 'notice' ->> 'kind' as kind
  from net.harness_requests order by id desc limit 1 \gset
select harness.check(:n_new = 1 and :'url' = 'https://harness.invalid/api/push-dispatch'
  and :'auth' = 'Bearer harness-dispatch-secret' and :'endpoint' = 'https://push.example.test/harness-selftest' and :'kind' = 'harness_probe',
  'notify() → notifications_push trigger → one net.http_post, captured in net.harness_requests');

rollback;
\echo 'selftest: all checks passed (everything was rolled back)'
