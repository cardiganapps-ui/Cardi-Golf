-- The Comité's inbox of refused and conflicted holes (0028, REL-08):
-- resolve_rejected_write applies a row through admin_save_score or dismisses
-- it, with a reason, once. Each step runs as the user who does it in the app,
-- on the two-tenant seed: tournament A has Ana and Beto in group 1 of round
-- 1, and the device dev_a holds Ana. Beto gets his own phone (dev_b). Rolled
-- back at the end; prints one «ok» line per check.
\set ON_ERROR_STOP 1
\set QUIET 1
\pset tuples_only on
\pset format unaligned
select id as org_a from harness.seed where key = 'org_a' \gset
select id as org_b from harness.seed where key = 'org_b' \gset
select id as dev_a from harness.seed where key = 'dev_a' \gset
select id as dev_x from harness.seed where key = 'dev_x' \gset
select id as t_a from harness.seed where key = 'tournament_a' \gset
select id as ana from harness.seed where key = 'player_a1' \gset
select id as beto from harness.seed where key = 'player_a2' \gset
select id as r1 from harness.seed where key = 'round_a1' \gset
select id as g1 from harness.seed where key = 'group_a1' \gset
\set dev_b '0000000b-0000-4000-8000-00000000000b'
begin;
insert into auth.users (id, last_sign_in_at, raw_app_meta_data, raw_user_meta_data, is_anonymous)
values (:'dev_b', now(), '{"provider":"anonymous","providers":["anonymous"]}', '{}', true);
select set_config('request.jwt.claims', harness.claims(:'dev_b'), true) \g /dev/null
set local role authenticated;
select public.claim_player(:'beto', '1234') \g /dev/null
reset role;

create function pg_temp.hole(r uuid, h int, entries jsonb) returns jsonb language sql as $$
  select jsonb_build_object('round_id', r, 'hole', h, 'mutation_id', gen_random_uuid(), 'device_id', '0000000d-0000-4000-8000-00000000000d', 'entries', entries)
$$;
-- A resolution whose refusal is the answer: «ok <answer>», or the SQLSTATE and the message.
create function pg_temp.try_resolve(id uuid, action text, reason text) returns text language plpgsql as $$
declare
  out jsonb;
begin
  out := public.resolve_rejected_write(id, action, reason);
  return 'ok ' || out::text;
exception when others then
  return sqlstate || ' ' || sqlerrm;
end $$;
grant execute on function pg_temp.hole(uuid, int, jsonb), pg_temp.try_resolve(uuid, text, text) to authenticated;
create function pg_temp.score(p uuid, h int) returns public.scores language sql as $$
  select s from public.scores s where s.round_id = (select id from harness.seed where key = 'round_a1') and s.player_id = p and s.hole = h
$$;
create function pg_temp.status(id uuid) returns text language sql as $$
  select status from public.rejected_writes where rejected_writes.id = $1
$$;

-- 0. The rows, as save_hole keeps them: a hole sent while the round was not live, and a conflict.
select set_config('request.jwt.claims', harness.claims(:'dev_a'), true) \g /dev/null
set local role authenticated;
select public.save_hole(pg_temp.hole(:'r1', 1, jsonb_build_array(jsonb_build_object('player_id', :'ana', 'fields', '{"strokes":4,"putts":2,"picked_up":false}'::jsonb, 'base', '{}'::jsonb)))) \g /dev/null
reset role;
select id as w_closed from public.rejected_writes where round_id = :'r1' and hole = 1 and reason = 'round_not_live' \gset
select set_config('request.jwt.claims', harness.claims(:'org_a'), true) \g /dev/null
set local role authenticated;
update public.rounds set status = 'live' where id = :'r1';
reset role;
-- Ana's phone saves Beto's 2nd as 5 with 2 putts; Beto's own phone, which saw it empty, sends 6 strokes only.
select set_config('request.jwt.claims', harness.claims(:'dev_a'), true) \g /dev/null
set local role authenticated;
select public.save_hole(pg_temp.hole(:'r1', 2, jsonb_build_array(jsonb_build_object('player_id', :'beto', 'fields', '{"strokes":5,"putts":2}'::jsonb, 'base', '{}'::jsonb)))) \g /dev/null
reset role;
select set_config('request.jwt.claims', harness.claims(:'dev_b'), true) \g /dev/null
set local role authenticated;
select public.save_hole(pg_temp.hole(:'r1', 2, jsonb_build_array(jsonb_build_object('player_id', :'beto', 'fields', '{"strokes":6}'::jsonb, 'base', '{}'::jsonb))))::text as out \gset
reset role;
select harness.check(:'out'::jsonb ->> 'status' = 'conflict' and (pg_temp.score(:'beto', 2)).strokes = 5, 'Beto''s phone met Ana''s 5: a conflict, the 5 stands');
select id as w_conflict from public.rejected_writes where round_id = :'r1' and hole = 2 and reason = 'conflict' \gset
select harness.check(pg_temp.status(:'w_closed') = 'open' and pg_temp.status(:'w_conflict') = 'open', 'both kept open for the Comité');

