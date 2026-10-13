-- TRUST-24 (0050): the phones that hold each player's PIN. On the two-tenant
-- seed: org_a runs tournament A (Ana, Beto), org_b runs B (Carla, Dani), and
-- dev_a is Ana's phone (it claimed her with 1234 in the seed). A second phone
-- types Ana's PIN and scores as her: the history used to show both phones'
-- writes as Ana's and nothing else (the finding's scenario 3). Rolled back at
-- the end; prints one «ok» line per check.
\set ON_ERROR_STOP 1
\set QUIET 1
\pset tuples_only on
\pset format unaligned
select id as org_a from harness.seed where key = 'org_a' \gset
select id as org_b from harness.seed where key = 'org_b' \gset
select id as dev_a from harness.seed where key = 'dev_a' \gset
select id as t_a from harness.seed where key = 'tournament_a' \gset
select id as ana from harness.seed where key = 'player_a1' \gset
select id as beto from harness.seed where key = 'player_a2' \gset
select id as r1 from harness.seed where key = 'round_a1' \gset
\set dev_2 '00000020-0000-4000-8000-000000000020'
\set iphone 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
begin;

insert into auth.users (id, last_sign_in_at, raw_app_meta_data, raw_user_meta_data, is_anonymous)
values (:'dev_2', now(), '{"provider":"anonymous","providers":["anonymous"]}', '{}', true);

-- A statement as a user of the app: its answer, or the SQLSTATE and the message.
create function pg_temp.as_user(uid uuid, q text) returns text language plpgsql as $$
declare
  r text;
begin
  perform set_config('request.jwt.claims', harness.claims(uid), true);
  set local role authenticated;
  execute q into r;
  reset role;
  return coalesce(r, 'null');
exception when others then
  reset role;
  return sqlstate || ' ' || sqlerrm;
end $$;
-- A PIN typed on a phone that sends `ua` as its user agent, as PostgREST hands the headers to the database.
create function pg_temp.claim(uid uuid, p uuid, ua text) returns text language plpgsql as $$
declare
  r text;
begin
  perform set_config('request.headers', json_build_object('user-agent', ua)::text, true);
  r := pg_temp.as_user(uid, format('select public.claim_player(%L, %L)::text', p, '1234'));
  perform set_config('request.headers', '', true);
  return r;
end $$;
create function pg_temp.open_phones(p uuid) returns bigint language sql as $$
  select count(*) from public.pin_claims where player_id = p and released_at is null
$$;
-- The Comité's history, as org_a reads it.
create function pg_temp.history() returns jsonb language sql as $$
  select pg_temp.as_user(current_setting('harness.org_a')::uuid, format('select public.tournament_audit(%L, null, 200)::text', current_setting('harness.t_a')))::jsonb
$$;
select set_config('harness.org_a', :'org_a', true), set_config('harness.t_a', :'t_a', true) \g /dev/null

-- 1. The seed's claim is kept: dev_a took Ana, of no known kind (the seed sends no headers)
select harness.check(
  (select count(*) = 1 and bool_and(platform = 'other' and released_at is null) from public.pin_claims where player_id = :'ana' and auth_user_id = :'dev_a'),
  'the PIN the seed typed on dev_a is a claim of Ana''s');

-- 2. A second phone types Ana's PIN: a claim of its own, its kind read from the request
select pg_temp.claim(:'dev_2', :'ana', :'iphone') as out \gset
select harness.check(:'out'::jsonb ->> 'ok' = 'true' and pg_temp.open_phones(:'ana') = 2
  and (select platform from public.pin_claims where player_id = :'ana' and auth_user_id = :'dev_2') = 'ios',
  'a second phone with Ana''s PIN is her second open claim, an iPhone: ' || :'out');

-- 3. The same phone typing the PIN again keeps its claim
select pg_temp.claim(:'dev_2', :'ana', :'iphone') \g /dev/null
select harness.check((select count(*) from public.pin_claims where player_id = :'ana' and auth_user_id = :'dev_2') = 1,
  'the PIN typed again on the same phone starts nothing new');

-- 4. The finding's scenario: each phone scores as Ana, and the history says which phone
update public.rounds set status = 'live' where id = :'r1';
select pg_temp.as_user(:'dev_a', format('insert into public.scores (round_id, player_id, hole, strokes, putts, picked_up) values (%L, %L, 1, 5, 2, false) returning id::text', :'r1', :'ana')) as s1 \gset
select pg_temp.as_user(:'dev_2', format('insert into public.scores (round_id, player_id, hole, strokes, putts, picked_up) values (%L, %L, 1, 9, 2, false) returning id::text', :'r1', :'beto')) as s2 \gset
select harness.check(:'s1' ~ '^[0-9a-f-]{36}$' and :'s2' ~ '^[0-9a-f-]{36}$', 'both phones wrote as Ana: ' || :'s1' || ', ' || :'s2');
select pg_temp.history() as h \gset
select harness.check(
  (select e -> 'phone' from jsonb_array_elements(:'h'::jsonb) e where e ->> 'table' = 'scores' and e ->> 'rowId' = :'s1') = '{"n": 1, "of": 2, "kind": "other"}'::jsonb
  and (select e ->> 'actor' from jsonb_array_elements(:'h'::jsonb) e where e ->> 'table' = 'scores' and e ->> 'rowId' = :'s1') = 'Ana',
  'Ana''s 5 says it came from her phone 1 of 2');
