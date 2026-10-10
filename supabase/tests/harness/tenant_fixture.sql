-- The world the tenant tests run on (tenant_write_matrix.sql, tenant_ids.sql), on
-- top of the two-tenant seed, inserted as postgres (no rules, every trigger).
-- The including file has \gset the seed's ids (org_a … g_b) and opened the
-- transaction. Never names tournament_id: it runs before and after 0030.
-- ---------------------------------------------------------------------------
-- More people: Beto runs the Comité from his phone (is_admin); Eva plays in
-- another group; Gabo and Juan in none; an account confirmed as Dani; one
-- with only a pending link to Hugo.
insert into auth.users (id, email, email_confirmed_at, is_anonymous, raw_app_meta_data, raw_user_meta_data) values
  ('c0000000-0000-4000-8000-0000000000b1', null, null, true, '{"provider":"anonymous","providers":["anonymous"]}', '{}'),
  ('c0000000-0000-4000-8000-0000000000e1', null, null, true, '{"provider":"anonymous","providers":["anonymous"]}', '{}'),
  ('c0000000-0000-4000-8000-0000000000d1', 'acc-b@polo.test', now(), false, '{"provider":"email","providers":["email"]}', '{"display_name":"Dani"}'),
  ('c0000000-0000-4000-8000-0000000000f1', 'acc-p@polo.test', now(), false, '{"provider":"email","providers":["email"]}', '{"display_name":"Hugo"}');
insert into public.profiles (id, handle, display_name) values
  ('c0000000-0000-4000-8000-0000000000d1', 'dani.beta', 'Dani'),
  ('c0000000-0000-4000-8000-0000000000f1', 'hugo.beta', 'Hugo');
insert into public.players (id, tournament_id, full_name, display_name, sort_order) values
  ('a0000000-0000-4000-8000-000000000003', :'t_a', 'Cami Alfa', 'Cami', 2),
  ('a0000000-0000-4000-8000-000000000004', :'t_a', 'Dario Alfa', 'Dario', 3),
  ('a0000000-0000-4000-8000-000000000005', :'t_a', 'Eva Alfa', 'Eva', 4),
  ('a0000000-0000-4000-8000-000000000006', :'t_a', 'Gabo Alfa', 'Gabo', 5),
  ('b0000000-0000-4000-8000-000000000003', :'t_b', 'Hugo Beta', 'Hugo', 2),
  ('b0000000-0000-4000-8000-000000000004', :'t_b', 'Ines Beta', 'Ines', 3),
  ('b0000000-0000-4000-8000-000000000005', :'t_b', 'Kike Beta', 'Kike', 4),
  ('b0000000-0000-4000-8000-000000000006', :'t_b', 'Juan Beta', 'Juan', 5);
update public.players set is_admin = true where id = :'beto';
update public.players set profile_id = 'c0000000-0000-4000-8000-0000000000d1', profile_status = 'confirmed' where id = :'dani';
update public.players set profile_id = 'c0000000-0000-4000-8000-0000000000f1', profile_status = 'pending' where id = 'b0000000-0000-4000-8000-000000000003';
insert into public.device_sessions (auth_user_id, player_id, tournament_id) values
  ('c0000000-0000-4000-8000-0000000000b1', :'beto', :'t_a'),
  ('c0000000-0000-4000-8000-0000000000e1', 'a0000000-0000-4000-8000-000000000005', :'t_a');
-- Groups of four, two pairs each; a second group with one player.
insert into public.group_members (group_id, player_id) values
  (:'g_a', 'a0000000-0000-4000-8000-000000000003'), (:'g_a', 'a0000000-0000-4000-8000-000000000004'),
  (:'g_b', 'b0000000-0000-4000-8000-000000000003'), (:'g_b', 'b0000000-0000-4000-8000-000000000004');
insert into public.groups (id, round_id, number, tee_time, start_hole) values
  ('a1000000-0000-4000-8000-000000000002', :'r_a', 2, '09:10', 1),
  ('b1000000-0000-4000-8000-000000000002', :'r_b', 2, '09:10', 1);
