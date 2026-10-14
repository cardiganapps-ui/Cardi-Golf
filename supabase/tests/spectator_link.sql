-- STRAT-05 (0053): a link to watch a tournament without a PIN. On the
-- two-tenant seed: org_a runs tournament A (Ana, Beto), org_b runs B (Carla,
-- Dani), dev_a is Ana's phone (a player of A, not the Comité), dev_x is a
-- phone in no tournament. The Comité makes the link; whoever has its token
-- reads the boards with no session (anon), and nothing private comes with
-- them: no PIN, no account, no profile, no full name, photo or form guide, no
-- join code or slug, no handicap note, none of the Comité's free text beyond
-- names, no money «Sin dinero», and never another tournament's rows. Rolled
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
select id as t_b from harness.seed where key = 'tournament_b' \gset
select id as ana from harness.seed where key = 'player_a1' \gset
select id as beto from harness.seed where key = 'player_a2' \gset
select id as r1 from harness.seed where key = 'round_a1' \gset
select slug as slug_a, join_code as code_a from public.tournaments where id = :'t_a' \gset
begin;

-- A statement as a user of the app (or as anon, `uid` null): its answer, or the SQLSTATE and the message.
create function pg_temp.as_user(uid uuid, q text) returns text language plpgsql as $$
declare
  r text;
begin
  if uid is null then
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    set local role anon;
  else
    perform set_config('request.jwt.claims', harness.claims(uid), true);
    set local role authenticated;
  end if;
  execute q into r;
  reset role;
  return coalesce(r, 'null');
exception when others then
  reset role;
  return sqlstate || ' ' || sqlerrm;
end $$;
-- The boards for a token, as a browser with no session asks for them.
create function pg_temp.board(token text, seen text default null) returns text language sql as $$
  select pg_temp.as_user(null, format('select public.spectator_board(%L, %L)::text', token, seen))
$$;
-- The link as a Comité screen saw it (what a save sends as `p_seen`), from spectator_link's answer: null for none.
create function pg_temp.seen(link text) returns text language sql as $$
  select case when link is null or link = 'null' then 'null' else jsonb_build_object('token', link::jsonb -> 'token', 'money', link::jsonb -> 'money')::text end
$$;
-- Every key at any depth of a JSON value.
create function pg_temp.keys(j jsonb) returns setof text language sql as $$
  select distinct e.key from jsonb_path_query(j, 'strict $.**') v, jsonb_each(case when jsonb_typeof(v) = 'object' then v else '{}'::jsonb end) e
$$;
-- An object's keys, in byte order, comma-separated.
create function pg_temp.top_keys(j jsonb) returns text language sql as $$
  select coalesce(string_agg(k, ',' order by k collate "C"), '') from jsonb_object_keys(j) k
$$;
-- The keys the rows of one table in the answer carry, together.
create function pg_temp.row_keys(answer jsonb, tbl text) returns text language sql as $$
  select coalesce(string_agg(k, ',' order by k collate "C"), '')
  from (select distinct k from jsonb_array_elements(coalesce(answer -> tbl, '[]'::jsonb)) r, jsonb_object_keys(r) k) x
$$;

-- What A holds besides the seed: a live day, two holes, a course, a correction with its reason, money with
-- its note and reason, a Calcutta lot and bid, a custom bet with its description, and Ana's photo, form guide
-- and handicap note.
update public.rounds set status = 'live' where id = :'r1';
insert into public.courses (name) values ('Campo Espectador') returning id as course \gset
insert into public.tees (course_id, name, rating, slope, par_total) values (:'course', 'Blancas', 72.0, 113, 72) returning id as tee \gset
insert into public.holes (tee_id, number, par, stroke_index) select :'tee', n, 4, n from generate_series(1, 18) n;
update public.rounds set course_id = :'course' where id = :'r1';
select set_config('cardi.handicap_lock', '1', true) \g /dev/null
update public.players set avatar_url = 'https://x.test/foto-ana.jpg', form_guide = 'formaprivada', handicap_note = '{"from":{"handicap_source":"manual","base_hcp":18},"changes":[{"at":"2026-10-13T10:00:00Z","reason":"notadehandicap","to":{"handicap_source":"manual","base_hcp":16}}]}' where id = :'ana';
select set_config('cardi.handicap_lock', '', true) \g /dev/null
select harness.check((select handicap_note is not null from public.players where id = :'ana'), 'Ana carries a handicap note to keep out');
insert into public.scores (round_id, player_id, hole, strokes, putts, picked_up, entered_by, reason) values
  (:'r1', :'ana', 1, 5, 2, false, :'ana', 'correccionprivada'), (:'r1', :'beto', 1, 4, 2, false, :'ana', null);
