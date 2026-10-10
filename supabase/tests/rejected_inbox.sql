-- The Comité's inbox of refused holes (0028, REL-08): rejected_inbox lists
-- the rows a person's value waits in (no conflict, no untouched default),
-- and resolve_rejected_write applies one through admin_save_score, against
-- the hole the Comité saw, or dismisses it, with a reason, once. Each step
-- runs as the user who does it in the app, on the two-tenant seed:
-- tournament A has Ana and Beto in group 1 of round 1, and the device dev_a
-- holds Ana. Beto gets his own phone (dev_b). Rolled back at the end; prints
-- one «ok» line per check.
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
create function pg_temp.try_resolve(id uuid, action text, reason text, expect jsonb default null) returns text language plpgsql as $$
declare
  out jsonb;
begin
  out := public.resolve_rejected_write(id, action, reason, expect);
  return 'ok ' || out::text;
exception when others then
  return sqlstate || ' ' || sqlerrm;
end $$;
-- The inbox as the Comité reads it: the ids listed, or the SQLSTATE and the message.
create function pg_temp.inbox(tid uuid) returns text language plpgsql as $$
declare
  out jsonb;
begin
  out := public.rejected_inbox(tid);
  return coalesce((select string_agg(x ->> 'id', ',' order by ord) from jsonb_array_elements(out) with ordinality as e(x, ord)), '');
exception when others then
  return sqlstate || ' ' || sqlerrm;
end $$;
grant execute on function pg_temp.hole(uuid, int, jsonb), pg_temp.try_resolve(uuid, text, text, jsonb), pg_temp.inbox(uuid) to authenticated;
create function pg_temp.score(p uuid, h int) returns public.scores language sql as $$
  select s from public.scores s where s.round_id = (select id from harness.seed where key = 'round_a1') and s.player_id = p and s.hole = h
$$;
-- The hole as the Comité's screen shows it, and passes as `expect`: its three values, or {} when there is none.
create function pg_temp.seen(r uuid, p uuid, h int) returns jsonb language sql as $$
  select coalesce((select jsonb_build_object('strokes', s.strokes, 'putts', s.putts, 'picked_up', s.picked_up) from public.scores s
    where s.round_id = r and s.player_id = p and s.hole = h), '{}'::jsonb)
$$;
create function pg_temp.status(id uuid) returns text language sql as $$
  select status from public.rejected_writes where rejected_writes.id = $1
$$;
grant execute on function pg_temp.seen(uuid, uuid, int) to authenticated;

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
select harness.check(pg_temp.status(:'w_closed') = 'open' and pg_temp.status(:'w_conflict') = 'open', 'both kept open, as the record');

-- 1. What the Comité is asked to decide: the refusal, not the conflict the phone settles itself
select set_config('request.jwt.claims', harness.claims(:'org_a'), true) \g /dev/null
set local role authenticated;
select pg_temp.inbox(:'t_a') as listed \gset
reset role;
select harness.check(:'listed' = :'w_closed', 'the inbox lists the hole sent with the day closed, and not the conflict');
select set_config('request.jwt.claims', harness.claims(:'dev_a'), true) \g /dev/null
set local role authenticated;
select pg_temp.inbox(:'t_a') as by_phone \gset
reset role;
select set_config('request.jwt.claims', harness.claims(:'org_b'), true) \g /dev/null
set local role authenticated;
select pg_temp.inbox(:'t_a') as by_other \gset
reset role;
select harness.check(:'by_phone' like '42501 %' and :'by_other' like '42501 %', 'a player, or another tournament''s organizer, may not read the inbox (42501)');

-- 2. Who may resolve: the Comité only, and nobody else learns whether the row exists
select set_config('request.jwt.claims', harness.claims(:'dev_a'), true) \g /dev/null
set local role authenticated;
select pg_temp.try_resolve(:'w_closed', 'apply', 'Lo vi en papel', '{}') as out \gset
select count(*) as sees from public.rejected_writes where id = :'w_closed' \gset
reset role;
select harness.check(:sees = 1 and :'out' like '42501 Solo el Comité%', 'the phone that sent it reads it, but may not resolve it (42501)');
select set_config('request.jwt.claims', harness.claims(:'dev_b'), true) \g /dev/null
set local role authenticated;
select pg_temp.try_resolve(:'w_closed', 'dismiss', 'No me gusta') as out \gset
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

