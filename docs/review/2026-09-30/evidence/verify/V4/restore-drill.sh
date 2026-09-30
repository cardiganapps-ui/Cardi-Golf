#!/usr/bin/env bash
# V4's own restore drill (DB-02 / DB-03). Usage: restore-drill.sh <db> <restore function name>
# Every step is its own transaction (one PostgREST request ~ one transaction), acting as the
# user the app would act as (RLS on). Only touches <db>, which must be a V4 database.
set -euo pipefail
DB=$1; FN=${2:-restore_tournament}
case "$DB" in v4_*) ;; *) echo "refusing: not a v4 database"; exit 2;; esac
P="psql -h 127.0.0.1 -p 5433 -U postgres -X -q -v ON_ERROR_STOP=1 -d $DB"
seed() { $P -At -c "select id from harness.seed where key='$1'"; }
TA=$(seed tournament_a); R1=$(seed round_a1); G1=$(seed group_a1)
ORG=$(seed org_a); DEVA=$(seed dev_a); ANA=$(seed player_a1); BETO=$(seed player_a2)
DEVC=cccccccc-cccc-4ccc-8ccc-00000000000c

echo "== 0. setup (postgres): a second anonymous phone, a place to keep the backup"
$P <<SQL
insert into auth.users (id, is_anonymous) values ('$DEVC', true) on conflict do nothing;
create schema if not exists v4;
create table if not exists v4.backups (name text primary key, payload jsonb);
SQL

echo "== 1. organizer: two more players, PINs, games in settings, round live, two groups, entrants, bet result"
IDS=$($P -At <<SQL | sed -n 's/^ID://p'
begin;
select set_config('request.jwt.claims', harness.claims('$ORG'), true) \g /dev/null
set local role authenticated;
with ins as (
  insert into public.players (tournament_id, full_name, display_name, base_hcp, sort_order)
  values ('$TA', 'Ceci Prueba', 'Ceci', 12, 3), ('$TA', 'Dario Prueba', 'Dario', 20, 4) returning id, sort_order)
select 'ID:' || id from ins order by sort_order;
commit;
SQL
)
CECI=$(echo "$IDS" | sed -n 1p); DARIO=$(echo "$IDS" | sed -n 2p)
[ -n "$CECI" ] && [ -n "$DARIO" ] || { echo "player insert failed"; exit 1; }
echo "   Ceci=$CECI Dario=$DARIO"
$P <<SQL
begin;
select set_config('request.jwt.claims', harness.claims('$ORG'), true) \g /dev/null
set local role authenticated;
select public.set_player_pin('$CECI', '1234');
update public.tournaments set settings = settings || jsonb_build_object('games', jsonb_build_array(
  jsonb_build_object('id','bote','label','Skins bote','type','skins','entrants','list','rounds','all','enabled',true,
    'money', jsonb_build_object('source','side','buyIn',200,'amount',0,'stake',0,'split',jsonb_build_array(100)),
    'options', jsonb_build_object('basis','net','carryOver',true)),
  jsonb_build_object('id','cerca','label','Más cerca','type','contest','entrants','all','rounds','all','enabled',true,
    'money', jsonb_build_object('source','direct','buyIn',0,'amount',0,'stake',100,'split',jsonb_build_array(100)),
    'options', jsonb_build_object('kind','closest','holes',jsonb_build_array(3,7))),
  jsonb_build_object('id','apuesta','label','Apuesta','type','custom','entrants','all','rounds','all','enabled',true,
    'money', jsonb_build_object('source','side','buyIn',100,'amount',0,'stake',0,'split',jsonb_build_array(100)),
    'options', jsonb_build_object('description','quien gana el 18'))))
where id = '$TA';
update public.rounds set status = 'live' where id = '$R1';
select public.upsert_groups('$R1', jsonb_build_array(
  jsonb_build_object('id','$G1','number',1,'tee_time','09:00','start_hole',1,'player_ids',jsonb_build_array('$ANA','$BETO')),
  jsonb_build_object('number',2,'tee_time','09:10','start_hole',1,'player_ids',jsonb_build_array('$CECI','$DARIO'))));
insert into public.game_entries (tournament_id, game_id, player_id)
select '$TA', 'bote', x from unnest(array['$ANA','$BETO','$CECI','$DARIO']::uuid[]) x
on conflict (tournament_id, game_id, player_id) do nothing;
insert into public.game_results (tournament_id, game_id, player_id, share) values ('$TA', 'apuesta', '$ANA', 1);
commit;
SQL
G2=$($P -At -c "select id from public.groups where round_id='$R1' and number=2")