-- 1. Who may resolve: the Comité only, and nobody else learns whether the row exists
select set_config('request.jwt.claims', harness.claims(:'dev_a'), true) \g /dev/null
set local role authenticated;
select pg_temp.try_resolve(:'w_closed', 'apply', 'Lo vi en papel') as out \gset
select count(*) as sees from public.rejected_writes where id = :'w_closed' \gset
reset role;
select harness.check(:sees = 1 and :'out' like '42501 Solo el Comité%', 'the phone that sent it reads it, but may not resolve it (42501)');
select set_config('request.jwt.claims', harness.claims(:'dev_b'), true) \g /dev/null
set local role authenticated;
select pg_temp.try_resolve(:'w_conflict', 'dismiss', 'No me gusta') as out \gset
reset role;
select harness.check(:'out' like '42501 %', 'a player of the tournament: 42501');
select set_config('request.jwt.claims', harness.claims(:'dev_x'), true) \g /dev/null
set local role authenticated;
select pg_temp.try_resolve(:'w_closed', 'dismiss', 'Desconocido') as out \gset
reset role;
select harness.check(:'out' like '42501 %', 'a stranger: 42501');
select set_config('request.jwt.claims', harness.claims(:'org_b'), true) \g /dev/null
set local role authenticated;
select pg_temp.try_resolve(:'w_closed', 'dismiss', 'Otro torneo') as out \gset
select pg_temp.try_resolve(gen_random_uuid(), 'dismiss', 'No existe') as out2 \gset
reset role;
select harness.check(:'out' like '42501 %' and :'out2' = :'out', 'another tournament''s organizer: 42501, the same answer as for a row that does not exist');
select harness.check(pg_temp.status(:'w_closed') = 'open' and pg_temp.status(:'w_conflict') = 'open' and pg_temp.score(:'ana', 1) is null, 'and nothing changed');

-- 2. The reason and the action
select set_config('request.jwt.claims', harness.claims(:'org_a'), true) \g /dev/null
set local role authenticated;
select pg_temp.try_resolve(:'w_closed', 'apply', '   ') as e1 \gset
select pg_temp.try_resolve(:'w_closed', 'apply', null) as e2 \gset
select pg_temp.try_resolve(:'w_closed', 'apply', repeat('x', 201)) as e3 \gset
select pg_temp.try_resolve(:'w_closed', 'borrar', 'Motivo válido') as e4 \gset
reset role;
select harness.check(:'e1' like '22023 Escribe el motivo%' and :'e2' like '22023 Escribe el motivo%', 'a blank or missing reason: 22023');
select harness.check(:'e3' like '22023 El motivo es muy largo%', 'a reason over 200 letters: 22023');
select harness.check(:'e4' like '22023 Una captura rechazada se aplica o se descarta%', 'an action other than apply or dismiss: 22023');
select harness.check(pg_temp.status(:'w_closed') = 'open' and pg_temp.score(:'ana', 1) is null, 'none of them wrote anything');

