-- First-party telemetry (0037: STRAT-02). Each step runs as the user who does
-- it in the app (role authenticated, that user's JWT claims), on the
-- two-tenant seed: org_a runs tournament A, the device dev_a holds Ana in A,
-- org_b runs B. Rolled back at the end; prints one «ok» line per check.
\set ON_ERROR_STOP 1
\set QUIET 1
\pset tuples_only on
\pset format unaligned
select id as org_a from harness.seed where key = 'org_a' \gset
select id as org_b from harness.seed where key = 'org_b' \gset
select id as dev_a from harness.seed where key = 'dev_a' \gset
select id as padmin from harness.seed where key = 'platform_admin' \gset
select id as t_a from harness.seed where key = 'tournament_a' \gset
select id as t_b from harness.seed where key = 'tournament_b' \gset
select id as ana from harness.seed where key = 'player_a1' \gset
begin;

create function pg_temp.try_log(e jsonb) returns text language plpgsql as $$
declare n int;
begin
  n := public.log_client_events(e);
  return n::text;
exception when others then
  return sqlstate;
end $$;
create function pg_temp.try_beat(p jsonb) returns text language plpgsql as $$
begin
  perform public.heartbeat(p);
  return 'taken';
exception when others then
  return sqlstate;
end $$;
create function pg_temp.try_devices(t uuid) returns text language plpgsql as $$
begin
  return public.tournament_devices(t)::text;
exception when others then
  return sqlstate;
end $$;
create function pg_temp.try_tel() returns text language plpgsql as $$
begin
  return public.platform_telemetry(24)::text;
exception when others then
  return sqlstate;
end $$;
create function pg_temp.try_read() returns text language plpgsql as $$
begin
  perform count(*) from public.client_events;
  return 'read';
exception when others then
  return sqlstate;
end $$;
grant execute on all functions in schema pg_temp to anon, authenticated;
select gen_random_uuid() as phone \gset

-- Without a session nothing is written.
set local role anon;
select pg_temp.try_log('[]'::jsonb) as anon_log \gset
reset role;
select harness.check(:'anon_log' = '42501', 'a browser without a session cannot log: ' || :'anon_log');

-- A phone's batch: one good error with a secret-shaped key and an email in its message,
-- one for a tournament it is not in, and four that are not events.
select set_config('request.jwt.claims', harness.claims(:'dev_a'), true) \g /dev/null
set local role authenticated;
select pg_temp.try_log(jsonb_build_array(
  jsonb_build_object('deviceId', :'phone', 'tournamentId', :'t_a', 'build', 1791700000, 'buildSha', 'abc1234', 'kind', 'error', 'name', 'window.error',
    'at', '2026-10-12T05:00:00.000Z',
    'data', jsonb_build_object('message', 'falló para ana@polo.test con eyJhbGciOi.eyJzdWIiOi.c2lnbmF0dXJl', 'route', '/t/x/tarjeta', 'email', 'ana@polo.test', 'accessToken', 'secreto')),
  jsonb_build_object('deviceId', :'phone', 'tournamentId', :'t_b', 'kind', 'sync', 'name', 'apply_lag', 'value', 850),
  jsonb_build_object('deviceId', :'phone', 'kind', 'spam', 'name', 'x'),
  jsonb_build_object('deviceId', :'phone', 'kind', 'funnel', 'name', 'Mayúsculas'),
  jsonb_build_object('kind', 'funnel', 'name', 'sin_telefono'),
  jsonb_build_object('deviceId', :'phone', 'kind', 'funnel', 'name', 'grande', 'data', jsonb_build_object('x', repeat('a', 3000)))
)) as kept \gset
select pg_temp.try_read() as direct_read \gset
reset role;
select harness.check(:'kept' = '2', 'two of six are kept: ' || :'kept');
select harness.check(:'direct_read' = '42501', 'a phone cannot read the table: ' || :'direct_read');
select harness.check((select tournament_id = :'t_a' and auth_user_id = :'dev_a' and build = 1791700000 and build_sha = 'abc1234'
  and client_at = '2026-10-12T05:00:00Z' and not data ? 'email' and not data ? 'accessToken'
  and data ->> 'message' = 'falló para [correo] con [token]' and data ->> 'route' = '/t/x/tarjeta'
  from public.client_events where name = 'window.error'), 'the error keeps its tournament, build and route, without the email, the token or secret keys');
select harness.check((select tournament_id is null from public.client_events where name = 'apply_lag'), 'a tournament the phone is not in is not kept');

-- More than 50 at once is refused; past 600 an hour, nothing more is kept.
select set_config('request.jwt.claims', harness.claims(:'dev_a'), true) \g /dev/null
set local role authenticated;
select pg_temp.try_log((select jsonb_agg(jsonb_build_object('deviceId', :'phone', 'kind', 'funnel', 'name', 'x')) from generate_series(1, 51))) as too_many \gset
reset role;
select harness.check(:'too_many' = '22023', '51 events in one call are refused: ' || :'too_many');
insert into public.client_events (auth_user_id, device_id, kind, name) select :'dev_a', :'phone', 'funnel', 'relleno' from generate_series(1, 597);
select set_config('request.jwt.claims', harness.claims(:'dev_a'), true) \g /dev/null
set local role authenticated;
select pg_temp.try_log((select jsonb_agg(jsonb_build_object('deviceId', :'phone', 'kind', 'funnel', 'name', 'tope')) from generate_series(1, 5))) as capped \gset
select pg_temp.try_log((select jsonb_agg(jsonb_build_object('deviceId', :'phone', 'kind', 'funnel', 'name', 'tope')) from generate_series(1, 5))) as over \gset
reset role;
select harness.check(:'capped' = '1' and :'over' = '0', 'the hourly cap keeps one more, then none: ' || :'capped' || ', ' || :'over');
delete from public.client_events where name in ('relleno', 'tope');

-- Retention: an event older than 30 days goes with the next batch.
insert into public.client_events (at, auth_user_id, device_id, kind, name) values (now() - interval '40 days', :'dev_a', :'phone', 'funnel', 'viejo');
select set_config('request.jwt.claims', harness.claims(:'dev_a'), true) \g /dev/null
set local role authenticated;
select pg_temp.try_log(jsonb_build_array(jsonb_build_object('deviceId', :'phone', 'kind', 'sync', 'name', 'save_ack', 'value', 420))) \g /dev/null
reset role;
select harness.check((select count(*) from public.client_events where name = 'viejo') = 0, 'events older than 30 days are pruned');

-- The heartbeat: its tournament and player when it is in it, nothing of another.
select set_config('request.jwt.claims', harness.claims(:'dev_a'), true) \g /dev/null
set local role authenticated;
select pg_temp.try_beat(jsonb_build_object('deviceId', :'phone', 'tournamentId', :'t_a', 'build', 1791700000, 'buildSha', 'abc1234',
  'platform', 'ios', 'standalone', true, 'pending', 3, 'rejected', 1, 'oldestPendingAt', '2026-10-12T04:00:00Z', 'lastSyncAt', '2099-01-01T00:00:00Z')) as beat \gset
select pg_temp.try_beat(jsonb_build_object('deviceId', 'no-es-uuid')) as bad_beat \gset
reset role;
select harness.check(:'beat' = 'taken' and :'bad_beat' = '22023', 'a heartbeat is taken; one without a device id is refused: ' || :'bad_beat');
select harness.check((select tournament_id = :'t_a' and player_id = :'ana' and pending = 3 and rejected = 1 and platform = 'ios' and standalone
  and last_sync_at <= now() from public.device_status where auth_user_id = :'dev_a' and device_id = :'phone'),
  'the phone is Ana''s in A, with 3 holes to send; a time in the future is clamped');
select set_config('request.jwt.claims', harness.claims(:'dev_a'), true) \g /dev/null
set local role authenticated;
select pg_temp.try_beat(jsonb_build_object('deviceId', :'phone', 'tournamentId', :'t_b', 'pending', 0)) \g /dev/null
reset role;
select harness.check((select tournament_id is null and player_id is null and pending = 0 from public.device_status where device_id = :'phone'),
  'a tournament the phone is not in is not kept; a changed count updates at once');
select set_config('request.jwt.claims', harness.claims(:'dev_a'), true) \g /dev/null
set local role authenticated;
select pg_temp.try_beat(jsonb_build_object('deviceId', :'phone', 'tournamentId', :'t_a', 'pending', 2)) \g /dev/null
reset role;

-- Who reads it: the Comité its own tournament's phones; the platform admin everything.
select set_config('request.jwt.claims', harness.claims(:'org_a'), true) \g /dev/null
set local role authenticated;
select pg_temp.try_devices(:'t_a') as devices_a \gset
select pg_temp.try_tel() as tel_org \gset
reset role;
select set_config('request.jwt.claims', harness.claims(:'org_b'), true) \g /dev/null
set local role authenticated;
select pg_temp.try_devices(:'t_a') as devices_b \gset
reset role;
select set_config('request.jwt.claims', harness.claims(:'dev_a'), true) \g /dev/null
set local role authenticated;
select pg_temp.try_devices(:'t_a') as devices_player \gset
reset role;
select harness.check((:'devices_a'::jsonb -> 0 ->> 'playerId') = :'ana' and (:'devices_a'::jsonb -> 0 ->> 'pending')::int = 2
  and not (:'devices_a'::jsonb -> 0) ? 'deviceId' and jsonb_array_length(:'devices_a'::jsonb) = 1,
  'the Comité of A sees Ana''s phone and what it has to send, without its ids: ' || :'devices_a');
select harness.check(:'devices_b' = '42501' and :'devices_player' = '42501' and :'tel_org' = '42501',
  'another Comité, a player and a Comité asking for Salud are refused');
select set_config('request.jwt.claims', harness.claims(:'padmin'), true) \g /dev/null
set local role authenticated;
select pg_temp.try_tel() as tel \gset
reset role;
select harness.check((:'tel'::jsonb ->> 'events')::int = 3
  and (:'tel'::jsonb -> 'errors' -> 0 ->> 'name') = 'window.error' and (:'tel'::jsonb -> 'errors' -> 0 ->> 'devices')::int = 1
  and (select (s ->> 'p95')::int from jsonb_array_elements(:'tel'::jsonb -> 'sync') s where s ->> 'name' = 'apply_lag') = 850
  and (:'tel'::jsonb -> 'devices' ->> 'seen')::int = 1 and (:'tel'::jsonb -> 'devices' ->> 'pending')::int = 2,
  'Salud: the events, the error group, the sync p95 and the phone: ' || :'tel');

-- An account that goes takes its rows with it.
delete from auth.users where id = :'dev_a';
select harness.check((select count(*) from public.client_events where auth_user_id = :'dev_a') = 0
  and (select count(*) from public.device_status where auth_user_id = :'dev_a') = 0, 'deleting the account deletes its events and its phone');

select 'telemetry: ok';
rollback;
