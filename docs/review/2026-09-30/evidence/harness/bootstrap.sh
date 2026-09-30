#!/usr/bin/env bash
# Your own Polo database on the shared harness (127.0.0.1:5433):
#   $S/pg/bootstrap.sh <dbname>             clone polo_template (stubs + 24 migrations)
#   $S/pg/bootstrap.sh <dbname> --seed      ... and run seed-two-tenants.sql
#   $S/pg/bootstrap.sh <dbname> --recreate [--seed]
#                                            drop <dbname> first (ONLY your own db!)
# Then: psql -h 127.0.0.1 -p 5433 -U postgres <dbname>
set -euo pipefail
PG=/tmp/claude-0/-home-user-Cardi-Golf/ba82926f-40ab-5a97-99c4-91c99e01493a/scratchpad/pg
PSQL=(psql -h 127.0.0.1 -p 5433 -U postgres -X -v ON_ERROR_STOP=1)
db=${1:-}
shift || true
seed=0; recreate=0
for a in "$@"; do
  case "$a" in
    --seed) seed=1 ;;
    --recreate) recreate=1 ;;
    *) echo "unknown option: $a" >&2; exit 2 ;;
  esac
done
if [[ ! "$db" =~ ^[a-z_][a-z0-9_]{0,62}$ ]]; then
  echo "usage: $0 <dbname: lowercase letters, digits, _> [--seed] [--recreate]" >&2; exit 2
fi
case "$db" in
  polo_template|postgres|template0|template1|idem_check|idem_chain|lint_check|lint_seeded|pg_seedtest|pg_restore_test|pg_nomig)
    echo "refusing: '$db' is reserved by the harness" >&2; exit 2 ;;
esac

"$PG/ctl.sh" start >/dev/null
exists=$("${PSQL[@]}" -d postgres -Atc "select 1 from pg_database where datname = '$db'")
if [ "$exists" = 1 ]; then
  if [ $recreate -eq 1 ]; then
    "${PSQL[@]}" -d postgres -q -c "drop database $db with (force)"
  else
    echo "database '$db' already exists (use --recreate to drop it first; only for your own db)" >&2; exit 1
  fi
fi
"${PSQL[@]}" -d postgres -q -c "create database $db template polo_template"
echo "created $db from polo_template"
if [ $seed -eq 1 ]; then
  "${PSQL[@]}" -d "$db" -f "$PG/seed-two-tenants.sql"
fi
echo "connect: psql -h 127.0.0.1 -p 5433 -U postgres $db"
