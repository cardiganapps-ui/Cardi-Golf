-- PWA-10 (0051): push for the players who enter with a PIN, on tournament
-- days. On the two-tenant seed, tournament A plays the first tournament's
-- games (pairs and the snake on) with four players on four PIN phones: Ana
-- (dev_a, the seed's), Beto, Ceci and Dani, in one group, pairs Ana+Dani and
-- Beto+Ceci. Carla holds a player of tournament B. Push is configured as on
-- production (Vault), and every request the database would send is read
-- back from the pg_net stub (net.harness_requests). For each notice: who
-- hears it, who doesn't (another tournament, the phone that caused it, a
-- released phone, a phone moved to another player, a deleted player or
-- account), once. Rolled back at the end; prints one «ok» line per check.
\set ON_ERROR_STOP 1
\set QUIET 1
\pset tuples_only on
\pset format unaligned
select id as org_a from harness.seed where key = 'org_a' \gset
select id as org_b from harness.seed where key = 'org_b' \gset
select id as dev_a from harness.seed where key = 'dev_a' \gset
select id as dev_x from harness.seed where key = 'dev_x' \gset
select id as t_a from harness.seed where key = 'tournament_a' \gset
select id as t_b from harness.seed where key = 'tournament_b' \gset
select id as ana from harness.seed where key = 'player_a1' \gset
select id as beto from harness.seed where key = 'player_a2' \gset
select id as carla from harness.seed where key = 'player_b1' \gset
select id as r1 from harness.seed where key = 'round_a1' \gset
select id as rb from harness.seed where key = 'round_b1' \gset
select id as g1 from harness.seed where key = 'group_a1' \gset
\set dev_beto '00000051-0000-4000-8000-000000000001'
\set dev_ceci '00000051-0000-4000-8000-000000000002'
\set dev_dani '00000051-0000-4000-8000-000000000003'
\set dev_carla '00000051-0000-4000-8000-000000000004'
\set dev_eva '00000051-0000-4000-8000-000000000005'
\set acct '00000051-0000-4000-8000-000000000006'
begin;

-- Push is configured (the stub sends nothing; it records).
select vault.create_secret('https://harness.invalid/api/push-dispatch', 'push_dispatch_url') \g /dev/null
select vault.create_secret('harness-dispatch-secret', 'push_dispatch_secret') \g /dev/null

insert into auth.users (id, last_sign_in_at, raw_app_meta_data, raw_user_meta_data, is_anonymous)
select u, now(), '{"provider":"anonymous","providers":["anonymous"]}', '{}', true
from unnest(array[:'dev_beto', :'dev_ceci', :'dev_dani', :'dev_carla', :'dev_eva']::uuid[]) u;
insert into auth.users (id, email, email_confirmed_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data, is_anonymous)
values (:'acct', 'ceci@polo.test', now(), now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Ceci"}', false);

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
-- The last request recorded so far.
create function pg_temp.mark() returns bigint language sql as $$ select coalesce(max(id), 0) from net.harness_requests $$;
-- What went out since `since`: one «kind phone» per address, sorted; an account's request (it carries the
-- unread count) is marked «acct:». Addresses are https://push.test/<phone>.
create function pg_temp.sent(since bigint) returns text language sql as $$
  select coalesce(string_agg(w, ', ' order by w), '')
  from (
    select case when q.body ? 'unread' then 'acct:' else '' end || (q.body -> 'notice' ->> 'kind') || ' ' || replace(e ->> 'endpoint', 'https://push.test/', '') as w
    from net.harness_requests q
    cross join lateral jsonb_array_elements(q.body -> 'subscriptions') e
    where q.id > since
  ) x
$$;
-- The notice a phone got since `since` (its data), for one kind.
create function pg_temp.data_for(since bigint, phone text, k text) returns jsonb language sql as $$
  select q.body -> 'notice' -> 'data'
  from net.harness_requests q cross join lateral jsonb_array_elements(q.body -> 'subscriptions') e
  where q.id > since and e ->> 'endpoint' = 'https://push.test/' || phone and q.body -> 'notice' ->> 'kind' = k
  order by q.id desc limit 1
$$;
-- A phone turns on the notices of the player it holds.
create function pg_temp.subscribe(uid uuid, t uuid, phone text) returns text language sql as $$
  select pg_temp.as_user(uid, format('select public.save_pin_push(%L, %L, %L, %L, %L)::text', t, 'https://push.test/' || phone, 'p256dh-' || phone, 'auth-' || phone, 'harness ' || phone))
