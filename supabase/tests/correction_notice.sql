-- TRUST-14 (0062): what the Comité changes on a card reaches the player whose card it is, and every member reads
-- how a card got to what it holds. On the two-tenant seed: org_a runs tournament A (Ana, Beto in group 1), dev_a is
-- Ana's phone, org_b runs tournament B, dev_x claimed nobody. Rolled back at the end; prints one «ok» line per check.
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
select id as b1 from harness.seed where key = 'player_b1' \gset
select id as r1 from harness.seed where key = 'round_a1' \gset
begin;

create function pg_temp.as_user(uid uuid, q text) returns text language plpgsql as $$
declare
  r text;
begin
  perform set_config('request.jwt.claims', harness.claims(uid), true);
  -- Each call is a request of its own: the Comité's mark (cardi.comite) is its transaction's, never the next one's.
  perform set_config('cardi.comite', '', true);
  set local role authenticated;
  execute q into r;
  reset role;
  return coalesce(r, '');
exception when others then
  reset role;
  return sqlstate || ' ' || sqlerrm;
end $$;
create function pg_temp.notices(p uuid) returns bigint language sql as $$
  select count(*) from public.player_notices where player_id = p and kind = 'score_corrected'
$$;
-- A phone's save of one hole, as the Tarjeta sends it (save_hole, 0026): each entry with what it saw.
create function pg_temp.save(hole int, entries jsonb) returns text language sql as $$
  select pg_temp.as_user((select id from harness.seed where key = 'dev_a'), format('select public.save_hole(%L::jsonb)::text',
    jsonb_build_object('round_id', (select id from harness.seed where key = 'round_a1'), 'hole', hole, 'mutation_id', gen_random_uuid(), 'entries', entries)))
$$;
-- The test is one transaction, and the audit log stamps a step with the moment its transaction began: what is
-- logged so far moves a minute back, so the next write is a step of its own, as it is on a phone.
create function pg_temp.later() returns void language sql as $$
  update public.audit_log set at = at - interval '1 minute' where table_name = 'scores' and tournament_id = (select id from harness.seed where key = 'tournament_a')
$$;
-- A hole's steps as «by/comite/before/after/reason», «-» where there is none, oldest first.
create function pg_temp.steps(h jsonb, hole int) returns text language sql as $$
  select string_agg(format('%s/%s/%s/%s/%s', coalesce(x ->> 'by', '-'), x ->> 'comite', coalesce(x -> 'before' ->> 'strokes', '-'),
    coalesce(x -> 'after' ->> 'strokes', '-'), coalesce(x ->> 'reason', '-')), ' | ' order by x ->> 'at')
  from jsonb_array_elements(h) x where (x ->> 'hole')::int = hole
$$;
create function pg_temp.history(uid uuid, p uuid) returns text language sql as $$
  select pg_temp.as_user(uid, format('select public.card_history(%L, %L)::text', (select id from harness.seed where key = 'tournament_a'), p))
$$;

update public.rounds set status = 'live' where id = :'r1';

-- 1. A player's own save is no correction.
select pg_temp.save(3, jsonb_build_array(
  jsonb_build_object('player_id', :'ana', 'fields', jsonb_build_object('strokes', 5, 'putts', 2), 'base', '{}'::jsonb),
  jsonb_build_object('player_id', :'beto', 'fields', jsonb_build_object('strokes', 6, 'putts', 2), 'base', '{}'::jsonb))) as saved \gset
select harness.check((:'saved'::jsonb ->> 'status') = 'ok', 'the phone saves hole 3: ' || :'saved');
select harness.check(pg_temp.notices(:'ana') = 0 and pg_temp.notices(:'beto') = 0, 'a player saving his own hole hears nothing');
select pg_temp.later();

-- 2. The Comité typing a hole nobody captured (a paper card) is a first capture, not a correction.
select pg_temp.as_user(:'org_a', format('select public.admin_save_score(%L, %L, 4, 4, 2, false, %L)::text', :'r1', :'ana', 'Tarjeta de papel')) \g /dev/null
select harness.check(pg_temp.notices(:'ana') = 0, 'a hole the Comité captures first sends nothing');
select pg_temp.later();