-- 3. The reason and the action: trimmed of any whitespace, counted in characters
select set_config('request.jwt.claims', harness.claims(:'org_a'), true) \g /dev/null
set local role authenticated;
select pg_temp.try_resolve(:'w_closed', 'apply', '   ', '{}') as e1 \gset
select pg_temp.try_resolve(:'w_closed', 'apply', null, '{}') as e2 \gset
select pg_temp.try_resolve(:'w_closed', 'apply', repeat('x', 201), '{}') as e3 \gset
select pg_temp.try_resolve(:'w_closed', 'borrar', 'Motivo válido') as e4 \gset
select pg_temp.try_resolve(:'w_closed', 'dismiss', E'\t\t\t') as e5 \gset
select pg_temp.try_resolve(:'w_closed', 'dismiss', E'\n ab \t') as e6 \gset
select pg_temp.try_resolve(:'w_closed', 'dismiss', '🏌🏌') as e7 \gset
select pg_temp.try_resolve(:'w_closed', 'dismiss', E'\u00a0\u00a0\u00a0') as e9 \gset
select pg_temp.try_resolve(:'w_closed', 'dismiss', E'\u00a0ab\u202f\u200b\ufeff') as e10 \gset
select pg_temp.try_resolve(:'w_closed', 'apply', repeat('🏌', 200), '{}') as e8 \gset
reset role;
select harness.check(:'e1' like '22023 Escribe el motivo%' and :'e2' like '22023 Escribe el motivo%', 'a blank or missing reason: 22023');
select harness.check(:'e3' like '22023 El motivo es muy largo%', 'a reason over 200 letters: 22023');
select harness.check(:'e4' like '22023 Una captura rechazada se aplica o se descarta%', 'an action other than apply or dismiss: 22023');
select harness.check(:'e5' like '22023 Escribe el motivo%' and :'e6' like '22023 Escribe el motivo%', 'three tabs, or two letters inside newlines and tabs: 22023 (every whitespace is trimmed, not only spaces)');
select harness.check(:'e7' like '22023 Escribe el motivo%', 'two golfers are two characters, not four: 22023');
select harness.check(:'e9' like '22023 Escribe el motivo%', 'three no-break spaces are blank: 22023');
select harness.check(:'e10' like '22023 Escribe el motivo%', 'two letters inside no-break, narrow and zero-width spaces: 22023 (trimmed too)');
select harness.check(:'e8' like 'ok %', 'two hundred golfers are two hundred characters: taken');
select harness.check(pg_temp.status(:'w_closed') = 'applied' and (pg_temp.score(:'ana', 1)).strokes = 4, 'that one applied it; none of the refused ones wrote anything');
-- The rest of the file needs a row like it, still open: the same capture again, with the day closed.
select set_config('request.jwt.claims', harness.claims(:'org_a'), true) \g /dev/null
set local role authenticated;
update public.rounds set status = 'finished' where id = :'r1';
reset role;
select set_config('request.jwt.claims', harness.claims(:'dev_a'), true) \g /dev/null
set local role authenticated;
select public.save_hole(pg_temp.hole(:'r1', 11, jsonb_build_array(jsonb_build_object('player_id', :'ana', 'fields', '{"strokes":4,"putts":2,"picked_up":false}'::jsonb, 'base', '{}'::jsonb)))) \g /dev/null
reset role;
select set_config('request.jwt.claims', harness.claims(:'org_a'), true) \g /dev/null
set local role authenticated;
update public.rounds set status = 'live' where id = :'r1';
reset role;
select id as w_closed from public.rejected_writes where round_id = :'r1' and hole = 11 and reason = 'round_not_live' \gset

-- 4. Apply: the hole the phone sent, through admin_save_score, with the reason, against the hole the Comité saw
select max(id) as audit0 from public.audit_log \gset
select set_config('request.jwt.claims', harness.claims(:'org_a'), true) \g /dev/null
set local role authenticated;
select pg_temp.try_resolve(:'w_closed', 'apply', E'\t Ana lo capturó con el día cerrado \n') as no_expect \gset
select pg_temp.try_resolve(:'w_closed', 'apply', 'Ana lo capturó con el día cerrado', '"nada"') as bad_expect \gset
select pg_temp.try_resolve(:'w_closed', 'apply', E'\t Ana lo capturó con el día cerrado \n', '{}') as out \gset
reset role;
select harness.check(:'no_expect' like '22023 Falta lo que viste%' and :'bad_expect' like '22023 Falta lo que viste%', 'applying without saying what the card showed: 22023');
select harness.check(:'out' like 'ok %' and (substr(:'out', 4))::jsonb ->> 'status' = 'applied', 'the Comité applies it: applied');
select harness.check((pg_temp.score(:'ana', 11)).strokes = 4 and (pg_temp.score(:'ana', 11)).putts = 2 and not (pg_temp.score(:'ana', 11)).picked_up
  and (pg_temp.score(:'ana', 11)).reason = 'Ana lo capturó con el día cerrado', 'Ana''s 11th is 4 with 2 putts, the trimmed reason on the score');
select harness.check((select status = 'applied' and resolved_by = :'org_a' and resolved_at is not null and resolution_note = 'Ana lo capturó con el día cerrado' from public.rejected_writes where id = :'w_closed'),
  'the row says applied, by whom, when and why');
select harness.check(exists (select 1 from public.audit_log where id > :audit0 and table_name = 'rejected_writes' and row_id = :'w_closed' and action = 'UPDATE'
  and reason = 'Ana lo capturó con el día cerrado' and actor_auth_user_id = :'org_a' and after ->> 'status' = 'applied'), 'the resolution is in the audit log, its reason as the reason');
select harness.check(exists (select 1 from public.audit_log where id > :audit0 and table_name = 'scores' and actor_auth_user_id = :'org_a' and reason = 'Ana lo capturó con el día cerrado'),
  'and so is the score it wrote');

-- 5. Once: a second call is refused and writes nothing
select (pg_temp.score(:'ana', 11)).version as v1 \gset
select count(*) as audits from public.audit_log \gset
select set_config('request.jwt.claims', harness.claims(:'org_a'), true) \g /dev/null
set local role authenticated;
select pg_temp.try_resolve(:'w_closed', 'apply', 'Otra vez', pg_temp.seen(:'r1', :'ana', 11)) as again \gset
select pg_temp.try_resolve(:'w_closed', 'dismiss', 'Otra vez') as again2 \gset
select pg_temp.inbox(:'t_a') as listed \gset
reset role;
select harness.check(:'again' like '22023 Esa captura ya estaba resuelta%' and :'again2' like '22023 Esa captura ya estaba resuelta%', 'applying or dismissing it again: 22023');
select harness.check((pg_temp.score(:'ana', 11)).version = :v1 and (select count(*) from public.audit_log) = :audits
  and (select resolution_note from public.rejected_writes where id = :'w_closed') = 'Ana lo capturó con el día cerrado', 'and nothing is written twice');
select harness.check(:'listed' = '', 'a resolved row leaves the inbox');