insert into public.group_members (group_id, player_id) values
  ('a1000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000005'),
  ('b1000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000005');
insert into public.pairs (id, tournament_id, name, player1_id, player2_id, kind) values
  ('a2000000-0000-4000-8000-000000000001', :'t_a', 'Ana y Beto', :'ana', :'beto', 'AD'),
  ('a2000000-0000-4000-8000-000000000002', :'t_a', 'Cami y Dario', 'a0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000004', 'BC'),
  ('b2000000-0000-4000-8000-000000000001', :'t_b', 'Carla y Dani', :'carla', :'dani', 'AD'),
  ('b2000000-0000-4000-8000-000000000002', :'t_b', 'Hugo e Ines', 'b0000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000004', 'BC');
-- A course each, made by its organizer: a tee with holes, a tee without.
insert into public.courses (id, name, created_by) values
  ('a3000000-0000-4000-8000-000000000001', 'Campo A', :'org_a'),
  ('b3000000-0000-4000-8000-000000000001', 'Campo B', :'org_b');
insert into public.tees (id, course_id, name, rating, slope, par_total) values
  ('a4000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000001', 'Azules', 72, 113, 72),
  ('a4000000-0000-4000-8000-000000000002', 'a3000000-0000-4000-8000-000000000001', 'Blancas', 70, 113, 72),
  ('b4000000-0000-4000-8000-000000000001', 'b3000000-0000-4000-8000-000000000001', 'Azules', 72, 113, 72),
  ('b4000000-0000-4000-8000-000000000002', 'b3000000-0000-4000-8000-000000000001', 'Blancas', 70, 113, 72);
insert into public.holes (tee_id, number, par, stroke_index)
  select t, h, 4, h from unnest(array['a4000000-0000-4000-8000-000000000001', 'b4000000-0000-4000-8000-000000000001']::uuid[]) t, generate_series(1, 18) h;
update public.rounds set course_id = 'a3000000-0000-4000-8000-000000000001' where id = :'r_a';
update public.rounds set course_id = 'b3000000-0000-4000-8000-000000000001' where id = :'r_b';
-- One row or two of every child table, in each tournament.
insert into public.round_tees (round_id, player_id, tee_id) values
  (:'r_a', :'ana', 'a4000000-0000-4000-8000-000000000001'), (:'r_a', :'beto', 'a4000000-0000-4000-8000-000000000001'),
  (:'r_b', :'carla', 'b4000000-0000-4000-8000-000000000001'), (:'r_b', :'dani', 'b4000000-0000-4000-8000-000000000001');
insert into public.scores (round_id, player_id, hole, strokes, putts, picked_up, entered_by, client_ts) values
  (:'r_a', :'ana', 1, 4, 2, false, :'ana', now()), (:'r_a', :'beto', 1, 5, 2, false, :'ana', now()),
  (:'r_a', 'a0000000-0000-4000-8000-000000000005', 1, 6, 3, false, null, now()),
  (:'r_b', :'carla', 1, 4, 2, false, :'carla', now()), (:'r_b', :'dani', 1, 5, 2, false, :'carla', now());
insert into public.snake_tiebreaks (round_id, group_id, hole, last_holed_player_id, decided_by) values
  (:'r_a', :'g_a', 1, :'ana', :'ana'), (:'r_b', :'g_b', 1, :'carla', :'carla');
insert into public.handicap_overrides (round_id, player_id, playing_hcp, reason, "by") values
  (:'r_a', :'ana', 10, 'motivo', :'beto'), (:'r_b', :'carla', 10, 'motivo', :'dani');
insert into public.hole_awards (round_id, group_id, hole, game_id, player_id, decided_by) values
  (:'r_a', :'g_a', 1, 'skins', :'ana', :'ana'), (:'r_b', :'g_b', 1, 'skins', :'carla', :'carla');