insert into public.handicap_overrides (round_id, player_id, playing_hcp, reason, by) values (:'r1', :'beto', 12, 'motivoprivado', :'ana');
update public.tournaments set banker_player_id = :'beto', settings = jsonb_set(settings, '{games}',
  '[{"id":"skins","type":"skins","label":"Skins","enabled":true,"rounds":"all","entrants":"all","options":{"basis":"net","carryOver":true},"money":{"source":"side","buyIn":4111,"amount":0,"stake":0,"split":[100]}},
    {"id":"tacos","type":"custom","label":"Tacos","enabled":true,"rounds":"all","entrants":"all","options":{"description":"apuestaprivada"},"money":{"source":"direct","buyIn":0,"amount":0,"stake":4222,"split":[100]}}]')
  where id = :'t_a';
-- Ana bought into the skins side pot and Beto plays the bet: who is in a side pot is who paid into it.
insert into public.game_entries (tournament_id, game_id, player_id) values (:'t_a', 'skins', :'ana'), (:'t_a', 'tacos', :'beto');
insert into public.game_results (tournament_id, game_id, player_id, share) values (:'t_a', 'skins', :'ana', 1), (:'t_a', 'tacos', :'beto', 1);
insert into public.hole_awards (round_id, group_id, hole, game_id, player_id) values (:'r1', null, 3, 'skins', :'ana'), (:'r1', null, 3, 'tacos', :'beto');
insert into public.payments (tournament_id, from_player_id, to_player_id, amount, kind, paid, note) values (:'t_a', :'ana', null, 4321, 'entry', true, 'notaprivada');
insert into public.calcutta_lots (tournament_id, player_id, lot_number, status, price, owner_id, sold_at) values (:'t_a', :'beto', 1, 'sold', 7770, :'ana', now()) returning id as lot \gset
insert into public.calcutta_bids (lot_id, bidder_id, amount) values (:'lot', :'ana', 7770);
insert into public.money_adjustments (tournament_id, source_key, kind, to_player_id, amount, reason, created_by) values (:'t_a', 'pool', 'award', :'ana', 6543, 'razonprivada', :'org_a');

-- 1. Only the Comité makes the link, reads it, changes it or turns it off
select pg_temp.as_user(:'dev_a', format('select public.save_spectator_link(%L, false, null)::text', :'t_a')) as out \gset
select harness.check(:'out' like '42501 Solo el Comité cambia el enlace para ver%', 'a player''s phone does not make the link: ' || :'out');
select pg_temp.as_user(:'org_b', format('select public.save_spectator_link(%L, false, null)::text', :'t_a')) as out \gset
select harness.check(:'out' like '42501%', 'nor another tournament''s Comité: ' || :'out');
select pg_temp.as_user(null, format('select public.save_spectator_link(%L, false, null)::text', :'t_a')) as out \gset
select harness.check(:'out' like '42501%', 'nor anyone without a session: ' || :'out');
select harness.check(not exists (select 1 from public.spectator_links where tournament_id = :'t_a'), 'so A has no link yet');
select pg_temp.as_user(:'org_a', format('select public.save_spectator_link(%L, null, null)::text', :'t_a')) as out \gset
select harness.check(:'out' = '22023 Falta decir si el enlace muestra el dinero', 'the Comité says whether it shows money: ' || :'out');
select pg_temp.as_user(:'org_a', format('select public.save_spectator_link(%L, false, null)::text', :'t_a')) as link \gset
select :'link'::jsonb ->> 'token' as tok \gset
select harness.check(:'tok' ~ '^[A-Za-z0-9_-]{24}$' and (:'link'::jsonb ->> 'money')::boolean = false and :'link'::jsonb -> 'rotatedAt' = 'null'::jsonb,
  'the Comité makes it: 24 URL-safe characters, «Sin dinero»: ' || :'link');
select harness.check(length(decode(translate(:'tok', '-_', '+/'), 'base64')) = 18, 'its token is 18 random bytes (144 bits)');
select pg_temp.as_user(:'org_a', format('select public.spectator_link(%L)::text', :'t_a')) as out \gset
select harness.check(:'out'::jsonb ->> 'token' = :'tok', 'the Comité reads it back');

-- 1b. A save made against a link that is not the one stored any more is refused whole, and writes nothing
select count(*) as audits from public.audit_log where table_name = 'spectator_links' \gset
-- The verifier's case: a second Comité phone whose card still shows no link taps «Crear» with «Con dinero».
select pg_temp.as_user(:'org_a', format('select public.save_spectator_link(%L, true, null)::text', :'t_a')) as out \gset
select harness.check(:'out' = '22023 El enlace para ver cambió en otro teléfono mientras lo veías: revisa cómo quedó y vuelve a elegir',
  'a stale «Crear» over a link already made is refused: ' || :'out');
-- The same token, the money flipped: a phone that still shows «Con dinero» taps «Cambiar enlace» (which keeps the money it shows).
select pg_temp.as_user(:'org_a', format('select public.save_spectator_link(%L, true, %L, true)::text', :'t_a', jsonb_build_object('token', :'tok', 'money', true))) as out \gset
select harness.check(:'out' like '22023 El enlace para ver cambió en otro teléfono%', 'the same token with another money choice is refused: ' || :'out');
select pg_temp.as_user(:'org_a', format('select public.save_spectator_link(%L, true, %L)::text', :'t_a', jsonb_build_object('token', repeat('Z', 24), 'money', false))) as out \gset
select harness.check(:'out' like '22023 El enlace para ver cambió en otro teléfono%', 'and so is another token than the one stored: ' || :'out');
select harness.check((select token = :'tok' and not money and rotated_at is null from public.spectator_links where tournament_id = :'t_a')
    and (select count(*) from public.audit_log where table_name = 'spectator_links') = :'audits'::int,
  'none of them changed the link or wrote a line of history: it is still «Sin dinero», with its token');
