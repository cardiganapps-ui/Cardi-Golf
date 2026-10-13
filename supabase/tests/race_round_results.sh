#!/usr/bin/env bash
# Round results (0015's refresh_round_results) against two writers at once
# (0041, DB-14). Each case starts from the same seeded copy: tournament A's
# round 1 on a course with a tee of 18 holes, Ana and Beto with three holes
# each. The first session holds its transaction open; the second runs during it.
#   1. Two corrections to a finished round: the second rebuild waits for the
#      first and both land in the results. (Before: the second failed with a
#      duplicate key, 23505, and its correction was lost.)
#   2. A score in flight on a live round while «Terminar ronda» commits: the
#      finish waits for it and its rebuild counts it. (Before: the score's
#      trigger saw the round live and the finish's rebuild could not see the
#      score, so the results kept the old value.)
#   3. The other order: the finish in flight, and a score written during it:
#      the score waits for the finish and rebuilds with itself in.
#   bash race_round_results.sh <scratch db> <migrated template db> <repo root>
# db-test.sh runs it on the migrated database (step 3b); PG* says where.
set -euo pipefail
DB=$1
TEMPLATE=$2
ROOT=$3
P=(psql -X -q -v ON_ERROR_STOP=1 -At)
out=$(mktemp -d)
drop() { for d in "$DB" "${DB}_s"; do "${P[@]}" -d postgres -c "drop database if exists $d with (force)" >/dev/null; done; }
trap 'rm -rf "$out"; drop' EXIT
drop
"${P[@]}" -d postgres -c "create database ${DB}_s template $TEMPLATE" >/dev/null
"${P[@]}" -d "${DB}_s" -f "$ROOT/supabase/tests/harness/seed-two-tenants.sql" >/dev/null
read -r ANA BETO R1 <<<"$("${P[@]}" -d "${DB}_s" -c "select string_agg(id::text, ' ' order by key) from harness.seed where key in ('player_a1', 'player_a2', 'round_a1')")"
# A course with one tee of 18 par-4 holes, the round on it, three holes each.
"${P[@]}" -d "${DB}_s" >/dev/null <<SQL
with c as (insert into public.courses (name) values ('Campo de prueba') returning id),
     t as (insert into public.tees (course_id, name, rating, slope, par_total) select id, 'Azules', 72, 113, 72 from c returning id, course_id)
insert into public.holes (tee_id, number, par, stroke_index) select t.id, n, 4, n from t, generate_series(1, 18) n;
update public.rounds set course_id = (select id from public.courses where name = 'Campo de prueba'), status = 'live' where id = '$R1';
insert into public.scores (round_id, player_id, hole, strokes, putts, picked_up)
select '$R1', p, h, 5, 2, false from unnest(array['$ANA', '$BETO']::uuid[]) p, generate_series(1, 3) h;
SQL

fresh() { "${P[@]}" -d postgres -c "drop database if exists $DB with (force)" -c "create database $DB template ${DB}_s" >/dev/null; }
# One transaction held open $1 seconds before its commit; prints «out:ok» or the error's state.
held() {
  local hold=$1
  shift
  local args=(-c "begin")
  for s in "$@"; do args+=(-c "$s"); done
  args+=(-c "select pg_sleep($hold) is null" -c "commit")
  if "${P[@]}" -d "$DB" "${args[@]}" >"$out/err" 2>&1; then echo "out:ok"; else echo "out:$(grep -oE 'ERROR: .*' "$out/err" | head -1)"; fi
}
score() { echo "update public.scores set strokes = $3 where round_id = '$R1' and player_id = '$1' and hole = $2"; }
finish() { echo "update public.rounds set status = 'finished' where id = '$R1'"; }
# What the results hold for a player's hole: its strokes, from the per-hole detail.
result() { "${P[@]}" -d "$DB" -c "select coalesce((select d ->> 3 from public.round_results rr, jsonb_array_elements(rr.detail) d where rr.round_id = '$R1' and rr.player_id = '$1' and (d ->> 0)::int = $2), 'none')"; }
check() { # <case> <want> <got>
  if [ "$2" != "$3" ]; then
    echo "$1: want «$2», got «$3»"
    exit 1
  fi
  echo "ok - $1"
}

# 1. Two corrections to a finished round at once
fresh
"${P[@]}" -d "$DB" -c "$(finish)" >/dev/null
held 3 "$(score "$ANA" 1 6)" >"$out/a" &
sleep 1
held 0 "$(score "$BETO" 2 7)" >"$out/b"
wait
check "two corrections to a finished round at once (first, second, Ana 1, Beto 2)" \
  "out:ok out:ok 6 7" "$(cat "$out/a") $(cat "$out/b") $(result "$ANA" 1) $(result "$BETO" 2)"

# 2. A score in flight on a live round, and «Terminar ronda» during it
fresh
held 3 "$(score "$ANA" 1 9)" >"$out/a" &
sleep 1
held 0 "$(finish)" >"$out/b"
wait
check "a score in flight while the round finishes (score, finish, Ana 1)" \
  "out:ok out:ok 9" "$(cat "$out/a") $(cat "$out/b") $(result "$ANA" 1)"

# 3. The finish in flight, and a score during it
fresh
held 3 "$(finish)" >"$out/a" &
sleep 1
held 0 "$(score "$ANA" 2 8)" >"$out/b"
wait
check "the round finishing, and a score during it (finish, score, Ana 2)" \
  "out:ok out:ok 8" "$(cat "$out/a") $(cat "$out/b") $(result "$ANA" 2)"
