-- UX-23 (0054): a card signed by a marker, one player at a time. On the
-- two-tenant seed, tournament A signs by marker (`settings.cardSigning`,
-- pairs game off): Ana (dev_a, the seed's phone), Beto and Ceci play group 1
-- of day 1 on their own PIN phones, Dani group 2. Carla is tournament B's.
-- For each rule: who may sign a player's card and who may not, what the
-- signature locks and settles, the rule read from the stored settings (a
-- tournament without the key behaves as before), the notices, a deleted
-- player and a restore. Rolled back at the end; prints one «ok» line per
-- check.
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
select id as carla from harness.seed where key = 'player_b1' \gset
select id as r1 from harness.seed where key = 'round_a1' \gset
select id as g1 from harness.seed where key = 'group_a1' \gset
\set dev_beto '00000054-0000-4000-8000-000000000001'
\set dev_ceci '00000054-0000-4000-8000-000000000002'
\set dev_dani '00000054-0000-4000-8000-000000000003'
begin;

insert into auth.users (id, last_sign_in_at, raw_app_meta_data, raw_user_meta_data, is_anonymous)
select u, now(), '{"provider":"anonymous","providers":["anonymous"]}', '{}', true
from unnest(array[:'dev_beto', :'dev_ceci', :'dev_dani']::uuid[]) u;

-- A statement as a user of the app: its answer, or the SQLSTATE and the message.
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
-- A phone signs a player's card, as `signer`.
create function pg_temp.sign(uid uuid, r uuid, p uuid, signer uuid) returns text language sql as $$
  select pg_temp.as_user(uid, format('insert into public.card_signatures (round_id, player_id, signed_by) values (%L, %L, %L) returning card_id::text', r, p, signer))
$$;
create function pg_temp.signed(r uuid, p uuid) returns boolean language sql as $$
  select exists (select 1 from public.card_signatures where round_id = r and player_id = p)
$$;
create function pg_temp.score(r uuid, p uuid, h int) returns public.scores language sql as $$
  select s from public.scores s where s.round_id = r and s.player_id = p and s.hole = h
$$;
create function pg_temp.set_rule(t uuid, rule jsonb) returns void language sql as $$
  update public.tournaments set settings = settings || rule where id = t
$$;

-- ---------------------------------------------------------------------------
-- Setup: tournament A signs by marker; group 1 is Ana, Beto and Ceci
-- ---------------------------------------------------------------------------
select pg_temp.set_rule(:'t_a', '{"cardSigning": "marker"}') \g /dev/null
select pg_temp.as_user(:'org_a', format($q$insert into public.players (tournament_id, full_name, display_name, sort_order) values (%L, 'Ceci Alfa', 'Ceci', 2) returning id::text$q$, :'t_a')) as ceci \gset
select pg_temp.as_user(:'org_a', format($q$insert into public.players (tournament_id, full_name, display_name, sort_order) values (%L, 'Dani Alfa', 'Dani', 3) returning id::text$q$, :'t_a')) as dani \gset
select pg_temp.as_user(:'org_a', format('select public.set_player_pin(%L, %L)::text', p, '1234')) from unnest(array[:'ceci', :'dani']::uuid[]) p \g /dev/null
insert into public.group_members (group_id, player_id) values (:'g1', :'ceci');
insert into public.groups (round_id, number, start_hole) values (:'r1', 2, 1) returning id as g2 \gset
insert into public.group_members (group_id, player_id) values (:'g2', :'dani');
select pg_temp.as_user(:'dev_beto', format('select public.claim_player(%L, %L)::text', :'beto', '1234')) \g /dev/null
select pg_temp.as_user(:'dev_ceci', format('select public.claim_player(%L, %L)::text', :'ceci', '1234')) \g /dev/null
select pg_temp.as_user(:'dev_dani', format('select public.claim_player(%L, %L)::text', :'dani', '1234')) \g /dev/null
update public.rounds set status = 'live' where id = :'r1';
-- Every hole of day 1 for the three, as the group saved it.
insert into public.scores (round_id, player_id, hole, strokes, putts, picked_up, entered_by)
select :'r1', p, h, 4, 2, false, :'beto' from unnest(array[:'ana', :'beto', :'ceci']::uuid[]) p, generate_series(1, 18) h;
select harness.check((select count(*) from public.device_sessions where auth_user_id in (:'dev_a', :'dev_beto', :'dev_ceci', :'dev_dani')) = 4,
  'setup: four PIN phones in tournament A, day 1 live and played');

-- ---------------------------------------------------------------------------
-- 1. The rule, read from the stored settings as src/engine/core/cardSigning.ts reads them
-- ---------------------------------------------------------------------------
select harness.check(
  public.card_signing_mode(null) = 'none'
  and public.card_signing_mode('{}') = 'none'
  and public.card_signing_mode('{"modules": {"pairs": {"enabled": true}}}') = 'pairs'
  and public.card_signing_mode('{"modules": {"pairs": {"enabled": false}}}') = 'none'
  and public.card_signing_mode('{"cardSigning": "marker", "modules": {"pairs": {"enabled": true}}}') = 'marker'
  and public.card_signing_mode('{"cardSigning": "none", "modules": {"pairs": {"enabled": true}}}') = 'none'
  and public.card_signing_mode('{"cardSigning": "pairs"}') = 'none'
  and public.card_signing_mode('{"cardSigning": "pairs", "modules": {"pairs": {"enabled": true}}}') = 'pairs'
  and public.card_signing_mode('{"cardSigning": "someday", "modules": {"pairs": {"enabled": true}}}') = 'pairs',
  'card_signing_mode: no key reads as before (pairs with the pairs game, none without), marker and none as said, the pairs need the game, an unknown value reads as no key');

-- ---------------------------------------------------------------------------
-- 2. Who signs a player's card
-- ---------------------------------------------------------------------------
select pg_temp.sign(:'dev_beto', :'r1', :'ana', :'beto') as out \gset
select harness.check(:'out' = :'ana' and (select tournament_id = :'t_a' and pair_id is null and signed_by = :'beto' from public.card_signatures where round_id = :'r1' and player_id = :'ana'),
  'Beto''s phone signs Ana''s card: its key is her id, its tournament the round''s: ' || :'out');
select pg_temp.sign(:'dev_ceci', :'r1', :'ceci', :'ceci') as out \gset
select harness.check(:'out' like '42501 %' and not pg_temp.signed(:'r1', :'ceci'), 'nobody signs his own card: ' || :'out');
select pg_temp.sign(:'dev_ceci', :'r1', :'beto', :'ana') as out \gset
select harness.check(:'out' like '42501 %' and not pg_temp.signed(:'r1', :'beto'), 'a signature is the phone''s own player''s: ' || :'out');
select pg_temp.sign(:'dev_dani', :'r1', :'ceci', :'dani') as out \gset
select harness.check(:'out' like '42501 %' and not pg_temp.signed(:'r1', :'ceci'), 'a player of another group that day does not sign: ' || :'out');
select pg_temp.sign(:'dev_x', :'r1', :'ceci', :'ana') as out \gset
select harness.check(:'out' like '42501 %', 'a phone that holds nobody does not sign: ' || :'out');
select pg_temp.as_user(:'dev_ceci', format('insert into public.card_signatures (round_id, player_id, signed_by) values (%L, %L, %L) on conflict (round_id, player_id) do nothing returning card_id::text', :'r1', :'ana', :'ceci')) as out \gset
select harness.check(:'out' = 'null' and (select signed_by from public.card_signatures where round_id = :'r1' and player_id = :'ana') = :'beto',
  'a card signed already keeps its signature: the second upsert writes nothing: ' || :'out');
select pg_temp.sign(:'dev_ceci', :'r1', :'ana', :'ceci') as out \gset
select harness.check(:'out' like '23505 %card_signatures_pkey%', 'and a plain second insert is a duplicate of the card: ' || :'out');
select pg_temp.as_user(:'org_a', format('insert into public.card_signatures (round_id, pair_id, player_id) values (%L, null, null) returning ''in''', :'r1')) as out \gset
select harness.check(:'out' like '23502 %card_id%', 'a signature of nobody''s card is refused: ' || :'out');
insert into public.pairs (tournament_id, name, player1_id, player2_id) values (:'t_a', null, :'beto', :'ceci') returning id as pair_bc \gset
select pg_temp.as_user(:'org_a', format('insert into public.card_signatures (round_id, pair_id, player_id) values (%L, %L, %L) returning ''in''', :'r1', :'pair_bc', :'beto')) as out \gset
select harness.check(:'out' like '23514 %card_signatures_one_card%', 'and one of a pair and a player at once: ' || :'out');
select pg_temp.as_user(:'org_a', format('insert into public.card_signatures (round_id, player_id) values (%L, %L) returning ''in''', :'r1', :'carla')) as out \gset
select harness.check(:'out' like '23503 %card_signatures_player_tenant_fkey%', 'a player of another tournament is no card of this day, not even the Comité''s: ' || :'out');

-- ---------------------------------------------------------------------------
-- 3. What a signature locks: that player's card, and no other
-- ---------------------------------------------------------------------------
select pg_temp.as_user(:'dev_ceci', format('update public.scores set strokes = 7 where round_id = %L and player_id = %L and hole = 3 returning ''changed''', :'r1', :'ana')) as out \gset
select harness.check(:'out' = 'null' and (pg_temp.score(:'r1', :'ana', 3)).strokes = 4, 'Ana''s card signed: a phone of her group changes none of her holes: ' || :'out');
select pg_temp.as_user(:'dev_ceci', format('update public.scores set strokes = 5 where round_id = %L and player_id = %L and hole = 3 returning ''changed''', :'r1', :'beto')) as out \gset
select harness.check(:'out' = 'changed' and (pg_temp.score(:'r1', :'beto', 3)).strokes = 5, 'Beto''s card, unsigned, still takes his group''s corrections: ' || :'out');
select pg_temp.as_user(:'dev_ceci', format('select public.save_hole(%L::jsonb)::text', jsonb_build_object('round_id', :'r1', 'hole', 4, 'mutation_id', gen_random_uuid(), 'entries',
  jsonb_build_array(jsonb_build_object('player_id', :'ana', 'fields', jsonb_build_object('strokes', 6), 'base', '{"strokes": 4, "putts": 2, "picked_up": false}'::jsonb),
                    jsonb_build_object('player_id', :'beto', 'fields', jsonb_build_object('strokes', 6), 'base', '{"strokes": 4, "putts": 2, "picked_up": false}'::jsonb))))) as out \gset
select harness.check(:'out'::jsonb #>> '{rejected,0,reason}' = 'card_signed' and :'out'::jsonb #>> '{rejected,0,player_id}' = :'ana'
  and (pg_temp.score(:'r1', :'ana', 4)).strokes = 4 and (pg_temp.score(:'r1', :'beto', 4)).strokes = 6,
  'save_hole: card_signed for Ana, and Beto''s value taken: ' || (:'out'::jsonb -> 'rejected')::text);
select pg_temp.as_user(:'org_a', format('select public.admin_save_score(%L, %L, 5, 5, 2, false, null)::text', :'r1', :'ana')) as out \gset
select harness.check(:'out' like '22023 La tarjeta está firmada%', 'the Comité corrects her signed card only with a reason: ' || :'out');
select pg_temp.as_user(:'org_a', format('select public.admin_save_score(%L, %L, 5, 5, 2, false, %L)::text', :'r1', :'ana', 'Era un 5 en el 5')) as out \gset
select harness.check((pg_temp.score(:'r1', :'ana', 5)).strokes = 5 and (pg_temp.score(:'r1', :'ana', 5)).reason = 'Era un 5 en el 5', 'and with it, it is written with the reason: ' || :'out');
select pg_temp.as_user(:'org_a', format('select public.admin_save_hole(%L, 6, %L::jsonb, null)::text', :'r1', jsonb_build_array(jsonb_build_object('player_id', :'ana', 'strokes', 5, 'putts', 2, 'picked_up', false)))) as out \gset
select harness.check(:'out' like '22023 %' and (pg_temp.score(:'r1', :'ana', 6)).strokes = 4, 'admin_save_hole asks for the reason too: ' || :'out');

-- admin_save_score speaks as the Comité until its request ends; here the transaction goes on.
select set_config('cardi.comite', '', true) \g /dev/null

-- ---------------------------------------------------------------------------
-- 4. A signature settles that player's discrepancies, and no other's
-- ---------------------------------------------------------------------------
select pg_temp.as_user(:'dev_a', format('update public.scores set strokes = 6 where round_id = %L and player_id = %L and hole in (7, 8) returning ''changed''', :'r1', :'ceci')) \g /dev/null
select pg_temp.as_user(:'dev_a', format('update public.scores set strokes = 6 where round_id = %L and player_id = %L and hole = 7 returning ''changed''', :'r1', :'beto')) \g /dev/null
select harness.check((pg_temp.score(:'r1', :'ceci', 7)).disputed and (pg_temp.score(:'r1', :'ceci', 8)).disputed and (pg_temp.score(:'r1', :'beto', 7)).disputed,
  'Ana''s phone overwrites holes Beto''s phone saved: discrepancies on Ceci''s 7th and 8th and Beto''s 7th');
select pg_temp.sign(:'dev_beto', :'r1', :'ceci', :'beto') as out \gset
select harness.check(:'out' = :'ceci' and not (pg_temp.score(:'r1', :'ceci', 7)).disputed and not (pg_temp.score(:'r1', :'ceci', 8)).disputed
  and (pg_temp.score(:'r1', :'ceci', 7)).previous is null and (pg_temp.score(:'r1', :'beto', 7)).disputed,
  'Beto signs Ceci''s card: hers settle, his own discrepancy stays');
select harness.check(coalesce(current_setting('cardi.comite', true), '') = '', 'and the Comité''s switch is left as found');

-- ---------------------------------------------------------------------------
-- 5. The rule the tournament signs by: a phone signs a player's card only under 'marker'
-- ---------------------------------------------------------------------------
select pg_temp.set_rule(:'t_a', '{"cardSigning": "none"}') \g /dev/null
select pg_temp.sign(:'dev_a', :'r1', :'beto', :'ana') as out \gset
select harness.check(:'out' like '42501 %' and not pg_temp.signed(:'r1', :'beto'), 'under «none» no phone signs: ' || :'out');
select pg_temp.as_user(:'dev_ceci', format('update public.scores set strokes = 7 where round_id = %L and player_id = %L and hole = 9 returning ''changed''', :'r1', :'ana')) as out \gset
select harness.check(:'out' = 'null', 'a card signed under another rule stays locked: ' || :'out');
-- The pairs' rule, as a tournament stored before the setting reads with the pairs game on.
update public.tournaments set settings = jsonb_set(settings - 'cardSigning', '{modules,pairs,enabled}', 'true') where id = :'t_a';
select pg_temp.sign(:'dev_a', :'r1', :'beto', :'ana') as out \gset
select harness.check(:'out' like '42501 %' and not pg_temp.signed(:'r1', :'beto'), 'under the pairs'' rule a phone signs no player''s card: ' || :'out');
select pg_temp.as_user(:'dev_a', format('insert into public.card_signatures (round_id, pair_id, signed_by) values (%L, %L, %L) returning card_id::text', :'r1', :'pair_bc', :'ana')) as out \gset
select harness.check(:'out' = :'pair_bc' and (select player_id is null from public.card_signatures where round_id = :'r1' and pair_id = :'pair_bc'),
  'and the other pair''s card as 0013 lets it, keyed by the pair: ' || :'out');
select pg_temp.as_user(:'dev_ceci', format('update public.scores set strokes = 7 where round_id = %L and player_id = %L and hole = 10 returning ''changed''', :'r1', :'beto')) as out \gset
select harness.check(:'out' = 'null' and (pg_temp.score(:'r1', :'beto', 10)).strokes = 4, 'which locks both of its players: ' || :'out');
select pg_temp.set_rule(:'t_a', '{"cardSigning": "marker"}') \g /dev/null
update public.tournaments set settings = jsonb_set(settings, '{modules,pairs,enabled}', 'false') where id = :'t_a';
delete from public.card_signatures where pair_id is not null;
delete from public.pairs where tournament_id = :'t_a';

-- ---------------------------------------------------------------------------
-- 6. A day no longer live: no phone signs; the Comité does
-- ---------------------------------------------------------------------------
update public.rounds set status = 'finished' where id = :'r1';
select pg_temp.sign(:'dev_a', :'r1', :'beto', :'ana') as out \gset
select harness.check(:'out' like '42501 %' and not pg_temp.signed(:'r1', :'beto'), 'day 1 finished: Ana''s phone signs nothing: ' || :'out');
select pg_temp.as_user(:'org_a', format('insert into public.card_signatures (round_id, player_id) values (%L, %L) returning card_id::text', :'r1', :'beto')) as out \gset
select harness.check(:'out' = :'beto' and pg_temp.signed(:'r1', :'beto'), 'the Comité signs Beto''s card after the day: ' || :'out');
select pg_temp.as_user(:'org_a', format('delete from public.card_signatures where round_id = %L and player_id = %L returning card_id::text', :'r1', :'beto')) as out \gset
select harness.check(:'out' = :'beto' and not pg_temp.signed(:'r1', :'beto'), 'and takes the signature off again (Comité › Tarjetas «Quitar firma»): ' || :'out');
select pg_temp.as_user(:'dev_a', format('delete from public.card_signatures where round_id = %L and player_id = %L returning card_id::text', :'r1', :'ceci')) as out \gset
select harness.check(:'out' = 'null' and pg_temp.signed(:'r1', :'ceci'), 'a phone takes no signature off: ' || :'out');

-- ---------------------------------------------------------------------------
-- 7. The group hears a card waits, by the tournament's rule (0052's notices)
-- ---------------------------------------------------------------------------
select vault.create_secret('https://harness.invalid/api/push-dispatch', 'push_dispatch_url') \g /dev/null
select vault.create_secret('harness-dispatch-secret', 'push_dispatch_secret') \g /dev/null
create function pg_temp.mark() returns bigint language sql as $$ select coalesce(max(id), 0) from net.harness_requests $$;
create function pg_temp.sent(since bigint, k text) returns text language sql as $$
  select coalesce(string_agg(w, ', ' order by w), '')
  from (
    select (q.body -> 'notice' ->> 'kind') || ' ' || replace(e ->> 'endpoint', 'https://push.test/', '') as w
    from net.harness_requests q
    cross join lateral jsonb_array_elements(q.body -> 'subscriptions') e
    where q.id > since and q.body -> 'notice' ->> 'kind' = k
  ) x
