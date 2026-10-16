-- TRUST-18 (0069): run_retention() deletes what has done its job, and nothing of a tournament that exists. Rolled
-- back at the end; prints one «ok» line per check.
\set ON_ERROR_STOP 1
\set QUIET 1
\pset tuples_only on
\pset format unaligned
select id as org_a from harness.seed where key = 'org_a' \gset
select id as dev_a from harness.seed where key = 'dev_a' \gset
select id as t_a from harness.seed where key = 'tournament_a' \gset
select id as p_a1 from harness.seed where key = 'player_a1' \gset
select id as r_a1 from harness.seed where key = 'round_a1' \gset
begin;

-- Accounts: each anonymous one idle 200 days unless it says otherwise.
\set free      '00000069-0000-4000-8000-000000000001'
\set consent   '00000069-0000-4000-8000-000000000002'
\set claimed   '00000069-0000-4000-8000-000000000003'
\set history   '00000069-0000-4000-8000-000000000004'
\set wrote     '00000069-0000-4000-8000-000000000005'
\set recent    '00000069-0000-4000-8000-000000000006'
\set refreshed '00000069-0000-4000-8000-000000000007'
\set reported  '00000069-0000-4000-8000-000000000008'
\set account   '00000069-0000-4000-8000-000000000009'
insert into auth.users (id, email, is_anonymous, created_at, updated_at, last_sign_in_at)
select u.id::uuid, case when u.id = :'account' then 'viejo@polo.test' end, u.id <> :'account',
       now() - interval '200 days', now() - interval '200 days',
       case when u.id = :'recent' then now() - interval '10 days' else now() - interval '200 days' end
from (values (:'free'), (:'consent'), (:'claimed'), (:'history'), (:'wrote'), (:'recent'), (:'refreshed'), (:'reported'), (:'account')) u(id);
-- What each one holds.
insert into public.legal_acceptances (auth_user_id, document, version, context) values (:'consent', 'privacy', '2026-10-15.3', 'pin');
insert into public.pin_attempts (auth_user_id, failed_attempts) values (:'consent', 2);
insert into public.pin_claims (tournament_id, player_id, auth_user_id, platform, claimed_at, released_at)
values (:'t_a', :'p_a1', :'history', 'ios', now() - interval '200 days', now() - interval '199 days');
insert into public.device_sessions (auth_user_id, player_id, tournament_id) values (:'claimed', :'p_a1', :'t_a');
insert into public.audit_log (tournament_id, table_name, row_id, actor_auth_user_id, action, at)
values (:'t_a', 'scores', 'x', :'wrote', 'INSERT', now() - interval '200 days');
insert into auth.sessions (user_id, created_at, updated_at) values (:'refreshed', now() - interval '200 days', now() - interval '3 days');
insert into public.device_status (auth_user_id, device_id, last_seen_at) values (:'reported', gen_random_uuid(), now() - interval '40 days');

-- Link tokens, answers, notices, telemetry.
insert into public.profiles (id, handle, display_name) values (:'org_a', 'orga', 'Organizadora A');
insert into public.profile_link_tokens (token_hash, created_by, player_id, expires_at) values
  ('viejo', :'dev_a', :'p_a1', now() - interval '2 days'),
  ('vivo', :'dev_a', :'p_a1', now() + interval '10 minutes');
insert into public.score_mutations (mutation_id, tournament_id, round_id, hole, auth_user_id, result, created_at) values
  (gen_random_uuid(), :'t_a', :'r_a1', 1, :'dev_a', '{}', now() - interval '100 days'),
  (gen_random_uuid(), :'t_a', :'r_a1', 2, :'dev_a', '{}', now() - interval '10 days');
insert into public.notifications (profile_id, kind, key, created_at) values
  (:'org_a', 'friend_request', 'viejo', now() - interval '13 months'),
  (:'org_a', 'friend_request', 'nuevo', now() - interval '11 months');
insert into public.client_events (auth_user_id, device_id, kind, name, at) values
  (:'dev_a', gen_random_uuid(), 'funnel', 'app_open', now() - interval '31 days'),
  (:'dev_a', gen_random_uuid(), 'funnel', 'app_open', now() - interval '1 day');
insert into public.device_status (auth_user_id, device_id, last_seen_at) values (:'dev_a', gen_random_uuid(), now() - interval '91 days');