insert into public.photos (round_id, player_id, hole, url) values
  (:'r_a', :'ana', 1, 'https://x.test/a.jpg'), (:'r_b', :'carla', 1, 'https://x.test/b.jpg');
insert into public.calcutta_lots (id, tournament_id, player_id, lot_number, status) values
  ('a5000000-0000-4000-8000-000000000001', :'t_a', :'ana', 1, 'sold'), ('a5000000-0000-4000-8000-000000000002', :'t_a', :'beto', 2, 'pending'),
  ('b5000000-0000-4000-8000-000000000001', :'t_b', :'carla', 1, 'sold'), ('b5000000-0000-4000-8000-000000000002', :'t_b', :'dani', 2, 'pending');
insert into public.calcutta_bids (lot_id, bidder_id, amount) values
  ('a5000000-0000-4000-8000-000000000001', :'beto', 500), ('b5000000-0000-4000-8000-000000000001', :'dani', 500);
insert into public.calcutta_buybacks (lot_id, pct, amount) values
  ('a5000000-0000-4000-8000-000000000001', 25, 125), ('b5000000-0000-4000-8000-000000000001', 25, 125);
insert into public.payments (tournament_id, from_player_id, to_player_id, amount, kind) values
  (:'t_a', :'ana', null, 500, 'entry'), (:'t_b', :'carla', null, 500, 'entry');
insert into public.game_entries (tournament_id, game_id, player_id) values (:'t_a', 'pot', :'ana'), (:'t_b', 'pot', :'carla');
insert into public.game_results (tournament_id, game_id, player_id, share) values (:'t_a', 'bet', :'ana', 1), (:'t_b', 'bet', :'carla', 1);
insert into public.teams (id, tournament_id, name, number) values
  ('a6000000-0000-4000-8000-000000000001', :'t_a', 'Equipo A', 1), ('b6000000-0000-4000-8000-000000000001', :'t_b', 'Equipo B', 1);
insert into public.team_members (team_id, player_id, tournament_id) values
  ('a6000000-0000-4000-8000-000000000001', :'ana', :'t_a'), ('b6000000-0000-4000-8000-000000000001', :'carla', :'t_b');
insert into public.round_results (round_id, player_id, tournament_id, round_number, holes, thru, complete) values
  (:'r_a', :'ana', :'t_a', 1, 18, 0, false), (:'r_b', :'carla', :'t_b', 1, 18, 0, false);
insert into public.money_adjustments (tournament_id, source_key, kind, to_player_id, amount, reason, call_id) values
  (:'t_a', 'bestRound', 'award', :'ana', 100, 'motivo', gen_random_uuid()), (:'t_b', 'bestRound', 'award', :'carla', 100, 'motivo', gen_random_uuid());
-- B is Protegido: the platform admin reads it but writes nothing there.
select set_config('request.jwt.claims', harness.claims(:'org_b'), true) \g /dev/null
set local role authenticated;
select public.set_tournament_protected(:'t_b', true, null) \g /dev/null
reset role;


-- Who asks: role and JWT claims, as PostgREST sets them.
create temp table who (ord int, name text, role text, claims text);
insert into who values
  (1, 'org_a', 'authenticated', harness.claims(:'org_a')),
  (2, 'org_b', 'authenticated', harness.claims(:'org_b')),
  (3, 'dev_a', 'authenticated', harness.claims(:'dev_a')),
  (4, 'dev_beto', 'authenticated', harness.claims('c0000000-0000-4000-8000-0000000000b1')),
  (5, 'dev_eva', 'authenticated', harness.claims('c0000000-0000-4000-8000-0000000000e1')),
  (6, 'acc_dani', 'authenticated', harness.claims('c0000000-0000-4000-8000-0000000000d1')),
  (7, 'acc_pending', 'authenticated', harness.claims('c0000000-0000-4000-8000-0000000000f1')),
  (8, 'dev_x', 'authenticated', harness.claims(:'dev_x')),
  (9, 'padmin', 'authenticated', harness.claims(:'padmin')),
  (10, 'anon', 'anon', '{"role":"anon"}');