-- 6. A conflict is never the Comité's to apply: refused, the card as it stands; it may still be dismissed
select set_config('request.jwt.claims', harness.claims(:'org_a'), true) \g /dev/null
set local role authenticated;
select pg_temp.try_resolve(:'w_conflict', 'apply', 'Beto confirma 6', pg_temp.seen(:'r1', :'beto', 2)) as out \gset
reset role;
select harness.check(:'out' like '22023 Ese choque lo resolvió el teléfono%' and (pg_temp.score(:'beto', 2)).strokes = 5 and pg_temp.status(:'w_conflict') = 'open',
  'applying a conflict: 22023, Beto''s 5 stands, the row stays open');

-- 7. Two phones save one hole at once, each its own pair, the other pair as the untouched defaults (A9)
-- Ana's phone: Ana typed 6/3; Beto's par and 2 putts untouched, marked auto.
select set_config('request.jwt.claims', harness.claims(:'dev_a'), true) \g /dev/null
set local role authenticated;
select public.save_hole(pg_temp.hole(:'r1', 3, jsonb_build_array(
  jsonb_build_object('player_id', :'ana', 'fields', '{"strokes":6,"putts":3,"picked_up":false}'::jsonb, 'base', '{}'::jsonb),
  jsonb_build_object('player_id', :'beto', 'fields', '{"strokes":4,"putts":2,"picked_up":false}'::jsonb, 'base', '{}'::jsonb, 'auto', true)))) ->> 'status' as s1 \gset
reset role;
-- Beto's phone, before it saw Ana's: Beto typed 5/2; Ana's par untouched, marked auto. Then the outbox sends Beto's
-- again over the row it met, which was Ana's phone's default.
select set_config('request.jwt.claims', harness.claims(:'dev_b'), true) \g /dev/null
set local role authenticated;
select public.save_hole(pg_temp.hole(:'r1', 3, jsonb_build_array(
  jsonb_build_object('player_id', :'ana', 'fields', '{"strokes":4,"putts":2,"picked_up":false}'::jsonb, 'base', '{}'::jsonb, 'auto', true),
  jsonb_build_object('player_id', :'beto', 'fields', '{"strokes":5,"putts":2,"picked_up":false}'::jsonb, 'base', '{}'::jsonb)))) ->> 'status' as s2 \gset
select public.save_hole(pg_temp.hole(:'r1', 3, jsonb_build_array(
  jsonb_build_object('player_id', :'beto', 'fields', '{"strokes":5,"putts":2,"picked_up":false}'::jsonb, 'base', '{"strokes":4,"putts":2,"picked_up":false}'::jsonb)))) ->> 'status' as s3 \gset
reset role;
select harness.check(:'s1' = 'ok' and :'s2' = 'conflict' and :'s3' = 'ok' and (pg_temp.score(:'ana', 3)).strokes = 6 and (pg_temp.score(:'ana', 3)).putts = 3
  and (pg_temp.score(:'beto', 3)).strokes = 5, 'each phone''s typed values stand: Ana 6/3, Beto 5');
select harness.check((select count(*) from public.rejected_writes where round_id = :'r1' and hole = 3 and status = 'open' and reason = 'conflict') = 2
  and (select payload -> 'auto' from public.rejected_writes where round_id = :'r1' and hole = 3 and player_id = :'ana') = 'true'::jsonb,
  'save_hole kept both conflicts, the default with the auto flag the phone sent');
select set_config('request.jwt.claims', harness.claims(:'org_a'), true) \g /dev/null
set local role authenticated;
select pg_temp.inbox(:'t_a') as listed \gset
select pg_temp.try_resolve((select id from public.rejected_writes where round_id = :'r1' and hole = 3 and player_id = :'ana'), 'apply', 'El teléfono lo mandó', pg_temp.seen(:'r1', :'ana', 3)) as out \gset
reset role;
select harness.check(:'listed' = '', 'and the Comité is asked nothing: the inbox is empty');
select harness.check(:'out' like '22023 %' and (pg_temp.score(:'ana', 3)).strokes = 6 and (pg_temp.score(:'ana', 3)).putts = 3,
  'applying the default anyway: 22023, Ana''s real 6/3 stands');

-- 8. An untouched default the server refused on an empty hole (the day closed, then the hole saved with all four at
--    par): the only value anyone sent for that hole, so the Comité's to decide, beside the typed one; applied as the
--    hole was seen, empty
select set_config('request.jwt.claims', harness.claims(:'org_a'), true) \g /dev/null
set local role authenticated;
update public.rounds set status = 'finished' where id = :'r1';
reset role;
select set_config('request.jwt.claims', harness.claims(:'dev_a'), true) \g /dev/null
set local role authenticated;
select public.save_hole(pg_temp.hole(:'r1', 12, jsonb_build_array(
  jsonb_build_object('player_id', :'ana', 'fields', '{"strokes":7,"putts":2,"picked_up":false}'::jsonb, 'base', '{}'::jsonb),
  jsonb_build_object('player_id', :'beto', 'fields', '{"strokes":4,"putts":2,"picked_up":false}'::jsonb, 'base', '{}'::jsonb, 'auto', true)))) \g /dev/null
reset role;
select id as w_typed from public.rejected_writes where round_id = :'r1' and hole = 12 and player_id = :'ana' \gset
select id as w_auto from public.rejected_writes where round_id = :'r1' and hole = 12 and player_id = :'beto' \gset
select set_config('request.jwt.claims', harness.claims(:'org_a'), true) \g /dev/null
set local role authenticated;
update public.rounds set status = 'live' where id = :'r1';
select pg_temp.inbox(:'t_a') as listed \gset
select pg_temp.try_resolve(:'w_auto', 'apply', 'Todos hicieron par', '{"strokes":4,"putts":2}') as not_seen \gset
reset role;
select harness.check((select payload -> 'auto' = 'true'::jsonb from public.rejected_writes where id = :'w_auto')
  and string_to_array(:'listed', ',') @> array[:'w_typed', :'w_auto'] and cardinality(string_to_array(:'listed', ',')) = 2,
  'the inbox lists Ana''s typed 7 and Beto''s untouched par: his hole is empty, nobody sent anything else for it');