-- 3. The Comité corrects Ana's hole 3: Ana hears it, with the day, and no hole, values, reason or name.
select pg_temp.as_user(:'org_a', format('select public.admin_save_score(%L, %L, 3, 4, 1, false, %L)::text', :'r1', :'ana', 'Se apuntó mal')) \g /dev/null
select harness.check(pg_temp.notices(:'ana') = 1 and pg_temp.notices(:'beto') = 0, 'the corrected player hears it, and only he does');
select data::text as d from public.player_notices where player_id = :'ana' and kind = 'score_corrected' \gset
select harness.check((:'d'::jsonb ->> 'round') = '1' and (:'d'::jsonb ->> 'slug') is not null and (:'d'::jsonb ->> 'tournament') is not null
    and not (:'d'::jsonb ? 'hole') and not (:'d'::jsonb ? 'strokes') and not (:'d'::jsonb ? 'reason') and position('Se apuntó' in :'d') = 0,
  'the notice carries the tournament and the day, never the hole, the values or the reason: ' || :'d');
select pg_temp.later();

-- 4. Fixing more of the card at once is the same news: one notice per player and day every ten minutes.
select pg_temp.as_user(:'org_a', format('select public.admin_save_score(%L, %L, 3, 5, 1, false, %L)::text', :'r1', :'ana', 'Era un 5, no un 4')) \g /dev/null
select pg_temp.later();
select pg_temp.as_user(:'org_a', format('select public.admin_save_score(%L, %L, 4, 6, 2, false, %L)::text', :'r1', :'ana', 'Era un 6')) \g /dev/null
select harness.check(pg_temp.notices(:'ana') = 1, 'two more corrections within ten minutes send nothing more');
select pg_temp.later();
update public.player_notices set created_at = created_at - interval '11 minutes' where player_id = :'ana' and kind = 'score_corrected';
select pg_temp.as_user(:'org_a', format('select public.admin_save_score(%L, %L, 4, 5, 2, false, %L)::text', :'r1', :'ana', 'Era un 5')) \g /dev/null
select harness.check(pg_temp.notices(:'ana') = 2, 'a correction ten minutes later is news again');
select pg_temp.later();

-- 5. Saving a hole again with the same value, or a discrepancy kept, changes nothing on the card and says nothing.
update public.player_notices set created_at = created_at - interval '11 minutes' where kind = 'score_corrected';
select pg_temp.as_user(:'org_a', format('select public.admin_save_score(%L, %L, 4, 5, 2, false, %L)::text', :'r1', :'ana', 'Confirmado')) \g /dev/null
select pg_temp.as_user(:'org_a', format('select public.resolve_score_dispute(%L, %L, 3, true)::text', :'r1', :'beto')) \g /dev/null
select harness.check(pg_temp.notices(:'ana') = 2 and pg_temp.notices(:'beto') = 0, 'a decision that leaves the value as it was sends nothing');
select pg_temp.later();

-- 6. The reason is on the card for everyone who reads it: a teammate's phone reads Beto's on the row.
select pg_temp.as_user(:'dev_a', format('select reason from public.scores where round_id = %L and player_id = %L and hole = 3', :'r1', :'beto')) as seen \gset
select harness.check(:'seen' = 'Discrepancia: se conserva el valor actual', 'the card shows the Comité''s reason to the tournament: ' || :'seen');

-- 7. The phone saves the corrected hole again: the value is the phone's now, the Comité's reason goes, and nobody hears it.
select pg_temp.save(3, jsonb_build_array(jsonb_build_object('player_id', :'ana', 'fields', jsonb_build_object('strokes', 6),
  'base', jsonb_build_object('strokes', 5, 'putts', 1, 'picked_up', false)))) as saved \gset
select harness.check((:'saved'::jsonb ->> 'status') = 'ok', 'the phone saves over the correction: ' || :'saved');
select harness.check((select reason is null from public.scores where round_id = :'r1' and player_id = :'ana' and hole = 3), 'a phone''s value carries no Comité reason');
select harness.check(pg_temp.notices(:'ana') = 2, 'a player''s save over a correction sends nothing');
select pg_temp.later();