$$;
create function pg_temp.on_(uid uuid, t uuid, phone text) returns boolean language sql as $$
  select pg_temp.as_user(uid, format('select public.pin_push_on(%L, %L)::text', t, 'https://push.test/' || phone))::boolean
$$;
-- A whole hole for the four, as one phone saves it: putts per player, 4 strokes each.
create function pg_temp.hole(uid uuid, rid uuid, h int, putts jsonb) returns text language sql as $$
  select pg_temp.as_user(uid, format(
    'insert into public.scores (round_id, player_id, hole, strokes, putts, picked_up) select %L, (e.key)::uuid, %s, 4, (e.value)::int, false from jsonb_each_text(%L::jsonb) e on conflict (round_id, player_id, hole) do update set putts = excluded.putts returning ''saved''',
    rid, h, putts))
$$;

-- ---------------------------------------------------------------------------
-- Setup: tournament A plays pairs and the snake; four players, four phones
-- ---------------------------------------------------------------------------
update public.tournaments set settings = jsonb_set(jsonb_set(settings, '{modules,pairs,enabled}', 'true'), '{modules,snake,enabled}', 'true') where id = :'t_a';
select pg_temp.as_user(:'org_a', format($q$insert into public.players (tournament_id, full_name, display_name, sort_order) values (%L, 'Ceci Alfa', 'Ceci', 2) returning id::text$q$, :'t_a')) as ceci \gset
select pg_temp.as_user(:'org_a', format($q$insert into public.players (tournament_id, full_name, display_name, sort_order) values (%L, 'Dani Alfa', 'Dani', 3) returning id::text$q$, :'t_a')) as dani \gset
select pg_temp.as_user(:'org_a', format('select public.set_player_pin(%L, %L)::text', :'ceci', '1234')) \g /dev/null
select pg_temp.as_user(:'org_a', format('select public.set_player_pin(%L, %L)::text', :'dani', '1234')) \g /dev/null
insert into public.group_members (group_id, player_id) values (:'g1', :'ceci'), (:'g1', :'dani');
insert into public.pairs (tournament_id, name, player1_id, player2_id, kind) values (:'t_a', null, :'ana', :'dani', 'AD') returning id as pair_ad \gset
insert into public.pairs (tournament_id, name, player1_id, player2_id, kind) values (:'t_a', null, :'beto', :'ceci', 'BC') returning id as pair_bc \gset
select pg_temp.as_user(:'dev_beto', format('select public.claim_player(%L, %L)::text', :'beto', '1234')) \g /dev/null
select pg_temp.as_user(:'dev_ceci', format('select public.claim_player(%L, %L)::text', :'ceci', '1234')) \g /dev/null
select pg_temp.as_user(:'dev_dani', format('select public.claim_player(%L, %L)::text', :'dani', '1234')) \g /dev/null
select pg_temp.as_user(:'dev_carla', format('select public.claim_player(%L, %L)::text', :'carla', '1234')) \g /dev/null
select harness.check(
  (select count(*) from public.device_sessions where auth_user_id in (:'dev_a', :'dev_beto', :'dev_ceci', :'dev_dani', :'dev_carla')) = 5,
  'setup: five PIN phones, four in tournament A and one in B');

-- ---------------------------------------------------------------------------
-- 1. Turning them on: only for the player the phone holds
-- ---------------------------------------------------------------------------
select pg_temp.subscribe(:'dev_x', :'t_a', 'x') as out \gset
select harness.check(:'out' = '42501 Entra con tu PIN para recibir los avisos del torneo', 'a phone that holds nobody cannot turn them on: ' || :'out');
select pg_temp.subscribe(:'dev_carla', :'t_a', 'carla') as out \gset
select harness.check(:'out' like '42501 %' and not exists (select 1 from public.pin_push_subscriptions), 'another tournament''s phone cannot either: ' || :'out');
select pg_temp.as_user(:'dev_a', format('select public.save_pin_push(%L, %L, %L, %L)::text', :'t_a', 'http://push.test/ana', 'k', 'a')) as out \gset
select harness.check(:'out' = '22023 Suscripción inválida', 'an address that is not https is refused: ' || :'out');
select pg_temp.subscribe(:'dev_a', :'t_a', 'ana') || pg_temp.subscribe(:'dev_beto', :'t_a', 'beto') || pg_temp.subscribe(:'dev_ceci', :'t_a', 'ceci')
  || pg_temp.subscribe(:'dev_dani', :'t_a', 'dani') || pg_temp.subscribe(:'dev_carla', :'t_b', 'carla') as out \gset
