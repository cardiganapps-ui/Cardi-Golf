-- Who may read and write the tournament tables (DB-12, 0030). Every read and
-- every write a phone, the Comité or the platform admin can send to a table
-- whose policies 0030 rewrote, by ten identities, on two tournaments, in three
-- states of the round, each answered as it was before 0030.
--
-- The answers are in harness/tenant_matrix_expected.sql, written by this same
-- file on the chain before 0030 (main at 0029):
--   psql -X -d <a seeded copy of main> -v emit=1 -f supabase/tests/tenant_write_matrix.sql > /tmp/rows
-- then pasted between that file's markers. It never names tournament_id, so
-- the same file runs on both chains; a line that differs fails with both
-- answers printed. Change the expected file only with a migration that is
-- meant to change who may do what, and say so in its PR.
--
-- Each request runs in its own subtransaction as its user (role and JWT
-- claims, as PostgREST sets them), with RETURNING where PostgREST asks for
-- the row back, and is rolled back: the answer is the row count, or the
-- SQLSTATE it was refused with. Reads count the rows each tournament has.
-- Everything is rolled back at the end.
\set ON_ERROR_STOP 1
\set QUIET 1
\pset tuples_only on
\pset format unaligned
select id as org_a from harness.seed where key = 'org_a' \gset
select id as org_b from harness.seed where key = 'org_b' \gset
select id as dev_a from harness.seed where key = 'dev_a' \gset
select id as dev_x from harness.seed where key = 'dev_x' \gset
select id as padmin from harness.seed where key = 'platform_admin' \gset
select id as t_a from harness.seed where key = 'tournament_a' \gset
select id as t_b from harness.seed where key = 'tournament_b' \gset
select id as ana from harness.seed where key = 'player_a1' \gset
select id as beto from harness.seed where key = 'player_a2' \gset
select id as carla from harness.seed where key = 'player_b1' \gset
select id as dani from harness.seed where key = 'player_b2' \gset
select id as r_a from harness.seed where key = 'round_a1' \gset
select id as r_b from harness.seed where key = 'round_b1' \gset
select id as g_a from harness.seed where key = 'group_a1' \gset
select id as g_b from harness.seed where key = 'group_b1' \gset
begin;

\ir harness/tenant_fixture.sql

