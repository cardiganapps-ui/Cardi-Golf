#!/usr/bin/env bash
# Rebuilds the polo_template database: Supabase stubs, then every file in
# supabase/migrations applied in order EXACTLY as scripts/db.mjs does:
#   create table if not exists public._migrations (...)   -- once, first
#   begin; <file>; insert into public._migrations (name) values ('<file>'); commit;
# with ON_ERROR_STOP. If $PG/workarounds/<file> exists it is applied instead of
# the repo file (only for real migration defects; see candidate-findings.md).
# Everything goes to $PG/migrate.log. Never touches the repo.
set -uo pipefail
PG=/tmp/claude-0/-home-user-Cardi-Golf/ba82926f-40ab-5a97-99c4-91c99e01493a/scratchpad/pg
MIG=/home/user/Cardi-Golf/supabase/migrations
DB=polo_template
LOG=$PG/migrate.log
PSQL=(psql -h 127.0.0.1 -p 5433 -U postgres -X -v ON_ERROR_STOP=1)
mkdir -p "$PG/work"
: >"$LOG"
log() { echo "$*" | tee -a "$LOG"; }

log "== build-template $(date -u +%FT%TZ)  repo HEAD $(git -C /home/user/Cardi-Golf rev-parse HEAD); migrations identical to 379ed52: $(git -C /home/user/Cardi-Golf diff --quiet 379ed5267a3660434068f6a71454a6f4e20a22db -- supabase/migrations && echo yes || echo NO)"
# Drop a previous template (it is marked non-connectable and is_template).
"${PSQL[@]}" -d postgres -q -c "update pg_database set datistemplate = false, datallowconn = true where datname = '$DB'" >>"$LOG" 2>&1
"${PSQL[@]}" -d postgres -q -c "drop database if exists $DB with (force)" >>"$LOG" 2>&1
"${PSQL[@]}" -d postgres -q -c "create database $DB" >>"$LOG" 2>&1 || { log "createdb failed"; exit 1; }

log "-- stubs.sql"
if ! "${PSQL[@]}" -d "$DB" -f "$PG/stubs.sql" >>"$LOG" 2>&1; then log "STUBS FAILED"; exit 1; fi

log "-- _migrations (as scripts/db.mjs)"
"${PSQL[@]}" -d "$DB" -c "create table if not exists public._migrations (name text primary key, applied_at timestamptz not null default now())" >>"$LOG" 2>&1 || exit 1

failed=0
for path in $(ls "$MIG"/*.sql | sort); do
  f=$(basename "$path")
  src=$path
  if [ -f "$PG/workarounds/$f" ]; then
    src=$PG/workarounds/$f
    log "-- $f  (WORKAROUND COPY: $src)"
  else
    log "-- $f"
  fi
  wrapped=$PG/work/$f
  { printf 'begin;\n'; cat "$src"; printf "\ninsert into public._migrations (name) values ('%s');\ncommit;\n" "$f"; } >"$wrapped"
  if "${PSQL[@]}" -d "$DB" -f "$wrapped" >>"$LOG" 2>&1; then
    log "   ok"
  else
    log "   FAILED ($f) — see the error above"
    failed=1
    break
  fi
done

if [ $failed -ne 0 ]; then exit 1; fi
n=$("${PSQL[@]}" -d "$DB" -Atc "select count(*) from public._migrations")
log "== applied: $n migrations"
# Seal it: a template nobody can connect to (so createdb -T never finds sessions).
"${PSQL[@]}" -d "$DB" -q -c "vacuum (analyze)" >>"$LOG" 2>&1
"${PSQL[@]}" -d postgres -q -c "alter database $DB is_template true" -c "alter database $DB allow_connections false" >>"$LOG" 2>&1
log "== polo_template sealed (is_template, no connections)"