$$;
create function pg_temp.data_for(since bigint, phone text, k text) returns jsonb language sql as $$
  select q.body -> 'notice' -> 'data'
  from net.harness_requests q cross join lateral jsonb_array_elements(q.body -> 'subscriptions') e
  where q.id > since and e ->> 'endpoint' = 'https://push.test/' || phone and q.body -> 'notice' ->> 'kind' = k
  order by q.id desc limit 1
$$;
select pg_temp.as_user(u, format('select public.save_pin_push(%L, %L, %L, %L, %L)::text', :'t_a', 'https://push.test/' || ph, 'k-' || ph, 'a-' || ph, 'harness'))
from (values (:'dev_a'::uuid, 'ana'), (:'dev_beto'::uuid, 'beto'), (:'dev_ceci'::uuid, 'ceci')) v(u, ph) \g /dev/null
insert into public.rounds (tournament_id, number, holes) values (:'t_a', 2, 9) returning id as r2 \gset
insert into public.groups (round_id, number, start_hole) values (:'r2', 1, 1) returning id as g3 \gset
insert into public.group_members (group_id, player_id) values (:'g3', :'ana'), (:'g3', :'beto'), (:'g3', :'ceci');
update public.rounds set status = 'live' where id = :'r2';
select pg_temp.set_rule(:'t_a', '{"cardSigning": "none"}') \g /dev/null
select pg_temp.mark() as m \gset
insert into public.scores (round_id, player_id, hole, strokes, putts, picked_up) select :'r2', :'beto', h, 4, 2, false from generate_series(1, 9) h;
select harness.check(pg_temp.sent(:m, 'card_to_sign') = '', 'under «none», Beto''s card complete asks nobody to sign');
select pg_temp.set_rule(:'t_a', '{"cardSigning": "marker"}') \g /dev/null
insert into public.scores (round_id, player_id, hole, strokes, putts, picked_up) select :'r2', :'ceci', h, 4, 2, false from generate_series(1, 8) h;
select pg_temp.sent(:m, 'card_to_sign') as out \gset
select harness.check(:'out' = 'card_to_sign ana, card_to_sign ceci',
  'under «marker», the group''s next change finds Beto''s card complete and unsigned: Ana and Ceci hear it, Beto is not asked to sign his own: ' || :'out');
