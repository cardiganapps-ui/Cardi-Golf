#!/usr/bin/env bash
# 0032 on a database whose operator log already holds emails (TRUST-03, round
# 2). A database at 0031 with one account (Vivo) and three rows that carry an
# email: Vivo's set_organizer, one for an account deleted before 0031
# (Ida, gone), and a block of Ida. Then 0032 through db.mjs migrate, and:
#   1. the rows whose account is gone keep the email's fingerprint, keyed by
#      the account the row names, and the rest of their payload;
#   2. the live account's row is untouched (its owner can still be told apart);
#   3. 0032 run a second time changes nothing.
#   bash upgrade_0032.sh <scratch db> <repo root>
# db-test.sh runs it in step 3c; PG* says where.
set -euo pipefail
DB=$1
ROOT=$2
P=(psql -X -q -v ON_ERROR_STOP=1 -At)
H=$ROOT/supabase/tests/harness
out=$(mktemp -d)
drop() { "${P[@]}" -d postgres -c "drop database if exists $DB with (force)" >/dev/null; }
trap 'rm -rf "$out"; drop' EXIT
fail() { echo "  ✗ $*"; exit 1; }
ok() { echo "  ✓ $*"; }
mig=$ROOT/supabase/migrations/0032_anonymize_copies.sql

drop
"${P[@]}" -d postgres -c "create database $DB" >/dev/null
"${P[@]}" -d "$DB" -f "$H/stubs.sql" >/dev/null
mkdir "$out/m31"
for f in "$ROOT"/supabase/migrations/*.sql; do [[ "$(basename "$f")" < "0032" ]] && cp "$f" "$out/m31/"; done
DB_TARGET=local PGDATABASE=$DB POLO_MIGRATIONS_DIR=$out/m31 node "$ROOT/scripts/db.mjs" migrate >"$out/log" || { cat "$out/log"; fail "migrate to 0031"; }

"${P[@]}" -d "$DB" >/dev/null <<'SQL'
insert into auth.users (id, email, is_anonymous) values ('44444444-4444-4444-8444-444444444444', 'vivo@polo.test', false);
insert into public.platform_audit_log (action, target_kind, target_id, reason, payload) values
  ('set_organizer', 'tournament', 't-1', 'Comité nuevo', '{"userId": "44444444-4444-4444-8444-444444444444", "email": "vivo@polo.test", "role": "owner"}'),
  ('set_organizer', 'tournament', 't-2', 'Comité nuevo', '{"userId": "55555555-5555-4555-8555-555555555555", "email": "Ida@Polo.Test", "role": "admin"}'),
  ('block', 'person', '55555555-5555-4555-8555-555555555555', 'Spam', '{"email": "ida@polo.test", "until": "2027-01-01"}');
SQL

DB_TARGET=local PGDATABASE=$DB node "$ROOT/scripts/db.mjs" migrate >"$out/log" || { cat "$out/log"; fail "0032 did not apply"; }
grep -q 'applying.*0032' "$out/log" || { cat "$out/log"; fail "db.mjs did not apply 0032"; }
ok "0032 applied by db.mjs migrate"

q() { "${P[@]}" -d "$DB" -c "$1"; }
hash=$(q "select encode(extensions.digest('ida@polo.test:55555555-5555-4555-8555-555555555555', 'sha256'), 'hex')")
[ "$(q "select count(*) from public.platform_audit_log where payload ->> 'emailHash' = '$hash' and not payload ? 'email'")" = "2" ] || fail "both rows of the account that is gone keep its fingerprint"
[ "$(q "select payload ->> 'role' from public.platform_audit_log where target_id = 't-2'")" = "admin" ] || fail "the rest of the row stays"
[ "$(q "select payload ->> 'until' from public.platform_audit_log where action = 'block'")" = "2027-01-01" ] || fail "the rest of the block stays"
ok "an account that is gone: every row with its email keeps the fingerprint, and the rest as it was"
[ "$(q "select payload ->> 'email' from public.platform_audit_log where target_id = 't-1'")" = "vivo@polo.test" ] || fail "the live account's row is untouched"
ok "a live account's row is untouched"

before=$(q "select md5(string_agg(payload::text, '|' order by id)) from public.platform_audit_log")
"${P[@]}" -d "$DB" -f "$mig" >/dev/null
[ "$(q "select md5(string_agg(payload::text, '|' order by id)) from public.platform_audit_log")" = "$before" ] || fail "0032 run again changed the log"
ok "0032 run a second time changes nothing"