select harness.check(:'not_seen' like '22023 El hoyo cambió%' and pg_temp.score(:'beto', 12) is null, 'applied as if the hole held the par: 22023, nothing written');
select set_config('request.jwt.claims', harness.claims(:'org_a'), true) \g /dev/null
set local role authenticated;
select pg_temp.try_resolve(:'w_auto', 'apply', 'Todos hicieron par', '{}') as out \gset
reset role;
select harness.check(:'out' like 'ok %' and (pg_temp.score(:'beto', 12)).strokes = 4 and (pg_temp.score(:'beto', 12)).putts = 2
  and (pg_temp.score(:'beto', 12)).reason = 'Todos hicieron par' and pg_temp.status(:'w_auto') = 'applied', 'applied as the hole was seen, empty: Beto''s 12th is 4 with 2 putts, the reason on the score');

-- 8b. The same default sent again once a score stands: never listed, never applied (A9 holds)
select set_config('request.jwt.claims', harness.claims(:'org_a'), true) \g /dev/null
set local role authenticated;
update public.rounds set status = 'finished' where id = :'r1';
reset role;
select set_config('request.jwt.claims', harness.claims(:'dev_a'), true) \g /dev/null
set local role authenticated;
select public.save_hole(pg_temp.hole(:'r1', 12, jsonb_build_array(
  jsonb_build_object('player_id', :'beto', 'fields', '{"strokes":5,"putts":2,"picked_up":false}'::jsonb, 'base', '{}'::jsonb, 'auto', true)))) \g /dev/null
reset role;
select id as w_auto2 from public.rejected_writes where round_id = :'r1' and hole = 12 and player_id = :'beto' and status = 'open' \gset
select set_config('request.jwt.claims', harness.claims(:'org_a'), true) \g /dev/null
set local role authenticated;
update public.rounds set status = 'live' where id = :'r1';
select pg_temp.inbox(:'t_a') as listed \gset
select pg_temp.try_resolve(:'w_auto2', 'apply', 'Era el par', pg_temp.seen(:'r1', :'beto', 12)) as out \gset
reset role;
select harness.check(not (string_to_array(:'listed', ',') @> array[:'w_auto2']), 'an untouched default over the score that stands is not listed');
select harness.check(:'out' like '22023 Nadie capturó ese valor%' and (pg_temp.score(:'beto', 12)).strokes = 4 and pg_temp.status(:'w_auto2') = 'open',
  'applying it: 22023, Beto''s 4 stands');

-- 8c. Beside a typed capture of the same empty hole: the typed one is listed, the default is not
insert into public.rejected_writes (tournament_id, round_id, hole, player_id, writer_player_id, auth_user_id, payload, reason) values
  (:'t_a', :'r1', 18, :'ana', :'beto', :'dev_b', '{"fields":{"strokes":6,"putts":2},"base":{}}'::jsonb, 'not_in_group'),
  (:'t_a', :'r1', 18, :'ana', :'ana', :'dev_a', '{"fields":{"strokes":4,"putts":2,"picked_up":false},"base":{},"auto":true}'::jsonb, 'round_not_live');
select id as w18_typed from public.rejected_writes where round_id = :'r1' and hole = 18 and player_id = :'ana' and reason = 'not_in_group' \gset
select id as w18_auto from public.rejected_writes where round_id = :'r1' and hole = 18 and player_id = :'ana' and reason = 'round_not_live' \gset
select set_config('request.jwt.claims', harness.claims(:'org_a'), true) \g /dev/null
set local role authenticated;
select pg_temp.inbox(:'t_a') as listed \gset
select pg_temp.try_resolve(:'w18_auto', 'apply', 'Era el par', '{}') as out \gset
reset role;
select harness.check(string_to_array(:'listed', ',') @> array[:'w18_typed'] and not (string_to_array(:'listed', ',') @> array[:'w18_auto']),
  'the typed 6 is listed; the default beside it is not');
select harness.check(:'out' like '22023 Nadie capturó ese valor%' and pg_temp.score(:'ana', 18) is null, 'applying the default: 22023, nothing written');
select set_config('request.jwt.claims', harness.claims(:'org_a'), true) \g /dev/null
set local role authenticated;
select pg_temp.try_resolve(:'w18_typed', 'dismiss', 'Lo mandó otro grupo') \g /dev/null
select pg_temp.inbox(:'t_a') as listed \gset
reset role;
select harness.check(string_to_array(:'listed', ',') @> array[:'w18_auto'], 'once the typed one is dismissed, the default is the only value sent for the hole: listed');

-- 9. A stale preview (A8): the phone saves 5/2, the Comité sees it, the phone saves 3/3, the Comité applies putts 1
insert into public.rejected_writes (tournament_id, round_id, hole, player_id, writer_player_id, auth_user_id, payload, reason)
values (:'t_a', :'r1', 4, :'beto', :'ana', :'dev_a', '{"fields":{"putts":1}}', 'not_in_group') returning id as w_stale \gset
select set_config('request.jwt.claims', harness.claims(:'dev_b'), true) \g /dev/null
set local role authenticated;
select public.save_hole(pg_temp.hole(:'r1', 4, jsonb_build_array(jsonb_build_object('player_id', :'beto', 'fields', '{"strokes":5,"putts":2}'::jsonb, 'base', '{}'::jsonb)))) \g /dev/null
reset role;
select pg_temp.seen(:'r1', :'beto', 4) as preview \gset
select set_config('request.jwt.claims', harness.claims(:'dev_b'), true) \g /dev/null
set local role authenticated;
select public.save_hole(pg_temp.hole(:'r1', 4, jsonb_build_array(jsonb_build_object('player_id', :'beto', 'fields', '{"strokes":3,"putts":3}'::jsonb, 'base', '{"strokes":5,"putts":2,"picked_up":false}'::jsonb)))) \g /dev/null
reset role;
select set_config('request.jwt.claims', harness.claims(:'org_a'), true) \g /dev/null
set local role authenticated;
select pg_temp.try_resolve(:'w_stale', 'apply', 'Según la vista', :'preview') as out \gset
reset role;
select harness.check(:'preview'::jsonb = '{"strokes":5,"putts":2,"picked_up":false}' and :'out' like '22023 El hoyo cambió mientras lo revisabas%',
  'the hole changed after the preview: 22023');