select harness.check(:'out' = ''
  and (select string_agg(p.display_name || '=' || replace(s.endpoint, 'https://push.test/', ''), ',' order by p.display_name)
       from public.pin_push_subscriptions s join public.players p on p.id = s.player_id) = 'Ana=ana,Beto=beto,Carla=carla,Ceci=ceci,Dani=dani',
  'each phone turns them on for the player it holds, the claim''s and no other');
select harness.check(pg_temp.on_(:'dev_a', :'t_a', 'ana') and not pg_temp.on_(:'dev_a', :'t_b', 'ana') and not pg_temp.on_(:'dev_beto', :'t_a', 'ana'),
  'pin_push_on: on for its own address and tournament, not another''s');
select pg_temp.as_user(:'dev_a', format('select public.pin_push_on(null, %L)::text', 'https://push.test/ana')) || ' '
  || pg_temp.as_user(:'dev_x', format('select public.pin_push_on(null, %L)::text', 'https://push.test/ana')) as out \gset
select harness.check(:'out' = 'true false', 'with no tournament: whether any player this phone holds uses the address, and only for its own: ' || :'out');
select pg_temp.as_user(:'dev_a', 'select count(*)::text from public.pin_push_subscriptions') || ' | '
  || pg_temp.as_user(:'dev_a', format($q$insert into public.pin_push_subscriptions (tournament_id, player_id, auth_user_id, endpoint, p256dh, auth) values (%L, %L, %L, 'https://push.test/forged', 'k', 'a') returning 'in'$q$, :'t_a', :'beto', :'dev_a')) || ' | '
  || pg_temp.as_user(:'dev_a', 'select count(*)::text from public.player_notices') as out \gset
select harness.check(:'out' ~ '^42501 .* \| 42501 .* \| 42501 ', 'nobody reads or writes the addresses or the notices directly: ' || :'out');
select pg_temp.as_user(:'dev_a', format('select public.notify_player(%L, %L, %L, %L)::text', :'beto', 'results', 'x', '{}')) || ' | '
  || pg_temp.as_user(:'dev_a', format('select public.group_notices(%L, %L, null)::text', :'r1', :'g1')) as out \gset
select harness.check(:'out' ~ '^42501 .* \| 42501 ', 'nor calls what sends them: ' || :'out');

-- ---------------------------------------------------------------------------
-- 2. A day goes live: its players, once
-- ---------------------------------------------------------------------------
select pg_temp.mark() as m \gset
select pg_temp.as_user(:'org_a', format($q$update public.rounds set status = 'live' where id = %L returning 'live'$q$, :'r1')) \g /dev/null
select pg_temp.sent(:m) as out \gset
select harness.check(:'out' = 'round_live ana, round_live beto, round_live ceci, round_live dani', 'day 1 goes live: each of its four players'' phones, no other: ' || :'out');
select harness.check(pg_temp.data_for(:m, 'ana', 'round_live') = jsonb_build_object('tournament', 'Seed Torneo A', 'slug', (select slug from public.tournaments where id = :'t_a'), 'round', 1, 'group', 1, 'startHole', 1, 'teeTime', '09:00'),
  'it says the tournament, the day, the group, its first hole and its tee time: ' || pg_temp.data_for(:m, 'ana', 'round_live')::text);
select harness.check((select url = 'https://harness.invalid/api/push-dispatch' and headers ->> 'Authorization' = 'Bearer harness-dispatch-secret' from net.harness_requests where id > :m order by id limit 1),
  'to the dispatch route, with the shared secret, as 0019''s');
select harness.check((select count(*) from public.player_notices where key = 'round_live:' || :'r1') = 4, 'one notice kept per player');
select pg_temp.mark() as m \gset
update public.rounds set status = 'finished' where id = :'r1';
update public.rounds set status = 'live' where id = :'r1';
select harness.check(pg_temp.sent(:m) = '', 'the day closed and opened again tells nobody twice');

