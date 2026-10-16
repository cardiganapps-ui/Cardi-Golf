#!/usr/bin/env bash
# 0074 on a database whose tournaments' columns disagree with their settings (ARCH-06). A database at the
# migration before 0074 with the two-tenant seed: tournament A's settings say America/Tijuana while its column
# still says the default, America/Mazatlan; tournament B's settings hold no zone at all. Then 0074 through
# db.mjs migrate, and:
#   1. A's column is its settings' zone, B's keeps what it had; no other column of either moved, and no audit
#      row was written on the way;
#   2. the tournaments' triggers are the ones before, plus the mirror;
#   3. 0074 run a second time changes nothing.
#   bash upgrade_0074.sh <scratch db> <repo root>
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
mig=$ROOT/supabase/migrations/0074_settings_mirror.sql

drop
"${P[@]}" -d postgres -c "create database $DB" >/dev/null
"${P[@]}" -d "$DB" -f "$H/stubs.sql" >/dev/null 2>&1
mkdir "$out/before"
for f in "$ROOT"/supabase/migrations/*.sql; do
  if [[ "$(basename "$f")" < "0074" ]]; then cp "$f" "$out/before/"; fi
done
DB_TARGET=local PGDATABASE=$DB POLO_MIGRATIONS_DIR=$out/before node "$ROOT/scripts/db.mjs" migrate >"$out/log" || { cat "$out/log"; fail "migrate to the migration before 0074"; }
"${P[@]}" -d "$DB" -f "$H/seed-two-tenants.sql" >/dev/null

"${P[@]}" -d "$DB" >/dev/null <<'SQL'
update public.tournaments set settings = jsonb_set(settings, '{timezone}', '"America/Tijuana"') where id = (select id from harness.seed where key = 'tournament_a');
update public.tournaments set settings = settings - 'timezone' where id = (select id from harness.seed where key = 'tournament_b');
SQL

q() { "${P[@]}" -d "$DB" -c "$1"; }
tz() { q "select timezone || ' ' || currency from public.tournaments where id = (select id from harness.seed where key = '$1')"; }
rest="select md5(string_agg((to_jsonb(t) - 'timezone' - 'currency')::text, '|' order by t.id)) from public.tournaments t"
triggers="select string_agg(tgname || ':' || pg_get_triggerdef(oid), '|' order by tgname) from pg_trigger where tgrelid = 'public.tournaments'::regclass and not tgisinternal"
[ "$(tz tournament_a)" = "America/Mazatlan MXN" ] || fail "before 0074, A's column is the default whatever its settings say"
others=$(q "$rest")
trg=$(q "$triggers")
audits=$(q "select count(*) from public.audit_log")

mkdir "$out/with"
for f in "$ROOT"/supabase/migrations/*.sql; do
  if [[ "$(basename "$f")" < "0075" ]]; then cp "$f" "$out/with/"; fi
done
DB_TARGET=local PGDATABASE=$DB POLO_MIGRATIONS_DIR=$out/with node "$ROOT/scripts/db.mjs" migrate >"$out/log" || { cat "$out/log"; fail "0074 did not apply"; }
grep -q 'applying.*0074' "$out/log" || { cat "$out/log"; fail "db.mjs did not apply 0074"; }
ok "0074 applied by db.mjs migrate"

[ "$(tz tournament_a)" = "America/Tijuana MXN" ] || fail "A's column is not its settings' zone: $(tz tournament_a)"
[ "$(tz tournament_b)" = "America/Mazatlan MXN" ] || fail "B, with no zone in its settings, lost its column: $(tz tournament_b)"
[ "$(q "$rest")" = "$others" ] || fail "another column of a tournament moved"
[ "$(q "select count(*) from public.audit_log")" = "$audits" ] || fail "the backfill wrote audit rows"
ok "A's column is its settings' zone, B's keeps its own; nothing else moved, and no audit row"
[ "$(q "select string_agg(tgname || ':' || pg_get_triggerdef(oid), '|' order by tgname) from pg_trigger where tgrelid = 'public.tournaments'::regclass and not tgisinternal and tgname <> 'tournaments_settings_mirror'")" = "$trg" ] || fail "a trigger the tournaments had before changed"
q "select pg_get_triggerdef(oid) from pg_trigger where tgrelid = 'public.tournaments'::regclass and tgname = 'tournaments_settings_mirror'" | grep -q 'BEFORE INSERT OR UPDATE ON public.tournaments FOR EACH ROW' || fail "the mirror is not a before-insert-or-update trigger on every row"
[ "$(q "select count(*) from pg_trigger where tgrelid = 'public.tournaments'::regclass and not tgisinternal and tgenabled <> 'O'")" = "0" ] || fail "a trigger was left disabled"
ok "the triggers are the ones before plus the mirror, each enabled"

after=$(q "select md5(string_agg(to_jsonb(t)::text, '|' order by t.id)) from public.tournaments t")
"${P[@]}" -1 -d "$DB" -f "$mig" >/dev/null
[ "$(q "select md5(string_agg(to_jsonb(t)::text, '|' order by t.id)) from public.tournaments t")" = "$after" ] || fail "0074 run again changed the rows"
[ "$(q "select count(*) from public.audit_log")" = "$audits" ] || fail "0074 run again wrote audit rows"
ok "0074 run a second time changes nothing"
