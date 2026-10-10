#!/usr/bin/env bash
# The database suite (W12, DB-09): a migration is proven on a database before
# it reaches the one that holds the tournament.
#   1. Every migration replayed from zero on Postgres with Supabase's stubs:
#      by a plain psql loop, one transaction per file (the chain needs nothing
#      before it, DB-22), and by scripts/db.mjs as production gets them.
#   2. db.mjs again: nothing left to apply; a file edited or removed after it
#      ran is refused; a ledger without checksums (production before DB-17)
#      gets them, and nothing is applied twice.
#   3. The harness self-test and every supabase/tests/*.sql, each on its own
#      copy of the migrated database with the two-tenant seed; the test
#      server's rules against the real ones (scripts/server-rules.mjs: every
#      request in src/data/testing/cases/serverRules.json, QA-06); then every
#      supabase/tests/race_*.sh, which runs two sessions at once; then every
#      supabase/tests/upgrade_*.sh, which applies a migration to a database at
#      the one before it, already holding tournaments, and compares.
#   4. Supabase's advisors (splinter): no finding over the baseline in
#      supabase/tests/harness/lint-baseline.json (DB-16 holds the line).
# Needs a superuser connection through the PG* variables, and the stub
# extensions of supabase/tests/harness/ext in the server's share/extension
# (db.yml copies them; the review harness on port 5433 has them):
#   PGHOST=127.0.0.1 PGPORT=5433 PGUSER=postgres scripts/db-test.sh
# Its own databases are named POLO_DB_PREFIX* (default polo_ci) and are dropped
# and made again on every run.
set -euo pipefail
# The stubs and the migrations say a lot at NOTICE level (roles already granted, objects skipped): warnings and up only.
export PGOPTIONS="${PGOPTIONS:-} -c client_min_messages=warning"
root=$(cd "$(dirname "$0")/.." && pwd)
H=$root/supabase/tests/harness
P=${POLO_DB_PREFIX:-polo_ci}
PSQL=(psql -X -q -v ON_ERROR_STOP=1)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
fresh() { "${PSQL[@]}" -d postgres -c "drop database if exists $1 with (force)" -c "create database $1${2:+ template $2}"; }
step() { printf '\n== %s\n' "$*"; }
migrations=$(ls "$root"/supabase/migrations/*.sql | sort)
dbmjs() { DB_TARGET=local PGDATABASE=$1 node "$root/scripts/db.mjs" "${@:2}"; }

step "1a. Replay: a plain psql loop, nothing before the first file"
fresh "${P}_plain"
"${PSQL[@]}" -d "${P}_plain" -f "$H/stubs.sql" >/dev/null
for f in $migrations; do
  if ! "${PSQL[@]}" -d "${P}_plain" -1 -f "$f" >"$work/out" 2>&1; then
    cat "$work/out"
    echo "  ✗ $(basename "$f")"
    exit 1
  fi
done
echo "  ✓ $(echo "$migrations" | wc -l) migrations"

step "1b. Replay: scripts/db.mjs migrate, as production gets them"
fresh "$P"
"${PSQL[@]}" -d "$P" -f "$H/stubs.sql" >/dev/null
dbmjs "$P" migrate >"$work/out" || { cat "$work/out"; exit 1; }
n=$("${PSQL[@]}" -d "$P" -Atc "select count(*) from public._migrations where checksum is not null")
[ "$n" -eq "$(echo "$migrations" | wc -l)" ] || { echo "  ✗ $n of $(echo "$migrations" | wc -l) recorded with a checksum"; exit 1; }
echo "  ✓ $n migrations, each recorded with its checksum"

step "2. db.mjs: nothing twice, nothing edited, nothing missing"
dbmjs "$P" migrate >"$work/out"
if grep -q 'applying' "$work/out"; then cat "$work/out"; echo "  ✗ a second migrate applied something"; exit 1; fi
echo "  ✓ a second run applies nothing"
mkdir "$work/mig" && cp "$root"/supabase/migrations/*.sql "$work/mig/"
echo '-- edited after it ran' >>"$work/mig/$(basename "$(echo "$migrations" | tail -1)")"
if POLO_MIGRATIONS_DIR=$work/mig dbmjs "$P" migrate >"$work/out" 2>&1; then echo "  ✗ an edited migration was not refused"; exit 1; fi
grep -q 'changed after it was applied' "$work/out" || { cat "$work/out"; exit 1; }
if POLO_MIGRATIONS_DIR=$work/mig dbmjs "$P" check >"$work/out" 2>&1; then echo "  ✗ check passed an edited migration"; exit 1; fi
echo "  ✓ an edited migration is refused, by migrate and by check"
rm -rf "$work/mig" && mkdir "$work/mig" && cp "$root"/supabase/migrations/*.sql "$work/mig/" && rm "$work/mig/$(basename "$(echo "$migrations" | sed -n 2p)")"
if POLO_MIGRATIONS_DIR=$work/mig dbmjs "$P" migrate >"$work/out" 2>&1; then echo "  ✗ a removed migration was not refused"; exit 1; fi
grep -q 'is not in' "$work/out" || { cat "$work/out"; exit 1; }
echo "  ✓ a migration removed after it ran is refused"
if dbmjs "$P" file "$(echo "$migrations" | sed -n 11p)" >"$work/out" 2>&1; then echo "  ✗ a migration was run again by hand"; exit 1; fi
grep -q 'by hand' "$work/out" || { cat "$work/out"; exit 1; }
echo "  ✓ a migration cannot be run again by hand (db.mjs file)"
fresh "${P}_legacy" "$P"
"${PSQL[@]}" -d "${P}_legacy" -c "update public._migrations set checksum = null"
dbmjs "${P}_legacy" migrate >"$work/out"
if grep -q 'applying' "$work/out"; then cat "$work/out"; echo "  ✗ a ledger without checksums made migrate apply again"; exit 1; fi
[ "$("${PSQL[@]}" -d "${P}_legacy" -Atc "select count(*) from public._migrations where checksum is null")" -eq 0 ] || { echo "  ✗ checksums not filled in"; exit 1; }
echo "  ✓ a ledger from before checksums gets them, and nothing is applied again"

step "3. SQL tests, each on its own copy with the two-tenant seed; the test server's rules, on a copy of their own"
fresh "${P}_seeded" "$P"
"${PSQL[@]}" -d "${P}_seeded" -f "$H/seed-two-tenants.sql" >/dev/null
for t in "$H/selftest.sql" "$root"/supabase/tests/*.sql; do
  fresh "${P}_t" "${P}_seeded"
  if ! "${PSQL[@]}" -d "${P}_t" -f "$t" >"$work/out" 2>&1; then
    tail -30 "$work/out"
    echo "  ✗ $(basename "$t")"
    exit 1
  fi
  echo "  ✓ $(basename "$t")"
done
# The case file brings its own world: a copy with no seed.
fresh "${P}_t" "$P"
PGDATABASE="${P}_t" node "$root/scripts/server-rules.mjs" || exit 1

step "3b. Races: two sessions at once, on the migrated database (supabase/tests/race_*.sh)"
for t in "$root"/supabase/tests/race_*.sh; do
  if ! bash "$t" "${P}_race" "$P" "$root" >"$work/out" 2>&1; then
    tail -30 "$work/out"
    echo "  ✗ $(basename "$t")"
    exit 1
  fi
  echo "  ✓ $(basename "$t")"
done

step "3c. Upgrades: a migration on a database that already holds tournaments (supabase/tests/upgrade_*.sh)"
for t in "$root"/supabase/tests/upgrade_*.sh; do
  if ! bash "$t" "${P}_up" "$root" >"$work/out" 2>&1; then
    tail -30 "$work/out"
    echo "  ✗ $(basename "$t")"
    exit 1
  fi
  sed 's/^/  /' "$work/out"
  echo "  ✓ $(basename "$t")"
done

step "4. Supabase's advisors (splinter), held at the baseline"
"${PSQL[@]}" -d "$P" -At -F ',' -c 'begin' -f "$H/splinter.sql" -c "select name, level, count(*) from _lint group by 1, 2 order by 1, 2" -c 'rollback' >"$work/lints.csv"
node "$root/scripts/db-lints.mjs" "$work/lints.csv" "$H/lint-baseline.json" ${POLO_LINT_WRITE:+--write}

for db in "${P}_plain" "${P}_legacy" "${P}_seeded" "${P}_t"; do "${PSQL[@]}" -d postgres -c "drop database if exists $db with (force)"; done
printf '\n✓ database suite clean\n'