-- 8. A restore brings back what was, and is no news, even a write that keeps a reason (as the Comité's do).
select set_config('cardi.comite', '1', true), set_config('cardi.restore', '1', true) \g /dev/null
update public.scores set strokes = 7, reason = 'Restaurado' where round_id = :'r1' and player_id = :'beto' and hole = 3;
select set_config('cardi.comite', '', true), set_config('cardi.restore', '', true) \g /dev/null
select harness.check(pg_temp.notices(:'beto') = 0, 'a restore of a corrected hole sends nothing');
update public.scores set strokes = 6, reason = null where round_id = :'r1' and player_id = :'beto' and hole = 3;
select pg_temp.later();

-- 9. The card's history, to every member. Ana's hole 3: her phone's 5, the Comité's 4 and 5, her phone's 6.
select pg_temp.history(:'dev_a', :'ana') as h \gset
select harness.check(jsonb_typeof(:'h'::jsonb) = 'array', 'Ana''s phone reads her card''s history: ' || left(:'h', 200));
select harness.check(pg_temp.steps(:'h'::jsonb, 3) = 'Ana/false/-/5/- | -/true/5/4/Se apuntó mal | -/true/4/5/Era un 5, no un 4 | Ana/false/5/6/-',
  'hole 3 step by step: who, the Comité, from what to what, why: ' || pg_temp.steps(:'h'::jsonb, 3));
-- Hole 4: the Comité's paper card, its corrections; its «Confirmado» on the same value is a step of the reason only.
select harness.check(pg_temp.steps(:'h'::jsonb, 4) = '-/true/-/4/Tarjeta de papel | -/true/4/6/Era un 6 | -/true/6/5/Era un 5 | -/true/5/5/Confirmado',
  'hole 4: what the Comité typed, changed and confirmed: ' || pg_temp.steps(:'h'::jsonb, 4));
select harness.check((select bool_and((x ->> 'round')::int = 1 and x ->> 'roundId' = :'r1' and (x ->> 'at') is not null) from jsonb_array_elements(:'h'::jsonb) x),
  'each step says its day and when');
-- Never an account, a phone, a mutation or the row's id: names and values only.
select harness.check(position(:'dev_a' in :'h') = 0 and position(:'org_a' in :'h') = 0 and position('mutation' in :'h') = 0
    and position('device' in :'h') = 0 and position('entered_by' in :'h') = 0,
  'the history names no account, phone or mutation');

-- Beto's card, read from Ana's phone: every member reads every card. The restore's write and its undoing, one
-- transaction that left the hole as it found it, are no step.
select pg_temp.history(:'dev_a', :'beto') as hb \gset
select harness.check(pg_temp.steps(:'hb'::jsonb, 3) = 'Ana/false/-/6/- | -/true/6/6/Discrepancia: se conserva el valor actual',
  'Beto''s hole 3: Ana''s phone typed it, the Comité kept it; the restore is no step: ' || pg_temp.steps(:'hb'::jsonb, 3));

-- A hole the Comité deletes is a step of the Comité's, to no capture.
select pg_temp.as_user(:'org_a', format('delete from public.scores where round_id = %L and player_id = %L and hole = 4 returning hole::text', :'r1', :'ana')) \g /dev/null
select pg_temp.history(:'dev_a', :'ana') as h \gset
select harness.check((select x ->> 'comite' = 'true' and x -> 'after' = 'null'::jsonb and x -> 'before' ->> 'strokes' = '5'
    from jsonb_array_elements(:'h'::jsonb) x where (x ->> 'hole')::int = 4 order by x ->> 'at' desc limit 1),
  'a deleted hole: the Comité, from 5 to nothing');

-- 10. Who may read it.
select harness.check(pg_temp.history(:'org_a', :'ana') like '[%', 'the Comité reads it');
select harness.check(pg_temp.history(:'org_b', :'ana') like '42501%', 'another tournament''s Comité does not');
select harness.check(pg_temp.history(:'dev_x', :'ana') like '42501%', 'a phone that claimed nobody does not');
select harness.check(pg_temp.history(:'dev_a', :'b1') like '22023%', 'a player of another tournament is refused by name');
select harness.check(not has_function_privilege('anon', 'public.card_history(uuid, uuid)', 'execute'), 'a link to watch (anon) cannot call it');

rollback;