-- The Comité's own phone starts day 2: everyone else hears it.
update public.players set is_admin = true where id = :'ana';
insert into public.rounds (tournament_id, number, holes) values (:'t_a', 2, 18) returning id as r2 \gset
insert into public.groups (round_id, number, tee_time, start_hole) values (:'r2', 1, '10:30', 10) returning id as g2 \gset
insert into public.group_members (group_id, player_id) values (:'g2', :'ana'), (:'g2', :'beto'), (:'g2', :'ceci'), (:'g2', :'dani');
select pg_temp.mark() as m \gset
select pg_temp.as_user(:'dev_a', format($q$update public.rounds set status = 'live' where id = %L returning 'live'$q$, :'r2')) as out \gset
select harness.check(:'out' = 'live' and pg_temp.sent(:m) = 'round_live beto, round_live ceci, round_live dani'
  and exists (select 1 from public.player_notices where player_id = :'ana' and key = 'round_live:' || :'r2'),
  'Ana''s phone starts day 2: the other three hear it, hers does not (she is on it), and hers is kept as said: ' || pg_temp.sent(:m));
select harness.check(pg_temp.data_for(:m, 'beto', 'round_live') ->> 'teeTime' = '10:30' and (pg_temp.data_for(:m, 'beto', 'round_live') ->> 'startHole')::int = 10,
  'with that day''s tee time and first hole');

-- Another tournament's day: its own phone only.
select pg_temp.mark() as m \gset
select pg_temp.as_user(:'org_b', format($q$update public.rounds set status = 'live' where id = %L returning 'live'$q$, :'rb')) \g /dev/null
select harness.check(pg_temp.sent(:m) = 'round_live carla', 'tournament B''s day reaches Carla''s phone and none of A''s: ' || pg_temp.sent(:m));

-- ---------------------------------------------------------------------------
-- 3. A card ready to sign: the players who sign it
-- ---------------------------------------------------------------------------
select pg_temp.mark() as m \gset
insert into public.scores (round_id, player_id, hole, strokes, putts, picked_up)
select :'r1', p, h, 4, 2, false from unnest(array[:'ana', :'beto', :'ceci', :'dani']::uuid[]) p, generate_series(1, 17) h;
select harness.check(pg_temp.sent(:m) = '', '17 holes of 18: nobody is asked to sign yet');
select pg_temp.hole(:'dev_beto', :'r1', 18, jsonb_build_object(:'ana', 2, :'beto', 2, :'ceci', 2, :'dani', 2)) \g /dev/null
select pg_temp.sent(:m) as out \gset
select harness.check(:'out' = 'card_to_sign ana, card_to_sign ceci, card_to_sign dani',
  'Beto''s phone saves the 18th: Ana and Dani sign Beto and Ceci''s card, Ceci signs Ana and Dani''s; Beto, on the card, is not pushed: ' || :'out');
select harness.check((select count(*) from public.player_notices where kind = 'card_to_sign') = 4
  and (select count(*) from public.player_notices where key = 'card_to_sign:' || :'r1' || ':' || :'pair_ad') = 2
  and exists (select 1 from public.player_notices where player_id = :'beto' and key = 'card_to_sign:' || :'r1' || ':' || :'pair_ad')
  and not exists (select 1 from public.player_notices where player_id in (:'ana', :'dani') and key = 'card_to_sign:' || :'r1' || ':' || :'pair_ad'),
  'a pair is never asked to sign its own card');
select harness.check(pg_temp.data_for(:m, 'ana', 'card_to_sign') = jsonb_build_object('tournament', 'Seed Torneo A', 'slug', (select slug from public.tournaments where id = :'t_a'), 'round', 1, 'group', 1),
  'it says the day and the group, and no one''s name');
select pg_temp.mark() as m \gset
select pg_temp.as_user(:'dev_beto', format('update public.scores set strokes = 5 where round_id = %L and player_id = %L and hole = 18 returning ''fixed''', :'r1', :'ana')) \g /dev/null
select harness.check(pg_temp.sent(:m) = '', 'a correction afterwards asks nobody again');