select harness.check(
  (select e -> 'phone' from jsonb_array_elements(:'h'::jsonb) e where e ->> 'table' = 'scores' and e ->> 'rowId' = :'s2') = '{"n": 2, "of": 2, "kind": "ios"}'::jsonb,
  'the 9 on Beto says it came from Ana''s phone 2 of 2, an iPhone: the two writes are told apart');
select harness.check(
  (select count(*) from jsonb_array_elements(:'h'::jsonb) e where e ->> 'table' = 'pin_claims' and e ->> 'action' = 'INSERT' and e ->> 'actor' = 'Ana'
     and e -> 'after' ->> 'platform' = 'ios' and e -> 'phone' = '{"n": 2, "of": 2, "kind": "ios"}'::jsonb) = 1,
  'the second phone taking Ana is in the history, as Ana, phone 2 of 2');
select harness.check(
  not exists (select 1 from jsonb_array_elements(:'h'::jsonb) e where (e -> 'after') ? 'auth_user_id' or (e -> 'before') ? 'auth_user_id' or (e -> 'after') ? 'released_by'),
  'no account id reaches the Comité in the history''s images');

-- 5. The Comité's own write says no phone
select pg_temp.as_user(:'org_a', format('insert into public.scores (round_id, player_id, hole, strokes, putts, picked_up) values (%L, %L, 2, 4, 2, false) returning id::text', :'r1', :'beto')) as s3 \gset
select harness.check(
  (select e -> 'phone' from jsonb_array_elements(pg_temp.history()) e where e ->> 'table' = 'scores' and e ->> 'rowId' = :'s3') = 'null'::jsonb,
  'a write from the Comité''s account names no phone');

-- 6. The phones holding each player: the Comité only, never an account id
select pg_temp.as_user(:'org_a', format('select public.player_phones(%L)::text', :'t_a')) as phones \gset
select harness.check(
  (select count(*) from jsonb_array_elements(:'phones'::jsonb) p where p ->> 'playerId' = :'ana') = 2
  and (select string_agg(p ->> 'n' || ':' || (p ->> 'kind'), ',' order by (p ->> 'n')::int) from jsonb_array_elements(:'phones'::jsonb) p where p ->> 'playerId' = :'ana') = '1:other,2:ios'
  and position(:'dev_2' in :'phones') = 0 and position(:'dev_a' in :'phones') = 0,
  'the Comité sees Ana on two phones, numbered as the history numbers them, with no account id: ' || :'phones');
select pg_temp.as_user(:'dev_a', format('select public.player_phones(%L)::text', :'t_a')) as out \gset
select harness.check(:'out' like '42501 Solo el Comité ve los teléfonos de cada jugador%', 'a player''s phone does not see them: ' || :'out');
select pg_temp.as_user(:'org_b', format('select public.player_phones(%L)::text', :'t_a')) as out \gset
select harness.check(:'out' like '42501%', 'another tournament''s Comité does not: ' || :'out');
select pg_temp.as_user(:'dev_a', 'select count(*)::text from public.pin_claims') as out \gset
select harness.check(:'out' like '42501%', 'nobody reads the claims directly: ' || :'out');

-- 7. «Sacar»: the Comité only, with a reason; that phone has to type the PIN again
select id as c2 from public.pin_claims where player_id = :'ana' and auth_user_id = :'dev_2' \gset
select pg_temp.as_user(:'dev_a', format('select public.release_pin_claim(%s, %L)::text', :'c2', 'No es de Ana')) as out \gset
select harness.check(:'out' like '42501 Solo el Comité quita un teléfono%' and pg_temp.open_phones(:'ana') = 2, 'a player''s phone does not take one off: ' || :'out');
select pg_temp.as_user(:'org_b', format('select public.release_pin_claim(%s, %L)::text', :'c2', 'No es de Ana')) as out \gset
select harness.check(:'out' like '42501%' and pg_temp.open_phones(:'ana') = 2, 'nor another tournament''s Comité: ' || :'out');
select pg_temp.as_user(:'org_a', format('select public.release_pin_claim(%s, %L)::text', :'c2', '  ')) as out \gset
select harness.check(:'out' = '22023 Escribe el motivo, al menos 3 letras' and pg_temp.open_phones(:'ana') = 2, 'not without a reason: ' || :'out');
select pg_temp.as_user(:'org_a', format('select public.release_pin_claim(%s, %L)::text', :'c2', ' No es el teléfono de Ana ')) as out \gset
select harness.check(:'out' = '' and pg_temp.open_phones(:'ana') = 1
  and (select released_by from public.pin_claims where id = :'c2') = :'org_a'::uuid
  and not exists (select 1 from public.device_sessions where auth_user_id = :'dev_2'),
  'the Comité takes it off: the claim ends, by org_a, and that phone holds nobody: ' || :'out');
