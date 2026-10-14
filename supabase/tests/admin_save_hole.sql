-- REL-22 (0051): a Comité correction of a hole is one call, every player or
-- none. On the two-tenant seed: org_a runs tournament A (Ana, Beto), org_b
-- runs B, and dev_a is Ana's phone. Ana and Beto's card is signed, so a
-- correction needs the Comité and a reason. Rolled back at the end; prints
-- one «ok» line per check.
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
select id as carla from harness.seed where key = 'player_b1' \gset
select id as r1 from harness.seed where key = 'round_a1' \gset
begin;

-- A statement as a user of the app: its answer, or the SQLSTATE and the message.
create function pg_temp.as_user(uid uuid, q text) returns text language plpgsql as $$
declare
  r text;
begin
  perform set_config('request.jwt.claims', harness.claims(uid), true);
  set local role authenticated;
  execute q into r;
  reset role;
  return coalesce(r, '');
exception when others then
  reset role;
  return sqlstate || ' ' || sqlerrm;
end $$;
-- A correction of hole `h` with `rows`, by `uid`.
create function pg_temp.fix(uid uuid, h int, rows jsonb, why text) returns text language sql as $$
  select pg_temp.as_user(uid, format('select public.admin_save_hole(%L, %s, %L::jsonb, %L)::text', current_setting('harness.r1'), h, rows, why))
$$;
-- The score of player `p` on hole `h`: strokes/putts/picked_up and its reason, or «none».
create function pg_temp.score(p uuid, h int) returns text language sql as $$
  select coalesce((select concat_ws('/', coalesce(s.strokes::text, '-'), coalesce(s.putts::text, '-'), s.picked_up::text, s.reason)
    from public.scores s where s.round_id = current_setting('harness.r1')::uuid and s.player_id = p and s.hole = h), 'none')
$$;
select set_config('harness.r1', :'r1', true) \g /dev/null

-- The day is live, Ana's phone saved holes 3 and 4 for both, and then the card was signed.
update public.rounds set status = 'live' where id = :'r1';
select pg_temp.as_user(:'dev_a', format('insert into public.scores (round_id, player_id, hole, strokes, putts, picked_up) values (%L, %L, 3, 5, 2, false), (%L, %L, 3, 6, 2, false), (%L, %L, 4, 4, 2, false), (%L, %L, 4, 4, 1, false) returning id::text',
  :'r1', :'ana', :'r1', :'beto', :'r1', :'ana', :'r1', :'beto')) \g /dev/null