select pg_temp.as_user(:'org_a', format('select public.save_spectator_link(%L, true, %L)::text', :'t_a', '"cualquiera"')) as out \gset
select harness.check(:'out' = '22023 No pudimos leer cómo estaba el enlace para ver; vuelve a abrirlo', 'a seen link that is not one is refused: ' || :'out');
select pg_temp.as_user(:'org_a', format('select public.save_spectator_link(%L, true, %L)::text', :'t_a', jsonb_build_object('token', :'tok'))) as out \gset
select harness.check(:'out' like '22023 No pudimos leer%', 'nor one without its money: ' || :'out');
select pg_temp.as_user(:'org_a', format('select public.save_spectator_link(%L, false, %L)::text', :'t_a', pg_temp.seen(:'link'))) as out \gset
select harness.check(:'out'::jsonb ->> 'token' = :'tok' and (select count(*) from public.audit_log where table_name = 'spectator_links') = :'audits'::int,
  'the link as stored passes, and a save that changes nothing writes nothing: ' || :'out');
select pg_temp.as_user(:'dev_a', format('select public.spectator_link(%L)::text', :'t_a')) as out \gset
select harness.check(:'out' like '42501 Solo el Comité ve el enlace para ver%', 'a player''s phone does not read it: ' || :'out');
select pg_temp.as_user(:'org_b', format('select public.spectator_link(%L)::text', :'t_a')) as out \gset
select harness.check(:'out' like '42501%', 'nor another tournament''s Comité: ' || :'out');
select pg_temp.as_user(:'dev_a', 'select count(*)::text from public.spectator_links') as out \gset
select harness.check(:'out' like '42501%', 'nobody reads the table directly: ' || :'out');
select pg_temp.as_user(null, 'select count(*)::text from public.spectator_links') as out \gset
select harness.check(:'out' like '42501%', 'not without a session either: ' || :'out');
select pg_temp.as_user(:'org_a', format('insert into public.spectator_links (tournament_id, token) values (%L, %L) returning 1', :'t_b', repeat('a', 24))) as out \gset
select harness.check(:'out' like '42501%', 'nor writes it: ' || :'out');
select harness.check((select bool_and(not has_function_privilege(r, f, 'execute'))
    from unnest(array['anon', 'authenticated']) r,
         unnest(array['public.new_spectator_token()', 'public.spectator_settings(jsonb, boolean)', 'public.spectator_settings_spec()', 'public.spectator_settings_legacy(jsonb)', 'public.spectator_pick(jsonb, jsonb)', 'public.spectator_side_pot(jsonb)', 'public.spectator_links_audit()', 'public.spectator_link_json(public.spectator_links)']) f),
  'its internal functions are nobody''s to call');
select harness.check(has_function_privilege('anon', 'public.spectator_board(text, text)', 'execute')
    and not has_function_privilege('anon', 'public.spectator_link(uuid)', 'execute')
    and not has_function_privilege('anon', 'public.save_spectator_link(uuid, boolean, jsonb, boolean)', 'execute')
    and not exists (select 1 from pg_proc where proname = 'save_spectator_link' and pronargs <> 4)
    and not has_function_privilege('anon', 'public.delete_spectator_link(uuid)', 'execute'),
  'without a session only the boards answer');

-- 2. Whoever has the token reads A's boards with no session
select pg_temp.board(:'tok') as b \gset
select harness.check(:'b'::jsonb ->> 'version' ~ '^[0-9a-f]{32}$' and (:'b'::jsonb -> 'money')::boolean = false
  and (select count(*) from jsonb_array_elements(:'b'::jsonb -> 'players')) = 2
  and (select count(*) from jsonb_array_elements(:'b'::jsonb -> 'scores')) = 2
  and :'b'::jsonb -> 'tournament' ->> 'name' = 'Seed Torneo A',
  'anon reads A: its name, its two players and its two holes');
select harness.check(pg_temp.top_keys(:'b'::jsonb) =
    'card_signatures,courses,game_entries,game_results,group_members,groups,handicap_overrides,hole_awards,holes,money,pairs,players,round_tees,rounds,scores,snake_tiebreaks,team_members,teams,tees,tournament,version',
  'without money: these tables and nothing else (no payments, decisions, lots, bids or buybacks): ' || pg_temp.top_keys(:'b'::jsonb));
-- Column by column, what each table's rows carry.
select harness.check(pg_temp.row_keys(:'b'::jsonb, 'players') = 'base_hcp,default_tee_id,display_name,estimate_inputs,handicap_index,handicap_source,id,is_honoree,sort_order,tier',
  'a player is his short name, tier, handicap and order: ' || pg_temp.row_keys(:'b'::jsonb, 'players'));