select pg_temp.mark() as m2 \gset
insert into public.scores (round_id, player_id, hole, strokes, putts, picked_up) values (:'r2', :'ceci', 9, 4, 2, false);
select pg_temp.sent(:m2, 'card_to_sign') as out \gset
select harness.check(:'out' = 'card_to_sign beto', 'Ceci''s card complete: Beto hears it; Ana, told today already, is not told twice: ' || :'out');
select harness.check(pg_temp.data_for(:m, 'ana', 'card_to_sign') = jsonb_build_object('tournament', 'Seed Torneo A', 'slug', (select slug from public.tournaments where id = :'t_a'), 'round', 2, 'group', 1, 'marker', true),
  'it says the day, the group and that it is a teammate''s card, and no one''s name: ' || pg_temp.data_for(:m, 'ana', 'card_to_sign')::text);
select harness.check((select count(*) from public.player_notices where key = 'card_to_sign:' || :'r2' || ':marker') = 3, 'one notice a day per player');
select pg_temp.mark() as m \gset
insert into public.scores (round_id, player_id, hole, strokes, putts, picked_up) select :'r2', :'ana', h, 4, 2, false from generate_series(1, 9) h;
select pg_temp.sign(:'dev_beto', :'r2', :'ana', :'beto') as out \gset
select harness.check(:'out' = :'ana' and pg_temp.sent(:m, 'card_to_sign') = '', 'Ana''s card complete and signed: nobody hears it twice: ' || pg_temp.sent(:m, 'card_to_sign'));