select pg_temp.as_user(:'org_a', format('with p as (insert into public.pairs (tournament_id, name, player1_id, player2_id) values (%L, %L, %L, %L) returning id)
  insert into public.card_signatures (round_id, pair_id, signed_by) select %L, p.id, %L from p returning pair_id::text', :'t_a', 'Ana y Beto', :'ana', :'beto', :'r1', :'beto')) \g /dev/null
select harness.check(pg_temp.score(:'ana', 3) = '5/2/false' and (select count(*) from public.card_signatures where round_id = :'r1') = 1, 'the card is signed with hole 3 saved: ' || pg_temp.score(:'ana', 3));

-- 1. Both players corrected in one call, with the reason on each
select pg_temp.fix(:'org_a', 3, jsonb_build_array(
  jsonb_build_object('player_id', :'ana', 'strokes', 4, 'putts', 1, 'picked_up', false),
  jsonb_build_object('player_id', :'beto', 'strokes', null, 'putts', 1, 'picked_up', true)), 'Se apuntó mal') as out \gset
select harness.check(:'out' = '' and pg_temp.score(:'ana', 3) = '4/1/false/Se apuntó mal' and pg_temp.score(:'beto', 3) = '-/1/true/Se apuntó mal',
  'the Comité corrects both in one call, each with the reason: ' || :'out' || ' ' || pg_temp.score(:'ana', 3) || ' ' || pg_temp.score(:'beto', 3));

-- 2. The finding: the second player's value is refused, so the first one is not written either
select pg_temp.fix(:'org_a', 4, jsonb_build_array(
  jsonb_build_object('player_id', :'ana', 'strokes', 6, 'putts', 2, 'picked_up', false),
  jsonb_build_object('player_id', :'beto', 'strokes', 3, 'putts', 4, 'picked_up', false)), 'Corrección') as out \gset
select harness.check(:'out' = '22023 Los putts no pueden ser más que los golpes' and pg_temp.score(:'ana', 4) = '4/2/false' and pg_temp.score(:'beto', 4) = '4/1/false',
  'one value refused takes the whole correction back: ' || :'out' || ' ' || pg_temp.score(:'ana', 4));

-- 3. admin_save_score's own rules hold on each row
select pg_temp.fix(:'org_a', 4, jsonb_build_array(jsonb_build_object('player_id', :'ana', 'strokes', 6, 'putts', 2, 'picked_up', false)), 'ok') as out \gset
select harness.check(:'out' = '22023 La tarjeta está firmada: la corrección necesita razón' and pg_temp.score(:'ana', 4) = '4/2/false', 'a signed card needs a reason of 3 letters: ' || :'out');
select pg_temp.fix(:'org_a', 4, jsonb_build_array(
  jsonb_build_object('player_id', :'ana', 'strokes', 6, 'putts', 2, 'picked_up', false),
  jsonb_build_object('player_id', :'carla', 'strokes', 4, 'putts', 2, 'picked_up', false)), 'Corrección') as out \gset
select harness.check(:'out' = '22023 Ese jugador no es de este torneo' and pg_temp.score(:'ana', 4) = '4/2/false', 'another tournament''s player: refused, and nothing written: ' || :'out');
select pg_temp.fix(:'dev_a', 4, jsonb_build_array(jsonb_build_object('player_id', :'ana', 'strokes', 6, 'putts', 2, 'picked_up', false)), 'Corrección') as out \gset
select harness.check(:'out' like '42501 Solo el Comité puede corregir tarjetas%' and pg_temp.score(:'ana', 4) = '4/2/false', 'a player''s phone does not correct: ' || :'out');
select pg_temp.fix(:'org_b', 4, jsonb_build_array(jsonb_build_object('player_id', :'ana', 'strokes', 6, 'putts', 2, 'picked_up', false)), 'Corrección') as out \gset
select harness.check(:'out' like '42501%' and pg_temp.score(:'ana', 4) = '4/2/false', 'nor another tournament''s Comité: ' || :'out');

-- 4. What it cannot read is refused before anything is written
select pg_temp.fix(:'org_a', 4, '[]', 'Corrección') as out \gset
select harness.check(:'out' = '22023 Una corrección lleva de uno a ocho jugadores', 'no rows: ' || :'out');
select pg_temp.fix(:'org_a', 4, '{"player_id": "x"}', 'Corrección') as out \gset
select harness.check(:'out' = '22023 Una corrección lleva de uno a ocho jugadores', 'not a list: ' || :'out');
select pg_temp.fix(:'org_a', 4, jsonb_build_array(
  jsonb_build_object('player_id', :'ana', 'strokes', 6, 'putts', 2, 'picked_up', false),
  jsonb_build_object('player_id', :'ana', 'strokes', 7, 'putts', 2, 'picked_up', false)), 'Corrección') as out \gset
select harness.check(:'out' = '22023 Un jugador viene dos veces en la corrección' and pg_temp.score(:'ana', 4) = '4/2/false', 'one player twice: ' || :'out');
select string_agg(pg_temp.fix(:'org_a', 4, jsonb_build_array(bad), 'Corrección'), ' | ') as out
from (values
  (jsonb_build_object('player_id', 'no-es-uuid', 'strokes', 6, 'putts', 2, 'picked_up', false)),
  (jsonb_build_object('player_id', :'ana', 'strokes', 'seis', 'putts', 2, 'picked_up', false)),
  (jsonb_build_object('player_id', :'ana', 'strokes', 5.5, 'putts', 2, 'picked_up', false)),
  (jsonb_build_object('player_id', :'ana', 'strokes', 6, 'putts', 1e9, 'picked_up', false)),
  (jsonb_build_object('player_id', :'ana', 'strokes', 6, 'putts', 2)),
  (jsonb_build_object('player_id', :'ana', 'strokes', 6, 'putts', 2, 'picked_up', 'no')),
  ('"Ana"'::jsonb)
) v(bad) \gset
select harness.check(:'out' = array_to_string(array_fill('22023 No pudimos leer esa corrección'::text, array[7]), ' | ') and pg_temp.score(:'ana', 4) = '4/2/false',
  'a row it cannot read: a bad id, a word, a fraction, a huge number, no picked_up, a word for it, not an object: ' || :'out');

-- 5. The history: one line per player, each with the reason, by the Comité
select harness.check(
  (select count(*) from public.audit_log where table_name = 'scores' and tournament_id = :'t_a' and reason = 'Se apuntó mal') = 2,
  'the correction is in the history, once per player, with its reason');

-- 6. Only signed-in users call it
select harness.check(not has_function_privilege('anon', 'public.admin_save_hole(uuid, integer, jsonb, text)', 'execute')
  and has_function_privilege('authenticated', 'public.admin_save_hole(uuid, integer, jsonb, text)', 'execute'), 'anon cannot call it; a signed-in user can');

rollback;