select harness.check(pg_temp.row_keys(:'b'::jsonb, 'scores') = 'hole,picked_up,player_id,putts,round_id,strokes,updated_at',
  'a hole is its strokes, putts and pick-up, never who entered it or a correction''s reason: ' || pg_temp.row_keys(:'b'::jsonb, 'scores'));
select harness.check(pg_temp.row_keys(:'b'::jsonb, 'handicap_overrides') = 'at,player_id,playing_hcp,round_id',
  'a playing handicap the Comité set, without its reason or who: ' || pg_temp.row_keys(:'b'::jsonb, 'handicap_overrides'));
select harness.check(pg_temp.top_keys(:'b'::jsonb -> 'tournament') = 'accent_color,currency,current_round_id,logo_url,name,settings,status,tagline,timezone',
  'the tournament is its brand, status and settings: no id, slug, join code, banker, creator or crew: ' || pg_temp.top_keys(:'b'::jsonb -> 'tournament'));
select harness.check(pg_temp.row_keys(:'b'::jsonb, 'rounds') = 'course_id,date,holes,id,number,status'
  and pg_temp.row_keys(:'b'::jsonb, 'groups') = 'id,number,round_id,start_hole,tee_time'
  and pg_temp.row_keys(:'b'::jsonb, 'group_members') = 'group_id,player_id',
  'a day, a group and who plays in it, as the boards read them');
select harness.check(pg_temp.row_keys(:'b'::jsonb, 'courses') = 'id,name' and pg_temp.row_keys(:'b'::jsonb, 'tees') = 'color,course_id,id,name,rating,slope,sort_order'
  and (select count(*) from jsonb_array_elements(:'b'::jsonb -> 'holes')) = 18,
  'the course it plays, its tee and its 18 holes, without who loaded it');
-- Nothing private, at any depth, by key and by value.
select harness.check(not exists (select 1 from pg_temp.keys(:'b'::jsonb) k where k = any (array[
    'pin_hash', 'pin', 'profile_id', 'profile_status', 'full_name', 'avatar_url', 'form_guide', 'handicap_note', 'is_admin',
    'auth_user_id', 'device_id', 'mutation_id', 'client_ts', 'entered_by', 'decided_by', 'reason', 'note', 'created_by',
    'void_reason', 'voided_by', 'join_code', 'slug', 'crew_id', 'banker_player_id', 'id_tournament', 'tournament_id', 'token'])),
  'no PIN, account, profile, full name, photo, form guide, note, reason, join code, slug or token, at any depth: ' || (select string_agg(k, ',') from pg_temp.keys(:'b'::jsonb) k));
select harness.check(position('Alfa' in :'b') = 0 and position('foto-ana' in :'b') = 0 and position('formaprivada' in :'b') = 0
  and position('notadehandicap' in :'b') = 0 and position('correccionprivada' in :'b') = 0 and position('motivoprivado' in :'b') = 0
  and position('apuestaprivada' in :'b') = 0,
  'Ana''s full name, photo, form guide and handicap note, a correction''s reason, an override''s and a bet''s description are nowhere in it');
select harness.check(position(:'slug_a' in :'b') = 0 and position(:'code_a' in :'b') = 0 and position(:'t_a' in :'b') = 0,
  'nor A''s slug, join code or id: the link leads to nothing but the boards');
select harness.check(position(:'dev_a' in :'b') = 0 and position(:'org_a' in :'b') = 0 and position('$2' in :'b') = 0,
  'nor any account id, nor a PIN''s hash');
-- 3. «Sin dinero»: not a peso
select harness.check(position('4321' in :'b') = 0 and position('7770' in :'b') = 0 and position('6543' in :'b') = 0 and position('4111' in :'b') = 0
  and position('4222' in :'b') = 0 and position('notaprivada' in :'b') = 0 and position('razonprivada' in :'b') = 0,
  'no payment, lot price, bid, decision, buy-in or stake in it');
select :'b'::jsonb -> 'tournament' -> 'settings' as s \gset
select harness.check((:'s'::jsonb ->> 'entryFee')::int = 0 and (:'s'::jsonb ->> 'houseCut')::int = 0
  and :'s'::jsonb -> 'prizes' = '{"pairs": [], "stableford": [], "fewestPutts": 0, "stablefordMode": "amount", "bestRoundPerDay": 0, "snakePerSurvivor": 0}'::jsonb
  and (:'s'::jsonb -> 'modules' -> 'auction' ->> 'enabled')::boolean = false
  and jsonb_array_length(:'s'::jsonb -> 'games') = 1
  and :'s'::jsonb -> 'games' -> 0 -> 'money' = '{"stake": 0, "split": [100], "buyIn": 0, "amount": 0, "source": "none"}'::jsonb
  and :'s'::jsonb -> 'games' -> 0 ->> 'label' = 'Tacos' and :'s'::jsonb -> 'games' -> 0 -> 'options' = '{"description": ""}'::jsonb
  and :'s'::jsonb -> 'modules' -> 'individual' ->> 'label' = 'Individual' and (:'s'::jsonb -> 'handicap' ->> 'allowance')::numeric = 0.8,
  'its settings: every peso at zero, the Calcutta off, the side pot left out, the bet for fun and without its description, the rest as the Comité set it: ' || :'s');