-- 3. Apply: the hole the phone sent, through admin_save_score, with the reason
select max(id) as audit0 from public.audit_log \gset
select set_config('request.jwt.claims', harness.claims(:'org_a'), true) \g /dev/null
set local role authenticated;
select pg_temp.try_resolve(:'w_closed', 'apply', '  Ana lo capturó con el día cerrado  ') as out \gset
reset role;
select harness.check(:'out' like 'ok %' and (substr(:'out', 4))::jsonb ->> 'status' = 'applied', 'the Comité applies it: applied');
select harness.check((pg_temp.score(:'ana', 1)).strokes = 4 and (pg_temp.score(:'ana', 1)).putts = 2 and not (pg_temp.score(:'ana', 1)).picked_up
  and (pg_temp.score(:'ana', 1)).reason = 'Ana lo capturó con el día cerrado', 'Ana''s 1st is 4 with 2 putts, the reason on the score');
select harness.check((select status = 'applied' and resolved_by = :'org_a' and resolved_at is not null and resolution_note = 'Ana lo capturó con el día cerrado' from public.rejected_writes where id = :'w_closed'),
  'the row says applied, by whom, when and why');
select harness.check(exists (select 1 from public.audit_log where id > :audit0 and table_name = 'rejected_writes' and row_id = :'w_closed' and action = 'UPDATE'
  and reason = 'Ana lo capturó con el día cerrado' and actor_auth_user_id = :'org_a' and after ->> 'status' = 'applied'), 'the resolution is in the audit log, its reason as the reason');
select harness.check(exists (select 1 from public.audit_log where id > :audit0 and table_name = 'scores' and actor_auth_user_id = :'org_a' and reason = 'Ana lo capturó con el día cerrado'),
  'and so is the score it wrote');

-- 4. Once: a second call is refused and writes nothing
select (pg_temp.score(:'ana', 1)).version as v1 \gset
select count(*) as audits from public.audit_log \gset
select set_config('request.jwt.claims', harness.claims(:'org_a'), true) \g /dev/null
set local role authenticated;
select pg_temp.try_resolve(:'w_closed', 'apply', 'Otra vez') as again \gset
select pg_temp.try_resolve(:'w_closed', 'dismiss', 'Otra vez') as again2 \gset
reset role;
select harness.check(:'again' like '22023 Esa captura ya estaba resuelta%' and :'again2' like '22023 Esa captura ya estaba resuelta%', 'applying or dismissing it again: 22023');
select harness.check((pg_temp.score(:'ana', 1)).version = :v1 and (select count(*) from public.audit_log) = :audits
  and (select resolution_note from public.rejected_writes where id = :'w_closed') = 'Ana lo capturó con el día cerrado', 'and nothing is written twice');

-- 5. A conflict: only the fields the phone set, over the hole as it is now
select set_config('request.jwt.claims', harness.claims(:'org_a'), true) \g /dev/null
set local role authenticated;
select pg_temp.try_resolve(:'w_conflict', 'apply', 'Beto confirma 6') as out \gset
reset role;
select harness.check(:'out' like 'ok %' and (pg_temp.score(:'beto', 2)).strokes = 6 and (pg_temp.score(:'beto', 2)).putts = 2,
  'Beto''s 6 over the 5: his strokes only, the putts that stand stay');

-- 6. The payload's ids are never read: only the row's player and hole are written
insert into public.rejected_writes (tournament_id, round_id, hole, player_id, writer_player_id, auth_user_id, payload, reason)
values (:'t_a', :'r1', 3, :'beto', :'ana', :'dev_a', jsonb_build_object('player_id', :'ana', 'hole', 9, 'round_id', gen_random_uuid(), 'fields', '{"strokes":7,"putts":3}'::jsonb), 'not_in_group')
returning id as w_ids \gset
select set_config('request.jwt.claims', harness.claims(:'org_a'), true) \g /dev/null
set local role authenticated;
select pg_temp.try_resolve(:'w_ids', 'apply', 'Era de Beto') as out \gset
reset role;
select harness.check(:'out' like 'ok %' and (pg_temp.score(:'beto', 3)).strokes = 7 and pg_temp.score(:'ana', 3) is null and pg_temp.score(:'ana', 9) is null,
  'a payload naming Ana and hole 9: Beto''s 3rd is written, nothing of Ana''s');