-- ---------------------------------------------------------------------------
-- 4. The snake: a tiebreak the group went on from (day 2 starts on the 10th)
-- ---------------------------------------------------------------------------
select pg_temp.mark() as m \gset
select pg_temp.hole(:'dev_a', :'r2', 10, jsonb_build_object(:'ana', 3, :'beto', 2, :'ceci', 3, :'dani', 2)) \g /dev/null
select harness.check(pg_temp.sent(:m) = '', 'two three-putts on the 10th: nothing yet, the phone that saved it asked and its answer comes next');
select pg_temp.hole(:'dev_a', :'r2', 11, jsonb_build_object(:'ana', 2, :'beto', 2, :'ceci', 2, :'dani', 2)) \g /dev/null
select pg_temp.sent(:m) as out \gset
select harness.check(:'out' = 'snake_tiebreak beto, snake_tiebreak ceci, snake_tiebreak dani', 'the group saves the 11th without an answer: the group hears it, not the phone that saved: ' || :'out');
select harness.check(pg_temp.data_for(:m, 'dani', 'snake_tiebreak') = jsonb_build_object('tournament', 'Seed Torneo A', 'slug', (select slug from public.tournaments where id = :'t_a'), 'round', 2, 'group', 1, 'hole', 10, 'game', 'La Víbora'),
  'it says the game, the day and the hole: ' || pg_temp.data_for(:m, 'dani', 'snake_tiebreak')::text);
select pg_temp.mark() as m \gset
select pg_temp.hole(:'dev_ceci', :'r2', 12, jsonb_build_object(:'ana', 2, :'beto', 2, :'ceci', 2, :'dani', 2)) \g /dev/null
select harness.check(pg_temp.sent(:m) = '', 'once: the 12th says nothing more');
select pg_temp.as_user(:'dev_beto', format('insert into public.snake_tiebreaks (round_id, group_id, hole, last_holed_player_id, decided_by) values (%L, %L, 10, %L, %L) returning ''answered''', :'r2', :'g2', :'ana', :'beto')) \g /dev/null
select pg_temp.hole(:'dev_dani', :'r2', 13, jsonb_build_object(:'ana', 2, :'beto', 3, :'ceci', 2, :'dani', 3)) \g /dev/null
select pg_temp.as_user(:'dev_dani', format('insert into public.snake_tiebreaks (round_id, group_id, hole, last_holed_player_id, decided_by) values (%L, %L, 13, %L, %L) returning ''answered''', :'r2', :'g2', :'dani', :'dani')) \g /dev/null
select pg_temp.hole(:'dev_dani', :'r2', 14, jsonb_build_object(:'ana', 2, :'beto', 2, :'ceci', 2, :'dani', 2)) \g /dev/null
select harness.check(pg_temp.sent(:m) = '', 'answered before the next hole, as the Tarjeta answers: nobody hears anything');
select pg_temp.hole(:'dev_a', :'r2', 15, jsonb_build_object(:'ana', 3, :'beto', 3, :'ceci', 2, :'dani', 2)) \g /dev/null
-- An answer naming someone who did not three-putt there (the engine reads it as no answer).
select pg_temp.as_user(:'dev_a', format('insert into public.snake_tiebreaks (round_id, group_id, hole, last_holed_player_id, decided_by) values (%L, %L, 15, %L, %L) returning ''answered''', :'r2', :'g2', :'ceci', :'ana')) \g /dev/null
select pg_temp.hole(:'dev_a', :'r2', 16, jsonb_build_object(:'ana', 2, :'beto', 2, :'ceci', 2, :'dani', 2)) \g /dev/null
select pg_temp.sent(:m) as out \gset
select harness.check(:'out' = 'snake_tiebreak beto, snake_tiebreak ceci, snake_tiebreak dani' and pg_temp.data_for(:m, 'beto', 'snake_tiebreak') ->> 'hole' = '15',
  'an answer that names neither of the two is no answer: the 15th waits, and the group hears it: ' || :'out');
update public.snake_tiebreaks set last_holed_player_id = :'ana' where round_id = :'r2' and group_id = :'g2' and hole = 15;
-- The group's order is 10 to 18, then 1 to 9: the 18th comes before the 2nd.
select pg_temp.mark() as m \gset
select pg_temp.hole(:'dev_a', :'r2', 2, jsonb_build_object(:'ana', 3, :'beto', 2, :'ceci', 2, :'dani', 3)) \g /dev/null
select pg_temp.hole(:'dev_a', :'r2', 18, jsonb_build_object(:'ana', 2, :'beto', 2, :'ceci', 2, :'dani', 2)) \g /dev/null
select harness.check(pg_temp.sent(:m) = '', 'a tie on the 2nd and then the 18th, which this group plays before it: nothing');
select pg_temp.hole(:'dev_a', :'r2', 3, jsonb_build_object(:'ana', 2, :'beto', 2, :'ceci', 2, :'dani', 2)) \g /dev/null
select harness.check(pg_temp.sent(:m) = 'snake_tiebreak beto, snake_tiebreak ceci, snake_tiebreak dani' and pg_temp.data_for(:m, 'ceci', 'snake_tiebreak') ->> 'hole' = '2',
  'the 3rd, which comes after it: the group hears about the 2nd');
