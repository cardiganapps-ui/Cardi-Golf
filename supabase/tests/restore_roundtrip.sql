-- Restore round trip (DB-02): every table of a tournament comes back exactly
-- as it was backed up, and nothing of another tournament moves.
--
-- 0020 rebuilt restore_tournament without the side-game tables, and the only
-- test (scripts/rls-test.mjs) never changed those rows between the backup and
-- the restore, so it passed against the broken function. Here every table is
-- changed after the backup (a row edited, a row deleted, a row added where the
-- table allows it), the backup is restored as the Comité, and each table is
-- compared whole.
--
-- The db job runs it (scripts/db-test.sh, supabase/tests/harness) on a copy
-- of the migrated database with the two-tenant seed; rolled back. It prints
-- «restore round trip: ok» or stops at the first table that differs.
\set ON_ERROR_STOP 1
\set QUIET 1
\pset tuples_only on
\pset format unaligned
select id as org_a from harness.seed where key = 'org_a' \gset
select id as t_a from harness.seed where key = 'tournament_a' \gset
select id as t_b from harness.seed where key = 'tournament_b' \gset
select id as p1 from harness.seed where key = 'player_a1' \gset
select id as p2 from harness.seed where key = 'player_a2' \gset
select id as r1 from harness.seed where key = 'round_a1' \gset
select id as g1 from harness.seed where key = 'group_a1' \gset
begin;

-- What a table holds for one tournament, as the restore owns it. A player's
-- account link never comes from a backup, and of the tournament row only what
-- the restore writes back is compared.
create function pg_temp.state(t uuid) returns jsonb language sql stable as $$
  with rs as (select id from public.rounds where tournament_id = t),
       gs as (select id from public.groups where round_id in (select id from rs)),
       ls as (select id from public.calcutta_lots where tournament_id = t),
       tm as (select id from public.teams where tournament_id = t)
  select jsonb_build_object(
    'tournaments', (select jsonb_agg(jsonb_build_object('name', name, 'tagline', tagline, 'logo_url', logo_url, 'accent_color', accent_color, 'status', status, 'settings', settings, 'timezone', timezone, 'currency', currency, 'current_round_id', current_round_id, 'banker_player_id', banker_player_id)) from public.tournaments where id = t),
    'players', (select jsonb_agg(to_jsonb(x) - 'profile_id' - 'profile_status' order by to_jsonb(x)::text) from public.players x where tournament_id = t),
    'rounds', (select jsonb_agg(to_jsonb(x) order by to_jsonb(x)::text) from public.rounds x where tournament_id = t),
    'groups', (select jsonb_agg(to_jsonb(x) order by to_jsonb(x)::text) from public.groups x where id in (select id from gs)),
    'group_members', (select jsonb_agg(to_jsonb(x) order by to_jsonb(x)::text) from public.group_members x where group_id in (select id from gs)),
    'round_tees', (select jsonb_agg(to_jsonb(x) order by to_jsonb(x)::text) from public.round_tees x where round_id in (select id from rs)),
    'scores', (select jsonb_agg(to_jsonb(x) order by to_jsonb(x)::text) from public.scores x where round_id in (select id from rs)),
    'snake_tiebreaks', (select jsonb_agg(to_jsonb(x) order by to_jsonb(x)::text) from public.snake_tiebreaks x where round_id in (select id from rs)),
    'card_signatures', (select jsonb_agg(to_jsonb(x) order by to_jsonb(x)::text) from public.card_signatures x where round_id in (select id from rs)),
    'handicap_overrides', (select jsonb_agg(to_jsonb(x) order by to_jsonb(x)::text) from public.handicap_overrides x where round_id in (select id from rs)),
    'hole_awards', (select jsonb_agg(to_jsonb(x) order by to_jsonb(x)::text) from public.hole_awards x where round_id in (select id from rs)),
    'pairs', (select jsonb_agg(to_jsonb(x) order by to_jsonb(x)::text) from public.pairs x where tournament_id = t),
    'teams', (select jsonb_agg(to_jsonb(x) order by to_jsonb(x)::text) from public.teams x where tournament_id = t),
    'team_members', (select jsonb_agg(to_jsonb(x) order by to_jsonb(x)::text) from public.team_members x where team_id in (select id from tm)),
    'calcutta_lots', (select jsonb_agg(to_jsonb(x) order by to_jsonb(x)::text) from public.calcutta_lots x where tournament_id = t),
    'calcutta_bids', (select jsonb_agg(to_jsonb(x) order by to_jsonb(x)::text) from public.calcutta_bids x where lot_id in (select id from ls)),
    'calcutta_buybacks', (select jsonb_agg(to_jsonb(x) order by to_jsonb(x)::text) from public.calcutta_buybacks x where lot_id in (select id from ls)),
    'payments', (select jsonb_agg(to_jsonb(x) order by to_jsonb(x)::text) from public.payments x where tournament_id = t),
    'money_adjustments', (select jsonb_agg(to_jsonb(x) order by to_jsonb(x)::text) from public.money_adjustments x where tournament_id = t),
    'game_entries', (select jsonb_agg(to_jsonb(x) order by to_jsonb(x)::text) from public.game_entries x where tournament_id = t),
    'game_results', (select jsonb_agg(to_jsonb(x) order by to_jsonb(x)::text) from public.game_results x where tournament_id = t)
  )