-- 7. Dismiss: the row closes, no score moves
select set_config('request.jwt.claims', harness.claims(:'dev_b'), true) \g /dev/null
set local role authenticated;
select public.save_hole(pg_temp.hole(:'r1', 2, jsonb_build_array(jsonb_build_object('player_id', :'beto', 'fields', '{"strokes":9}'::jsonb, 'base', '{"strokes":5,"putts":2,"picked_up":false}'::jsonb)))) \g /dev/null
reset role;
select id as w_dismiss from public.rejected_writes where round_id = :'r1' and hole = 2 and reason = 'conflict' and status = 'open' \gset
select (pg_temp.score(:'beto', 2)).version as v2 \gset
select set_config('request.jwt.claims', harness.claims(:'org_a'), true) \g /dev/null
set local role authenticated;
select pg_temp.try_resolve(:'w_dismiss', 'dismiss', 'Se equivocó de hoyo') as out \gset
reset role;
select harness.check(:'out' like 'ok %' and (substr(:'out', 4))::jsonb ->> 'status' = 'dismissed'
  and (select status = 'dismissed' and resolved_by = :'org_a' and resolution_note = 'Se equivocó de hoyo' from public.rejected_writes where id = :'w_dismiss'),
  'dismissed, by whom and why');
select harness.check((pg_temp.score(:'beto', 2)).strokes = 6 and (pg_temp.score(:'beto', 2)).version = :v2, 'and Beto''s 2nd is as it was');

-- 8. A signed card: applied through admin_save_score, the reason on the score; its own rules still hold
select set_config('request.jwt.claims', harness.claims(:'org_a'), true) \g /dev/null
set local role authenticated;
insert into public.pairs (tournament_id, name, player1_id, player2_id) values (:'t_a', 'Ana y Beto', :'ana', :'beto') returning id as pair \gset
insert into public.card_signatures (round_id, pair_id, signed_by) values (:'r1', :'pair', :'beto');
reset role;
select set_config('request.jwt.claims', harness.claims(:'dev_a'), true) \g /dev/null
set local role authenticated;
select public.save_hole(pg_temp.hole(:'r1', 4, jsonb_build_array(jsonb_build_object('player_id', :'ana', 'fields', '{"picked_up":true,"putts":1}'::jsonb, 'base', '{}'::jsonb)))) \g /dev/null
reset role;
select id as w_signed from public.rejected_writes where round_id = :'r1' and hole = 4 and reason = 'card_signed' \gset
select set_config('request.jwt.claims', harness.claims(:'org_a'), true) \g /dev/null
set local role authenticated;
select pg_temp.try_resolve(:'w_signed', 'apply', 'ok') as short \gset
select pg_temp.try_resolve(:'w_signed', 'apply', 'Levantó, firmada después') as out \gset
reset role;
select harness.check(:'short' like '22023 Escribe el motivo%', 'a two-letter reason on a signed card: 22023');
select harness.check(:'out' like 'ok %' and (pg_temp.score(:'ana', 4)).picked_up and (pg_temp.score(:'ana', 4)).strokes is null and (pg_temp.score(:'ana', 4)).putts = 1
  and (pg_temp.score(:'ana', 4)).reason = 'Levantó, firmada después', 'a pick-up on a signed card: written, no strokes, with its reason');

-- 9. A player who has left the group since: the Comité still applies it
select set_config('request.jwt.claims', harness.claims(:'org_a'), true) \g /dev/null
set local role authenticated;
delete from public.card_signatures where round_id = :'r1';
delete from public.group_members where group_id = :'g1' and player_id = :'beto';
reset role;
select harness.check(not exists (select 1 from public.group_members where group_id = :'g1' and player_id = :'beto'), 'Beto is out of the group');
insert into public.rejected_writes (tournament_id, round_id, hole, player_id, writer_player_id, auth_user_id, payload, reason)
values (:'t_a', :'r1', 5, :'beto', :'beto', :'dev_b', '{"fields":{"strokes":4,"putts":1}}'::jsonb, 'not_in_group')
returning id as w_left \gset
select set_config('request.jwt.claims', harness.claims(:'org_a'), true) \g /dev/null
set local role authenticated;
select pg_temp.try_resolve(:'w_left', 'apply', 'Jugó el 5 antes del cambio') as out \gset
reset role;
select harness.check(:'out' like 'ok %' and (pg_temp.score(:'beto', 5)).strokes = 4, 'Beto''s 5th, applied with him out of the group');

