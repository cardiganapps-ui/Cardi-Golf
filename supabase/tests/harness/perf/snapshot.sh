#!/usr/bin/env bash
# DB-12: the database time of one tournament reload, as the phone asks for it.
# Every query of tournamentStore.fetchSnapshot (same filters, ORDER BY and
# 1,000-row pages), run with EXPLAIN ANALYZE as the given user (role
# authenticated, that user's JWT claims, RLS on) in one session, rolled back.
# Prints the total, each query's time and rows, and how many times the
# security-definer helpers ran (pg_stat_xact_user_functions).
# Usage: snapshot.sh <db> <tid> <uid> [runs=3]   (the median run is printed)
# Ported from docs/review/2026-09-30/evidence/verify/V4/perf-snapshot.sh.
set -euo pipefail
DB=$1; TID=$2; UID_=$3; RUNS=${4:-3}
P="psql -X -q -At -v ON_ERROR_STOP=1 -d $DB"
lit() { $P -c "$1"; }
RIDS=$(lit "select coalesce(string_agg(quote_literal(id), ',' order by number), 'null') from public.rounds where tournament_id = '$TID'")
GIDS=$(lit "select coalesce(string_agg(quote_literal(g.id), ','), 'null') from public.groups g join public.rounds r on r.id = g.round_id where r.tournament_id = '$TID'")
CIDS=$(lit "select coalesce(string_agg(distinct quote_literal(course_id), ','), 'null') from public.rounds where tournament_id = '$TID' and course_id is not null")
TEIDS=$(lit "select coalesce(string_agg(quote_literal(t.id), ','), 'null') from public.tees t where t.course_id in (select course_id from public.rounds where tournament_id = '$TID')")
LIDS=$(lit "select coalesce(string_agg(quote_literal(id), ','), 'null') from public.calcutta_lots where tournament_id = '$TID'")
NS=$(lit "select count(*) from public.scores s join public.rounds r on r.id = s.round_id where r.tournament_id = '$TID'")
declare -a Q=(
"tournaments|select * from public.tournaments where id = '$TID'"
"players|select * from public.players where tournament_id = any(array['$TID']::uuid[]) order by id limit 1000"
"rounds|select * from public.rounds where tournament_id = any(array['$TID']::uuid[]) order by id limit 1000"
"pairs|select * from public.pairs where tournament_id = any(array['$TID']::uuid[]) order by id limit 1000"
"teams|select * from public.teams where tournament_id = any(array['$TID']::uuid[]) order by id limit 1000"
"calcutta_lots|select * from public.calcutta_lots where tournament_id = any(array['$TID']::uuid[]) order by id limit 1000"
"payments|select * from public.payments where tournament_id = any(array['$TID']::uuid[]) order by id limit 1000"
"game_entries|select * from public.game_entries where tournament_id = any(array['$TID']::uuid[]) order by tournament_id, game_id, player_id limit 1000"
"game_results|select * from public.game_results where tournament_id = any(array['$TID']::uuid[]) order by tournament_id, game_id, player_id limit 1000"
"money_adjustments|select * from public.money_adjustments where tournament_id = any(array['$TID']::uuid[]) order by id limit 1000"
"groups|select * from public.groups where round_id = any(array[$RIDS]::uuid[]) order by id limit 1000"
"round_tees|select * from public.round_tees where round_id = any(array[$RIDS]::uuid[]) order by round_id, player_id limit 1000"
"scores p1|select * from public.scores where round_id = any(array[$RIDS]::uuid[]) order by id limit 1000 offset 0"
"snake_tiebreaks|select * from public.snake_tiebreaks where round_id = any(array[$RIDS]::uuid[]) order by round_id, group_id, hole limit 1000"
"card_signatures|select * from public.card_signatures where round_id = any(array[$RIDS]::uuid[]) order by round_id, pair_id limit 1000"
"handicap_overrides|select * from public.handicap_overrides where round_id = any(array[$RIDS]::uuid[]) order by round_id, player_id limit 1000"
"calcutta_bids|select * from public.calcutta_bids where lot_id = any(array[$LIDS]::uuid[]) order by id limit 1000"
"calcutta_buybacks|select * from public.calcutta_buybacks where lot_id = any(array[$LIDS]::uuid[]) order by lot_id limit 1000"
"courses|select * from public.courses where id = any(array[$CIDS]::uuid[]) order by id limit 1000"
"tees|select * from public.tees where course_id = any(array[$CIDS]::uuid[]) order by id limit 1000"
"hole_awards|select * from public.hole_awards where round_id = any(array[$RIDS]::uuid[]) order by round_id, game_id, hole, player_id limit 1000"
"group_members|select * from public.group_members where group_id = any(array[$GIDS]::uuid[]) order by group_id, player_id limit 1000"
"holes|select * from public.holes where tee_id = any(array[$TEIDS]::uuid[]) order by tee_id, number limit 1000"
"team_members|select * from public.team_members where team_id = any(array[null]::uuid[]) order by team_id, player_id limit 1000"
)
if [ "$NS" -ge 1000 ]; then Q+=("scores p2|select * from public.scores where round_id = any(array[$RIDS]::uuid[]) order by id limit 1000 offset 1000"); fi
SQL="begin;
set local track_functions = 'all';
select set_config('request.jwt.claims', harness.claims('$UID_'), true) \\g /dev/null
set local role authenticated;
"
for item in "${Q[@]}"; do SQL+="select '@@${item%%|*}';
explain (analyze, format json) ${item#*|};
"; done
SQL+="reset role;
select '@@CALLS ' || coalesce(sum(calls), 0) from pg_stat_xact_user_functions where schemaname = 'public';
rollback;"
for i in $(seq 1 "$RUNS"); do
  OUT=$(echo "$SQL" | $P)
  node -e '
const out = process.argv[1];
const calls = (out.match(/^@@CALLS (\d+)$/m) || [, "?"])[1];
const chunks = out.replace(/^@@CALLS.*$/m, "").split(/^@@/m).slice(1);
let total = 0; const rows = [];
for (const c of chunks) {
  const name = c.slice(0, c.indexOf("\n")).trim();
  const j = JSON.parse(c.slice(c.indexOf("["), c.lastIndexOf("]") + 1))[0];
  total += j["Execution Time"];
  rows.push(`${name}=${j["Execution Time"].toFixed(1)}ms/${j.Plan["Actual Rows"]}r`);
}
console.log(`${total.toFixed(1)}\ttotal_ms=${total.toFixed(1)}  helper_calls=${calls}  ` + rows.join("  "));
' "$OUT"
done | sort -n | sed -n "$(( (RUNS + 1) / 2 ))p" | cut -f2-