echo "== 2. Ceci's phone claims Ceci"
$P -At <<SQL
begin;
select set_config('request.jwt.claims', harness.claims('$DEVC'), true) \g /dev/null
set local role authenticated;
select 'claim_player: ' || public.claim_player('$CECI', '1234')::text;
commit;
SQL

echo "== 3. group 1 (Ana's phone): claims hole 3 = Ana, hole 7 = Beto; scores"
$P <<SQL
begin;
select set_config('request.jwt.claims', harness.claims('$DEVA'), true) \g /dev/null
set local role authenticated;
insert into public.hole_awards (round_id, group_id, hole, game_id, player_id, decided_by) values
  ('$R1', '$G1', 3, 'cerca', '$ANA', '$ANA'),
  ('$R1', '$G1', 7, 'cerca', '$BETO', '$ANA');
insert into public.scores (round_id, player_id, hole, strokes, putts, picked_up, entered_by, client_ts)
values ('$R1', '$ANA', 1, 4, 2, false, '$ANA', now()), ('$R1', '$BETO', 1, 5, 2, false, '$ANA', now());
commit;
SQL

echo "== 4. group 2 (Ceci's phone): claims hole 3 = Ceci (a dispute with group 1)"
$P <<SQL
begin;
select set_config('request.jwt.claims', harness.claims('$DEVC'), true) \g /dev/null
set local role authenticated;
insert into public.hole_awards (round_id, group_id, hole, game_id, player_id, decided_by) values ('$R1', '$G2', 3, 'cerca', '$CECI', '$CECI');
commit;
SQL

echo "== 5. BACKUP as the organizer through RLS, in src/data/backup.ts's shape"
$P <<SQL
begin;
select set_config('request.jwt.claims', harness.claims('$ORG'), true) \g /dev/null
set local role authenticated;
create temp table b on commit drop as
with
 t as (select * from public.tournaments where id = '$TA'),
 rds as (select * from public.rounds where tournament_id = '$TA'),
 grp as (select * from public.groups where round_id in (select id from rds)),
 tms as (select * from public.teams where tournament_id = '$TA'),
 lots as (select * from public.calcutta_lots where tournament_id = '$TA')
select jsonb_build_object(
  'version', 1, 'exportedAt', now(), 'tournamentId', '$TA', 'slug', (select slug from t),
  'tables', jsonb_build_object(
    'tournaments', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from t x),
    'players', (select coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]') from public.players x where tournament_id = '$TA'),
    'rounds', (select coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]') from rds x),
    'pairs', (select coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]') from public.pairs x where tournament_id = '$TA'),
    'teams', (select coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]') from tms x),
    'calcutta_lots', (select coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]') from lots x),
    'payments', (select coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]') from public.payments x where tournament_id = '$TA'),
    'game_entries', (select coalesce(jsonb_agg(to_jsonb(x) order by x.game_id, x.player_id), '[]') from public.game_entries x where tournament_id = '$TA'),
    'game_results', (select coalesce(jsonb_agg(to_jsonb(x) order by x.game_id, x.player_id), '[]') from public.game_results x where tournament_id = '$TA'),
    'groups', (select coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]') from grp x),
    'round_tees', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.round_tees x where round_id in (select id from rds)),
    'scores', (select coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]') from public.scores x where round_id in (select id from rds)),
    'snake_tiebreaks', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.snake_tiebreaks x where round_id in (select id from rds)),
    'card_signatures', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.card_signatures x where round_id in (select id from rds)),
    'handicap_overrides', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.handicap_overrides x where round_id in (select id from rds)),
    'hole_awards', (select coalesce(jsonb_agg(to_jsonb(x) order by x.round_id, x.game_id, x.hole, x.player_id), '[]') from public.hole_awards x where round_id in (select id from rds)),
    'group_members', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.group_members x where group_id in (select id from grp)),
    'team_members', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.team_members x where team_id in (select id from tms)),
    'calcutta_bids', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.calcutta_bids x where lot_id in (select id from lots)),
    'calcutta_buybacks', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.calcutta_buybacks x where lot_id in (select id from lots))
  )) as payload;
reset role;
insert into v4.backups (name, payload) select 'drill', payload from b
  on conflict (name) do update set payload = excluded.payload;
commit;
select 'backup rows: ' || string_agg(k || '=' || jsonb_array_length(v), ' ' order by k)
from v4.backups, jsonb_each(payload -> 'tables') as e(k, v) where name = 'drill' and jsonb_array_length(v) > 0;
SQL

