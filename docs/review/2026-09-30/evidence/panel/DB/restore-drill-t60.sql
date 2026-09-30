-- Restore drill on the panel's harness DB (db_db, seed.sql's tournament panel-t12).
-- 1. As the organizer, through RLS, build a backup in exactly the shape of
--    src/data/backup.ts exportBackup() minus courses/tees/holes (restoreBackup strips them).
-- 2. Snapshot the rows restore should bring back.
-- 3. Mutate: remove 3 side-pot entrants, change the bet winner, delete a hole
--    award, change a score.
-- 4. restore_tournament(backup) as the organizer, statement_timeout 8s (the
--    authenticated role's timeout on Supabase).
-- 5. Compare.
\set ON_ERROR_STOP 1
\pset footer off
select md5('t:t60')::uuid as tid, md5('org')::uuid as org \gset

begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'org', 'role', 'authenticated', 'is_anonymous', false)::text, true);
set local statement_timeout = '8s';

create temp table bk on commit drop as
with t as (select :'tid'::uuid as id),
rs as (select id from public.rounds where tournament_id = (select id from t)),
gs as (select id from public.groups where round_id in (select id from rs)),
ls as (select id from public.calcutta_lots where tournament_id = (select id from t)),
tm as (select id from public.teams where tournament_id = (select id from t))
select jsonb_build_object(
  'version', 1, 'exportedAt', now(), 'tournamentId', (select id from t), 'slug', 'panel-t60',
  'tables', jsonb_build_object(
    'tournaments', (select jsonb_agg(to_jsonb(x)) from public.tournaments x where x.id = (select id from t)),
    'players', coalesce((select jsonb_agg(to_jsonb(x) order by x.id) from public.players x where x.tournament_id = (select id from t)), '[]'),
    'rounds', coalesce((select jsonb_agg(to_jsonb(x) order by x.id) from public.rounds x where x.tournament_id = (select id from t)), '[]'),
    'pairs', coalesce((select jsonb_agg(to_jsonb(x) order by x.id) from public.pairs x where x.tournament_id = (select id from t)), '[]'),
    'teams', coalesce((select jsonb_agg(to_jsonb(x) order by x.id) from public.teams x where x.tournament_id = (select id from t)), '[]'),
    'calcutta_lots', coalesce((select jsonb_agg(to_jsonb(x) order by x.id) from public.calcutta_lots x where x.tournament_id = (select id from t)), '[]'),
    'payments', coalesce((select jsonb_agg(to_jsonb(x) order by x.id) from public.payments x where x.tournament_id = (select id from t)), '[]'),
    'game_entries', coalesce((select jsonb_agg(to_jsonb(x)) from public.game_entries x where x.tournament_id = (select id from t)), '[]'),
    'game_results', coalesce((select jsonb_agg(to_jsonb(x)) from public.game_results x where x.tournament_id = (select id from t)), '[]'),
    'groups', coalesce((select jsonb_agg(to_jsonb(x) order by x.id) from public.groups x where x.round_id in (select id from rs)), '[]'),
    'round_tees', coalesce((select jsonb_agg(to_jsonb(x)) from public.round_tees x where x.round_id in (select id from rs)), '[]'),
    'scores', coalesce((select jsonb_agg(to_jsonb(x) order by x.id) from public.scores x where x.round_id in (select id from rs)), '[]'),
    'snake_tiebreaks', coalesce((select jsonb_agg(to_jsonb(x)) from public.snake_tiebreaks x where x.round_id in (select id from rs)), '[]'),
    'card_signatures', coalesce((select jsonb_agg(to_jsonb(x)) from public.card_signatures x where x.round_id in (select id from rs)), '[]'),
    'handicap_overrides', coalesce((select jsonb_agg(to_jsonb(x)) from public.handicap_overrides x where x.round_id in (select id from rs)), '[]'),
    'hole_awards', coalesce((select jsonb_agg(to_jsonb(x)) from public.hole_awards x where x.round_id in (select id from rs)), '[]'),
    'group_members', coalesce((select jsonb_agg(to_jsonb(x)) from public.group_members x where x.group_id in (select id from gs)), '[]'),
    'team_members', coalesce((select jsonb_agg(to_jsonb(x)) from public.team_members x where x.team_id in (select id from tm)), '[]'),
    'calcutta_bids', coalesce((select jsonb_agg(to_jsonb(x) order by x.id) from public.calcutta_bids x where x.lot_id in (select id from ls)), '[]'),
    'calcutta_buybacks', coalesce((select jsonb_agg(to_jsonb(x)) from public.calcutta_buybacks x where x.lot_id in (select id from ls)), '[]')
  )) as b;

select 'backup rows' as what, (select jsonb_object_agg(k, jsonb_array_length(v)) from jsonb_each((select b from bk) -> 'tables') e(k, v)) as counts;

-- 2. What restore should bring back
create temp table before_state on commit drop as
select 'game_entries' as tbl, count(*)::text as val from public.game_entries where tournament_id = :'tid'
union all select 'game_results.winner', string_agg(p.display_name, ',') from public.game_results g join public.players p on p.id = g.player_id where g.tournament_id = :'tid'
union all select 'hole_awards', string_agg(format('h%s:%s:%s', a.hole, p.display_name, case when a.group_id is null then 'COMITE' else 'grupo' end), ' ' order by a.hole, p.display_name) from public.hole_awards a join public.players p on p.id = a.player_id join public.rounds r on r.id = a.round_id where r.tournament_id = :'tid'
union all select 'score p5 R1 h1', (select strokes::text from public.scores where round_id = md5('r1:t60')::uuid and player_id = md5('p:t60:5')::uuid and hole = 1);

-- 3. Mutations after the backup
delete from public.game_entries where tournament_id = :'tid' and game_id = 'skins' and player_id in (md5('p:t60:6')::uuid, md5('p:t60:7')::uuid, md5('p:t60:8')::uuid);
delete from public.game_results where tournament_id = :'tid' and game_id = 'tacos';
insert into public.game_results (tournament_id, game_id, player_id, share) values (:'tid', 'tacos', md5('p:t60:4')::uuid, 1);
delete from public.hole_awards where round_id = md5('r1:t60')::uuid and hole = 7;
select public.admin_save_score(md5('r1:t60')::uuid, md5('p:t60:5')::uuid, 1, 9, 2, false, 'drill: wrong score after the backup');

-- 4. Restore
\timing on
select public.restore_tournament(:'tid', (select b from bk)) as restore_result;
\timing off

-- 5. Compare
create temp table after_state on commit drop as
select 'game_entries' as tbl, count(*)::text as val from public.game_entries where tournament_id = :'tid'
union all select 'game_results.winner', string_agg(p.display_name, ',') from public.game_results g join public.players p on p.id = g.player_id where g.tournament_id = :'tid'
union all select 'hole_awards', string_agg(format('h%s:%s:%s', a.hole, p.display_name, case when a.group_id is null then 'COMITE' else 'grupo' end), ' ' order by a.hole, p.display_name) from public.hole_awards a join public.players p on p.id = a.player_id join public.rounds r on r.id = a.round_id where r.tournament_id = :'tid'
union all select 'score p5 R1 h1', (select strokes::text from public.scores where round_id = md5('r1:t60')::uuid and player_id = md5('p:t60:5')::uuid and hole = 1);

select b.tbl, b.val as in_backup, a.val as after_restore, case when a.val is not distinct from b.val then 'restored' else 'NOT RESTORED' end as verdict
from before_state b join after_state a using (tbl) order by 1;
commit;