insert into public.snake_tiebreaks (round_id, group_id, hole, last_holed_player_id, decided_by) values (:'r2', :'g2', 2, :'ana', :'ana');
-- The last hole of its order has no next hole: the card signed is the group going on.
select pg_temp.mark() as m \gset
select pg_temp.hole(:'dev_a', :'r2', 9, jsonb_build_object(:'ana', 2, :'beto', 3, :'ceci', 3, :'dani', 2)) \g /dev/null
select harness.check(pg_temp.sent(:m) = '', 'a tie on the 9th, this group''s last: nothing yet');
select pg_temp.as_user(:'dev_beto', format('insert into public.card_signatures (round_id, pair_id, signed_by) values (%L, %L, %L) returning ''signed''', :'r2', :'pair_ad', :'beto')) as out \gset
select harness.check(:'out' = 'signed' and pg_temp.sent(:m) = 'snake_tiebreak ana, snake_tiebreak ceci, snake_tiebreak dani' and pg_temp.data_for(:m, 'ana', 'snake_tiebreak') ->> 'hole' = '9',
  'Beto signs a card with it still open: the rest of the group hears about the 9th: ' || pg_temp.sent(:m));

-- ---------------------------------------------------------------------------
-- 5. Results: every player, the PIN ones too, once
-- ---------------------------------------------------------------------------
create function pg_temp.publish() returns void language sql as $$
  delete from public.tournament_results where tournament_id = current_setting('harness.t_a')::uuid;
  insert into public.tournament_results (tournament_id, player_id, rank, rank_label, field, points)
  select current_setting('harness.t_a')::uuid, p.id, x.rank, x.label, 4, 70 - x.rank
  from public.players p join (values ('Ana', 1, '1'), ('Beto', 2, 'T2'), ('Ceci', 2, 'T2'), ('Dani', 4, '4')) x(name, rank, label) on x.name = p.display_name
  where p.tournament_id = current_setting('harness.t_a')::uuid;
$$;
select set_config('harness.t_a', :'t_a', true) \g /dev/null
select pg_temp.mark() as m \gset
select pg_temp.publish() \g /dev/null
select pg_temp.sent(:m) as out \gset
select harness.check(:'out' = 'results ana, results beto, results ceci, results dani' and pg_temp.data_for(:m, 'ceci', 'results') ->> 'rankLabel' = 'T2'
  and (pg_temp.data_for(:m, 'ceci', 'results') ->> 'field')::int = 4,
  'results published: each PIN phone hears its own place: ' || :'out');
select pg_temp.mark() as m \gset
select pg_temp.publish() \g /dev/null
select harness.check(pg_temp.sent(:m) = '', 'published again: nobody hears it twice');

-- ---------------------------------------------------------------------------
-- 6. A player whose profile is his hears it in his account, and the same browser once
-- ---------------------------------------------------------------------------
insert into public.profiles (id, handle, display_name) values (:'acct', 'cecialfa', 'Ceci');
update public.players set profile_id = :'acct', profile_status = 'confirmed' where id = :'ceci';
-- The account's two browsers, one of them the phone that also holds Ceci by PIN.
insert into public.push_subscriptions (profile_id, endpoint, p256dh, auth) values (:'acct', 'https://push.test/acct', 'k', 'a'), (:'acct', 'https://push.test/ceci', 'k', 'a');
insert into public.rounds (tournament_id, number, holes) values (:'t_a', 3, 9) returning id as r3 \gset
insert into public.groups (round_id, number, start_hole) values (:'r3', 1, 1) returning id as g3 \gset
insert into public.group_members (group_id, player_id) values (:'g3', :'ana'), (:'g3', :'beto'), (:'g3', :'ceci'), (:'g3', :'dani');
select pg_temp.mark() as m \gset
update public.rounds set status = 'live' where id = :'r3';
select pg_temp.sent(:m) as out \gset
select harness.check(:'out' = 'acct:round_live acct, acct:round_live ceci, round_live ana, round_live beto, round_live dani',
  'Ceci''s account hears day 3 on both its browsers; the one that is also her PIN phone hears it once: ' || :'out');