-- 10. What cannot be applied stays open, to dismiss
insert into public.rejected_writes (tournament_id, round_id, hole, player_id, writer_player_id, auth_user_id, payload, reason) values
  (:'t_a', :'r1', 6, :'ana', :'ana', :'dev_a', '{"fields":{"gross":4}}'::jsonb, 'invalid'),
  (:'t_a', :'r1', 7, :'ana', :'ana', :'dev_a', '{"fields":{"strokes":"cuatro"}}'::jsonb, 'invalid'),
  (:'t_a', :'r1', 8, :'ana', :'ana', :'dev_a', '{"fields":{"strokes":4,"putts":6}}'::jsonb, 'invalid'),
  (:'t_a', :'r1', 9, :'ana', :'ana', :'dev_a', '{"fields":{"putts":2}}'::jsonb, 'invalid'),
  (:'t_a', :'r1', 10, :'ana', :'ana', :'dev_a', '{"fields":{"strokes":4.5}}'::jsonb, 'invalid');
select set_config('request.jwt.claims', harness.claims(:'org_a'), true) \g /dev/null
set local role authenticated;
select pg_temp.try_resolve((select id from public.rejected_writes where hole = 6 and round_id = :'r1'), 'apply', 'Probar') as b6 \gset
select pg_temp.try_resolve((select id from public.rejected_writes where hole = 7 and round_id = :'r1'), 'apply', 'Probar') as b7 \gset
select pg_temp.try_resolve((select id from public.rejected_writes where hole = 8 and round_id = :'r1'), 'apply', 'Probar') as b8 \gset
select pg_temp.try_resolve((select id from public.rejected_writes where hole = 9 and round_id = :'r1'), 'apply', 'Probar') as b9 \gset
select pg_temp.try_resolve((select id from public.rejected_writes where hole = 10 and round_id = :'r1'), 'apply', 'Probar') as b10 \gset
reset role;
select harness.check(:'b6' like '22023 Esa captura no trae golpes%', 'a field the table does not have: 22023');
select harness.check(:'b7' like '22023 Los valores de esa captura no se entienden%', 'strokes that are not a number: 22023');
select harness.check(:'b8' like '22023 Con esa captura los putts%', 'more putts than strokes: 22023');
select harness.check(:'b9' like '22023 Con esa captura el hoyo no queda con golpes%', 'putts over an empty hole (no strokes): 22023');
select harness.check(:'b10' like '22023 Con esa captura el hoyo no queda con golpes%', 'half a stroke: 22023');
select harness.check((select count(*) from public.rejected_writes where round_id = :'r1' and hole between 6 and 10 and status = 'open') = 5
  and not exists (select 1 from public.scores where round_id = :'r1' and player_id = :'ana' and hole between 6 and 10), 'all five stay open, nothing written');

-- 11. An admin player is the Comité too
select set_config('request.jwt.claims', harness.claims(:'org_a'), true) \g /dev/null
set local role authenticated;
update public.players set is_admin = true where id = :'ana';
reset role;
select set_config('request.jwt.claims', harness.claims(:'dev_a'), true) \g /dev/null
set local role authenticated;
select pg_temp.try_resolve((select id from public.rejected_writes where hole = 6 and round_id = :'r1'), 'dismiss', 'Captura rota') as out \gset
reset role;
select harness.check(:'out' like 'ok %' and (select status from public.rejected_writes where hole = 6 and round_id = :'r1') = 'dismissed', 'Ana, made admin, dismisses one');

-- 12. Published to Realtime, for the bundle that listens to it
select harness.check(exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'rejected_writes')
  or not exists (select 1 from pg_publication where pubname = 'supabase_realtime'), 'rejected_writes is in the realtime publication');

rollback;