$$;

-- The backup, in src/data/backup.ts's shape (every table it exports).
create function pg_temp.backup(t uuid) returns jsonb language sql stable as $$
  with rs as (select id from public.rounds where tournament_id = t),
       gs as (select id from public.groups where round_id in (select id from rs)),
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
    'group_members', coalesce((select jsonb_agg(to_jsonb(x)) from public.group_members x where group_id in (select id from gs)), '[]'),
    'team_members', coalesce((select jsonb_agg(to_jsonb(x)) from public.team_members x where team_id in (select id from tm)), '[]'),
    'calcutta_bids', coalesce((select jsonb_agg(to_jsonb(x)) from public.calcutta_bids x where lot_id in (select id from ls)), '[]'),
    'calcutta_buybacks', coalesce((select jsonb_agg(to_jsonb(x)) from public.calcutta_buybacks x where lot_id in (select id from ls)), '[]')
  ))
$$;

-- 1. A tournament with a row in every table (written directly: the restore is under test, not who may write).
\set course '''c0000000-0000-4000-8000-000000000001'''
\set tee '''c0000000-0000-4000-8000-000000000002'''
\set p3 '''c0000000-0000-4000-8000-0000000000a3'''
\set p4 '''c0000000-0000-4000-8000-0000000000a4'''
\set p5 '''c0000000-0000-4000-8000-0000000000a5'''
\set r2 '''c0000000-0000-4000-8000-0000000000b2'''
\set r3 '''c0000000-0000-4000-8000-0000000000b3'''
\set g2 '''c0000000-0000-4000-8000-0000000000c2'''
\set g3 '''c0000000-0000-4000-8000-0000000000c3'''
\set d1 '''c0000000-0000-4000-8000-0000000000d1'''
\set d2 '''c0000000-0000-4000-8000-0000000000d2'''
\set e1 '''c0000000-0000-4000-8000-0000000000e1'''
\set e2 '''c0000000-0000-4000-8000-0000000000e2'''
\set f1 '''c0000000-0000-4000-8000-0000000000f1'''
\set f2 '''c0000000-0000-4000-8000-0000000000f2'''
\set f3 '''c0000000-0000-4000-8000-0000000000f3'''
\set f4 '''c0000000-0000-4000-8000-0000000000f4'''
\set y1 '''c0000000-0000-4000-8000-000000000101'''
\set y2 '''c0000000-0000-4000-8000-000000000102'''
\set y3 '''c0000000-0000-4000-8000-000000000103'''
\set m1 '''c0000000-0000-4000-8000-000000000201'''
\set m2 '''c0000000-0000-4000-8000-000000000202'''
\set m3 '''c0000000-0000-4000-8000-000000000203'''

insert into public.courses (id, name, source) values (:course, 'Campo Restore', 'manual');
insert into public.tees (id, course_id, name, color, rating, slope, par_total) values (:tee, :course, 'Azules', 'azul', 71.2, 128, 72);
insert into public.holes (tee_id, number, par, stroke_index)
select :tee, h, (array[4,4,3,5,4,4,3,4,5,4,4,3,5,4,4,3,4,5])[h], (array[7,3,15,1,11,9,17,5,13,8,4,16,2,12,10,18,6,14])[h] from generate_series(1, 18) h;

