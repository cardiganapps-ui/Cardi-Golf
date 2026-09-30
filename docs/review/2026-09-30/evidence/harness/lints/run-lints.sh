#!/usr/bin/env bash
# Supabase splinter advisors + harness extras against fresh copies of polo_template.
#   lint_check  : unseeded copy (splinter, as the dashboard would run it)
#   lint_seeded : seeded copy (extras: privilege matrix, definer functions on auth.users, read matrix)
# Only these two harness-owned databases are (re)created. Output lands next to this script.
set -euo pipefail
PG=/tmp/claude-0/-home-user-Cardi-Golf/ba82926f-40ab-5a97-99c4-91c99e01493a/scratchpad/pg
L=$PG/lints
PSQL=(psql -h 127.0.0.1 -p 5433 -U postgres -X -v ON_ERROR_STOP=1)
cd "$L"
for db in lint_check lint_seeded; do
  "${PSQL[@]}" -d postgres -q -c "drop database if exists $db with (force)" -c "create database $db template polo_template"
done
"${PSQL[@]}" -q -d lint_seeded -f "$PG/seed-two-tenants.sql" >/dev/null

# Splinter as published (pg_graphql gate included: nothing from 0026/0027 here).
"${PSQL[@]}" -q -d lint_check \
  -c 'begin' -f run-splinter.sql \
  -c "\\copy (select name, title, level, facing, array_to_string(categories, ',') as categories, detail, remediation, metadata::text as metadata, cache_key, description from _lint order by name, cache_key) to 'splinter-results.csv' with (format csv, header)" \
  -c 'rollback'
# Same query with the "pg_graphql is installed" gate removed (Supabase installs pg_graphql by default).
"${PSQL[@]}" -q -d lint_check \
  -c 'begin' -f run-splinter-graphql-ungated.sql \
  -c "\\copy (select name, title, level, facing, array_to_string(categories, ',') as categories, detail, remediation, metadata::text as metadata, cache_key, description from _lint_g where name like 'pg_graphql%' order by name, cache_key) to 'splinter-graphql-ungated.csv' with (format csv, header)" \
  -c 'rollback'
# Extras (seeded copy, rolled back).
"${PSQL[@]}" -q -d lint_seeded -f extras.sql
wc -l splinter-results.csv splinter-graphql-ungated.csv e1-table-privileges.csv e2-definer-auth-users.csv e3-read-matrix.csv