select harness.check((select string_agg(e ->> 'game_id', ',') from jsonb_array_elements(:'b'::jsonb -> 'game_entries') e) = 'tacos'
  and (select string_agg(e ->> 'game_id', ',') from jsonb_array_elements(:'b'::jsonb -> 'game_results') e) = 'tacos'
  and (select string_agg(e ->> 'game_id', ',') from jsonb_array_elements(:'b'::jsonb -> 'hole_awards') e) = 'tacos'
  and position('skins' in :'b') = 0 and position('Skins' in :'b') = 0,
  'and who is in the side pot (who paid into it), its claims and its results stay out with it: ' || (:'b'::jsonb -> 'game_entries')::text);
select harness.check(not exists (select 1 from pg_temp.keys(:'b'::jsonb -> 'tournament' -> 'settings') k where k = 'matrimonios'), 'a legacy prize key does not slip through either');

-- 4. «Con dinero»: the money, never its notes or reasons
select pg_temp.as_user(:'org_a', format('select public.save_spectator_link(%L, true, %L)::text', :'t_a', jsonb_build_object('token', :'tok', 'money', false))) as link \gset
select harness.check(:'link'::jsonb ->> 'token' = :'tok' and (:'link'::jsonb ->> 'money')::boolean, 'money on keeps the token: ' || :'link');
select pg_temp.board(:'tok') as m \gset
select harness.check(pg_temp.top_keys(:'m'::jsonb) =
    'calcutta_bids,calcutta_buybacks,calcutta_lots,card_signatures,courses,game_entries,game_results,group_members,groups,handicap_overrides,hole_awards,holes,money,money_adjustments,pairs,payments,players,round_tees,rounds,scores,snake_tiebreaks,team_members,teams,tees,tournament,version',
  'with money: the payments, the decisions and the Calcutta come too: ' || pg_temp.top_keys(:'m'::jsonb));
select harness.check(jsonb_array_length(:'m'::jsonb -> 'game_entries') = 2 and jsonb_array_length(:'m'::jsonb -> 'game_results') = 2
  and jsonb_array_length(:'m'::jsonb -> 'hole_awards') = 2 and :'m'::jsonb -> 'tournament' -> 'settings' -> 'games' -> 0 ->> 'id' = 'skins',
  'and the side pot, with who is in it, its claims and results');
select harness.check(pg_temp.row_keys(:'m'::jsonb, 'players') = pg_temp.row_keys(:'b'::jsonb, 'players') and pg_temp.row_keys(:'m'::jsonb, 'scores') = pg_temp.row_keys(:'b'::jsonb, 'scores'),
  'and the players and holes carry no more than without it');
select harness.check(position('4321' in :'m') > 0 and position('7770' in :'m') > 0 and position('6543' in :'m') > 0
  and (:'m'::jsonb -> 'tournament' ->> 'banker_player_id') = :'beto'
  and (:'m'::jsonb -> 'tournament' -> 'settings' ->> 'entryFee')::int = 500
  and (:'m'::jsonb -> 'tournament' -> 'settings' -> 'games' -> 0 -> 'money' ->> 'buyIn')::int = 4111
  and (:'m'::jsonb -> 'tournament' -> 'settings' -> 'games' -> 1 -> 'money' ->> 'stake')::int = 4222
  and (:'m'::jsonb -> 'tournament' -> 'settings') - 'games' = (select settings - 'games' from public.tournaments where id = :'t_a'),
  'the payment, the lot''s price and bid, the decision, the banker and the settings as stored');
select harness.check(:'m'::jsonb -> 'tournament' -> 'settings' -> 'games' -> 1 -> 'options' = '{"description": ""}'::jsonb
  and :'m'::jsonb -> 'tournament' -> 'settings' -> 'games' -> 0 = (select settings -> 'games' -> 0 from public.tournaments where id = :'t_a')
  and position('apuestaprivada' in :'m') = 0,
  'but for a custom bet''s description, the Comité''s free text: with money too it stays with the members');
select harness.check(pg_temp.row_keys(:'m'::jsonb, 'payments') = 'amount,from_player_id,id,kind,paid,to_player_id'
  and pg_temp.row_keys(:'m'::jsonb, 'money_adjustments') = 'amount,call_id,created_at,id,kind,source_key,to_player_id,voided_at'
  and pg_temp.row_keys(:'m'::jsonb, 'calcutta_lots') = 'id,lot_number,owner_id,player_id,price,sold_at,status'
  and pg_temp.row_keys(:'m'::jsonb, 'calcutta_bids') = 'amount,bidder_id,created_at,id,lot_id',
  'a payment without its note, a decision without its reasons or who wrote it');
