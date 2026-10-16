-- What the history still missed (0064, DB-13), on the two-tenant seed: org_a runs tournament A (Ana and Beto,
-- each with PIN 1234 from the seed, round 1 scheduled), the device dev_a holds Ana. Each step runs as whoever
-- does it in the app; the history is read as the Comité reads it (tournament_audit). Rolled back at the end;
-- prints one «ok» line per check.
\set ON_ERROR_STOP 1
\set QUIET 1
\pset tuples_only on
\pset format unaligned
select id as org_a from harness.seed where key = 'org_a' \gset
select id as dev_a from harness.seed where key = 'dev_a' \gset
select id as dev_x from harness.seed where key = 'dev_x' \gset
select id as t_a from harness.seed where key = 'tournament_a' \gset
select id as ana from harness.seed where key = 'player_a1' \gset
select id as beto from harness.seed where key = 'player_a2' \gset
select id as r1 from harness.seed where key = 'round_a1' \gset
begin;

-- The Comité's history of tournament A, as its screen reads it: the lines of one table, newest first.
create function pg_temp.lines(tbl text, t uuid default 'a0000000-0000-0000-0000-000000000000') returns jsonb language sql as $$
  select coalesce(jsonb_agg(e order by (e ->> 'id')::bigint desc), '[]'::jsonb)
  from jsonb_array_elements(public.tournament_audit(t, null, 200)) e
  where e ->> 'table' = tbl