select harness.check((pg_temp.score(:'beto', 4)).strokes = 3 and (pg_temp.score(:'beto', 4)).putts = 3 and pg_temp.status(:'w_stale') = 'open', 'Beto''s 3/3 is intact, the row still open');
select set_config('request.jwt.claims', harness.claims(:'org_a'), true) \g /dev/null
set local role authenticated;
select pg_temp.try_resolve(:'w_stale', 'apply', 'Según la vista', '{}') as empty_seen \gset
select pg_temp.try_resolve(:'w_stale', 'apply', 'Según la vista nueva', '{"strokes":3,"putts":3}') as out \gset
reset role;
select harness.check(:'empty_seen' like '22023 El hoyo cambió%', 'an empty hole seen, a score there: 22023');
select harness.check(:'out' like 'ok %' and (pg_temp.score(:'beto', 4)).strokes = 3 and (pg_temp.score(:'beto', 4)).putts = 1,
  'looked at again (a pick-up left out reads as not picked up), it applies: 3 strokes, 1 putt');

-- 10. The payload's ids are never read: only the row's player and hole are written
insert into public.rejected_writes (tournament_id, round_id, hole, player_id, writer_player_id, auth_user_id, payload, reason)
values (:'t_a', :'r1', 13, :'beto', :'ana', :'dev_a', jsonb_build_object('player_id', :'ana', 'hole', 9, 'round_id', gen_random_uuid(), 'fields', '{"strokes":7,"putts":3}'::jsonb), 'not_in_group')
returning id as w_ids \gset
select set_config('request.jwt.claims', harness.claims(:'org_a'), true) \g /dev/null
set local role authenticated;
select pg_temp.try_resolve(:'w_ids', 'apply', 'Era de Beto', '{}') as out \gset
reset role;
select harness.check(:'out' like 'ok %' and (pg_temp.score(:'beto', 13)).strokes = 7 and pg_temp.score(:'ana', 13) is null and pg_temp.score(:'ana', 9) is null,
  'a payload naming Ana and hole 9: Beto''s 13th is written, nothing of Ana''s');

-- 11. Strokes over a pick-up: a number of strokes is a hole played
select set_config('request.jwt.claims', harness.claims(:'org_a'), true) \g /dev/null
set local role authenticated;
select public.admin_save_score(:'r1', :'beto', 14, null, 1, true, 'Levantó') \g /dev/null
reset role;
insert into public.rejected_writes (tournament_id, round_id, hole, player_id, writer_player_id, auth_user_id, payload, reason)
values (:'t_a', :'r1', 14, :'beto', :'beto', :'dev_b', '{"fields":{"strokes":5}}', 'card_signed') returning id as w_pick \gset
select set_config('request.jwt.claims', harness.claims(:'org_a'), true) \g /dev/null
set local role authenticated;
select pg_temp.try_resolve(:'w_pick', 'apply', 'Sí lo terminó', pg_temp.seen(:'r1', :'beto', 14)) as out \gset
reset role;
select harness.check(:'out' like 'ok %' and (pg_temp.score(:'beto', 14)).strokes = 5 and (pg_temp.score(:'beto', 14)).putts = 1 and not (pg_temp.score(:'beto', 14)).picked_up,
  '5 strokes over a pick-up: 5 strokes, the putt that stood, not picked up');

-- 12. Dismiss: the row closes, no score moves
insert into public.rejected_writes (tournament_id, round_id, hole, player_id, writer_player_id, auth_user_id, payload, reason)
values (:'t_a', :'r1', 4, :'beto', :'beto', :'dev_b', '{"fields":{"strokes":9}}', 'invalid') returning id as w_dismiss \gset
select (pg_temp.score(:'beto', 4)).version as v2 \gset
select set_config('request.jwt.claims', harness.claims(:'org_a'), true) \g /dev/null
set local role authenticated;
select pg_temp.try_resolve(:'w_dismiss', 'dismiss', 'Se equivocó de hoyo') as out \gset
reset role;
select harness.check(:'out' like 'ok %' and (substr(:'out', 4))::jsonb ->> 'status' = 'dismissed'
  and (select status = 'dismissed' and resolved_by = :'org_a' and resolution_note = 'Se equivocó de hoyo' from public.rejected_writes where id = :'w_dismiss'),
  'dismissed, by whom and why');
select harness.check((pg_temp.score(:'beto', 4)).strokes = 3 and (pg_temp.score(:'beto', 4)).version = :v2, 'and Beto''s 4th is as it was');