-- ---------------------------------------------------------------------------
-- 8. A deleted player takes his signatures with him
-- ---------------------------------------------------------------------------
select pg_temp.as_user(:'org_a', format('insert into public.card_signatures (round_id, player_id) values (%L, %L) returning card_id::text', :'r1', :'dani')) \g /dev/null
select harness.check(pg_temp.signed(:'r1', :'dani'), 'the Comité signs Dani''s card');
select pg_temp.as_user(:'org_a', format('delete from public.players where id = %L returning ''gone''', :'dani')) \g /dev/null
select harness.check(not exists (select 1 from public.card_signatures where player_id = :'dani'), 'Dani deleted: his signature goes with him');

-- ---------------------------------------------------------------------------
-- 9. A restore writes a player's signature back, and refuses one of nobody's card
-- ---------------------------------------------------------------------------
-- The backup, in src/data/backup.ts's shape (restore_roundtrip.sql's).
create function pg_temp.backup(t uuid) returns jsonb language sql stable as $$
  with rs as (select id from public.rounds where tournament_id = t),
       ls as (select id from public.calcutta_lots where tournament_id = t),
       tm as (select id from public.teams where tournament_id = t)
  select jsonb_build_object('version', 1, 'exportedAt', now(), 'tournamentId', t, 'slug', 'harness', 'tables', jsonb_build_object(
    'tournaments', (select jsonb_agg(to_jsonb(x)) from public.tournaments x where x.id = t),
    'players', coalesce((select jsonb_agg(to_jsonb(x)) from public.players x where tournament_id = t), '[]'),
    'rounds', coalesce((select jsonb_agg(to_jsonb(x)) from public.rounds x where tournament_id = t), '[]'),
    'pairs', coalesce((select jsonb_agg(to_jsonb(x)) from public.pairs x where tournament_id = t), '[]'),
    'teams', coalesce((select jsonb_agg(to_jsonb(x)) from public.teams x where tournament_id = t), '[]'),
    'calcutta_lots', coalesce((select jsonb_agg(to_jsonb(x)) from public.calcutta_lots x where tournament_id = t), '[]'),
    'payments', coalesce((select jsonb_agg(to_jsonb(x)) from public.payments x where tournament_id = t), '[]'),
    'money_adjustments', coalesce((select jsonb_agg(to_jsonb(x)) from public.money_adjustments x where tournament_id = t), '[]'),
    'game_entries', coalesce((select jsonb_agg(to_jsonb(x)) from public.game_entries x where tournament_id = t), '[]'),
    'game_results', coalesce((select jsonb_agg(to_jsonb(x)) from public.game_results x where tournament_id = t), '[]'),
    'groups', coalesce((select jsonb_agg(to_jsonb(x)) from public.groups x where round_id in (select id from rs)), '[]'),
    'round_tees', coalesce((select jsonb_agg(to_jsonb(x)) from public.round_tees x where round_id in (select id from rs)), '[]'),
    'scores', coalesce((select jsonb_agg(to_jsonb(x)) from public.scores x where round_id in (select id from rs)), '[]'),
    'snake_tiebreaks', coalesce((select jsonb_agg(to_jsonb(x)) from public.snake_tiebreaks x where round_id in (select id from rs)), '[]'),
    'card_signatures', coalesce((select jsonb_agg(to_jsonb(x)) from public.card_signatures x where round_id in (select id from rs)), '[]'),
    'handicap_overrides', coalesce((select jsonb_agg(to_jsonb(x)) from public.handicap_overrides x where round_id in (select id from rs)), '[]'),
    'hole_awards', coalesce((select jsonb_agg(to_jsonb(x)) from public.hole_awards x where round_id in (select id from rs)), '[]'),
    'team_members', coalesce((select jsonb_agg(to_jsonb(x)) from public.team_members x where team_id in (select id from tm)), '[]'),
    'calcutta_bids', coalesce((select jsonb_agg(to_jsonb(x)) from public.calcutta_bids x where lot_id in (select id from ls)), '[]'),
    'calcutta_buybacks', coalesce((select jsonb_agg(to_jsonb(x)) from public.calcutta_buybacks x where lot_id in (select id from ls)), '[]')
  ))