$$;
grant execute on function pg_temp.lines(text, uuid) to authenticated;
create function pg_temp.as_user(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', harness.claims(uid), true), set_config('role', 'authenticated', true)
$$;
create function pg_temp.raw_hashes() returns bigint language sql as $$
  select count(*) from public.audit_log where table_name = 'player_pins' and (before::text ~ '\$2[aby]\$' or after::text ~ '\$2[aby]\$' or before ? 'pin_hash' or after ? 'pin_hash')
$$;

-- ---------------------------------------------------------------------------
-- 1. A PIN set or changed is a line, never the hash
-- ---------------------------------------------------------------------------
-- The seed set both PINs through set_player_pin: each player's first PIN is a line of its own.
select harness.check((select count(*) from public.audit_log where table_name = 'player_pins' and action = 'INSERT' and tournament_id = :'t_a') = 2,
  'the seed''s two first PINs are two lines under the tournament');
select pg_temp.as_user(:'org_a') \g /dev/null
select public.set_player_pin(:'ana', '4321') \g /dev/null
create temp table pin_line on commit drop as select pg_temp.lines('player_pins', :'t_a') -> 0 as e;
grant select on pin_line to authenticated;
reset role;
select harness.check((select e ->> 'action' = 'UPDATE' and e -> 'before' ->> 'pin' = 'old' and e -> 'after' ->> 'pin' = 'new'
  and e -> 'after' ->> 'player_id' = :'ana' from pin_line),
  'the Comité''s new PIN for Ana is an UPDATE line that names her: ' || (select e::text from pin_line));
select harness.check((select actor_auth_user_id = :'org_a' from public.audit_log where id = (select (e ->> 'id')::bigint from pin_line)), 'and is the Comité''s');
select harness.check(pg_temp.raw_hashes() = 0, 'no PIN line anywhere in audit_log carries a hash, or the hash''s column');
select harness.check((select (e -> 'before') - 'player_id' - 'pin' = '{}'::jsonb and (e -> 'after') - 'player_id' - 'pin' = '{}'::jsonb from pin_line),
  'its images hold the player and the word, nothing else');

-- A wrong PIN counts toward the lock, and a lock is no PIN change: no line (a stranger's attempts would flood it).
create temp table n0 on commit drop as select count(*) as n from public.audit_log where table_name = 'player_pins';
select pg_temp.as_user(:'dev_x') \g /dev/null
select public.claim_player(:'beto', '0000') \g /dev/null
select public.claim_player(:'beto', '0001') \g /dev/null
reset role;
select harness.check((select failed_attempts from public.player_pins where player_id = :'beto') = 2, 'the wrong PINs counted');
select harness.check((select count(*) from public.audit_log where table_name = 'player_pins') = (select n from n0), 'and wrote no line');

-- Any writer of player_pins is seen: a script with the service key resetting a PIN by hand.
update public.player_pins set pin_hash = extensions.crypt('9999', extensions.gen_salt('bf', 4)) where player_id = :'beto';
select harness.check((select count(*) from public.audit_log where table_name = 'player_pins') = (select n from n0) + 1 and pg_temp.raw_hashes() = 0,
  'a PIN changed outside set_player_pin is a line too, with no hash');

-- ---------------------------------------------------------------------------
-- 2. Results published, published again, withdrawn: one line each, by its counts
-- ---------------------------------------------------------------------------
update public.rounds set status = 'finished' where id = :'r1';
update public.tournaments set status = 'finished' where id = :'t_a';
delete from public.audit_log where table_name = 'tournament_results';
select pg_temp.as_user(:'org_a') \g /dev/null
select public.publish_tournament_results(:'t_a', jsonb_build_array(
  jsonb_build_object('playerId', :'ana', 'rank', 1, 'rankLabel', '1', 'points', 36, 'perRound', '[36]'::jsonb, 'awards', '[]'::jsonb, 'net', 500),
  jsonb_build_object('playerId', :'beto', 'rank', 2, 'rankLabel', '2', 'points', 30, 'perRound', '[30]'::jsonb, 'awards', '[]'::jsonb)), 'MXN') \g /dev/null
reset role;
select harness.check((select jsonb_array_length(pg_temp.lines('tournament_results', :'t_a')) = 1
  and pg_temp.lines('tournament_results', :'t_a') -> 0 ->> 'action' = 'INSERT'
  and pg_temp.lines('tournament_results', :'t_a') -> 0 -> 'after' = '{"players": 2, "nets": 1}'::jsonb
  and pg_temp.lines('tournament_results', :'t_a') -> 0 -> 'before' = 'null'::jsonb),
  'a first publish is one line: two players placed, one net: ' || pg_temp.lines('tournament_results', :'t_a')::text);
select pg_temp.as_user(:'org_a') \g /dev/null
select public.publish_tournament_results(:'t_a', jsonb_build_array(
  jsonb_build_object('playerId', :'ana', 'rank', 1, 'rankLabel', '1', 'points', 36, 'perRound', '[36]'::jsonb, 'awards', '[]'::jsonb, 'net', 500),
  jsonb_build_object('playerId', :'beto', 'rank', 2, 'rankLabel', '2', 'points', 30, 'perRound', '[30]'::jsonb, 'awards', '[]'::jsonb, 'net', -500)), 'MXN') \g /dev/null
reset role;
select harness.check((select pg_temp.lines('tournament_results', :'t_a') -> 0 ->> 'action' = 'UPDATE'
  and pg_temp.lines('tournament_results', :'t_a') -> 0 -> 'before' = '{"players": 2, "nets": 1}'::jsonb
  and pg_temp.lines('tournament_results', :'t_a') -> 0 -> 'after' = '{"players": 2, "nets": 2}'::jsonb),
  'publishing again is an UPDATE from what was published to what is now');
select pg_temp.as_user(:'org_a') \g /dev/null
update public.tournaments set status = 'live' where id = :'t_a';
reset role;
select harness.check((select pg_temp.lines('tournament_results', :'t_a') -> 0 ->> 'action' = 'DELETE'
  and pg_temp.lines('tournament_results', :'t_a') -> 0 -> 'before' = '{"players": 2, "nets": 2}'::jsonb
  and jsonb_array_length(pg_temp.lines('tournament_results', :'t_a')) = 3),
  'leaving Terminado withdraws them in one line that says what went');
update public.tournaments set status = 'finished' where id = :'t_a';
update public.tournaments set status = 'live' where id = :'t_a';
select harness.check(jsonb_array_length(pg_temp.lines('tournament_results', :'t_a')) = 3, 'leaving again with nothing published writes nothing');
select harness.check((select count(*) from public.audit_log where table_name in ('tournament_results', 'tournament_money') and row_id <> :'t_a') = 0,
  'never one line per player or per net');

-- ---------------------------------------------------------------------------
-- 3. Photos and a course's documents have a trail
-- ---------------------------------------------------------------------------
select pg_temp.as_user(:'dev_a') \g /dev/null
insert into public.photos (round_id, player_id, hole, url) values (:'r1', :'ana', 3, 'https://example.test/foto.jpg');
reset role;
select harness.check((select count(*) from public.audit_log where table_name = 'photos' and action = 'INSERT' and tournament_id = :'t_a' and actor_player_id = :'ana') = 1,
  'a photo a player adds is a line under the tournament, by him');
insert into public.courses (id, name) values ('c0000000-0000-4000-8000-000000000641', 'Campo 0064');
insert into public.course_documents (course_id, kind, url) values ('c0000000-0000-4000-8000-000000000641', 'scorecard', 'https://example.test/tarjeta.jpg');
select harness.check((select count(*) from public.audit_log where table_name = 'course_documents' and action = 'INSERT') = 1, 'a course''s scorecard photo is a line');

-- ---------------------------------------------------------------------------
-- 4. A deleted day still shows what went with it (0030, kept)
-- ---------------------------------------------------------------------------
insert into public.scores (round_id, player_id, hole, strokes, putts, picked_up) values (:'r1', :'ana', 1, 5, 2, false), (:'r1', :'beto', 1, 4, 2, false);
select pg_temp.as_user(:'org_a') \g /dev/null
delete from public.rounds where id = :'r1';
reset role;
select harness.check((select count(*) from jsonb_array_elements(pg_temp.lines('scores', :'t_a')) e where e ->> 'action' = 'DELETE') = 2
  and (select count(*) from jsonb_array_elements(pg_temp.lines('rounds', :'t_a')) e where e ->> 'action' = 'DELETE') = 1,
  'the Comité''s history lists the day and both holes its delete took');

rollback;