select harness.check(
  (select e ->> 'reason' from jsonb_array_elements(pg_temp.history()) e where e ->> 'table' = 'pin_claims' and e ->> 'action' = 'UPDATE' and e ->> 'rowId' = :'c2') = 'No es el teléfono de Ana',
  'the history has it, with the reason, trimmed');
select pg_temp.as_user(:'dev_2', format('select coalesce(public.my_player_id(%L)::text, ''nobody'')', :'t_a')) as out \gset
select harness.check(:'out' = 'nobody', 'that phone is nobody in the tournament until it types the PIN again: ' || :'out');
select pg_temp.as_user(:'org_a', format('select public.release_pin_claim(%s, %L)::text', :'c2', 'Otra vez')) as out \gset
select harness.check(:'out' = '22023 Ese teléfono ya no entra como ese jugador', 'a claim taken off is not taken off twice: ' || :'out');
-- The numbering is the history's: the 9 still came from Ana's phone 2 of 2.
select harness.check(
  (select e -> 'phone' from jsonb_array_elements(pg_temp.history()) e where e ->> 'table' = 'scores' and e ->> 'rowId' = :'s2') = '{"n": 2, "of": 2, "kind": "ios"}'::jsonb,
  'a phone taken off keeps its number in the history');

-- 8. A phone that takes another player lets the first go; «Cambiar de jugador» lets go of its player
select pg_temp.claim(:'dev_a', :'beto', 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126.0 Mobile Safari/537.36') as out \gset
select harness.check(:'out'::jsonb ->> 'ok' = 'true'
  and (select released_at is not null and released_by is null from public.pin_claims where player_id = :'ana' and auth_user_id = :'dev_a')
  and (select platform from public.pin_claims where player_id = :'beto' and auth_user_id = :'dev_a' and released_at is null) = 'android',
  'dev_a taking Beto ends its claim of Ana, by itself, and starts Beto''s, as an Android: ' || :'out');
select pg_temp.as_user(:'dev_a', 'select public.release_device()::text') \g /dev/null
select harness.check(pg_temp.open_phones(:'beto') = 0 and not exists (select 1 from public.device_sessions where auth_user_id = :'dev_a'),
  '«Cambiar de jugador» ends the phone''s claim with its session');

-- 9. The kind of phone, read from its user agent
create function pg_temp.kind(headers text) returns text language plpgsql as $$
begin
  perform set_config('request.headers', headers, true);
  return public.request_platform();
end $$;
select harness.check(
  pg_temp.kind(json_build_object('user-agent', 'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) Mobile/15E148')::text) = 'ios'
  and pg_temp.kind(json_build_object('user-agent', 'Mozilla/5.0 (Linux; Android 14) Mobile Safari/537.36')::text) = 'android'
  and pg_temp.kind(json_build_object('user-agent', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15')::text) = 'desktop'
  and pg_temp.kind(json_build_object('user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0')::text) = 'desktop'
  and pg_temp.kind(json_build_object('user-agent', 'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) Chrome/126.0')::text) = 'desktop'
  and pg_temp.kind(json_build_object('user-agent', 'curl/8.5')::text) = 'other'
  and pg_temp.kind('{}') = 'other' and pg_temp.kind('') = 'other' and pg_temp.kind('no es json') = 'other',
  'iPhone and iPad, Android, the computers, anything else, and no headers at all');
select pg_temp.as_user(:'dev_a', 'select public.request_platform()') as out \gset
select harness.check(:'out' like '42501%', 'no client calls the helper: ' || :'out');

-- 10. claim_player is 0013's but for the claim: a wrong PIN takes nobody, and the phone still waits at its fifth
\set dev_3 '00000030-0000-4000-8000-000000000030'
insert into auth.users (id, last_sign_in_at, raw_app_meta_data, raw_user_meta_data, is_anonymous)
values (:'dev_3', now(), '{"provider":"anonymous","providers":["anonymous"]}', '{}', true);
create function pg_temp.five_wrong(uid uuid, p uuid) returns text language plpgsql as $$
declare
  tries text := '';
  r jsonb;
begin
  for i in 1..5 loop
    r := pg_temp.as_user(uid, format('select public.claim_player(%L, %L)::text', p, '0000'))::jsonb;
    tries := tries || case when i > 1 then ',' else '' end || coalesce(r ->> 'attemptsLeft', r ->> 'reason');
  end loop;
  return tries;
end $$;
select pg_temp.five_wrong(:'dev_3', :'beto') as tries \gset
select harness.check(:'tries' = '4,3,2,1,locked' and not exists (select 1 from public.pin_claims where auth_user_id = :'dev_3'),
  'five wrong PINs on one phone: 4, 3, 2 and 1 tries left, then it waits, and no claim: ' || :'tries');

rollback;
