-- Which version of the notice and the terms each person accepted (0038,
-- TRUST-05). Each step runs as the user who does it in the app (role
-- authenticated, that user's JWT claims), on the two-tenant seed: dev_a is a
-- phone that entered with a PIN, org_a an organizer's account. Rolled back at
-- the end; prints one «ok» line per check.
\set ON_ERROR_STOP 1
\set QUIET 1
\pset tuples_only on
\pset format unaligned
select id as org_a from harness.seed where key = 'org_a' \gset
select id as dev_a from harness.seed where key = 'dev_a' \gset
begin;

create function pg_temp.try_accept(p text, t text, c text) returns text language plpgsql as $$
begin
  return public.accept_legal(p, t, c)::text;
exception when others then
  return sqlstate;
end $$;
create function pg_temp.try_mine() returns text language plpgsql as $$
begin
  return public.my_legal_acceptances()::text;
exception when others then
  return sqlstate;
end $$;
create function pg_temp.try_read() returns text language plpgsql as $$
begin
  perform count(*) from public.legal_acceptances;
  return 'read';
exception when others then
  return sqlstate;
end $$;
create function pg_temp.try_insert(u uuid) returns text language plpgsql as $$
begin
  insert into public.legal_acceptances (auth_user_id, document, version, context) values (u, 'privacy', '2026-10-12', 'pin');
  return 'written';
exception when others then
  return sqlstate;
end $$;
grant execute on all functions in schema pg_temp to anon, authenticated;

-- Without a session nothing is recorded, nor read.
set local role anon;
select pg_temp.try_accept('2026-10-12.4', '2026-10-01', 'pin') as anon_accept \gset
select pg_temp.try_mine() as anon_mine \gset
reset role;
select harness.check(:'anon_accept' = '42501' and :'anon_mine' = '42501', 'a browser without a session records and reads nothing: ' || :'anon_accept' || ' ' || :'anon_mine');

-- A phone that entered with its PIN: nothing yet, then both documents.
select set_config('request.jwt.claims', harness.claims(:'dev_a'), true) \g /dev/null
set local role authenticated;
select pg_temp.try_mine() as before \gset
select pg_temp.try_accept('2026-10-12.4', '2026-10-01', 'pin') as first \gset
select pg_temp.try_accept('2026-10-12.4', '2026-10-01', 'update') as again \gset
select pg_temp.try_read() as direct_read \gset
select pg_temp.try_insert(:'dev_a') as direct_write \gset
reset role;
select harness.check(:'before'::jsonb = '{"privacy": null, "terms": null}'::jsonb, 'nothing accepted yet: ' || :'before');
select harness.check(:'first'::jsonb -> 'privacy' ->> 'version' = '2026-10-12.4' and :'first'::jsonb -> 'terms' ->> 'version' = '2026-10-01',
  'both versions recorded: ' || :'first');
select harness.check((select count(*) from public.legal_acceptances where auth_user_id = :'dev_a') = 2
  and (select bool_and(context = 'pin') from public.legal_acceptances where auth_user_id = :'dev_a'),
  'the same versions again keep the first time and where it was');
select harness.check(:'direct_read' = '42501' and :'direct_write' = '42501', 'a phone cannot read or write the table: ' || :'direct_read' || ' ' || :'direct_write');

-- Bad input is refused whole, in Spanish.
select set_config('request.jwt.claims', harness.claims(:'dev_a'), true) \g /dev/null
set local role authenticated;
select pg_temp.try_accept('2026-10-12.4', '2026-10-01', 'somewhere') as bad_context \gset
select pg_temp.try_accept('v2', '2026-10-01', 'pin') as bad_version \gset
select pg_temp.try_accept('2026-10-12.4', null, 'pin') as no_terms \gset
reset role;
select harness.check(:'bad_context' = '22023' and :'bad_version' = '22023' and :'no_terms' = '22023',
  'an unknown place or a malformed version is refused: ' || :'bad_context' || ' ' || :'bad_version' || ' ' || :'no_terms');
select harness.check((select count(*) from public.legal_acceptances where auth_user_id = :'dev_a') = 2, 'and writes nothing');

-- The latest is the newest version, not the last accepted: an older phone accepting an older one later changes nothing.
select set_config('request.jwt.claims', harness.claims(:'dev_a'), true) \g /dev/null
set local role authenticated;
select pg_temp.try_accept('2026-10-12.10', '2026-10-01', 'update') as newer \gset
select pg_temp.try_accept('2026-10-12.9', '2026-10-01', 'pin') as older_later \gset
reset role;
select harness.check(:'older_later'::jsonb -> 'privacy' ->> 'version' = '2026-10-12.10',
  '«.10» stays the latest after «.9» is accepted later: ' || :'older_later');

-- The time is the phone's, when it waited there: never in the future, nor more than eight days back.
create function pg_temp.try_accept_at(p text, a timestamptz) returns text language plpgsql as $$
begin
  return public.accept_legal(p, '2026-10-01', 'pin', a)::text;
exception when others then
  return sqlstate;
end $$;
grant execute on function pg_temp.try_accept_at(text, timestamptz) to authenticated;
select set_config('request.jwt.claims', harness.claims(:'dev_a'), true) \g /dev/null
set local role authenticated;
select pg_temp.try_accept_at('2026-10-11', now() - interval '2 days') \g /dev/null
select pg_temp.try_accept_at('2026-10-10', now() + interval '1 year') \g /dev/null
select pg_temp.try_accept_at('2026-10-09', now() - interval '1 year') \g /dev/null
reset role;
select harness.check((select accepted_at from public.legal_acceptances where auth_user_id = :'dev_a' and version = '2026-10-11') between now() - interval '2 days 1 minute' and now() - interval '47 hours'
  and (select accepted_at from public.legal_acceptances where auth_user_id = :'dev_a' and version = '2026-10-10') <= now()
  and (select accepted_at from public.legal_acceptances where auth_user_id = :'dev_a' and version = '2026-10-09') >= now() - interval '8 days',
  'the phone''s time is kept, clamped to now and the last eight days');

-- Each person sees only their own.
select set_config('request.jwt.claims', harness.claims(:'org_a'), true) \g /dev/null
set local role authenticated;
select pg_temp.try_mine() as org_mine \gset
select pg_temp.try_accept('2026-10-12.4', '2026-10-01', 'organizer') as org_accept \gset
reset role;
select harness.check(:'org_mine'::jsonb = '{"privacy": null, "terms": null}'::jsonb, 'another account sees none of the phone''s: ' || :'org_mine');
select harness.check(:'org_accept'::jsonb -> 'privacy' ->> 'version' = '2026-10-12.4', 'and records its own: ' || :'org_accept');

-- At most 100 rows per user: past that a call answers what it has and writes nothing.
insert into public.legal_acceptances (auth_user_id, document, version, context)
select :'org_a', 'privacy', '2020-01-01.' || g, 'update' from generate_series(1, 96) g;
select set_config('request.jwt.claims', harness.claims(:'org_a'), true) \g /dev/null
set local role authenticated;
select pg_temp.try_accept('2026-10-12.5', '2026-10-02', 'update') as last_two \gset
reset role;
select harness.check((select count(*) from public.legal_acceptances where auth_user_id = :'org_a') = 100, 'the last two fit, exactly 100: ' || :'last_two');
select set_config('request.jwt.claims', harness.claims(:'org_a'), true) \g /dev/null
set local role authenticated;
select pg_temp.try_accept('2026-10-13', '2026-10-13', 'update') as capped \gset
reset role;
select harness.check((select count(*) from public.legal_acceptances where auth_user_id = :'org_a') = 100
  and :'capped'::jsonb -> 'privacy' ->> 'version' = '2026-10-12.5', 'a full user writes nothing more: ' || :'capped');

-- An account that goes takes its rows with it.
delete from auth.users where id = :'dev_a';
select harness.check((select count(*) from public.legal_acceptances where auth_user_id = :'dev_a') = 0, 'deleting the account deletes what it accepted');

select 'legal acceptances: ok';
rollback;
