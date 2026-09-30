#!/usr/bin/env bash
# DB-12: the client's scores page (PostgREST: round_id = ANY(..) ORDER BY id LIMIT 1000 OFFSET n)
# as a PIN-claimed player (role authenticated, RLS on) and, as a control, as postgres (no RLS).
# Usage: perf-measure.sh <db> <tid> <dev uid> <offset> <label> [policy-sql-file]
# One fresh backend (psql session) per call; one transaction, rolled back. Prints one line.
set -euo pipefail
E=$(dirname "$0")
DB=$1; TID=$2; DEV=$3; OFF=$4; LABEL=$5; POL=${6:-}
P="psql -h 127.0.0.1 -p 5433 -U postgres -X -q -At -v ON_ERROR_STOP=1 -d $DB"
RIDS=$($P -c "select string_agg(quote_literal(id), ',' order by number) from public.rounds where tournament_id = '$TID'")
Q="select * from public.scores where round_id = any(array[$RIDS]::uuid[]) order by id limit 1000 offset $OFF"
OUT=$($P <<SQL
begin;
$( [ -n "$POL" ] && cat "$POL" )
set local track_functions = 'all';
explain (analyze, format json) $Q;
select '@@CTRL';
select set_config('request.jwt.claims', harness.claims('$DEV'), true) \g /dev/null
set local role authenticated;
select '@@PLAYER';
explain (analyze, format json) $Q;
reset role;
select '@@CALLS ' || coalesce(string_agg(funcname || '=' || calls, ' ' order by calls desc), '') from pg_stat_xact_user_functions where schemaname = 'public';
rollback;
SQL
)
echo "$OUT" > $E/perf-last-raw.txt; node -e '
const out = process.argv[1], label = process.argv[2];
const parts = out.split(/^@@(?:CTRL|PLAYER)\s*$/m);
const j = (s) => JSON.parse(s.slice(s.indexOf("["), s.lastIndexOf("]") + 1))[0];
const ctrl = j(parts[0]), player = j(parts[parts.length - 1].split("@@CALLS")[0]);
const calls = (out.match(/@@CALLS (.*)$/m) || [,""])[1];
const tot = calls.split(" ").filter(Boolean).reduce((a, kv) => a + Number(kv.split("=")[1]), 0);
const rows = player.Plan["Actual Rows"];
console.log(`${label}\trows=${rows}\tcontrol_no_rls_ms=${ctrl["Execution Time"].toFixed(2)}\tplayer_rls_ms=${player["Execution Time"].toFixed(1)}\thelper_calls=${tot}\tper_row=${rows ? (tot / rows).toFixed(1) : "-"}\t${calls}`);
' "$OUT" "$LABEL"