$$;
create function pg_temp.signatures(t uuid) returns text language sql stable as $$
  select coalesce(string_agg(r.number || ':' || p.display_name, ', ' order by r.number, p.display_name), '')
  from public.card_signatures s join public.rounds r on r.id = s.round_id join public.players p on p.id = s.player_id
  where r.tournament_id = t
$$;
select pg_temp.signatures(:'t_a') as before \gset
select pg_temp.backup(:'t_a')::text as bk \gset
delete from public.card_signatures where tournament_id = :'t_a';
select pg_temp.as_user(:'org_a', format('select public.restore_tournament(%L, %L::jsonb)::text', :'t_a', :'bk')) as out \gset
select harness.check(:'out' like '{%' and pg_temp.signatures(:'t_a') = :'before' and :'before' = '1:Ana, 1:Ceci, 2:Ana',
  'the backup''s players'' signatures come back as they were: ' || pg_temp.signatures(:'t_a'));
select harness.check((select bool_and(card_id = player_id and pair_id is null) from public.card_signatures where tournament_id = :'t_a'), 'each keyed by its player');
-- The first restore's scratch tables live until the transaction ends (on commit drop): a second one in this transaction needs them gone.
do $$ declare x record; begin
  for x in select tablename from pg_tables where schemaname = (select nspname from pg_namespace where oid = pg_my_temp_schema()) and tablename like 'r\_%' loop
    execute format('drop table pg_temp.%I', x.tablename);
  end loop;
end $$;
select pg_temp.as_user(:'org_a', format('select public.restore_tournament(%L, %L::jsonb)::text', :'t_a',
  jsonb_set(:'bk'::jsonb, '{tables,card_signatures,0,player_id}', 'null'))) as out \gset
select harness.check(:'out' like '22023 El respaldo está incompleto%' and pg_temp.signatures(:'t_a') = :'before', 'a backup with a signature of nobody''s card is refused, and nothing changes: ' || :'out');

rollback;