insert into public.players (id, tournament_id, full_name, display_name, tier, base_hcp)
values (:p3, :'t_a', 'Carla Restrepo', 'Carla', 'B', 12), (:p4, :'t_a', 'Darío Uribe', 'Darío', 'C', 20);
update public.rounds set course_id = :course, status = 'live', date = date '2027-04-09' where id = :'r1';
insert into public.rounds (id, tournament_id, number, date, course_id, holes, status) values (:r2, :'t_a', 2, date '2027-04-10', :course, 18, 'scheduled');
insert into public.groups (id, round_id, number, tee_time, start_hole) values (:g2, :'r1', 2, '09:10', 10), (:g3, :r2, 1, '09:00', 1);
insert into public.group_members (group_id, player_id) values (:g2, :p3), (:g2, :p4), (:g3, :'p1'), (:g3, :'p2'), (:g3, :p3), (:g3, :p4) on conflict do nothing;
insert into public.round_tees (round_id, player_id, tee_id) values (:'r1', :'p1', :tee), (:'r1', :'p2', :tee), (:r2, :p3, :tee);
insert into public.scores (round_id, player_id, hole, strokes, putts, picked_up, entered_by)
select :'r1', p, h, 4 + (h % 2), 2, false, :'p1' from unnest(array[:'p1', :'p2']::uuid[]) p, generate_series(1, 3) h;
insert into public.scores (round_id, player_id, hole, strokes, putts, picked_up, entered_by) values (:'r1', :p3, 10, 5, 2, false, :p3);
insert into public.snake_tiebreaks (round_id, group_id, hole, last_holed_player_id, decided_by) values (:'r1', :'g1', 2, :'p2', :'p1');
insert into public.pairs (id, tournament_id, name, player1_id, player2_id, kind) values (:d1, :'t_a', 'Los Primeros', :'p1', :'p2', 'AD'), (:d2, :'t_a', null, :p3, :p4, 'BC');
insert into public.card_signatures (round_id, pair_id, signed_by) values (:'r1', :d1, :'p2'), (:'r1', :d2, :p3);
insert into public.handicap_overrides (round_id, player_id, playing_hcp, reason, "by") values (:'r1', :'p1', 9, 'Jugó tees rojas', :'p2');
insert into public.teams (id, tournament_id, name, number, drawn_at) values (:e1, :'t_a', 'Los Uno', 1, now()), (:e2, :'t_a', null, 2, now());
insert into public.team_members (team_id, player_id, tournament_id) values (:e1, :'p1', :'t_a'), (:e1, :'p2', :'t_a'), (:e2, :p3, :'t_a'), (:e2, :p4, :'t_a');
insert into public.calcutta_lots (id, tournament_id, player_id, lot_number, status, price, owner_id, sold_at)
values (:f1, :'t_a', :'p1', 1, 'sold', 750, :'p2', now()), (:f2, :'t_a', :p3, 2, 'sold', 500, :p3, now());
insert into public.calcutta_bids (id, lot_id, bidder_id, amount) values (:f3, :f1, :'p2', 750), (:f4, :f2, :p3, 500);
insert into public.calcutta_buybacks (lot_id, pct, amount, paid) values (:f1, 25, 188, false);
insert into public.payments (id, tournament_id, from_player_id, to_player_id, amount, kind, paid, note)
values (:y1, :'t_a', :'p1', null, 2500, 'entry', true, null), (:y2, :'t_a', :'p2', null, 750, 'calcutta', false, 'lote 1');
insert into public.money_adjustments (id, tournament_id, source_key, kind, to_player_id, amount, reason, created_by)
values (:m1, :'t_a', 'bestRound', 'award', :p4, 1200, 'Día 2 cancelado', :'org_a'), (:m2, :'t_a', 'calcutta', 'house', null, 300, 'Para la cena', :'org_a');
insert into public.game_entries (tournament_id, game_id, player_id) values (:'t_a', 'skins', :'p1'), (:'t_a', 'skins', :'p2'), (:'t_a', 'skins', :p3);
insert into public.game_results (tournament_id, game_id, player_id, share) values (:'t_a', 'tacos', :'p1', 1);
insert into public.hole_awards (round_id, group_id, hole, game_id, player_id, decided_by) values (:'r1', :'g1', 3, 'ctp', :'p1', :'p2'), (:'r1', :g2, 12, 'ctp', :p3, :p4);
update public.tournaments set current_round_id = :'r1', banker_player_id = :'p1', tagline = 'Antes', accent_color = '#0f6e77' where id = :'t_a';