select harness.check(position('notaprivada' in :'m') = 0 and position('razonprivada' in :'m') = 0 and position(:'org_a' in :'m') = 0
  and position('Alfa' in :'m') = 0 and position('foto-ana' in :'m') = 0,
  'the Comité''s free text and accounts stay out with money too, and so do full names and photos');
select pg_temp.as_user(:'org_a', format('select public.save_spectator_link(%L, false, %L)::text', :'t_a', jsonb_build_object('token', :'tok', 'money', true))) \g /dev/null
select harness.check(position('4321' in pg_temp.board(:'tok')) = 0, 'money off: the payment is gone again at once');

-- 5. Nothing changed: the version alone
select pg_temp.board(:'tok') as b \gset
select :'b'::jsonb ->> 'version' as v \gset
select pg_temp.board(:'tok', :'v') as same \gset
select harness.check(:'same'::jsonb = jsonb_build_object('version', :'v', 'same', true), 'the version it holds: the answer is that version alone: ' || :'same');
update public.scores set strokes = 6 where round_id = :'r1' and player_id = :'ana' and hole = 1;
select pg_temp.board(:'tok', :'v') as moved \gset
select harness.check(:'moved'::jsonb ->> 'version' <> :'v' and not (:'moved'::jsonb ? 'same')
  and (select (s ->> 'strokes')::int from jsonb_array_elements(:'moved'::jsonb -> 'scores') s where s ->> 'player_id' = :'ana') = 6,
  'a hole changed: a new version, with the hole as it is now');
select pg_temp.board(:'tok', 'not-a-version') as other \gset
select harness.check(:'other'::jsonb ->> 'version' = :'moved'::jsonb ->> 'version' and :'other'::jsonb ? 'players', 'any other version gets the whole boards');

