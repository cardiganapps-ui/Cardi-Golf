#!/usr/bin/env bash
# Repro for PG-C3: without scripts/db.mjs's preamble, the chain stops at 0010.
# Creates and drops its own scratch database (pg_nomig) on the harness.
set -uo pipefail
PG=/tmp/claude-0/-home-user-Cardi-Golf/ba82926f-40ab-5a97-99c4-91c99e01493a/scratchpad/pg
P=(psql -h 127.0.0.1 -p 5433 -U postgres -X -q)
"${P[@]}" -d postgres -c "drop database if exists pg_nomig with (force)" -c "create database pg_nomig" 2>/dev/null
"${P[@]}" -v ON_ERROR_STOP=1 -d pg_nomig -f "$PG/stubs.sql" >/dev/null 2>&1
for f in /home/user/Cardi-Golf/supabase/migrations/*.sql; do
  if ! "${P[@]}" -v ON_ERROR_STOP=1 -d pg_nomig -1 -f "$f" >/dev/null 2>"$PG/tests/.nomig.err"; then
    echo "stopped at $(basename "$f"): $(grep -m1 ERROR "$PG/tests/.nomig.err" | sed 's|^psql:.*/migrations/||')"; break
  fi
  echo "ok $(basename "$f")"
done
rm -f "$PG/tests/.nomig.err"
"${P[@]}" -d postgres -c "drop database pg_nomig with (force)"