-- 13. A signed card: applied through admin_save_score, the reason on the score; its own rules still hold
select set_config('request.jwt.claims', harness.claims(:'org_a'), true) \g /dev/null
set local role authenticated;
insert into public.pairs (tournament_id, name, player1_id, player2_id) values (:'t_a', 'Ana y Beto', :'ana', :'beto') returning id as pair \gset
insert into public.card_signatures (round_id, pair_id, signed_by) values (:'r1', :'pair', :'beto');
reset role;
select set_config('request.jwt.claims', harness.claims(:'dev_a'), true) \g /dev/null
set local role authenticated;
select public.save_hole(pg_temp.hole(:'r1', 15, jsonb_build_array(jsonb_build_object('player_id', :'ana', 'fields', '{"picked_up":true,"putts":1}'::jsonb, 'base', '{}'::jsonb)))) \g /dev/null
reset role;
select id as w_signed from public.rejected_writes where round_id = :'r1' and hole = 15 and reason = 'card_signed' \gset
select set_config('request.jwt.claims', harness.claims(:'org_a'), true) \g /dev/null
set local role authenticated;
select pg_temp.try_resolve(:'w_signed', 'apply', 'ok', '{}') as short \gset
select pg_temp.try_resolve(:'w_signed', 'apply', 'Levantó, firmada después', '{}') as out \gset
reset role;
select harness.check(:'short' like '22023 Escribe el motivo%', 'a two-letter reason on a signed card: 22023');
select harness.check(:'out' like 'ok %' and (pg_temp.score(:'ana', 15)).picked_up and (pg_temp.score(:'ana', 15)).strokes is null and (pg_temp.score(:'ana', 15)).putts = 1
  and (pg_temp.score(:'ana', 15)).reason = 'Levantó, firmada después', 'a pick-up on a signed card: written, no strokes, with its reason');

-- 14. A player who has left the group since: the Comité still applies it
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
select pg_temp.try_resolve(:'w_left', 'apply', 'Jugó el 5 antes del cambio', '{}') as out \gset
reset role;
select harness.check(:'out' like 'ok %' and (pg_temp.score(:'beto', 5)).strokes = 4, 'Beto''s 5th, applied with him out of the group');

-- 15. What cannot be applied stays open, to dismiss
insert into public.rejected_writes (tournament_id, round_id, hole, player_id, writer_player_id, auth_user_id, payload, reason) values
  (:'t_a', :'r1', 6, :'ana', :'ana', :'dev_a', '{"fields":{"gross":4}}'::jsonb, 'invalid'),
  (:'t_a', :'r1', 7, :'ana', :'ana', :'dev_a', '{"fields":{"strokes":"cuatro"}}'::jsonb, 'invalid'),
  (:'t_a', :'r1', 8, :'ana', :'ana', :'dev_a', '{"fields":{"strokes":4,"putts":6}}'::jsonb, 'invalid'),
  (:'t_a', :'r1', 9, :'ana', :'ana', :'dev_a', '{"fields":{"putts":2}}'::jsonb, 'invalid'),
  (:'t_a', :'r1', 10, :'ana', :'ana', :'dev_a', '{"fields":{"strokes":4.5}}'::jsonb, 'invalid'),
  (:'t_a', :'r1', 16, :'ana', :'ana', :'dev_a', '{"fields":{"strokes":4,"gross":1}}'::jsonb, 'invalid');
select set_config('request.jwt.claims', harness.claims(:'org_a'), true) \g /dev/null
set local role authenticated;
select pg_temp.try_resolve((select id from public.rejected_writes where hole = 6 and round_id = :'r1'), 'apply', 'Probar', '{}') as b6 \gset
select pg_temp.try_resolve((select id from public.rejected_writes where hole = 7 and round_id = :'r1'), 'apply', 'Probar', '{}') as b7 \gset
select pg_temp.try_resolve((select id from public.rejected_writes where hole = 8 and round_id = :'r1'), 'apply', 'Probar', '{}') as b8 \gset
select pg_temp.try_resolve((select id from public.rejected_writes where hole = 9 and round_id = :'r1'), 'apply', 'Probar', '{}') as b9 \gset
select pg_temp.try_resolve((select id from public.rejected_writes where hole = 10 and round_id = :'r1'), 'apply', 'Probar', '{}') as b10 \gset
select pg_temp.try_resolve((select id from public.rejected_writes where hole = 16 and round_id = :'r1'), 'apply', 'Probar', '{}') as b16 \gset
reset role;
select harness.check(:'b6' like '22023 Esa captura no trae golpes%', 'a field the table does not have: 22023');
select harness.check(:'b16' like '22023 Esa captura no trae golpes%', 'strokes with a field the table does not have beside them: 22023');
select harness.check(:'b7' like '22023 Los valores de esa captura no se entienden%', 'strokes that are not a number: 22023');
select harness.check(:'b8' like '22023 Con esa captura los putts%', 'more putts than strokes: 22023');
select harness.check(:'b9' like '22023 Con esa captura el hoyo no queda con golpes%', 'putts over an empty hole (no strokes): 22023');
select harness.check(:'b10' like '22023 Con esa captura el hoyo no queda con golpes%', 'half a stroke: 22023');
select harness.check((select count(*) from public.rejected_writes where round_id = :'r1' and hole in (6, 7, 8, 9, 10, 16) and status = 'open') = 6
  and not exists (select 1 from public.scores where round_id = :'r1' and player_id = :'ana' and hole in (6, 7, 8, 9, 10, 16)), 'all six stay open, nothing written');

-- 16. A cancelled day: nothing is applied to it; dismissing still works
insert into public.rejected_writes (tournament_id, round_id, hole, player_id, writer_player_id, auth_user_id, payload, reason)
values (:'t_a', :'r1', 17, :'ana', :'ana', :'dev_a', '{"fields":{"strokes":5}}'::jsonb, 'round_not_live') returning id as w_cancel \gset
select set_config('request.jwt.claims', harness.claims(:'org_a'), true) \g /dev/null
set local role authenticated;
update public.rounds set status = 'cancelled' where id = :'r1';
select pg_temp.try_resolve(:'w_cancel', 'apply', 'Llovió', '{}') as out \gset
select pg_temp.try_resolve(:'w_cancel', 'dismiss', 'Llovió') as out2 \gset
update public.rounds set status = 'live' where id = :'r1';
reset role;
select harness.check(:'out' like '22023 Ese día está cancelado%' and pg_temp.score(:'ana', 17) is null, 'applying into a cancelled day: 22023, nothing written');
select harness.check(:'out2' like 'ok %' and pg_temp.status(:'w_cancel') = 'dismissed', 'dismissing it: done');