-- ---------------------------------------------------------------------------
-- The requests: one template per table, for each tournament (who asks: the fixture's `who`)
-- ---------------------------------------------------------------------------
-- p1, p2: a pair in group g; pin: of the other pair in g; pout: in no group.
create temp table tp (tenant text, t uuid, r uuid, g uuid, g2 uuid, p1 uuid, p2 uuid, pin uuid, pout uuid,
  l1 uuid, l2 uuid, pr1 uuid, pr2 uuid, team uuid, c uuid, te uuid, te2 uuid);
insert into tp values
  ('A', :'t_a', :'r_a', :'g_a', 'a1000000-0000-4000-8000-000000000002', :'ana', :'beto', 'a0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000006',
   'a5000000-0000-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000002', 'a2000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000002',
   'a6000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000002'),
  ('B', :'t_b', :'r_b', :'g_b', 'b1000000-0000-4000-8000-000000000002', :'carla', :'dani', 'b0000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000006',
   'b5000000-0000-4000-8000-000000000001', 'b5000000-0000-4000-8000-000000000002', 'b2000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000002',
   'b6000000-0000-4000-8000-000000000001', 'b3000000-0000-4000-8000-000000000001', 'b4000000-0000-4000-8000-000000000001', 'b4000000-0000-4000-8000-000000000002');

-- Templates: %1$L t, %2$L r, %3$L g, %4$L g2, %5$L p1, %6$L p2, %7$L pin, %8$L pout,
-- %9$L l1, %10$L l2, %11$L pr1, %12$L pr2, %13$L team, %14$L c, %15$L te, %16$L te2.
create temp table tmpl (ord serial, tbl text, op text, sql text);
insert into tmpl (tbl, op, sql) values
  ('tournaments', 'sel', 'select count(*) from public.tournaments where id = %1$L'),
  ('tournaments', 'upd', 'update public.tournaments set name = name where id = %1$L returning id'),
  ('players', 'sel', 'select count(*) from public.players where tournament_id = %1$L'),
  ('players', 'ins', 'insert into public.players (tournament_id, full_name, display_name, sort_order) values (%1$L, ''Nuevo Jugador'', ''Nuevo'', 99) returning id'),
  ('players', 'ups', 'insert into public.players (id, tournament_id, full_name, display_name) values (%5$L, %1$L, ''Otro Nombre'', ''Otro'') on conflict (id) do update set tournament_id = excluded.tournament_id, full_name = excluded.full_name, display_name = excluded.display_name returning id'),
  ('players', 'upd', 'update public.players set display_name = display_name where id = %5$L returning id'),
  ('players', 'del', 'delete from public.players where id = %8$L returning id'),
  ('rounds', 'sel', 'select count(*) from public.rounds where tournament_id = %1$L'),
  ('rounds', 'ins', 'insert into public.rounds (tournament_id, number, holes) values (%1$L, 5, 18) returning id'),
  ('rounds', 'upd', 'update public.rounds set date = date where id = %2$L returning id'),
  ('rounds', 'del', 'delete from public.rounds where id = %2$L returning id'),
  ('pairs', 'sel', 'select count(*) from public.pairs where tournament_id = %1$L'),
  ('pairs', 'ins', 'insert into public.pairs (tournament_id, name, player1_id, player2_id, kind) values (%1$L, ''Nueva'', %8$L, %7$L, ''AD'') returning id'),
  ('pairs', 'upd', 'update public.pairs set name = name where id = %11$L returning id'),
  ('pairs', 'del', 'delete from public.pairs where id = %12$L returning id'),
  ('teams', 'sel', 'select count(*) from public.teams where tournament_id = %1$L'),
  ('teams', 'ins', 'insert into public.teams (tournament_id, name, number) values (%1$L, ''Equipo 9'', 9) returning id'),
  ('teams', 'upd', 'update public.teams set name = name where id = %13$L returning id'),
  ('teams', 'del', 'delete from public.teams where id = %13$L returning id'),
  ('team_members', 'sel', 'select count(*) from public.team_members where team_id = %13$L'),
  ('team_members', 'ins', 'insert into public.team_members (team_id, player_id, tournament_id) values (%13$L, %8$L, %1$L) returning team_id'),
  ('team_members', 'upd', 'update public.team_members set player_id = player_id where team_id = %13$L and player_id = %5$L returning team_id'),
  ('team_members', 'del', 'delete from public.team_members where team_id = %13$L and player_id = %5$L returning team_id'),
  ('calcutta_lots', 'sel', 'select count(*) from public.calcutta_lots where tournament_id = %1$L'),
  ('calcutta_lots', 'ins', 'insert into public.calcutta_lots (tournament_id, player_id, lot_number) values (%1$L, %8$L, 9) returning id'),
  ('calcutta_lots', 'upd', 'update public.calcutta_lots set status = status where id = %9$L returning id'),
  ('calcutta_lots', 'del', 'delete from public.calcutta_lots where id = %10$L returning id'),
  ('payments', 'sel', 'select count(*) from public.payments where tournament_id = %1$L'),
  ('payments', 'ins', 'insert into public.payments (tournament_id, from_player_id, to_player_id, amount, kind) values (%1$L, %6$L, null, 100, ''other'') returning id'),
  ('payments', 'upd', 'update public.payments set paid = paid where tournament_id = %1$L returning id'),
  ('payments', 'del', 'delete from public.payments where tournament_id = %1$L returning id'),
  ('game_entries', 'sel', 'select count(*) from public.game_entries where tournament_id = %1$L'),
  ('game_entries', 'ins', 'insert into public.game_entries (tournament_id, game_id, player_id) values (%1$L, ''pot'', %6$L) returning player_id'),
  ('game_entries', 'ins2', 'insert into public.game_entries (tournament_id, game_id, player_id) values (%1$L, ''pot'', (select pout from pg_temp.tp where tp.t <> %1$L)) returning player_id'),
  ('game_entries', 'ups', 'insert into public.game_entries (tournament_id, game_id, player_id) values (%1$L, ''pot'', %5$L) on conflict (tournament_id, game_id, player_id) do update set tournament_id = excluded.tournament_id, game_id = excluded.game_id, player_id = excluded.player_id returning player_id'),
  ('game_entries', 'del', 'delete from public.game_entries where tournament_id = %1$L and player_id = %5$L returning player_id'),
  ('game_results', 'sel', 'select count(*) from public.game_results where tournament_id = %1$L'),
  ('game_results', 'ins', 'insert into public.game_results (tournament_id, game_id, player_id, share) values (%1$L, ''bet'', %6$L, 1) returning player_id'),
  ('game_results', 'upd', 'update public.game_results set share = share where tournament_id = %1$L returning player_id'),
  ('game_results', 'del', 'delete from public.game_results where tournament_id = %1$L returning player_id'),
  ('round_results', 'sel', 'select count(*) from public.round_results where tournament_id = %1$L'),
  ('money_adjustments', 'sel', 'select count(*) from public.money_adjustments where tournament_id = %1$L'),
  ('groups', 'sel', 'select count(*) from public.groups where round_id = %2$L'),
  ('groups', 'ins', 'insert into public.groups (round_id, number, tee_time, start_hole) values (%2$L, 9, ''10:00'', 1) returning id'),
  ('groups', 'upd', 'update public.groups set tee_time = tee_time where id = %3$L returning id'),
  ('groups', 'del', 'delete from public.groups where id = %4$L returning id'),
  ('group_members', 'sel', 'select count(*) from public.group_members where group_id in (%3$L, %4$L)'),
  ('group_members', 'ins', 'insert into public.group_members (group_id, player_id) values (%4$L, %8$L) returning group_id'),
  ('group_members', 'upd', 'update public.group_members set player_id = player_id where group_id = %3$L and player_id = %5$L returning group_id'),
  ('group_members', 'del', 'delete from public.group_members where group_id = %3$L and player_id = %5$L returning group_id'),
  ('round_tees', 'sel', 'select count(*) from public.round_tees where round_id = %2$L'),
  ('round_tees', 'ins', 'insert into public.round_tees (round_id, player_id, tee_id) values (%2$L, %7$L, %15$L) returning player_id'),
  ('round_tees', 'ups', 'insert into public.round_tees (round_id, player_id, tee_id) values (%2$L, %5$L, %16$L) on conflict (round_id, player_id) do update set round_id = excluded.round_id, player_id = excluded.player_id, tee_id = excluded.tee_id returning tee_id'),
  ('round_tees', 'upd', 'update public.round_tees set tee_id = tee_id where round_id = %2$L and player_id = %5$L returning tee_id'),
  ('round_tees', 'del', 'delete from public.round_tees where round_id = %2$L and player_id = %6$L returning tee_id'),
  ('scores', 'sel', 'select count(*) from public.scores where round_id = %2$L'),
  ('scores', 'ins', 'insert into public.scores (round_id, player_id, hole, strokes, putts, picked_up, entered_by, client_ts) values (%2$L, %6$L, 2, 4, 2, false, %5$L, now()) returning id'),
  ('scores', 'ins2', 'insert into public.scores (round_id, player_id, hole, strokes, putts, picked_up, entered_by, client_ts) values (%2$L, %7$L, 2, 4, 2, false, %5$L, now()) returning id'),
  ('scores', 'ups', 'insert into public.scores (round_id, player_id, hole, strokes, putts, picked_up, entered_by, client_ts) values (%2$L, %5$L, 1, 6, 2, false, %5$L, now()) on conflict (round_id, player_id, hole) do update set round_id = excluded.round_id, player_id = excluded.player_id, hole = excluded.hole, strokes = excluded.strokes, putts = excluded.putts, picked_up = excluded.picked_up, entered_by = excluded.entered_by, client_ts = excluded.client_ts returning id'),
  ('scores', 'upd', 'update public.scores set putts = putts where round_id = %2$L and player_id = %5$L and hole = 1 returning id'),
  ('scores', 'del', 'delete from public.scores where round_id = %2$L and player_id = %5$L and hole = 1 returning id'),
  ('snake_tiebreaks', 'sel', 'select count(*) from public.snake_tiebreaks where round_id = %2$L'),
  ('snake_tiebreaks', 'ins', 'insert into public.snake_tiebreaks (round_id, group_id, hole, last_holed_player_id, decided_by) values (%2$L, %3$L, 2, %6$L, %5$L) returning hole'),
  ('snake_tiebreaks', 'ups', 'insert into public.snake_tiebreaks (round_id, group_id, hole, last_holed_player_id, decided_by) values (%2$L, %3$L, 1, %6$L, %5$L) on conflict (round_id, group_id, hole) do update set round_id = excluded.round_id, group_id = excluded.group_id, hole = excluded.hole, last_holed_player_id = excluded.last_holed_player_id, decided_by = excluded.decided_by returning hole'),
  ('snake_tiebreaks', 'upd', 'update public.snake_tiebreaks set last_holed_player_id = last_holed_player_id where round_id = %2$L and group_id = %3$L and hole = 1 returning hole'),
  ('snake_tiebreaks', 'del', 'delete from public.snake_tiebreaks where round_id = %2$L and group_id = %3$L and hole = 1 returning hole'),
  ('card_signatures', 'sel', 'select count(*) from public.card_signatures where round_id = %2$L'),
  ('card_signatures', 'ins', 'insert into public.card_signatures (round_id, pair_id, signed_by) values (%2$L, %12$L, %5$L) returning pair_id'),
  ('card_signatures', 'ups', 'insert into public.card_signatures (round_id, pair_id, signed_by) values (%2$L, %11$L, %7$L) on conflict (round_id, pair_id) do nothing returning pair_id'),
  ('card_signatures', 'upd', 'update public.card_signatures set signed_at = signed_at where round_id = %2$L returning pair_id'),
  ('card_signatures', 'del', 'delete from public.card_signatures where round_id = %2$L and pair_id = %11$L returning pair_id'),
  ('handicap_overrides', 'sel', 'select count(*) from public.handicap_overrides where round_id = %2$L'),
  ('handicap_overrides', 'ins', 'insert into public.handicap_overrides (round_id, player_id, playing_hcp, reason, "by") values (%2$L, %6$L, 10, ''motivo'', %5$L) returning player_id'),
  ('handicap_overrides', 'ups', 'insert into public.handicap_overrides (round_id, player_id, playing_hcp, reason, "by") values (%2$L, %5$L, 12, ''motivo'', %5$L) on conflict (round_id, player_id) do update set round_id = excluded.round_id, player_id = excluded.player_id, playing_hcp = excluded.playing_hcp, reason = excluded.reason, "by" = excluded."by" returning player_id'),
  ('handicap_overrides', 'upd', 'update public.handicap_overrides set playing_hcp = playing_hcp where round_id = %2$L and player_id = %5$L returning player_id'),
  ('handicap_overrides', 'del', 'delete from public.handicap_overrides where round_id = %2$L and player_id = %5$L returning player_id'),
  ('hole_awards', 'sel', 'select count(*) from public.hole_awards where round_id = %2$L'),
  ('hole_awards', 'ins', 'insert into public.hole_awards (round_id, group_id, hole, game_id, player_id, decided_by) values (%2$L, %3$L, 2, ''skins'', %6$L, %5$L) returning hole'),
  ('hole_awards', 'ins2', 'insert into public.hole_awards (round_id, group_id, hole, game_id, player_id, decided_by) values (%2$L, null, 3, ''closest'', %6$L, %5$L) returning hole'),
  ('hole_awards', 'upd', 'update public.hole_awards set decided_by = decided_by where round_id = %2$L and game_id = ''skins'' and hole = 1 and player_id = %5$L returning hole'),
  ('hole_awards', 'del', 'delete from public.hole_awards where round_id = %2$L and game_id = ''skins'' and hole = 1 and player_id = %5$L returning hole'),
  ('photos', 'sel', 'select count(*) from public.photos where round_id = %2$L'),
  ('photos', 'ins', 'insert into public.photos (round_id, player_id, hole, url) values (%2$L, %5$L, 2, ''https://x.test/2.jpg'') returning id'),
  ('photos', 'upd', 'update public.photos set url = url where round_id = %2$L returning id'),
  ('photos', 'del', 'delete from public.photos where round_id = %2$L returning id'),
  ('calcutta_bids', 'sel', 'select count(*) from public.calcutta_bids where lot_id in (%9$L, %10$L)'),
  ('calcutta_bids', 'ins', 'insert into public.calcutta_bids (lot_id, bidder_id, amount) values (%9$L, %6$L, 750) returning id'),
  ('calcutta_bids', 'upd', 'update public.calcutta_bids set amount = amount where lot_id = %9$L returning id'),
  ('calcutta_bids', 'del', 'delete from public.calcutta_bids where lot_id = %9$L returning id'),
  ('calcutta_buybacks', 'sel', 'select count(*) from public.calcutta_buybacks where lot_id in (%9$L, %10$L)'),
  ('calcutta_buybacks', 'ins', 'insert into public.calcutta_buybacks (lot_id, pct, amount) values (%10$L, 10, 50) returning lot_id'),
  ('calcutta_buybacks', 'ups', 'insert into public.calcutta_buybacks (lot_id, pct, amount, paid) values (%9$L, 50, 250, false) on conflict (lot_id) do update set lot_id = excluded.lot_id, pct = excluded.pct, amount = excluded.amount, paid = excluded.paid returning lot_id'),
  ('calcutta_buybacks', 'upd', 'update public.calcutta_buybacks set paid = paid where lot_id = %9$L returning lot_id'),
  ('calcutta_buybacks', 'del', 'delete from public.calcutta_buybacks where lot_id = %9$L returning lot_id'),
  ('tees', 'sel', 'select count(*) from public.tees where course_id = %14$L'),
  ('tees', 'ins', 'insert into public.tees (course_id, name) values (%14$L, ''Rojas'') returning id'),
  ('tees', 'upd', 'update public.tees set name = name where id = %16$L returning id'),
  ('tees', 'del', 'delete from public.tees where id = %16$L returning id'),
  ('holes', 'sel', 'select count(*) from public.holes where tee_id in (%15$L, %16$L)'),
  ('holes', 'ins', 'insert into public.holes (tee_id, number, par, stroke_index) values (%16$L, 1, 4, 1) returning number'),
  ('holes', 'upd', 'update public.holes set par = par where tee_id = %15$L and number = 1 returning number'),
  ('holes', 'del', 'delete from public.holes where tee_id = %15$L and number = 1 returning number');

create temp table ops as
  select m.ord * 2 + (tp.tenant = 'B')::int as ord, m.tbl, m.op, tp.tenant,
    format(m.sql, tp.t, tp.r, tp.g, tp.g2, tp.p1, tp.p2, tp.pin, tp.pout, tp.l1, tp.l2, tp.pr1, tp.pr2, tp.team, tp.c, tp.te, tp.te2) as sql
  from tmpl m cross join tp;
create temp table result (state text, who text, wo int, tbl text, op text, tenant text, ord int, res text);
grant select on pg_temp.tp to anon, authenticated;

create function pg_temp.run(st text) returns void language plpgsql as $fn$
declare
  w record;
  o record;
  res text;
  n bigint;
begin
  for w in select * from pg_temp.who order by ord loop
    for o in select * from pg_temp.ops order by ord loop
      begin
        perform set_config('request.jwt.claims', w.claims, true);
        execute format('set local role %I', w.role);
        if o.op = 'sel' then
          execute o.sql into n;
        else
          execute o.sql;
          get diagnostics n = row_count;
        end if;
        res := n::text;
        raise exception 'undo' using errcode = 'U0001';
      exception
        when sqlstate 'U0001' then null;
        when others then res := sqlstate;
      end;
      insert into pg_temp.result values (st, w.name, w.ord, o.tbl, o.op, o.tenant, o.ord, res);
    end loop;
  end loop;
end
$fn$;

-- ---------------------------------------------------------------------------
-- Reads, row for row: what each identity sees under row-level security is
-- exactly the rows its table's read rule names, as the rule read before 0030
-- (membership of the parent's tournament). Before 0030 this proves the FOR
-- ALL write policies, OR'd into every SELECT, added no row to it; after, that
-- the set-based policies give the same rows.
-- ---------------------------------------------------------------------------
create temp table readable (tbl text, rule text);
insert into readable values
  ('tournaments', 'public.is_tournament_member(id)'),
  ('players', 'public.is_tournament_member(tournament_id)'),
  ('rounds', 'public.is_tournament_member(tournament_id)'),
  ('pairs', 'public.is_tournament_member(tournament_id)'),
  ('teams', 'public.is_tournament_member(tournament_id)'),
  ('team_members', 'public.is_tournament_member(tournament_id)'),
  ('calcutta_lots', 'public.is_tournament_member(tournament_id)'),
  ('payments', 'public.is_tournament_member(tournament_id)'),
  ('game_entries', 'public.is_tournament_member(tournament_id)'),
  ('game_results', 'public.is_tournament_member(tournament_id)'),
  ('round_results', 'public.is_tournament_member(tournament_id)'),
  ('money_adjustments', 'public.is_tournament_member(tournament_id)'),
  ('groups', 'public.is_tournament_member(public.round_tournament_id(round_id))'),
  ('group_members', 'public.is_tournament_member(public.group_tournament_id(group_id))'),
  ('round_tees', 'public.is_tournament_member(public.round_tournament_id(round_id))'),
  ('scores', 'public.is_tournament_member(public.round_tournament_id(round_id))'),
  ('snake_tiebreaks', 'public.is_tournament_member(public.round_tournament_id(round_id))'),
  ('card_signatures', 'public.is_tournament_member(public.round_tournament_id(round_id))'),
  ('handicap_overrides', 'public.is_tournament_member(public.round_tournament_id(round_id))'),
  ('hole_awards', 'public.is_tournament_member(public.round_tournament_id(round_id))'),
  ('photos', 'public.is_tournament_member(public.round_tournament_id(round_id))'),
  ('calcutta_bids', 'public.is_tournament_member(public.lot_tournament_id(lot_id))'),
  ('calcutta_buybacks', 'public.is_tournament_member(public.lot_tournament_id(lot_id))'),
  ('tees', 'auth.uid() is not null'),
  ('holes', 'auth.uid() is not null');
-- The card signed, so card_signatures has rows to see.
insert into public.card_signatures (round_id, pair_id, signed_by) values
  (:'r_a', 'a2000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000003'),
  (:'r_b', 'b2000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000003');
create function pg_temp.same_rows() returns table (who text, tbl text, seen int, rule int, same boolean) language plpgsql as $fn$
declare
  w record;
  r record;
  a tid[];
  b tid[];
begin
  for w in select * from pg_temp.who order by ord loop
    for r in select * from pg_temp.readable order by tbl loop
      perform set_config('request.jwt.claims', w.claims, true);
      execute format('select coalesce(array_agg(ctid order by ctid), ''{}'') from public.%I where %s', r.tbl, r.rule) into b;
      begin
        execute format('set local role %I', w.role);
        execute format('select coalesce(array_agg(ctid order by ctid), ''{}'') from public.%I', r.tbl) into a;
        reset role;
      exception when insufficient_privilege then
        a := '{}'; -- no grant at all (anon on money_adjustments): it reads nothing
      end;
      return query select w.name, r.tbl, cardinality(a), cardinality(b), a = b;
    end loop;
  end loop;
end
$fn$;
create temp table rows_seen as select * from pg_temp.same_rows();
select format('reads differ: %s on %s sees %s rows, its rule names %s', who, tbl, seen, rule) from rows_seen where not same;
select harness.check(not exists (select 1 from rows_seen where not same),
  'every identity reads exactly the rows the read rule names, on all ' || (select count(distinct tbl) from rows_seen) || ' tables (' ||
  (select sum(seen) from rows_seen) || ' rows seen in all)');
delete from public.card_signatures where round_id in (:'r_a', :'r_b');

-- ---------------------------------------------------------------------------
-- Three states of the day: not started, live, live with the first pair's card signed
-- ---------------------------------------------------------------------------
select pg_temp.run('1 scheduled') \g /dev/null
update public.rounds set status = 'live' where id in (:'r_a', :'r_b');
select pg_temp.run('2 live') \g /dev/null
insert into public.card_signatures (round_id, pair_id, signed_by) values
  (:'r_a', 'a2000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000003'),
  (:'r_b', 'b2000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000003');
select pg_temp.run('3 signed') \g /dev/null

create temp table got as
  select state, who, tbl, string_agg(op || ':' || tenant || '=' || res, ' ' order by ord) as line, min(wo) as wo, min(ord) as tord
  from pg_temp.result group by state, who, tbl;

\if :{?emit}
select format('  (%L, %L, %L, %L),', state, who, tbl, line) from got order by state, wo, tord;
\else
create temp table expected (state text, who text, tbl text, line text);
\ir harness/tenant_matrix_expected.sql
select format('differs: %s | %s | %s%s  expected: %s%s  got:      %s', coalesce(e.state, g.state), coalesce(e.who, g.who), coalesce(e.tbl, g.tbl),
    chr(10), coalesce(e.line, '(none)'), chr(10), coalesce(g.line, '(none)'))
  from expected e full join got g using (state, who, tbl)
  where e.line is distinct from g.line
  order by 1;
select harness.check(not exists (
    select 1 from expected e full join got g using (state, who, tbl) where e.line is distinct from g.line),
  'every read and write of ' || (select count(*) from pg_temp.result) || ' requests (' || (select count(distinct tbl) from got) ||
  ' tables, ten identities, three states) is answered as before 0030');
select harness.check((select count(*) from expected) = (select count(*) from got) and (select count(*) from got) = 3 * 10 * (select count(distinct tbl) from pg_temp.tmpl),
  'the matrix is whole: ' || (select count(*) from got) || ' lines');
\endif
rollback;