-- The history of tournaments: one deleted 100 days ago, one deleted 10 days ago, and tournament A's own, 200 days old.
insert into public.audit_log (tournament_id, table_name, row_id, action, before, at) values
  ('00000069-0000-4000-8000-0000000000d1', 'players', 'a', 'DELETE', '{"full_name": "Alguien Borrado"}', now() - interval '101 days'),
  ('00000069-0000-4000-8000-0000000000d1', 'tournaments', 'b', 'DELETE', '{}', now() - interval '100 days'),
  ('00000069-0000-4000-8000-0000000000d2', 'players', 'c', 'DELETE', '{"full_name": "Hace poco"}', now() - interval '10 days'),
  (:'t_a', 'players', 'd', 'UPDATE', '{}', now() - interval '200 days');
select count(*) as scores_before from public.scores \gset
select count(*) as audit_a_before from public.audit_log where tournament_id = :'t_a' \gset

-- 1. Only the service role (the backup route) and postgres run it.
create function pg_temp.as_auth(q text) returns text language plpgsql as $$
begin
  perform set_config('request.jwt.claims', harness.claims((select id from harness.seed where key = 'org_a')), true);
  set local role authenticated;
  execute q;
  reset role;
  return 'answered';
exception when others then
  reset role;
  return sqlstate;
end $$;
select harness.check(pg_temp.as_auth('select public.run_retention()') = '42501', 'a signed-in user cannot run it');

set local role service_role;
select public.run_retention()::text as run \gset
reset role;
select harness.check((:'run')::jsonb ->> 'ok' = 'true', 'the run goes through: ' || :'run');

-- 2. What has done its job is gone; what has not stays.
select harness.check((select array_agg(token_hash) from public.profile_link_tokens) = array['vivo'], 'a link token expired a day ago goes, a live one stays');
select harness.check((select array_agg(hole) from public.score_mutations) = array[2], 'a save''s answer goes after 90 days');
select harness.check((select array_agg(key) from public.notifications where profile_id = :'org_a') = array['nuevo'], 'a notice goes after 12 months');
select harness.check((select count(*) from public.client_events where auth_user_id = :'dev_a') = 1
                     and not exists (select 1 from public.device_status where last_seen_at < now() - interval '90 days'),
  'telemetry after 30 days and a phone unseen 90 days go');

-- 3. Idle anonymous users that hold nothing go, with their consent record and PIN tries; the rest stay.
select harness.check(not exists (select 1 from auth.users where id in (:'free', :'consent')), 'an idle anonymous user that holds nothing goes');
select harness.check(not exists (select 1 from public.legal_acceptances where auth_user_id = :'consent')
                     and not exists (select 1 from public.pin_attempts where auth_user_id = :'consent'), 'its consent record and its PIN tries go with it');
select harness.check((select count(*) from auth.users where id in (:'claimed', :'history', :'wrote', :'recent', :'refreshed', :'reported', :'account')) = 7,
  'a PIN claim, a past claim, a history line, a recent sign-in, a refreshed session, a phone report or an email keeps the user');
select harness.check(exists (select 1 from auth.users where id = :'dev_a'), 'the seed''s phone, which holds Ana, stays');

-- 4. The history of a tournament deleted 90 days ago goes; the rest of the history stays whole.
select harness.check(not exists (select 1 from public.audit_log where tournament_id = '00000069-0000-4000-8000-0000000000d1'),
  'a tournament deleted 100 days ago leaves no history');
select harness.check(exists (select 1 from public.audit_log where tournament_id = '00000069-0000-4000-8000-0000000000d2'),
  'one deleted 10 days ago keeps it');
select harness.check((select count(*) from public.audit_log where tournament_id = :'t_a') = :'audit_a_before'::int,
  'an existing tournament''s history is untouched, however old');
select harness.check((select count(*) from public.scores) = :'scores_before'::int, 'no score is touched');

-- 5. Each night is a row Salud shows, with its counts.
select harness.check((select ok and (counts ->> 'anonymous')::int = 2 and (counts ->> 'link_tokens')::int = 1 and (counts ->> 'deleted_tournament_audit')::int = 2
                      from public.retention_runs order by at desc limit 1), 'the run is recorded with its counts');
select set_config('request.jwt.claims', harness.claims((select id from harness.seed where key = 'platform_admin')), true) \g /dev/null
set local role authenticated;
select public.platform_health()::text as health \gset
reset role;
select harness.check(((:'health')::jsonb #>> '{retention,last,ok}') = 'true' and ((:'health')::jsonb #>> '{retention,week,anonymous}') = '2',
  'Admin › Salud reads the last run and the week''s counts');

-- 6. A second night has nothing left to do.
set local role service_role;
select public.run_retention()::text as again \gset
reset role;
select harness.check(not exists (select 1 from jsonb_each_text((:'again')::jsonb -> 'counts') e where e.value::int <> 0), 'a second run deletes nothing');

rollback;