select harness.check(exists (select 1 from public.notifications where profile_id = :'acct' and kind = 'round_live' and key = 'round_live:' || :'r3'),
  'and it is in her inbox, with the same words (src/lib/noticeText.ts)');

-- ---------------------------------------------------------------------------
-- 7. A tournament without the pairs game or the snake asks for neither
-- ---------------------------------------------------------------------------
update public.tournaments set settings = jsonb_set(jsonb_set(settings, '{modules,pairs,enabled}', 'false'), '{modules,snake,enabled}', 'false') where id = :'t_a';
select pg_temp.mark() as m \gset
insert into public.scores (round_id, player_id, hole, strokes, putts, picked_up)
select :'r3', p, h, 4, case when h = 1 and p in (:'ana', :'beto') then 3 else 2 end, false from unnest(array[:'ana', :'beto', :'ceci', :'dani']::uuid[]) p, generate_series(1, 8) h;
select pg_temp.hole(:'dev_dani', :'r3', 9, jsonb_build_object(:'ana', 2, :'beto', 2, :'ceci', 2, :'dani', 2)) \g /dev/null
select harness.check(pg_temp.sent(:m) = '' and not exists (select 1 from public.player_notices where key like '%' || :'r3' || '%' and kind <> 'round_live'),
  'day 3 complete with a tie on the 1st, both games off: no card to sign, no snake');
update public.tournaments set settings = jsonb_set(jsonb_set(settings, '{modules,pairs,enabled}', 'true'), '{modules,snake,enabled}', 'true') where id = :'t_a';

-- ---------------------------------------------------------------------------
-- 8. A restore brings back what was: nobody hears it as news
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
select pg_temp.backup(:'t_a')::text as bk \gset
-- As if every event before had happened before 0051: nothing on record, day 1 closed since the backup.
delete from public.player_notices where tournament_id = :'t_a';
update public.rounds set status = 'finished' where id = :'r1';
select pg_temp.mark() as m \gset
select pg_temp.as_user(:'org_a', format('select public.restore_tournament(%L, %L::jsonb)::text', :'t_a', :'bk')) as out \gset
select harness.check(:'out' like '{%' and (select status from public.rounds where id = :'r1') = 'live' and pg_temp.sent(:m) = ''
  and not exists (select 1 from public.player_notices where tournament_id = :'t_a'),
  'the backup''s day 1 comes back live, its whole cards unsigned, its snake open: no notice at all: ' || pg_temp.sent(:m));
select harness.check(coalesce(current_setting('cardi.restore', true), '') = '', 'and the restore leaves its quiet behind: the next change is news again');

-- ---------------------------------------------------------------------------
-- 9. When the phone stops holding the player, its address goes
-- ---------------------------------------------------------------------------
-- Eva, on a phone of her own, before anything else happens to her.
select pg_temp.as_user(:'org_a', format($q$insert into public.players (tournament_id, full_name, display_name, sort_order) values (%L, 'Eva Alfa', 'Eva', 4) returning id::text$q$, :'t_a')) as eva \gset
select pg_temp.as_user(:'org_a', format('select public.set_player_pin(%L, %L)::text', :'eva', '1234')) \g /dev/null
select pg_temp.as_user(:'dev_eva', format('select public.claim_player(%L, %L)::text', :'eva', '1234')) \g /dev/null
select pg_temp.subscribe(:'dev_eva', :'t_a', 'eva') as out \gset
select harness.check(:'out' = '' and pg_temp.on_(:'dev_eva', :'t_a', 'eva'), 'Eva''s phone turns them on');
-- «Cambiar de jugador»
select pg_temp.as_user(:'dev_ceci', 'select public.release_device()::text') \g /dev/null
select harness.check(not exists (select 1 from public.pin_push_subscriptions where endpoint = 'https://push.test/ceci'), '«Cambiar de jugador» on Ceci''s phone: its address is gone');
-- Another player's PIN on the same phone
select pg_temp.as_user(:'dev_dani', format('select public.claim_player(%L, %L)::text', :'beto', '1234')) as out \gset
select harness.check(:'out'::jsonb ->> 'ok' = 'true' and not exists (select 1 from public.pin_push_subscriptions where endpoint = 'https://push.test/dani')
  and not pg_temp.on_(:'dev_dani', :'t_a', 'dani'),
  'Dani''s phone takes Beto: its address for Dani is gone, and it hears Beto only once it turns them on again');
