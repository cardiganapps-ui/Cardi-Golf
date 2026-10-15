-- SEC-03 (0055): a push endpoint is accepted only on a browser push service, for an account's subscription and
-- for a PIN phone's. Rolled back at the end; prints one «ok» line per check.
\set ON_ERROR_STOP 1
\set QUIET 1
\pset tuples_only on
\pset format unaligned
select id as dev_a from harness.seed where key = 'dev_a' \gset
select id as t_a from harness.seed where key = 'tournament_a' \gset
select id as ana from harness.seed where key = 'player_a1' \gset
begin;

create function pg_temp.as_user(uid uuid, q text) returns text language plpgsql as $$
declare
  r text;
begin
  perform set_config('request.jwt.claims', harness.claims(uid), true);
  set local role authenticated;
  execute q into r;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  return coalesce(r, 'null');
exception when others then
  reset role;
  perform set_config('request.jwt.claims', '', true);
  return sqlstate || ' ' || sqlerrm;
end $$;

-- The list itself: the services browsers use, and nothing that only looks like one.
select harness.check(
  (select bool_and(public.push_endpoint_ok(e)) from unnest(array[
    'https://fcm.googleapis.com/fcm/send/dXy:APA91b-abc',
    'https://updates.push.services.mozilla.com/wpush/v2/gAAAAAB',
    'https://web.push.apple.com/QGx2',
    'https://wns2-by3p.notify.windows.com/w/?token=BQYA',
    'https://FCM.googleapis.com/fcm/send/x',
    'https://fcm.googleapis.com:443/fcm/send/x'
  ]) e),
  'the push services browsers give are accepted');
select harness.check(
  (select not bool_or(coalesce(public.push_endpoint_ok(e), true)) from unnest(array[
    'https://httpbin.org/status/201',
    'https://169.254.169.254/latest/meta-data',
    'https://localhost/x',
    'http://fcm.googleapis.com/fcm/send/x',
    'https://fcm.googleapis.com:8443/fcm/send/x',
    'https://fcm.googleapis.com.evil.test/x',
    'https://evil.test/#@fcm.googleapis.com',
    'https://user:pw@fcm.googleapis.com/fcm/send/x',
    'https://push.apple.com/x',
    'https://notify.windows.com/x',
    'not a url',
    ''
  ]) e) and public.push_endpoint_ok(null) = false,
  'any other host, scheme, port, a user in the address or nothing at all is refused');
select harness.check(public.push_endpoint_ok('https://fcm.googleapis.com/fcm/send/' || repeat('x', 2100)) = false, 'an endpoint over 2048 characters is refused');

-- A PIN phone (Ana on dev_a, the seed's claim): a push service is saved, any other host is not.
select pg_temp.as_user(:'dev_a', format('select ''saved'' from public.save_pin_push(%L, %L, %L, %L)', :'t_a', 'https://fcm.googleapis.com/fcm/send/ana', 'k', 'a')) as ok_pin \gset
select harness.check(:'ok_pin' = 'saved' and exists (select 1 from public.pin_push_subscriptions where endpoint = 'https://fcm.googleapis.com/fcm/send/ana'), 'a PIN phone saves its push service address');
select pg_temp.as_user(:'dev_a', format('select ''saved'' from public.save_pin_push(%L, %L, %L, %L)', :'t_a', 'https://httpbin.org/anything', 'k', 'a')) as bad_pin \gset
select harness.check(:'bad_pin' like '22023 Suscripción inválida%' and not exists (select 1 from public.pin_push_subscriptions where endpoint like 'https://httpbin.org/%'), 'a PIN phone cannot save an address on another host');

-- An account with a profile: the same.
insert into auth.users (id, email, email_confirmed_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data, is_anonymous)
values ('00000055-0000-4000-8000-000000000001', 'push55@polo.test', now(), now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Pus"}', false);
select pg_temp.as_user('00000055-0000-4000-8000-000000000001', 'select ''made'' from public.ensure_my_profile()') \g /dev/null
select pg_temp.as_user('00000055-0000-4000-8000-000000000001', format('select ''saved'' from public.save_push_subscription(%L, %L, %L)', 'https://web.push.apple.com/Qacct', 'k', 'a')) as ok_acct \gset
select harness.check(:'ok_acct' = 'saved' and exists (select 1 from public.push_subscriptions where endpoint = 'https://web.push.apple.com/Qacct'), 'an account saves its push service address');
select pg_temp.as_user('00000055-0000-4000-8000-000000000001', format('select ''saved'' from public.save_push_subscription(%L, %L, %L)', 'https://169.254.169.254/latest', 'k', 'a')) as bad_acct \gset
select harness.check(:'bad_acct' like '22023 Suscripción inválida%' and not exists (select 1 from public.push_subscriptions where endpoint like 'https://169.254%'), 'an account cannot save an address on another host');

-- Any other writer, the service key included, meets the same rule on the table.
do $$
begin
  begin
    insert into public.pin_push_subscriptions (tournament_id, player_id, auth_user_id, endpoint, p256dh, auth)
    select tournament_id, player_id, auth_user_id, 'https://httpbin.org/status/201', 'k', 'a' from public.device_sessions limit 1;
    raise exception 'inserted';
  exception when check_violation then null;
  end;
  begin
    insert into public.push_subscriptions (profile_id, endpoint, p256dh, auth)
    values ('00000055-0000-4000-8000-000000000001', 'https://httpbin.org/status/201', 'k', 'a');
    raise exception 'inserted';
  exception when check_violation then null;
  end;
end $$;
select harness.check(true, 'a direct write of an address on another host is refused by the table');

rollback;
