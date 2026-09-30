#!/usr/bin/env bash
# DB-03: the Comité removes a group of a live round in Comité > Grupos (upsert_groups without it).
# Runs on v4_ctl after restore-drill.sh v4_ctl restore_tournament_0011 (claims linked to their groups).
set -euo pipefail
DB=${1:-v4_ctl}
case "$DB" in v4_*) ;; *) echo "refusing: not a v4 database"; exit 2;; esac
P="psql -h 127.0.0.1 -p 5433 -U postgres -X -q -v ON_ERROR_STOP=1 -d $DB"
seed() { $P -At -c "select id from harness.seed where key='$1'"; }
TA=$(seed tournament_a); R1=$(seed round_a1); G1=$(seed group_a1); ORG=$(seed org_a)
ANA=$(seed player_a1); BETO=$(seed player_a2)
CECI=$($P -At -c "select id from public.players where tournament_id='$TA' and display_name='Ceci'")
DARIO=$($P -At -c "select id from public.players where tournament_id='$TA' and display_name='Dario'")

# The engine's rule (src/engine/games/contest/index.ts:62-64): group-less rows (Comité) override the
# groups' claims; a single-winner contest with 2+ claimants is 'disputed' and pays nothing.
VIEW="with a as (select h.hole, p.display_name as who, h.group_id from public.hole_awards h join public.players p on p.id = h.player_id where h.round_id = '$R1' and h.game_id = 'cerca'),
 per as (select hole, string_agg(who || ':' || coalesce((select 'grupo ' || g.number from public.groups g where g.id = a.group_id), 'COMITE'), ' ' order by who) as rows,
   coalesce(array_agg(who order by who) filter (where group_id is null), '{}') as comite, array_agg(distinct who) as allc from a group by hole)
 select hole, rows, case when cardinality(comite) > 0 then comite else allc end as counted,
   case when cardinality(case when cardinality(comite) > 0 then comite else allc end) > 1 then 'disputed (pays nothing)' else 'won by ' || (case when cardinality(comite) > 0 then comite else allc end)[1] end as engine
 from per order by hole;"

echo "== before: groups and claims of round 1"
$P -c "select g.number, string_agg(p.display_name, ', ' order by p.display_name) as members from public.groups g join public.group_members m on m.group_id = g.id join public.players p on p.id = m.player_id where g.round_id = '$R1' group by g.number order by 1;"
$P -c "$VIEW"

echo "== the Comité consolidates round 1 into one group of four (Grupos: delete group 2, add Ceci and Dario to group 1, Guardar)"
$P -At <<SQL
begin;
select set_config('request.jwt.claims', harness.claims('$ORG'), true) \g /dev/null
set local role authenticated;
select 'upsert_groups: ' || public.upsert_groups('$R1', jsonb_build_array(
  jsonb_build_object('id','$G1','number',1,'tee_time','09:00','start_hole',1,'player_ids',jsonb_build_array('$ANA','$BETO','$CECI','$DARIO'))))::text;
commit;
SQL

echo "== after"
$P -c "$VIEW"
echo "== audit_log rows written for hole_awards by that save (who changed the claim?)"
$P -c "select action, before ->> 'group_id' as group_before, after ->> 'group_id' as group_after, actor_player_id is null as no_actor from public.audit_log where table_name = 'hole_awards' and action = 'update' order by at desc limit 3;"