-- 2. The backup, and what every table holds at that moment (and the other tournament).
create temp table bk on commit drop as select pg_temp.backup(:'t_a') as b;
grant select on bk to authenticated;
create temp table before_a on commit drop as select pg_temp.state(:'t_a') as s;
create temp table before_b on commit drop as select pg_temp.state(:'t_b') as s;
select harness.check((select count(*) from jsonb_each((select s from before_a)) e(k, v) where v is null) = 0, 'every table holds a row before the backup') \g /dev/null

-- 3. Every table changes after the backup.
update public.tournaments set tagline = 'Después', accent_color = '#b04327', banker_player_id = :'p2', current_round_id = :r2 where id = :'t_a';
update public.players set display_name = 'Ana cambiada', base_hcp = 30 where id = :'p1';
delete from public.players where id = :p4;
insert into public.players (id, tournament_id, full_name, display_name) values (:p5, :'t_a', 'Eva Nueva', 'Eva');
update public.rounds set date = date '2027-05-01' where id = :'r1';
delete from public.rounds where id = :r2;
insert into public.rounds (id, tournament_id, number, date, course_id, holes, status) values (:r3, :'t_a', 3, date '2027-04-11', :course, 9, 'scheduled');
update public.groups set tee_time = '11:30', start_hole = 1 where id = :'g1';
delete from public.round_tees where round_id = :'r1' and player_id = :'p2';
update public.scores set strokes = 9 where round_id = :'r1' and player_id = :'p1' and hole = 1;
delete from public.scores where round_id = :'r1' and player_id = :'p2' and hole = 3;
insert into public.scores (round_id, player_id, hole, strokes, putts, picked_up, entered_by) values (:'r1', :p3, 11, 6, 3, false, :p3);
update public.snake_tiebreaks set last_holed_player_id = :'p1' where round_id = :'r1' and hole = 2;
delete from public.card_signatures where round_id = :'r1' and pair_id = :d2;
update public.handicap_overrides set playing_hcp = 11, reason = 'Otra razón' where round_id = :'r1' and player_id = :'p1';
update public.pairs set name = 'Renombrados' where id = :d1;
delete from public.pairs where id = :d2;
update public.teams set name = 'Los Dos' where id = :e1;
delete from public.teams where id = :e2;
update public.calcutta_lots set price = 1000, owner_id = :p3 where id = :f1;
delete from public.calcutta_bids where id = :f4;
update public.calcutta_buybacks set paid = true where lot_id = :f1;
update public.payments set paid = true where id = :y2;
insert into public.payments (id, tournament_id, from_player_id, to_player_id, amount, kind, paid) values (:y3, :'t_a', :p3, null, 500, 'calcutta', true);
update public.money_adjustments set voided_at = now(), voided_by = :'org_a', void_reason = 'Anulada después' where id = :m2;
insert into public.money_adjustments (id, tournament_id, source_key, kind, to_player_id, amount, reason) values (:m3, :'t_a', 'snake', 'refund', :'p1', 150, 'Añadida después');
delete from public.game_entries where tournament_id = :'t_a' and player_id = :p3;
insert into public.game_entries (tournament_id, game_id, player_id) values (:'t_a', 'birdies', :'p2');
delete from public.game_results where tournament_id = :'t_a' and game_id = 'tacos';
insert into public.game_results (tournament_id, game_id, player_id, share) values (:'t_a', 'tacos', :'p2', 1);
delete from public.hole_awards where round_id = :'r1' and hole = 3;
select harness.check((select count(*) from jsonb_each((select s from before_a)) e(k, v) where v is not distinct from (pg_temp.state(:'t_a') -> k)) = 0, 'every table differs from the backup before the restore') \g /dev/null

