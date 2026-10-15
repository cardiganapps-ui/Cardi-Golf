-- SEC-04 and SEC-06 (0056). On the two-tenant seed: org_a runs tournament A, dev_a is Ana's phone (it claimed
-- her with 1234 in the seed). Strangers' wrong PINs used to lock Ana out of every phone; now they stop only
-- phones that never held her. And the faces a stranger sees carry no full names. Rolled back at the end;
-- prints one «ok» line per check.
\set ON_ERROR_STOP 1
\set QUIET 1
\pset tuples_only on
\pset format unaligned
select id as org_a from harness.seed where key = 'org_a' \gset
select id as org_b from harness.seed where key = 'org_b' \gset
select id as dev_a from harness.seed where key = 'dev_a' \gset
select id as t_a from harness.seed where key = 'tournament_a' \gset
select id as ana from harness.seed where key = 'player_a1' \gset
\set dev_k '00000056-0000-4000-8000-00000000000a'
\set dev_n '00000056-0000-4000-8000-00000000000b'
begin;

-- dev_k: a phone the Comité will take off Ana. s1..s3: strangers. dev_n: a new phone with the right PIN.
insert into auth.users (id, last_sign_in_at, raw_app_meta_data, raw_user_meta_data, is_anonymous)
select u::uuid, now(), '{"provider":"anonymous","providers":["anonymous"]}', '{}', true
from unnest(array[:'dev_k', :'dev_n', '00000056-0000-4000-8000-000000000001', '00000056-0000-4000-8000-000000000002', '00000056-0000-4000-8000-000000000003']) u;

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
create function pg_temp.claim(uid uuid, p uuid, pin text) returns jsonb language sql as $$
  select pg_temp.as_user(uid, format('select public.claim_player(%L, %L)::text', p, pin))::jsonb
$$;

-- dev_k takes Ana, then the Comité takes it off: it is no longer one of hers.
select harness.check((pg_temp.claim(:'dev_k', :'ana', '1234') ->> 'ok')::boolean, 'a second phone takes Ana');
select pg_temp.as_user(:'org_a', format('select ''done'' from public.release_pin_claim(%s, %L)',
  (select id from public.pin_claims where player_id = :'ana' and auth_user_id = :'dev_k' and released_at is null), 'Prueba de bloqueo')) \g /dev/null

-- 1. Three strangers spend their five wrong PINs each on Ana: fifteen, and the player's lock.
select count(*) from (
  select pg_temp.claim(('00000056-0000-4000-8000-00000000000' || s)::uuid, :'ana', '9999')
  from generate_series(1, 3) s, generate_series(1, 5) i
) x \g /dev/null
select harness.check((select failed_attempts = 15 and locked_until > now() from public.player_pins where player_id = :'ana'), 'fifteen wrong PINs from new phones lock Ana for new phones');

-- 2. A new phone with the right PIN waits, and is told it is the player's lock.
select pg_temp.claim(:'dev_n', :'ana', '1234') as n1 \gset
select harness.check((:'n1'::jsonb ->> 'reason') = 'locked' and (:'n1'::jsonb ->> 'scope') = 'player' and (:'n1'::jsonb ->> 'lockedUntil') is not null, 'a new phone with the right PIN waits, told it is the player''s lock');

-- 3. A phone the Comité took off counts as new.
select harness.check((pg_temp.claim(:'dev_k', :'ana', '1234') ->> 'scope') = 'player', 'a phone the Comité took off waits like a new one');

-- 4. Ana's own phone gets in, and its own wrong PIN counts only on itself.
select harness.check((pg_temp.claim(:'dev_a', :'ana', '1234') ->> 'ok')::boolean, 'Ana''s own phone gets in with her PIN whatever strangers tried');
select pg_temp.claim(:'dev_a', :'ana', '0000') as w \gset
select harness.check((:'w'::jsonb ->> 'reason') = 'wrong_pin' and (:'w'::jsonb ->> 'attemptsLeft')::int = 4
  and (select failed_attempts = 15 from public.player_pins where player_id = :'ana'), 'her own phone''s wrong PIN counts on its device, not on her');
select count(*) from (select pg_temp.claim(:'dev_a', :'ana', '0000') from generate_series(1, 4)) x \g /dev/null
select harness.check((pg_temp.claim(:'dev_a', :'ana', '1234') ->> 'scope') = 'device', 'five wrong PINs on her own phone lock that phone, and it says so');

-- 5. The Comité sees the lock; nobody else does.
select pg_temp.as_user(:'org_a', format('select public.pin_locks(%L)::text', :'t_a')) as locks \gset
select harness.check(jsonb_array_length(:'locks'::jsonb) = 1 and (:'locks'::jsonb -> 0 ->> 'playerId') = :'ana' and (:'locks'::jsonb -> 0 ->> 'failed')::int = 15
  and not (:'locks'::jsonb -> 0 ? 'pin_hash'), 'the Comité sees Ana''s lock, with no PIN in it');
select harness.check(pg_temp.as_user(:'dev_a', format('select public.pin_locks(%L)::text', :'t_a')) like '42501%'
  and pg_temp.as_user(:'org_b', format('select public.pin_locks(%L)::text', :'t_a')) like '42501%', 'a player and another tournament''s Comité do not');

-- 6. Only the Comité opens it, the PIN unchanged, and the history says so.
select harness.check(pg_temp.as_user(:'dev_a', format('select ''x'' from public.unlock_player_pin(%L)', :'ana')) like '42501%'
  and pg_temp.as_user(:'org_b', format('select ''x'' from public.unlock_player_pin(%L)', :'ana')) like '42501%', 'a player and another Comité cannot unlock it');
select pg_temp.as_user(:'org_a', format('select ''done'' from public.unlock_player_pin(%L)', :'ana')) \g /dev/null
select harness.check((pg_temp.claim(:'dev_n', :'ana', '1234') ->> 'ok')::boolean, 'once the Comité unlocks it, the new phone gets in with the same PIN');
select pg_temp.as_user(:'org_a', format('select public.tournament_audit(%L, null, 200)::text', :'t_a')) as hist \gset
select harness.check(exists (select 1 from jsonb_array_elements(:'hist'::jsonb) e where e ->> 'table' = 'player_pins' and e ->> 'reason' = 'PIN desbloqueado'),
  'the unlock is a line of the Comité''s history');

-- 7. SEC-06: a stranger and no session see short names and photos, no full names; a member sees them.
select pg_temp.as_user('00000056-0000-4000-8000-000000000001', format('select public.lookup_tournament(%L)::text', (select slug from public.tournaments where id = :'t_a'))) as stranger \gset
select harness.check(jsonb_array_length(:'stranger'::jsonb -> 'players') > 0
  and (select bool_and(p ->> 'fullName' is null and p ->> 'displayName' is not null) from jsonb_array_elements(:'stranger'::jsonb -> 'players') p),
  'a stranger''s faces carry short names and no full names');
select join_code as code_a from public.tournaments where id = :'t_a' \gset
set local role anon;
select public.lookup_tournament(:'code_a')::text as nosession \gset
reset role;
select harness.check((select bool_and(p ->> 'fullName' is null) from jsonb_array_elements(:'nosession'::jsonb -> 'players') p), 'so do the faces with no session');
select pg_temp.as_user(:'dev_a', format('select public.lookup_tournament(%L)::text', (select slug from public.tournaments where id = :'t_a'))) as member \gset
select harness.check((select bool_and(p ->> 'fullName' is not null) from jsonb_array_elements(:'member'::jsonb -> 'players') p), 'a member sees the full names');

rollback;