-- 17. An admin player is the Comité too
select set_config('request.jwt.claims', harness.claims(:'org_a'), true) \g /dev/null
set local role authenticated;
update public.players set is_admin = true where id = :'ana';
reset role;
select set_config('request.jwt.claims', harness.claims(:'dev_a'), true) \g /dev/null
set local role authenticated;
select pg_temp.inbox(:'t_a') as listed \gset
select pg_temp.try_resolve((select id from public.rejected_writes where hole = 6 and round_id = :'r1'), 'dismiss', 'Captura rota') as out \gset
reset role;
select harness.check(:'listed' not like '42501%' and :'listed' like '%' || (select id from public.rejected_writes where hole = 6 and round_id = :'r1')::text || '%', 'Ana, made admin, reads the inbox');
select harness.check(:'out' like 'ok %' and (select status from public.rejected_writes where hole = 6 and round_id = :'r1') = 'dismissed', 'and dismisses one');

-- 18. Oldest first: two rows sent a minute apart are listed in that order, before the rest (sent in this transaction)
insert into public.rejected_writes (tournament_id, round_id, hole, player_id, writer_player_id, auth_user_id, payload, reason, created_at)
values (:'t_a', :'r1', 16, :'beto', :'beto', :'dev_b', '{"fields":{"strokes":5}}'::jsonb, 'card_signed', now() - interval '1 minute')
returning id as w_newer \gset
insert into public.rejected_writes (tournament_id, round_id, hole, player_id, writer_player_id, auth_user_id, payload, reason, created_at)
values (:'t_a', :'r1', 17, :'beto', :'beto', :'dev_b', '{"fields":{"strokes":6}}'::jsonb, 'card_signed', now() - interval '2 minutes')
returning id as w_older \gset
select set_config('request.jwt.claims', harness.claims(:'org_a'), true) \g /dev/null
set local role authenticated;
select pg_temp.inbox(:'t_a') as listed \gset
reset role;
select harness.check((string_to_array(:'listed', ','))[1] = :'w_older' and (string_to_array(:'listed', ','))[2] = :'w_newer'
  and cardinality(string_to_array(:'listed', ',')) > 2, 'the inbox is oldest first: the row sent two minutes ago, then the one sent a minute ago, then the rest');

-- 19. «Descartar los que ya coinciden» says what the card showed: a hole that changed since is refused, the row open
insert into public.rejected_writes (tournament_id, round_id, hole, player_id, writer_player_id, auth_user_id, payload, reason)
values (:'t_a', :'r1', 13, :'beto', :'ana', :'dev_a', '{"fields":{"strokes":7,"putts":3},"base":{}}'::jsonb, 'not_in_group') returning id as w_match \gset
select pg_temp.seen(:'r1', :'beto', 13) as matched \gset
select set_config('request.jwt.claims', harness.claims(:'org_a'), true) \g /dev/null
set local role authenticated;
select public.admin_save_score(:'r1', :'beto', 13, 6, 3, false, 'Eran 6') \g /dev/null
select pg_temp.try_resolve(:'w_match', 'dismiss', 'La tarjeta ya tiene ese valor', :'matched') as stale \gset
select pg_temp.try_resolve(:'w_match', 'dismiss', 'La tarjeta ya tiene ese valor', '"nada"') as bad \gset
reset role;
select harness.check(:'matched'::jsonb = '{"strokes":7,"putts":3,"picked_up":false}' and :'stale' like '22023 El hoyo cambió mientras lo revisabas%' and pg_temp.status(:'w_match') = 'open',
  'the card matched 7/3, then became 6/3: dismissing as «ya coincide» is refused (22023), the row open');
select harness.check(:'bad' like '22023 Falta lo que viste%', 'a dismissal that says something other than a hole: 22023');
select set_config('request.jwt.claims', harness.claims(:'org_a'), true) \g /dev/null
set local role authenticated;
select pg_temp.try_resolve(:'w_match', 'dismiss', 'Revisado otra vez', pg_temp.seen(:'r1', :'beto', 13)) as out \gset
reset role;
select harness.check(:'out' like 'ok %' and pg_temp.status(:'w_match') = 'dismissed' and (pg_temp.score(:'beto', 13)).strokes = 6, 'with the card as it is now: dismissed, the 6 stands');

-- 20. An apply writes what admin_save_score writes: the same row and the same audit, inserted or updated, by an admin player
select set_config('request.jwt.claims', harness.claims(:'dev_a'), true) \g /dev/null
set local role authenticated;
select public.admin_save_score(:'r1', :'beto', 15, 6, 2, false, 'Base') \g /dev/null
select public.admin_save_score(:'r1', :'beto', 16, 6, 2, false, 'Base') \g /dev/null
reset role;
insert into public.rejected_writes (tournament_id, round_id, hole, player_id, writer_player_id, auth_user_id, payload, reason) values
  (:'t_a', :'r1', 13, :'ana', :'beto', :'dev_b', '{"fields":{"strokes":5,"putts":2,"picked_up":false},"base":{}}'::jsonb, 'not_in_group'),
  (:'t_a', :'r1', 15, :'beto', :'beto', :'dev_b', '{"fields":{"putts":1},"base":{"strokes":6,"putts":2,"picked_up":false}}'::jsonb, 'card_signed');