-- The Comité takes a phone off
select id as c_beto from public.pin_claims where player_id = :'beto' and auth_user_id = :'dev_beto' and released_at is null \gset
select pg_temp.as_user(:'org_a', format('select public.release_pin_claim(%s, %L)::text', :'c_beto', 'No es el teléfono de Beto')) \g /dev/null
select harness.check(not exists (select 1 from public.pin_push_subscriptions where endpoint = 'https://push.test/beto'), 'the Comité takes Beto''s phone off: its address is gone');
-- The player deleted
select pg_temp.as_user(:'org_a', format('delete from public.players where id = %L returning ''gone''', :'eva')) \g /dev/null
select harness.check(not exists (select 1 from public.pin_push_subscriptions where endpoint = 'https://push.test/eva'), 'Eva deleted: her phone''s address is gone');
-- What is left hears the next day, and only that
insert into public.rounds (tournament_id, number, holes) values (:'t_a', 4, 18) returning id as r4 \gset
select pg_temp.mark() as m \gset
update public.rounds set status = 'live' where id = :'r4';
select pg_temp.sent(:m) as out \gset
select harness.check(:'out' = 'acct:round_live acct, acct:round_live ceci, round_live ana',
  'day 4 (no groups yet: the whole tournament): Ana''s phone and Ceci''s account; no released, moved, taken-off or deleted phone: ' || :'out');
-- The account deleted (the phone's anonymous user)
delete from auth.users where id = :'dev_a';
select harness.check(not exists (select 1 from public.pin_push_subscriptions where endpoint = 'https://push.test/ana'), 'Ana''s phone''s user deleted: its address is gone');
select harness.check((select string_agg(replace(endpoint, 'https://push.test/', ''), ',') from public.pin_push_subscriptions) = 'carla', 'only Carla''s, in tournament B, is left');

-- ---------------------------------------------------------------------------
-- 10. A dead address comes back from the route and goes, with the secret only
-- ---------------------------------------------------------------------------
-- As the route calls it: the anon key, no session.
create function pg_temp.as_anon(q text) returns text language plpgsql as $$
declare
  r text;
begin
  perform set_config('request.jwt.claims', '', true);
  set local role anon;
  execute q into r;
  reset role;
  return coalesce(r, 'null');
exception when others then
  reset role;
  return sqlstate || ' ' || sqlerrm;
end $$;
select pg_temp.as_anon($q$select public.push_prune('nope', array['https://push.test/carla'])::text$q$) as out \gset
select harness.check(:'out' = '42501 No autorizado' and exists (select 1 from public.pin_push_subscriptions where endpoint = 'https://push.test/carla'), 'a wrong secret prunes nothing: ' || :'out');
select pg_temp.as_anon($q$select public.push_prune('harness-dispatch-secret', array['https://push.test/carla', 'https://push.test/acct'])::text$q$) as pruned \gset
select harness.check(:'pruned' = '2' and not exists (select 1 from public.pin_push_subscriptions) and not exists (select 1 from public.push_subscriptions where endpoint = 'https://push.test/acct'),
  'push_prune with the secret clears a PIN phone''s dead address and an account''s: ' || :'pruned');

-- ---------------------------------------------------------------------------
-- 11. No notice carries an amount, or anyone's name
-- ---------------------------------------------------------------------------
select harness.check(not exists (
    select 1 from net.harness_requests q cross join lateral jsonb_object_keys(q.body -> 'notice' -> 'data') k
    where q.body -> 'notice' ->> 'kind' in ('round_live', 'card_to_sign', 'snake_tiebreak', 'results')
      and k not in ('tournament', 'slug', 'round', 'group', 'startHole', 'teeTime', 'hole', 'game', 'rankLabel', 'field')
  ) and (select count(*) from net.harness_requests where body -> 'notice' ->> 'kind' in ('round_live', 'card_to_sign', 'snake_tiebreak', 'results')) > 10
  and not exists (select 1 from net.harness_requests q where q.body::text ~ '(Ana|Beto|Ceci|Dani|Carla|Eva) Alfa'),
  'every tournament notice says only the tournament, the day, the group, the hole, the game and a place');

rollback;