echo "== 6. AFTER the backup: organizer drops 2 entrants and changes the bet winner; group 1 re-answers hole 7; a score changes"
$P <<SQL
begin;
select set_config('request.jwt.claims', harness.claims('$ORG'), true) \g /dev/null
set local role authenticated;
delete from public.game_entries where tournament_id = '$TA' and game_id = 'bote' and player_id in ('$CECI', '$DARIO');
delete from public.game_results where tournament_id = '$TA' and game_id = 'apuesta';
insert into public.game_results (tournament_id, game_id, player_id, share) values ('$TA', 'apuesta', '$BETO', 1);
commit;
begin;
select set_config('request.jwt.claims', harness.claims('$DEVA'), true) \g /dev/null
set local role authenticated;
delete from public.hole_awards where round_id = '$R1' and game_id = 'cerca' and hole = 7 and group_id = '$G1';
insert into public.hole_awards (round_id, group_id, hole, game_id, player_id, decided_by) values ('$R1', '$G1', 7, 'cerca', '$ANA', '$ANA');
update public.scores set strokes = 7 where round_id = '$R1' and player_id = '$ANA' and hole = 1;
commit;
SQL

echo "== 7. RESTORE as the organizer: public.$FN(tournament, backup minus courses/tees/holes)"
$P -At <<SQL
select payload::text as payload from v4.backups where name = 'drill' \gset
begin;
select set_config('request.jwt.claims', harness.claims('$ORG'), true) \g /dev/null
set local role authenticated;
select 'restore returned: ' || public.$FN('$TA', :'payload'::jsonb)::text;
commit;
SQL

echo "== 8. COMPARE the backup with the database after the restore"
$P <<SQL
\pset footer off
with bk as (select payload -> 'tables' as t from v4.backups where name = 'drill'),
lbl as (select id, display_name from public.players where tournament_id = '$TA'),
g as (select id, number from public.groups where round_id = '$R1'),
backup_side as (
  select 'game_entries' as tbl, (select string_agg(x ->> 'game_id' || ':' || coalesce(l.display_name, '?'), ' ' order by x ->> 'game_id', l.display_name)
     from bk, jsonb_array_elements(bk.t -> 'game_entries') x left join lbl l on l.id = (x ->> 'player_id')::uuid) as v
  union all select 'game_results', (select string_agg(x ->> 'game_id' || ':' || coalesce(l.display_name, '?') || ':' || (x ->> 'share'), ' ' order by l.display_name)
     from bk, jsonb_array_elements(bk.t -> 'game_results') x left join lbl l on l.id = (x ->> 'player_id')::uuid)
  union all select 'hole_awards', (select string_agg('h' || (x ->> 'hole') || ':' || coalesce(l.display_name, '?') || ':' || coalesce('grupo ' || g.number, 'COMITE'), ' ' order by (x ->> 'hole')::int, l.display_name)
     from bk, jsonb_array_elements(bk.t -> 'hole_awards') x left join lbl l on l.id = (x ->> 'player_id')::uuid left join g on g.id = (x ->> 'group_id')::uuid)
  union all select 'scores', (select string_agg(coalesce(l.display_name, '?') || ' h' || (x ->> 'hole') || '=' || (x ->> 'strokes'), ' ' order by l.display_name)
     from bk, jsonb_array_elements(bk.t -> 'scores') x left join lbl l on l.id = (x ->> 'player_id')::uuid)
),
db_side as (
  select 'game_entries' as tbl, (select string_agg(e.game_id || ':' || l.display_name, ' ' order by e.game_id, l.display_name) from public.game_entries e join lbl l on l.id = e.player_id where e.tournament_id = '$TA') as v
  union all select 'game_results', (select string_agg(r.game_id || ':' || l.display_name || ':' || r.share, ' ' order by l.display_name) from public.game_results r join lbl l on l.id = r.player_id where r.tournament_id = '$TA')
  union all select 'hole_awards', (select string_agg('h' || a.hole || ':' || l.display_name || ':' || coalesce('grupo ' || g.number, 'COMITE'), ' ' order by a.hole, l.display_name) from public.hole_awards a join lbl l on l.id = a.player_id left join g on g.id = a.group_id where a.round_id = '$R1')
  union all select 'scores', (select string_agg(l.display_name || ' h' || s.hole || '=' || s.strokes, ' ' order by l.display_name) from public.scores s join lbl l on l.id = s.player_id where s.round_id = '$R1')
)
select b.tbl as "table", b.v as "in the backup", d.v as "after the restore",
       case when b.v is not distinct from d.v then 'restored' else 'NOT RESTORED' end as verdict
from backup_side b join db_side d using (tbl) order by 1;
SQL