select max(id) as audit1 from public.audit_log \gset
select set_config('request.jwt.claims', harness.claims(:'dev_a'), true) \g /dev/null
set local role authenticated;
select pg_temp.try_resolve((select id from public.rejected_writes where round_id = :'r1' and hole = 13 and player_id = :'ana'), 'apply', 'Mismo motivo', '{}') as ins \gset
select public.admin_save_score(:'r1', :'ana', 14, 5, 2, false, 'Mismo motivo') \g /dev/null
select pg_temp.try_resolve((select id from public.rejected_writes where round_id = :'r1' and hole = 15 and player_id = :'beto' and status = 'open'), 'apply', 'Mismo motivo', pg_temp.seen(:'r1', :'beto', 15)) as upd \gset
select public.admin_save_score(:'r1', :'beto', 16, 6, 1, false, 'Mismo motivo') \g /dev/null
reset role;
create function pg_temp.row_of(p uuid, h int) returns jsonb language sql as $$
  select to_jsonb(s) - 'id' - 'hole' - 'client_ts' - 'updated_at' from public.scores s where s.round_id = (select id from harness.seed where key = 'round_a1') and s.player_id = p and s.hole = h
$$;
create function pg_temp.audit_of(p uuid, h int, since bigint) returns jsonb language sql as $$
  select jsonb_agg(jsonb_build_object('action', a.action, 'by', a.actor_auth_user_id, 'player', a.actor_player_id, 'reason', a.reason, 'platform', a.actor_platform,
    'before', a.before - 'id' - 'hole' - 'client_ts' - 'updated_at', 'after', a.after - 'id' - 'hole' - 'client_ts' - 'updated_at') order by a.id)
  from public.audit_log a where a.id > since and a.table_name = 'scores' and a.after ->> 'player_id' = p::text and (a.after ->> 'hole')::int = h
$$;
select harness.check(:'ins' like 'ok %' and :'upd' like 'ok %', 'both applied');
select harness.check(pg_temp.row_of(:'ana', 13) = pg_temp.row_of(:'ana', 14) and (pg_temp.score(:'ana', 13)).entered_by = :'ana' and (pg_temp.score(:'ana', 13)).reason = 'Mismo motivo',
  'on an empty hole: the row admin_save_score writes (Ana, the admin player, as the writer, the reason, no discrepancy, version 1)');
select harness.check(pg_temp.audit_of(:'ana', 13, :audit1) = pg_temp.audit_of(:'ana', 14, :audit1) and jsonb_array_length(pg_temp.audit_of(:'ana', 13, :audit1)) = 1,
  'and the audit admin_save_score leaves: one INSERT, by Ana''s device, with the reason');
select harness.check(pg_temp.row_of(:'beto', 15) = pg_temp.row_of(:'beto', 16) and (pg_temp.score(:'beto', 15)).putts = 1 and (pg_temp.score(:'beto', 15)).version = 2,
  'over a score: the row admin_save_score leaves (6 strokes, 1 putt, version 2)');
select harness.check(pg_temp.audit_of(:'beto', 15, :audit1) = pg_temp.audit_of(:'beto', 16, :audit1) and jsonb_array_length(pg_temp.audit_of(:'beto', 15, :audit1)) = 1,
  'and the same UPDATE in the audit');

-- 21. On a finished day the results follow the applied hole, as they follow admin_save_score (the day gets a card first)
insert into public.courses (name) values ('Campo de prueba') returning id as course \gset
insert into public.tees (course_id, name, rating, slope, par_total) values (:'course', 'Blancas', 72.0, 113, 72) returning id as tee \gset
insert into public.holes (tee_id, number, par, stroke_index) select :'tee', n, 4, n from generate_series(1, 18) n;
update public.rounds set course_id = :'course' where id = :'r1';
select set_config('request.jwt.claims', harness.claims(:'org_a'), true) \g /dev/null
set local role authenticated;
update public.rounds set status = 'finished' where id = :'r1';
reset role;
select thru as thru0, coalesce(putts, 0) as putts0 from public.round_results where round_id = :'r1' and player_id = :'ana' \gset
insert into public.rejected_writes (tournament_id, round_id, hole, player_id, writer_player_id, auth_user_id, payload, reason)
values (:'t_a', :'r1', 4, :'ana', :'ana', :'dev_a', '{"fields":{"strokes":5,"putts":2},"base":{}}'::jsonb, 'round_not_live') returning id as w_fin \gset
select set_config('request.jwt.claims', harness.claims(:'org_a'), true) \g /dev/null
set local role authenticated;
select pg_temp.try_resolve(:'w_fin', 'apply', 'Llegó tarde', '{}') as out \gset
reset role;
select harness.check(:'out' like 'ok %' and (select thru = :thru0 + 1 and putts = :putts0 + 2 from public.round_results where round_id = :'r1' and player_id = :'ana'),
  'Ana''s results for the day count the applied 4th: one hole more, two putts more');
select set_config('request.jwt.claims', harness.claims(:'org_a'), true) \g /dev/null
set local role authenticated;
select public.admin_save_score(:'r1', :'ana', 5, 4, 1, false, 'Llegó tarde') \g /dev/null
reset role;
select harness.check((select thru = :thru0 + 2 and putts = :putts0 + 3 from public.round_results where round_id = :'r1' and player_id = :'ana'),
  'as they count admin_save_score''s 5th');
select set_config('request.jwt.claims', harness.claims(:'org_a'), true) \g /dev/null
set local role authenticated;
update public.rounds set status = 'live' where id = :'r1';
reset role;

-- 22. Published to Realtime, for the bundle that listens to it
select harness.check(exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'rejected_writes')
  or not exists (select 1 from pg_publication where pubname = 'supabase_realtime'), 'rejected_writes is in the realtime publication');

rollback;