-- 6. A wrong, changed or switched-off token answers like none: null
select harness.check(pg_temp.board(repeat('A', 24)) = 'null' and pg_temp.board('') = 'null' and pg_temp.board('corto') = 'null'
  and pg_temp.board(left(:'tok', 23) || ' ') = 'null' and pg_temp.board(:'tok' || 'x') = 'null' and pg_temp.board(''' or 1=1 --') = 'null'
  and pg_temp.as_user(null, 'select public.spectator_board(null)::text') = 'null',
  'a token that is not one, or not of any tournament, answers null');
select pg_temp.as_user(:'org_a', format('select public.save_spectator_link(%L, false, %L, true)::text', :'t_a', jsonb_build_object('token', :'tok', 'money', false))) as link \gset
select :'link'::jsonb ->> 'token' as tok2 \gset
select harness.check(:'tok2' <> :'tok' and :'tok2' ~ '^[A-Za-z0-9_-]{24}$' and :'link'::jsonb ->> 'rotatedAt' is not null and (:'link'::jsonb ->> 'money')::boolean = false,
  '«Cambiar enlace»: a new token, the money as it was: ' || :'link');
select harness.check(pg_temp.board(:'tok') = 'null', 'the old token stops at once, and answers like one that never was');
select harness.check(pg_temp.board(:'tok2')::jsonb -> 'tournament' ->> 'name' = 'Seed Torneo A', 'the new one opens A');
select pg_temp.as_user(:'org_a', format('select public.save_spectator_link(%L, false, %L)::text', :'t_a', pg_temp.seen(:'link'))) as again \gset
select harness.check(:'again'::jsonb ->> 'token' = :'tok2' and (select count(*) from public.audit_log where table_name = 'spectator_links' and action = 'UPDATE') = 3,
  'a save that changes nothing writes nothing (three changes so far: money on, money off, the new token)');

-- 7. Another tournament's link opens only its own
select pg_temp.as_user(:'org_b', format('select public.save_spectator_link(%L, true, null)::text', :'t_b')) as lb \gset
select :'lb'::jsonb ->> 'token' as tok_b \gset
select pg_temp.board(:'tok_b') as bb \gset
select harness.check(:'bb'::jsonb -> 'tournament' ->> 'name' = 'Seed Torneo B'
  and (select string_agg(p ->> 'display_name', ',' order by p ->> 'display_name') from jsonb_array_elements(:'bb'::jsonb -> 'players') p) = 'Carla,Dani'
  and position('Ana' in :'bb') = 0 and position('4321' in :'bb') = 0 and position('Campo Espectador' in :'bb') = 0,
  'B''s link opens B''s boards and nothing of A''s, money on or not');
select harness.check(position('Carla' in pg_temp.board(:'tok2')) = 0 and position('Dani' in pg_temp.board(:'tok2')) = 0, 'and A''s nothing of B''s');

-- 8. The history: every step, never the token
select pg_temp.as_user(:'org_a', format('select public.tournament_audit(%L, null, 200)::text', :'t_a')) as h \gset
select harness.check(
  (select count(*) from jsonb_array_elements(:'h'::jsonb) e where e ->> 'table' = 'spectator_links') = 4
  and (select e -> 'after' ->> 'money' from jsonb_array_elements(:'h'::jsonb) e where e ->> 'table' = 'spectator_links' and e ->> 'action' = 'INSERT') = 'false'
  and (select count(*) from jsonb_array_elements(:'h'::jsonb) e where e ->> 'table' = 'spectator_links' and e ->> 'action' = 'UPDATE'
         and e -> 'before' ->> 'rotated_at' is distinct from e -> 'after' ->> 'rotated_at') = 1,
  'Comité › Historial has its creation, both money changes and its new token');
select harness.check((select bool_and(actor_auth_user_id = :'org_a' and tournament_id = :'t_a' and row_id = :'t_a') from public.audit_log where table_name = 'spectator_links' and tournament_id = :'t_a'),
  'each one under A, by the Comité''s account');
select harness.check((select count(*) from public.audit_log where table_name = 'spectator_links' and ((before ? 'token') or (after ? 'token'))) = 0
  and (select count(*) from public.audit_log where position(:'tok' in coalesce(before::text, '') || coalesce(after::text, '')) > 0
     or position(:'tok2' in coalesce(before::text, '') || coalesce(after::text, '')) > 0) = 0,
  'no token, old or new, anywhere in the history');

-- 9. «Apagar»: the link is gone; a new one is another token
select pg_temp.as_user(:'dev_a', format('select public.delete_spectator_link(%L)::text', :'t_a')) as out \gset
select harness.check(:'out' like '42501 Solo el Comité apaga el enlace para ver%' and pg_temp.board(:'tok2') <> 'null', 'a player''s phone does not turn it off: ' || :'out');
select pg_temp.as_user(:'org_a', format('select public.delete_spectator_link(%L)::text', :'t_a')) as out \gset
select harness.check(pg_temp.board(:'tok2') = 'null' and pg_temp.as_user(:'org_a', format('select public.spectator_link(%L)::text', :'t_a')) = 'null',
  'the Comité turns it off: the token answers null, and A has no link');
select harness.check((select count(*) from public.audit_log where table_name = 'spectator_links' and action = 'DELETE' and tournament_id = :'t_a') = 1, 'turning it off is in the history');
select pg_temp.as_user(:'org_a', format('select public.save_spectator_link(%L, false, %L)::text', :'t_a', jsonb_build_object('token', :'tok2', 'money', false))) as out \gset
select harness.check(:'out' like '22023 El enlace para ver cambió en otro teléfono%' and not exists (select 1 from public.spectator_links where tournament_id = :'t_a'),
  'a phone that still shows the link switched off can''t bring it back with a stale «Con dinero» or «Cambiar enlace»: ' || :'out');
select pg_temp.as_user(:'org_a', format('select public.save_spectator_link(%L, false, null)::text', :'t_a')) as link \gset
select harness.check(:'link'::jsonb ->> 'token' not in (:'tok', :'tok2'), 'a link made again has a token of its own: the old ones never come back');

-- 10. Copies and tournaments that go: no link travels or stays
select pg_temp.as_user(:'org_a', format('select (public.duplicate_tournament(%L, %L)).id::text', :'t_a', 'Copia con enlace')) as copy \gset
select harness.check(:'copy' ~ '^[0-9a-f-]{36}$' and not exists (select 1 from public.spectator_links where tournament_id = :'copy'::uuid),
  'Duplicar torneo does not copy the link: ' || :'copy');
delete from public.tournaments where id = :'t_b';
select harness.check(pg_temp.board(:'tok_b') = 'null' and not exists (select 1 from public.spectator_links where tournament_id = :'t_b'),
  'a tournament deleted takes its link with it');

-- 11. Only the keys the settings schema knows, at any depth: a key typed by hand never reaches the link
select :'link'::jsonb ->> 'token' as tok3 \gset
update public.tournaments set settings = settings
  || '{"secretoTop": "llave1"}'::jsonb
  || jsonb_build_object('modules', (settings -> 'modules') || '{"nuevo": {"enabled": true, "label": "llave2"}}'::jsonb
       || jsonb_build_object('individual', (settings -> 'modules' -> 'individual') || '{"junkMod": "llave3"}'::jsonb))
  || jsonb_build_object('labels', (settings -> 'labels') || '{"junkLabel": "llave4"}'::jsonb)
  || jsonb_build_object('handicap', (settings -> 'handicap') || '{"junkHcp": "llave5"}'::jsonb)
  || jsonb_build_object('auction', (settings -> 'auction') || jsonb_build_object('junkAuction', 'llave6',
       'payout', jsonb_build_array('{"slot": "place", "place": 1, "share": 1, "junkSlot": "llave7"}'::jsonb, '{"slot": "otro", "nota": "llave8"}'::jsonb)))
  || jsonb_build_object('tiers', jsonb_build_array('A', '{"nota": "llave9"}'::jsonb))
  || jsonb_build_object('games', jsonb_build_array(
       '{"id":"skins","type":"skins","label":"Skins","enabled":true,"rounds":"all","entrants":"all","junkGame":"llave10","options":{"basis":"net","carryOver":true,"junkOpt":"llave11"},"money":{"source":"main","buyIn":0,"amount":100,"stake":0,"split":[100],"junkMoney":"llave12"}}'::jsonb,
       '{"id":"nassau","type":"match","label":"Nassau","enabled":true,"rounds":[1],"entrants":"all","options":{"format":"nassau","basis":"net","pairScoring":"bestBall","pressAt":0,"maxPresses":1,"matches":[{"id":"m1","a":["x"],"b":["y"],"junkMatch":"llave13"}]},"money":{"source":"direct","buyIn":0,"amount":0,"stake":50,"split":[100]}}'::jsonb,
       '{"id":"raro","type":"nuevo","label":"llave14","options":{"x":"llave15"}}'::jsonb))
  where id = :'t_a';
select pg_temp.board(:'tok3') as b \gset
select pg_temp.as_user(:'org_a', format('select public.save_spectator_link(%L, true, %L)::text', :'t_a', pg_temp.seen(:'link'))) \g /dev/null
select pg_temp.board(:'tok3') as m \gset
select harness.check(position('llave' in :'b') = 0 and position('llave' in :'m') = 0,
  'no key the schema doesn''t know, nor its value, at any depth, with money or without: ' || (:'m'::jsonb -> 'tournament' -> 'settings')::text);
select harness.check(not exists (select 1 from pg_temp.keys(:'m'::jsonb -> 'tournament' -> 'settings') k where k like 'junk%' or k in ('secretoTop', 'nuevo', 'nota', 'x')),
  'by key too: ' || (select string_agg(k, ',') from pg_temp.keys(:'m'::jsonb -> 'tournament' -> 'settings') k));
select :'m'::jsonb -> 'tournament' -> 'settings' as s \gset
select harness.check(:'s'::jsonb -> 'games' -> 0 = '{"id":"skins","type":"skins","label":"Skins","enabled":true,"rounds":"all","entrants":"all","options":{"basis":"net","carryOver":true},"money":{"source":"main","buyIn":0,"amount":100,"stake":0,"split":[100]}}'::jsonb
  and :'s'::jsonb -> 'games' -> 1 -> 'options' -> 'matches' = '[{"id":"m1","a":["x"],"b":["y"]}]'::jsonb and :'s'::jsonb -> 'games' -> 1 -> 'rounds' = '[1]'::jsonb
  and :'s'::jsonb -> 'games' -> 2 = '{}'::jsonb
  and :'s'::jsonb -> 'auction' -> 'payout' = '[{"slot": "place", "place": 1, "share": 1}, {}]'::jsonb
  and :'s'::jsonb -> 'tiers' = '["A", null]'::jsonb
  and :'s'::jsonb -> 'modules' -> 'individual' = (select (settings -> 'modules' -> 'individual') - 'junkMod' from public.tournaments where id = :'t_a')
  and :'s'::jsonb -> 'handicap' = (select (settings -> 'handicap') - 'junkHcp' from public.tournaments where id = :'t_a'),
  'what the schema knows comes as stored; a game or a Calcutta slot of a kind it doesn''t know is empty, and a value of the wrong kind null, so it fails to parse as it does for the members');
select harness.check(public.spectator_pick('"texto"', public.spectator_settings_spec()) = 'null'::jsonb
  and public.spectator_settings('"texto"', true) = 'null'::jsonb and public.spectator_settings(null, false) is null,
  'settings that are not an object come as null');

-- 12. The settings as the phone shows them, case for case: every fixture's, and each legacy key (src/data/spectatorSettings.cases.test.ts
-- writes the cases and proves each parses as the members' settings do; here the server must give exactly the same)
\ir harness/spectator_settings_cases.sql
select harness.check((select count(*) from spectator_settings_cases) >= 30, 'the shared cases are there: ' || (select count(*) from spectator_settings_cases));
select harness.check(not exists (select 1 from spectator_settings_cases c where public.spectator_settings(c.input, c.money) is distinct from c.expected),
  'spectator_settings gives what the phone shows, for every case, with money and without: ' || coalesce((select string_agg(c.name || ' (money ' || c.money || ')', '; ')
    from spectator_settings_cases c where public.spectator_settings(c.input, c.money) is distinct from c.expected), 'all equal'));
select harness.check((select (public.spectator_settings(c.input, true) -> 'prizes' -> 'pairs') = '[2000, 1000]'::jsonb
    and not (public.spectator_settings(c.input, true) -> 'prizes' ? 'matrimonios')
  from spectator_settings_cases c where c.name = 'first tournament: prizes.matrimonios instead of pairs' and c.money),
  'an older row''s prizes.matrimonios comes as prizes.pairs, as the members read it');
select harness.check(public.spectator_settings_legacy('{"prizes": {"pairs": [1], "matrimonios": [2]}}') = '{"prizes": {"pairs": [1], "matrimonios": [2]}}'::jsonb
  and public.spectator_settings_legacy('{"prizes": ["matrimonios"]}') = '{"prizes": ["matrimonios"]}'::jsonb
  and public.spectator_settings_legacy('"texto"') = '"texto"'::jsonb and public.spectator_settings_legacy(null) is null,
  'the new key wins over the old one, a list is no object, and anything else stays as it is');

rollback;
