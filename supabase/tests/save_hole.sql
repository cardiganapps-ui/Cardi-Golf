-- save_hole and the score writes around it (0026: REL-05, REL-08, REL-09,
-- SEC-02, NEW-01). Each step runs as the user who does it in the app (role
-- authenticated, that user's JWT claims), on the two-tenant seed: tournament
-- A has Ana and Beto in group 1 of round 1, and the device dev_a holds Ana.
-- Here Beto gets his own phone (dev_b), and Caro, a player of A in no group,
-- the device dev_x. Rolled back at the end; prints one «ok» line per check.
\set ON_ERROR_STOP 1
\set QUIET 1
\pset tuples_only on
\pset format unaligned
select id as org_a from harness.seed where key = 'org_a' \gset
select id as dev_a from harness.seed where key = 'dev_a' \gset
select id as dev_x from harness.seed where key = 'dev_x' \gset
select id as t_a from harness.seed where key = 'tournament_a' \gset
select id as t_b from harness.seed where key = 'tournament_b' \gset
select id as ana from harness.seed where key = 'player_a1' \gset
select id as beto from harness.seed where key = 'player_a2' \gset
select id as r1 from harness.seed where key = 'round_a1' \gset
select id as rb from harness.seed where key = 'round_b1' \gset
select id as g1 from harness.seed where key = 'group_a1' \gset
\set dev_b '0000000b-0000-4000-8000-00000000000b'
\set dev_n '0000000c-0000-4000-8000-00000000000c'
\set m1 '10000000-0000-4000-8000-000000000001'
begin;
-- The ids a DO block needs while it acts as a phone, which cannot read harness.seed.
select set_config('harness.r1', :'r1', true), set_config('harness.g1', :'g1', true), set_config('harness.ana', :'ana', true), set_config('harness.beto', :'beto', true) \g /dev/null

insert into auth.users (id, last_sign_in_at, raw_app_meta_data, raw_user_meta_data, is_anonymous)
values (:'dev_b', now(), '{"provider":"anonymous","providers":["anonymous"]}', '{}', true),
       (:'dev_n', now(), '{"provider":"anonymous","providers":["anonymous"]}', '{}', true);

-- Caro: a player of A in no group, and the phones that claim Beto and Caro.
select set_config('request.jwt.claims', harness.claims(:'org_a'), true) \g /dev/null
set local role authenticated;
insert into public.players (tournament_id, full_name, display_name, sort_order) values (:'t_a', 'Caro Alfa', 'Caro', 2) returning id as caro \gset
select public.set_player_pin(:'caro', '1234') \g /dev/null
reset role;
select set_config('request.jwt.claims', harness.claims(:'dev_b'), true) \g /dev/null
set local role authenticated;
select public.claim_player(:'beto', '1234') \g /dev/null
reset role;
select set_config('request.jwt.claims', harness.claims(:'dev_x'), true) \g /dev/null
set local role authenticated;
select public.claim_player(:'caro', '1234') \g /dev/null
reset role;

-- A hole as the phone sends it: entries of {player_id, fields, base?}.
create function pg_temp.hole(r uuid, h int, m uuid, entries jsonb) returns jsonb language sql as $$
  select jsonb_build_object('round_id', r, 'hole', h, 'mutation_id', m, 'device_id', '0000000d-0000-4000-8000-00000000000d', 'entries', entries)
$$;
create function pg_temp.entry(p uuid, fields jsonb, base jsonb default null) returns jsonb language sql as $$
  select jsonb_strip_nulls(jsonb_build_object('player_id', p, 'fields', fields)) || case when base is null then '{}'::jsonb else jsonb_build_object('base', base) end
$$;
grant execute on function pg_temp.hole(uuid, int, uuid, jsonb), pg_temp.entry(uuid, jsonb, jsonb) to authenticated;
create function pg_temp.score(p uuid, h int) returns public.scores language sql as $$
  select s from public.scores s where s.round_id = (select id from harness.seed where key = 'round_a1') and s.player_id = p and s.hole = h
$$;

-- 1. Who may save at all
select set_config('request.jwt.claims', harness.claims(:'dev_n'), true) \g /dev/null
set local role authenticated;
select public.save_hole(pg_temp.hole(:'r1', 1, gen_random_uuid(), jsonb_build_array(pg_temp.entry(:'ana', '{"strokes":4}'))))::text as out \gset
reset role;
select harness.check(:'out'::jsonb ->> 'status' = 'not_member', 'a phone with no player in the tournament: not_member, and nothing kept');
select set_config('request.jwt.claims', harness.claims(:'dev_a'), true) \g /dev/null
set local role authenticated;
select public.save_hole(pg_temp.hole(:'rb', 1, gen_random_uuid(), jsonb_build_array(pg_temp.entry(:'ana', '{"strokes":4}'))))::text as out \gset
reset role;
select harness.check(:'out'::jsonb ->> 'status' = 'not_member', 'another tournament''s round: not_member');

-- 2. A round not yet live: refused, and the refusal is kept for the Comité
select set_config('request.jwt.claims', harness.claims(:'dev_a'), true) \g /dev/null
set local role authenticated;
select public.save_hole(pg_temp.hole(:'r1', 1, gen_random_uuid(), jsonb_build_array(pg_temp.entry(:'ana', '{"strokes":4,"putts":2,"picked_up":false}'))))::text as out \gset
reset role;
select harness.check(:'out'::jsonb ->> 'status' = 'rejected' and :'out'::jsonb #>> '{rejected,0,reason}' = 'round_not_live', 'a round not live: rejected, round_not_live');
select harness.check((select count(*) from public.rejected_writes where round_id = :'r1' and reason = 'round_not_live' and writer_player_id = :'ana') = 1, 'and kept in rejected_writes with its writer');
select harness.check(pg_temp.score(:'ana', 1) is null, 'and no score written');

select set_config('request.jwt.claims', harness.claims(:'org_a'), true) \g /dev/null
set local role authenticated;
update public.rounds set status = 'live' where id = :'r1';
reset role;

-- 3. The hole of the group in one call
select set_config('request.jwt.claims', harness.claims(:'dev_a'), true) \g /dev/null
set local role authenticated;
select public.save_hole(pg_temp.hole(:'r1', 1, :'m1', jsonb_build_array(
  pg_temp.entry(:'ana', '{"strokes":4,"putts":2,"picked_up":false}'),
  pg_temp.entry(:'beto', '{"strokes":5,"putts":2,"picked_up":false}'))))::text as first \gset
reset role;
select harness.check(:'first'::jsonb ->> 'status' = 'ok' and jsonb_array_length(:'first'::jsonb -> 'rows') = 2, 'a live round: both players saved in one call, the rows as stored come back');
select harness.check((pg_temp.score(:'ana', 1)).strokes = 4 and (pg_temp.score(:'beto', 1)).strokes = 5 and (pg_temp.score(:'beto', 1)).version = 1, 'Ana 4, Beto 5, each at version 1');
select harness.check((pg_temp.score(:'beto', 1)).entered_by = :'ana' and (pg_temp.score(:'beto', 1)).mutation_id = :'m1' and (pg_temp.score(:'beto', 1)).device_id is not null,
  'entered by the phone''s own player, with its mutation and device');

-- 4. The same mutation again answers the same, and writes nothing
select set_config('request.jwt.claims', harness.claims(:'dev_a'), true) \g /dev/null
set local role authenticated;
select public.save_hole(pg_temp.hole(:'r1', 1, :'m1', jsonb_build_array(pg_temp.entry(:'ana', '{"strokes":9}'))))::text as again \gset
reset role;
select harness.check((:'again'::jsonb - 'replayed') = :'first'::jsonb and (:'again'::jsonb ->> 'replayed')::boolean, 'a mutation sent twice: the first answer, marked replayed');
select harness.check((pg_temp.score(:'ana', 1)).strokes = 4 and (pg_temp.score(:'ana', 1)).version = 1, 'and Ana is still 4, at version 1');

-- 5. Beto corrects his own hole from his phone, against what it saw
select set_config('request.jwt.claims', harness.claims(:'dev_b'), true) \g /dev/null
set local role authenticated;
select public.save_hole(pg_temp.hole(:'r1', 1, gen_random_uuid(), jsonb_build_array(pg_temp.entry(:'beto', '{"strokes":6}', '{"strokes":5}'))))::text as out \gset
reset role;
select harness.check(:'out'::jsonb ->> 'status' = 'ok' and (pg_temp.score(:'beto', 1)).strokes = 6 and (pg_temp.score(:'beto', 1)).version = 2, 'Beto''s phone: 5 → 6, version 2');
select harness.check((pg_temp.score(:'beto', 1)).entered_by = :'beto' and (pg_temp.score(:'beto', 1)).disputed, 'another phone changing what Ana''s entered: a discrepancy, as before');

-- 6. Ana's phone, which still saw 5, sets 7: not overwritten, asked instead
select set_config('request.jwt.claims', harness.claims(:'dev_a'), true) \g /dev/null
set local role authenticated;
select public.save_hole(pg_temp.hole(:'r1', 1, gen_random_uuid(), jsonb_build_array(pg_temp.entry(:'beto', '{"strokes":7}', '{"strokes":5}'))))::text as out \gset
reset role;
select harness.check(:'out'::jsonb ->> 'status' = 'conflict' and :'out'::jsonb #>> '{conflicts,0,fields,0}' = 'strokes'
  and (:'out'::jsonb #>> '{conflicts,0,server,strokes}')::int = 6, 'a stale phone''s 7 over Beto''s 6: conflict, with the server''s row');
select harness.check((pg_temp.score(:'beto', 1)).strokes = 6 and (pg_temp.score(:'beto', 1)).version = 2, 'and the 6 stands');
select harness.check((select count(*) from public.rejected_writes where round_id = :'r1' and player_id = :'beto' and reason = 'conflict' and payload #>> '{server,strokes}' = '6') = 1, 'the conflict is kept for the Comité with both values');

-- 7. The same value from a stale phone is no conflict; another field merges
select set_config('request.jwt.claims', harness.claims(:'dev_a'), true) \g /dev/null
set local role authenticated;
select public.save_hole(pg_temp.hole(:'r1', 1, gen_random_uuid(), jsonb_build_array(pg_temp.entry(:'beto', '{"strokes":6}', '{"strokes":5}'))))::text as out \gset
reset role;
select harness.check(:'out'::jsonb ->> 'status' = 'ok' and :'out'::jsonb -> 'unchanged' = jsonb_build_array(:'beto'::text) and (pg_temp.score(:'beto', 1)).version = 2,
  'a stale phone sending the 6 that is there: unchanged, no new version');
select set_config('request.jwt.claims', harness.claims(:'dev_a'), true) \g /dev/null
set local role authenticated;
select public.save_hole(pg_temp.hole(:'r1', 1, gen_random_uuid(), jsonb_build_array(pg_temp.entry(:'beto', '{"putts":1}', '{"putts":2}'))))::text as out \gset
reset role;
select harness.check(:'out'::jsonb ->> 'status' = 'ok' and (pg_temp.score(:'beto', 1)).strokes = 6 and (pg_temp.score(:'beto', 1)).putts = 1,
  'only the putts set, against the putts seen: Beto''s 6 kept, putts 1');

-- 7b. A phone that saw the hole empty: its score goes in, unless someone filled it meanwhile; nothing set is no score
select set_config('request.jwt.claims', harness.claims(:'dev_a'), true) \g /dev/null
set local role authenticated;
select public.save_hole(pg_temp.hole(:'r1', 9, gen_random_uuid(), jsonb_build_array(pg_temp.entry(:'ana', '{"strokes":5,"picked_up":false}', '{}'))))::text as out \gset
reset role;
select harness.check(:'out'::jsonb ->> 'status' = 'ok' and (pg_temp.score(:'ana', 9)).strokes = 5, 'a phone that saw the 9th empty: its 5 goes in');
select set_config('request.jwt.claims', harness.claims(:'dev_b'), true) \g /dev/null
set local role authenticated;
select public.save_hole(pg_temp.hole(:'r1', 9, gen_random_uuid(), jsonb_build_array(pg_temp.entry(:'ana', '{"strokes":6,"picked_up":false}', '{}'))))::text as out \gset
select public.save_hole(pg_temp.hole(:'r1', 10, gen_random_uuid(), jsonb_build_array(pg_temp.entry(:'beto', '{}', '{}'))))::text as out2 \gset
reset role;
select harness.check(:'out'::jsonb ->> 'status' = 'conflict' and (pg_temp.score(:'ana', 9)).strokes = 5, 'another phone that also saw it empty, with a 6: asked, and the 5 stands');
select harness.check(:'out2'::jsonb #>> '{rejected,0,reason}' = 'invalid' and pg_temp.score(:'beto', 10) is null, 'an entry that sets nothing on an empty hole: invalid, no half row');

-- 7b'. Putts on a hole stored with none, from a phone that saw none (no key in its base): no conflict
select set_config('request.jwt.claims', harness.claims(:'dev_a'), true) \g /dev/null
set local role authenticated;
select public.save_hole(pg_temp.hole(:'r1', 9, gen_random_uuid(), jsonb_build_array(pg_temp.entry(:'ana', '{"putts":2}', '{}'))))::text as out \gset
reset role;
select harness.check(:'out'::jsonb ->> 'status' = 'ok' and (pg_temp.score(:'ana', 9)).putts = 2 and (pg_temp.score(:'ana', 9)).strokes = 5,
  'putts set on a hole that had none, by a phone that saw none: no conflict, the 5 kept');

-- 7c. A stale phone's pick-up does not wipe strokes another phone entered meanwhile
select set_config('request.jwt.claims', harness.claims(:'dev_a'), true) \g /dev/null
set local role authenticated;
select public.save_hole(pg_temp.hole(:'r1', 11, gen_random_uuid(), jsonb_build_array(pg_temp.entry(:'ana', '{"strokes":5,"picked_up":false}', '{}')))) \g /dev/null
reset role;
select set_config('request.jwt.claims', harness.claims(:'dev_b'), true) \g /dev/null
set local role authenticated;
select public.save_hole(pg_temp.hole(:'r1', 11, gen_random_uuid(), jsonb_build_array(pg_temp.entry(:'ana', '{"strokes":6}', '{"strokes":5}')))) \g /dev/null
reset role;
select set_config('request.jwt.claims', harness.claims(:'dev_a'), true) \g /dev/null
set local role authenticated;
select public.save_hole(pg_temp.hole(:'r1', 11, gen_random_uuid(), jsonb_build_array(
  pg_temp.entry(:'ana', '{"picked_up":true}', '{"picked_up":false,"strokes":5}'))))::text as out \gset
reset role;
select harness.check(:'out'::jsonb ->> 'status' = 'conflict' and :'out'::jsonb #>> '{conflicts,0,fields,0}' = 'strokes'
  and (pg_temp.score(:'ana', 11)).strokes = 6 and not (pg_temp.score(:'ana', 11)).picked_up,
  'a stale phone picking up over the 6 another phone entered: asked, the 6 stands');

-- 8. Picking up clears the strokes; values out of rule are refused
select set_config('request.jwt.claims', harness.claims(:'dev_a'), true) \g /dev/null
set local role authenticated;
select public.save_hole(pg_temp.hole(:'r1', 1, gen_random_uuid(), jsonb_build_array(pg_temp.entry(:'ana', '{"picked_up":true}', '{"picked_up":false}'))))::text as out \gset
reset role;
select harness.check(:'out'::jsonb ->> 'status' = 'ok' and (pg_temp.score(:'ana', 1)).picked_up and (pg_temp.score(:'ana', 1)).strokes is null and (pg_temp.score(:'ana', 1)).putts = 2,
  'Ana picks up: no strokes, her putts kept');
select set_config('request.jwt.claims', harness.claims(:'dev_a'), true) \g /dev/null
set local role authenticated;
select public.save_hole(pg_temp.hole(:'r1', 2, gen_random_uuid(), jsonb_build_array(
  pg_temp.entry(:'ana', '{"strokes":0,"picked_up":false}'),
  pg_temp.entry(:'beto', '{"strokes":3,"putts":4,"picked_up":false}'))))::text as out \gset
select public.save_hole(pg_temp.hole(:'r1', 3, gen_random_uuid(), jsonb_build_array(
  pg_temp.entry(:'ana', '{"strokes":4.5,"picked_up":false}'),
  pg_temp.entry(:'beto', '{"strokes":4,"handicap":1}'))))::text as out2 \gset
select public.save_hole(pg_temp.hole(:'r1', 4, gen_random_uuid(), jsonb_build_array(
  pg_temp.entry(:'ana', '{"strokes":4.0,"picked_up":false}'),
  pg_temp.entry(:'ana', '{"strokes":5,"picked_up":false}'))))::text as out3 \gset
reset role;
select harness.check(:'out'::jsonb ->> 'status' = 'rejected' and (select count(*) from jsonb_array_elements(:'out'::jsonb -> 'rejected') x where x ->> 'reason' = 'invalid') = 2,
  'strokes 0, and more putts than strokes: invalid');
select harness.check(:'out2'::jsonb ->> 'status' = 'rejected', 'a fraction of a stroke, and a field that is not a score''s: invalid');
select harness.check(:'out3'::jsonb ->> 'status' = 'partial' and (pg_temp.score(:'ana', 4)).strokes = 4 and :'out3'::jsonb #>> '{rejected,0,reason}' = 'invalid',
  '4.0 is 4, and a second entry for the same player in one call is refused');
select harness.check(pg_temp.score(:'ana', 2) is null and pg_temp.score(:'beto', 2) is null, 'nothing of a refused hole is written');

-- 9. A player not in the group
select set_config('request.jwt.claims', harness.claims(:'dev_x'), true) \g /dev/null
set local role authenticated;
select public.save_hole(pg_temp.hole(:'r1', 5, gen_random_uuid(), jsonb_build_array(pg_temp.entry(:'ana', '{"strokes":4,"picked_up":false}'))))::text as out \gset
reset role;
select harness.check(:'out'::jsonb #>> '{rejected,0,reason}' = 'not_in_group' and pg_temp.score(:'ana', 5) is null, 'Caro''s phone saving Ana''s hole: not_in_group');

-- 10. A direct write says who wrote it, whatever its body claims (SEC-02)
select set_config('request.jwt.claims', harness.claims(:'dev_a'), true) \g /dev/null
set local role authenticated;
insert into public.scores (round_id, player_id, hole, strokes, putts, picked_up, entered_by) values (:'r1', :'beto', 6, 5, 2, false, :'beto');
reset role;
select harness.check((pg_temp.score(:'beto', 6)).entered_by = :'ana', 'Ana''s phone writing Beto''s 6th as if by Beto: recorded as Ana''s');
select set_config('request.jwt.claims', harness.claims(:'dev_a'), true) \g /dev/null
set local role authenticated;
update public.scores set strokes = 4 where round_id = :'r1' and player_id = :'beto' and hole = 6;
reset role;
select harness.check((pg_temp.score(:'beto', 6)).version = 2, 'a direct update bumps the version too');

-- 11. Signing settles the discrepancies; a signed card takes no more (NEW-01)
select harness.check((pg_temp.score(:'beto', 1)).disputed, 'Beto''s 1st is in discrepancy before the signature');
select set_config('request.jwt.claims', harness.claims(:'org_a'), true) \g /dev/null
set local role authenticated;
insert into public.pairs (tournament_id, name, player1_id, player2_id) values (:'t_a', 'Ana y Beto', :'ana', :'beto') returning id as pair \gset
insert into public.card_signatures (round_id, pair_id, signed_by) values (:'r1', :'pair', :'caro');
reset role;
select harness.check(not (pg_temp.score(:'beto', 1)).disputed and (pg_temp.score(:'beto', 1)).previous is null, 'signing the card settles it');
select set_config('request.jwt.claims', harness.claims(:'dev_a'), true) \g /dev/null
set local role authenticated;
select public.save_hole(pg_temp.hole(:'r1', 7, gen_random_uuid(), jsonb_build_array(pg_temp.entry(:'ana', '{"strokes":4,"picked_up":false}'))))::text as out \gset
update public.scores set strokes = 8 where round_id = :'r1' and player_id = :'beto' and hole = 6;
reset role;
select harness.check(:'out'::jsonb #>> '{rejected,0,reason}' = 'card_signed' and pg_temp.score(:'ana', 7) is null, 'a signed card: card_signed, nothing written');
select harness.check((pg_temp.score(:'beto', 6)).strokes = 4, 'and a direct write to it changes nothing');

-- 12. A finished round: the Comité corrects only through admin_save_score (REL-09)
select set_config('request.jwt.claims', harness.claims(:'org_a'), true) \g /dev/null
set local role authenticated;
delete from public.card_signatures where round_id = :'r1';
update public.rounds set status = 'finished' where id = :'r1';
update public.scores set strokes = 9 where round_id = :'r1' and player_id = :'beto' and hole = 6;
reset role;
select harness.check((pg_temp.score(:'beto', 6)).strokes = 4, 'the Comité''s direct write to a finished round changes nothing');
select set_config('request.jwt.claims', harness.claims(:'org_a'), true) \g /dev/null
set local role authenticated;
do $$ begin
  insert into public.scores (round_id, player_id, hole, strokes, picked_up) values (current_setting('harness.r1')::uuid, current_setting('harness.beto')::uuid, 8, 4, false);
  perform set_config('harness.out', 'inserted', true);
exception when others then
  perform set_config('harness.out', sqlstate || ' ' || sqlerrm, true);
end $$;
select public.admin_save_score(:'r1', :'beto', 6, 9, 2, false, 'La tarjeta de papel dice 9') \g /dev/null
reset role;
select harness.check(current_setting('harness.out') like '42501 new row violates row-level security policy%', 'nor can it add a hole there directly (42501, the policy)');
select harness.check((pg_temp.score(:'beto', 6)).strokes = 9 and (pg_temp.score(:'beto', 6)).reason = 'La tarjeta de papel dice 9', 'admin_save_score, with its reason, does');

-- 12b. After the round a phone's snake answer and contest winner are refused; the Comité's decisions are taken (REL-08)
select set_config('request.jwt.claims', harness.claims(:'dev_a'), true) \g /dev/null
set local role authenticated;
do $$ begin
  insert into public.snake_tiebreaks (round_id, group_id, hole, last_holed_player_id, decided_by)
  values (current_setting('harness.r1')::uuid, current_setting('harness.g1')::uuid, 3, current_setting('harness.beto')::uuid, current_setting('harness.ana')::uuid);
  perform set_config('harness.tb', 'inserted', true);
exception when others then
  perform set_config('harness.tb', sqlstate || ' ' || sqlerrm, true);
end $$;
do $$ begin
  insert into public.hole_awards (round_id, group_id, hole, game_id, player_id, decided_by)
  values (current_setting('harness.r1')::uuid, current_setting('harness.g1')::uuid, 3, 'closest', current_setting('harness.beto')::uuid, current_setting('harness.ana')::uuid);
  perform set_config('harness.aw', 'inserted', true);
exception when others then
  perform set_config('harness.aw', sqlstate || ' ' || sqlerrm, true);
end $$;
reset role;
select harness.check(current_setting('harness.tb') like '42501 new row violates row-level security policy%' and current_setting('harness.aw') like '42501 new row violates row-level security policy%',
  'after the round, a phone''s snake answer and contest winner: refused by the policy');
select set_config('request.jwt.claims', harness.claims(:'org_a'), true) \g /dev/null
set local role authenticated;
insert into public.snake_tiebreaks (round_id, group_id, hole, last_holed_player_id, decided_by) values (:'r1', :'g1', 3, :'beto', null);
insert into public.hole_awards (round_id, group_id, hole, game_id, player_id, decided_by) values (:'r1', null, 3, 'closest', :'beto', null);
reset role;
select harness.check((select count(*) from public.snake_tiebreaks where round_id = :'r1' and hole = 3) = 1 and (select count(*) from public.hole_awards where round_id = :'r1' and hole = 3) = 1,
  'the Comité''s answer and winner after the round: taken');

-- 13. Who reads the refusals
select set_config('request.jwt.claims', harness.claims(:'dev_x'), true) \g /dev/null
set local role authenticated;
select count(*) as mine_x from public.rejected_writes \gset
reset role;
select set_config('request.jwt.claims', harness.claims(:'org_a'), true) \g /dev/null
set local role authenticated;
select count(*) as all_a from public.rejected_writes where tournament_id = :'t_a' \gset
reset role;
select harness.check(:mine_x = 1 and :all_a = (select count(*) from public.rejected_writes where tournament_id = :'t_a') and :all_a > 1,
  'a phone reads its own refusals; the Comité reads the tournament''s');
select set_config('request.jwt.claims', harness.claims(:'dev_a'), true) \g /dev/null
set local role authenticated;
do $$ begin
  perform 1 from public.score_mutations;
  perform set_config('harness.out', 'read', true);
exception when others then
  perform set_config('harness.out', sqlstate || ' ' || sqlerrm, true);
end $$;
reset role;
select harness.check(current_setting('harness.out') = '42501 permission denied for table score_mutations', 'nobody reads score_mutations through the API');

rollback;
\echo 'save_hole: ok'