-- 4. The Comité restores the backup.
select set_config('request.jwt.claims', harness.claims(:'org_a'), true) \g /dev/null
set local role authenticated;
select public.restore_tournament(:'t_a', (select b from bk)) \g /dev/null
reset role;

-- 5. Every table is what it was at the backup, and the other tournament never moved.
select coalesce(string_agg(k, ', ' order by k), '') as differ from jsonb_each((select s from before_a)) e(k, v) where v is distinct from (pg_temp.state(:'t_a') -> k) \gset
select harness.check(:'differ' = '', 'tables the restore did not bring back: ' || :'differ') \g /dev/null
select harness.check((select s from before_b) = pg_temp.state(:'t_b'), 'the other tournament changed') \g /dev/null
-- 6. A backup is the client's JSON: a row aimed at the other tournament is
-- refused whole (22023), and neither tournament moves. Without these checks a
-- restore could write into tournament B or link A's games to B's players.
select id as pb1 from harness.seed where key = 'player_b1' \gset
select id as rb1 from harness.seed where key = 'round_b1' \gset
select id as gb1 from harness.seed where key = 'group_b1' \gset
create temp table bad on commit drop as
  select 'game_entries of tournament B' as what, jsonb_set(b, '{tables,game_entries,0,tournament_id}', to_jsonb(:'t_b'::text)) as b from bk
  union all select 'game_entries with a player of B', jsonb_set(b, '{tables,game_entries,0,player_id}', to_jsonb(:'pb1'::text)) from bk
  union all select 'game_results of tournament B', jsonb_set(b, '{tables,game_results,0,tournament_id}', to_jsonb(:'t_b'::text)) from bk
  union all select 'game_results with a player of B', jsonb_set(b, '{tables,game_results,0,player_id}', to_jsonb(:'pb1'::text)) from bk
  union all select 'hole_awards in a round of B', jsonb_set(b, '{tables,hole_awards,0,round_id}', to_jsonb(:'rb1'::text)) from bk
  union all select 'hole_awards in a group of B', jsonb_set(b, '{tables,hole_awards,0,group_id}', to_jsonb(:'gb1'::text)) from bk
  union all select 'hole_awards with a player of B', jsonb_set(b, '{tables,hole_awards,0,player_id}', to_jsonb(:'pb1'::text)) from bk
  union all select 'money_adjustments of tournament B', jsonb_set(b, '{tables,money_adjustments,0,tournament_id}', to_jsonb(:'t_b'::text)) from bk
  union all select 'money_adjustments to a player of B', jsonb_set(b, '{tables,money_adjustments,0,to_player_id}', to_jsonb(:'pb1'::text)) from bk;
create temp table outcome (what text, state text) on commit drop;
grant select on bad to authenticated;
select set_config('request.jwt.claims', harness.claims(:'org_a'), true) \g /dev/null
-- Each attempt as the Comité, as in the app; between attempts the restore's own
-- temp tables (r_*) are dropped, since here every call shares one transaction.
do $$
declare
  r record;
  tmp text;
begin
  for r in select * from bad loop
    for tmp in select c.relname from pg_class c where c.relnamespace = pg_my_temp_schema() and c.relkind = 'r' and c.relname like 'r\_%' loop
      execute format('drop table %I', tmp);
    end loop;
    begin
      set local role authenticated;
      perform public.restore_tournament((r.b ->> 'tournamentId')::uuid, r.b);
      reset role;
      insert into outcome values (r.what, 'restored');
    exception when others then
      reset role;
      insert into outcome values (r.what, sqlstate);
    end;
  end loop;
end $$;
select coalesce(string_agg(what || ' (' || state || ')', ', ' order by what), '') as let_in from outcome where state <> '22023' \gset
select harness.check((select count(*) from outcome) = 9 and :'let_in' = '', 'backups aimed at another tournament were not refused: ' || :'let_in') \g /dev/null
select coalesce(string_agg(k, ', ' order by k), '') as moved from jsonb_each((select s from before_a)) e(k, v) where v is distinct from (pg_temp.state(:'t_a') -> k) \gset
select harness.check(:'moved' = '', 'a refused restore changed tournament A: ' || :'moved') \g /dev/null
select harness.check((select s from before_b) = pg_temp.state(:'t_b'), 'a refused restore changed the other tournament') \g /dev/null

select 'restore round trip: ok';
rollback;
