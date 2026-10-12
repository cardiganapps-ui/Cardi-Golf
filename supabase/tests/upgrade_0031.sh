#!/usr/bin/env bash
# 0031 on a database that already logged deletions (TRUST-03): what production
# meets. A database at 0030 (scripts/db.mjs, as production got it) with three
# rows in the operator's log: an account's deletion with its email, a phone's
# deletion (no email), and an action that is not a deletion. Then 0031 through
# db.mjs migrate, and:
#   1. the account's row keeps the email's fingerprint, never the email;
#   2. the phone's row loses the empty key and gains no fingerprint;
#   3. the other row is untouched;
#   4. 0031 run a second time changes nothing.
#   bash upgrade_0031.sh <scratch db> <repo root>
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
mig=$ROOT/supabase/migrations/0031_anonymize_person.sql

drop
"${P[@]}" -d postgres -c "create database $DB" >/dev/null
"${P[@]}" -d "$DB" -f "$H/stubs.sql" >/dev/null
mkdir "$out/m30"
for f in "$ROOT"/supabase/migrations/*.sql; do [[ "$(basename "$f")" < "0031" ]] && cp "$f" "$out/m30/"; done
DB_TARGET=local PGDATABASE=$DB POLO_MIGRATIONS_DIR=$out/m30 node "$ROOT/scripts/db.mjs" migrate >"$out/log" || { cat "$out/log"; fail "migrate to 0030"; }

"${P[@]}" -d "$DB" >/dev/null <<'SQL'
insert into public.platform_audit_log (action, target_kind, target_id, reason, payload) values
  ('delete', 'person', '11111111-1111-4111-8111-111111111111', 'Pidió borrar su cuenta', '{"email": "Vieja@Polo.Test", "anonymous": false, "linkedPlayers": 1}'),
  ('delete', 'person', '22222222-2222-4222-8222-222222222222', 'Teléfono de prueba', '{"email": null, "anonymous": true, "linkedPlayers": 0}'),
  ('block', 'person', '33333333-3333-4333-8333-333333333333', 'Spam', '{"email": "otra@polo.test", "until": "2027-01-01"}');
SQL

# 0031 and nothing after it: a later migration is its own upgrade test's business.
mkdir "$out/m31"
for f in "$ROOT"/supabase/migrations/*.sql; do [[ "$(basename "$f")" < "0032" ]] && cp "$f" "$out/m31/"; done
DB_TARGET=local PGDATABASE=$DB POLO_MIGRATIONS_DIR=$out/m31 node "$ROOT/scripts/db.mjs" migrate >"$out/log" || { cat "$out/log"; fail "0031 did not apply"; }
grep -q 'applying.*0031' "$out/log" || { cat "$out/log"; fail "db.mjs did not apply 0031"; }
ok "0031 applied by db.mjs migrate"

q() { "${P[@]}" -d "$DB" -c "$1"; }
hash=$(q "select encode(extensions.digest('vieja@polo.test:11111111-1111-4111-8111-111111111111', 'sha256'), 'hex')")
[ "$(q "select payload ->> 'emailHash' from public.platform_audit_log where target_id = '11111111-1111-4111-8111-111111111111'")" = "$hash" ] || fail "the account's deletion keeps the fingerprint"
[ "$(q "select count(*) from public.platform_audit_log where action = 'delete' and payload ? 'email'")" = "0" ] || fail "no deletion keeps an email"
[ "$(q "select (payload - 'emailHash') = '{\"anonymous\": false, \"linkedPlayers\": 1}'::jsonb from public.platform_audit_log where target_id = '11111111-1111-4111-8111-111111111111'")" = "t" ] || fail "the rest of the account's row is as it was"
ok "an account's deletion: the email's fingerprint, never the email, and the rest as it was"
[ "$(q "select payload = '{\"anonymous\": true, \"linkedPlayers\": 0}'::jsonb from public.platform_audit_log where target_id = '22222222-2222-4222-8222-222222222222'")" = "t" ] || fail "a phone's deletion"
ok "a phone's deletion: the empty email goes, no fingerprint comes"
[ "$(q "select payload ->> 'email' from public.platform_audit_log where target_id = '33333333-3333-4333-8333-333333333333'")" = "otra@polo.test" ] || fail "a block is not a deletion"
ok "an action that is not a deletion is untouched"

before=$(q "select md5(string_agg(payload::text, '|' order by id)) from public.platform_audit_log")
"${P[@]}" -d "$DB" -f "$mig" >/dev/null
[ "$(q "select md5(string_agg(payload::text, '|' order by id)) from public.platform_audit_log")" = "$before" ] || fail "0031 run again changed the log"
ok "0031 run a second time changes nothing"
