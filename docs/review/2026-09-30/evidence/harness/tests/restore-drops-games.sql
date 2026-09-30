-- Repro (harness, seeded db; rolled back): since 0020, restore_tournament()
-- no longer restores game_entries / game_results / hole_awards (0020 rebuilt
-- it from 0010's body; 0011's additions were lost), and every surviving hole
-- award loses its group_id (groups are wiped and re-inserted; FK is ON DELETE SET NULL).
-- The backup is built like src/data/backup.ts builds it (same tables).
--   psql -h 127.0.0.1 -p 5433 -U postgres -X -v ON_ERROR_STOP=1 -d <seeded db> -f restore-drops-games.sql
\set ON_ERROR_STOP 1
\set QUIET 1
\pset tuples_only on
\pset format unaligned
select id as org_a from harness.seed where key = 'org_a' \gset
select id as dev_a from harness.seed where key = 'dev_a' \gset
select id as t_a from harness.seed where key = 'tournament_a' \gset
select id as p_a1 from harness.seed where key = 'player_a1' \gset
select id as p_a2 from harness.seed where key = 'player_a2' \gset
select id as r_a1 from harness.seed where key = 'round_a1' \gset
select id as g_a1 from harness.seed where key = 'group_a1' \gset
begin;

-- 1. State at backup time (organizer A; the hole award by Ana's phone, the player path).
select set_config('request.jwt.claims', harness.claims(:'org_a'), true) \g /dev/null
set local role authenticated;
update public.rounds set status = 'live' where id = :'r_a1';
insert into public.game_entries (tournament_id, game_id, player_id) values (:'t_a', 'skins-1', :'p_a1'), (:'t_a', 'skins-1', :'p_a2');
insert into public.game_results (tournament_id, game_id, player_id, share) values (:'t_a', 'bet-1', :'p_a1', 1);
insert into public.hole_awards (round_id, group_id, hole, game_id, player_id, decided_by) values (:'r_a1', :'g_a1', 7, 'ctp', :'p_a1', null);
reset role;
select set_config('request.jwt.claims', harness.claims(:'dev_a'), true) \g /dev/null
set local role authenticated;
insert into public.hole_awards (round_id, group_id, hole, game_id, player_id, decided_by) values (:'r_a1', :'g_a1', 3, 'ctp', :'p_a2', :'p_a1');
reset role;

-- 2. The backup, table by table as backup.ts reads it (as postgres here; the app reads the same rows as the organizer).
create temp table _bk as
select jsonb_build_object('version', 1, 'exportedAt', now(), 'tournamentId', t.id, 'slug', t.slug, 'tables', jsonb_build_object(
  'tournaments', jsonb_build_array(to_jsonb(t)),
  'players', coalesce((select jsonb_agg(to_jsonb(x)) from public.players x where x.tournament_id = t.id), '[]'),
  'rounds', coalesce((select jsonb_agg(to_jsonb(x)) from public.rounds x where x.tournament_id = t.id), '[]'),
  'pairs', coalesce((select jsonb_agg(to_jsonb(x)) from public.pairs x where x.tournament_id = t.id), '[]'),
  'teams', coalesce((select jsonb_agg(to_jsonb(x)) from public.teams x where x.tournament_id = t.id), '[]'),
  'calcutta_lots', coalesce((select jsonb_agg(to_jsonb(x)) from public.calcutta_lots x where x.tournament_id = t.id), '[]'),
  'payments', coalesce((select jsonb_agg(to_jsonb(x)) from public.payments x where x.tournament_id = t.id), '[]'),
  'game_entries', coalesce((select jsonb_agg(to_jsonb(x)) from public.game_entries x where x.tournament_id = t.id), '[]'),
  'game_results', coalesce((select jsonb_agg(to_jsonb(x)) from public.game_results x where x.tournament_id = t.id), '[]'),
  'groups', coalesce((select jsonb_agg(to_jsonb(x)) from public.groups x join public.rounds r on r.id = x.round_id where r.tournament_id = t.id), '[]'),
  'round_tees', '[]'::jsonb, 'scores', '[]'::jsonb, 'snake_tiebreaks', '[]'::jsonb, 'card_signatures', '[]'::jsonb, 'handicap_overrides', '[]'::jsonb,
  'hole_awards', coalesce((select jsonb_agg(to_jsonb(x)) from public.hole_awards x join public.rounds r on r.id = x.round_id where r.tournament_id = t.id), '[]'),
  'group_members', coalesce((select jsonb_agg(to_jsonb(x)) from public.group_members x join public.groups g on g.id = x.group_id join public.rounds r on r.id = g.round_id where r.tournament_id = t.id), '[]'),
  'team_members', '[]'::jsonb, 'calcutta_bids', '[]'::jsonb, 'calcutta_buybacks', '[]'::jsonb
)) as b
from public.tournaments t where t.id = :'t_a';
grant select on _bk to authenticated;
select 'backup carries: game_entries ' || jsonb_array_length(b -> 'tables' -> 'game_entries') || ', game_results ' || jsonb_array_length(b -> 'tables' -> 'game_results')
       || ', hole_awards ' || jsonb_array_length(b -> 'tables' -> 'hole_awards') from _bk;

-- 3. After the backup, things change (the Comité edits; a mistake to undo).
select set_config('request.jwt.claims', harness.claims(:'org_a'), true) \g /dev/null
set local role authenticated;
delete from public.game_entries where tournament_id = :'t_a' and player_id = :'p_a2';
update public.game_results set player_id = :'p_a2' where tournament_id = :'t_a' and game_id = 'bet-1';
delete from public.hole_awards where round_id = :'r_a1' and hole = 3;

-- 4. Restore that backup with the CURRENT function (0020's body).
savepoint before_restore;
select public.restore_tournament(:'t_a', (select b from _bk))::text as counts \gset
reset role;
select 'current restore_tournament (0020): ' || :'counts';
select format('  game_entries %s (backup 2) | game_results winner %s (backup Ana) | hole_awards %s (backup 2) | hole-7 award group_id %s (backup %s)',
  (select count(*) from public.game_entries where tournament_id = :'t_a'),
  (select case player_id when :'p_a1' then 'Ana' else 'Beto' end from public.game_results where tournament_id = :'t_a' and game_id = 'bet-1'),
  (select count(*) from public.hole_awards where round_id = :'r_a1'),
  coalesce((select group_id::text from public.hole_awards where round_id = :'r_a1' and hole = 7), 'NULL'), :'g_a1');
select count(*) as ge_0020 from public.game_entries where tournament_id = :'t_a' \gset
select count(*) as ha_0020 from public.hole_awards where round_id = :'r_a1' \gset
select (select group_id is null from public.hole_awards where round_id = :'r_a1' and hole = 7) as ha7_null \gset
select (select player_id = :'p_a2' from public.game_results where tournament_id = :'t_a' and game_id = 'bet-1') as gr_beto \gset

-- 5. Contrast: the same backup through 0011's body of the same function.
rollback to savepoint before_restore;
reset role;
\i restore_tournament_0011.sql
select set_config('request.jwt.claims', harness.claims(:'org_a'), true) \g /dev/null
set local role authenticated;
select public.restore_tournament(:'t_a', (select b from _bk))::text as counts11 \gset
reset role;
select '0011''s restore_tournament, same backup: ' || :'counts11';
select format('  game_entries %s | game_results winner %s | hole_awards %s | hole-7 award group_id %s',
  (select count(*) from public.game_entries where tournament_id = :'t_a'),
  (select case player_id when :'p_a1' then 'Ana' else 'Beto' end from public.game_results where tournament_id = :'t_a' and game_id = 'bet-1'),
  (select count(*) from public.hole_awards where round_id = :'r_a1'),
  coalesce((select group_id::text from public.hole_awards where round_id = :'r_a1' and hole = 7), 'NULL'));
select count(*) as ge_0011 from public.game_entries where tournament_id = :'t_a' \gset

select harness.check(:ge_0020 = 1 and :'gr_beto'::boolean and :ha_0020 = 1 and :'ha7_null'::boolean,
  'REGRESSION: with 0020''s restore, side-pot entrants, the bet result and a hole award are NOT restored, and the kept award lost its group_id');
select harness.check(:ge_0011 = 2, 'with 0011''s body the same backup restores the entrants (the regression is 0020''s)');
rollback;
