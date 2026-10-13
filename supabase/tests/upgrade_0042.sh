#!/usr/bin/env bash
# 0042 on a database whose hole contests already hold claims and rulings
# (DB-03, DB-04). A database at 0041 with the two-tenant seed and Ceci in a
# second group of tournament A. On «Más cerca»: hole 3 claimed by both groups,
# hole 5 ruled by the Comité, and hole 7 the row DB-03 left behind (a claim
# whose group was deleted, now with no group). Then 0042 through db.mjs
# migrate, and:
#   1. every row is kept, value for value;
#   2. each reads as whose it was: the claims as their group's, the ruling and
#      the orphaned row as the Comité's, as the engine already read them;
#   3. the policies and triggers on hole_awards are the ones 0041 had;
#   4. 0042 run a second time changes nothing.
#   bash upgrade_0042.sh <scratch db> <repo root>
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
mig=$ROOT/supabase/migrations/0042_hole_award_rulings.sql

drop
"${P[@]}" -d postgres -c "create database $DB" >/dev/null
"${P[@]}" -d "$DB" -f "$H/stubs.sql" >/dev/null 2>&1
mkdir "$out/m41"
for f in "$ROOT"/supabase/migrations/*.sql; do
  if [[ "$(basename "$f")" < "0042" ]]; then cp "$f" "$out/m41/"; fi
done
DB_TARGET=local PGDATABASE=$DB POLO_MIGRATIONS_DIR=$out/m41 node "$ROOT/scripts/db.mjs" migrate >"$out/log" || { cat "$out/log"; fail "migrate to 0041"; }
"${P[@]}" -d "$DB" -f "$H/seed-two-tenants.sql" >/dev/null

"${P[@]}" -d "$DB" >/dev/null <<'SQL'
create temp table k as select
  (select id from harness.seed where key = 'tournament_a') t,
  (select id from harness.seed where key = 'round_a1') r,
  (select id from harness.seed where key = 'group_a1') g1,
  (select id from harness.seed where key = 'player_a1') ana,
  (select id from harness.seed where key = 'player_a2') beto;
insert into public.players (id, tournament_id, full_name, display_name, sort_order)
  select '66666666-6666-4666-8666-666666666666', t, 'Ceci Alfa', 'Ceci', 2 from k;
insert into public.groups (id, round_id, number, start_hole) select '77777777-7777-4777-8777-777777777777', r, 2, 1 from k;
insert into public.group_members (group_id, player_id) values ('77777777-7777-4777-8777-777777777777', '66666666-6666-4666-8666-666666666666');
insert into public.hole_awards (round_id, group_id, hole, game_id, player_id, decided_by, created_at)
  select r, g1, 3, 'closest', ana, ana, '2027-04-09 15:00+00'::timestamptz from k
  union all select r, '77777777-7777-4777-8777-777777777777', 3, 'closest', '66666666-6666-4666-8666-666666666666', '66666666-6666-4666-8666-666666666666', '2027-04-09 15:01+00'::timestamptz from k
  union all select r, null, 5, 'closest', beto, ana, '2027-04-09 15:02+00'::timestamptz from k
  union all select r, null, 7, 'closest', ana, ana, '2027-04-09 15:03+00'::timestamptz from k;
SQL

q() { "${P[@]}" -d "$DB" -c "$1"; }
rows="select coalesce(string_agg(to_jsonb(a)::text, '|' order by a.hole, a.player_id, a.group_id nulls first), '') from (select round_id, group_id, hole, game_id, player_id, decided_by, created_at, tournament_id from public.hole_awards) a"
policies="select string_agg(policyname || ':' || cmd || ':' || coalesce(qual, '') || ':' || coalesce(with_check, ''), '|' order by policyname) from pg_policies where schemaname = 'public' and tablename = 'hole_awards'"
triggers="select string_agg(tgname || ':' || pg_get_triggerdef(oid), '|' order by tgname) from pg_trigger where tgrelid = 'public.hole_awards'::regclass and not tgisinternal"
before=$(q "$rows")
pol=$(q "$policies")
trg=$(q "$triggers")
[ "$(q "select count(*) from public.hole_awards")" = "4" ] || fail "the 0041 database holds the four rows"

# 0042 and nothing after it.
mkdir "$out/m42"
for f in "$ROOT"/supabase/migrations/*.sql; do
  if [[ "$(basename "$f")" < "0043" ]]; then cp "$f" "$out/m42/"; fi
done
DB_TARGET=local PGDATABASE=$DB POLO_MIGRATIONS_DIR=$out/m42 node "$ROOT/scripts/db.mjs" migrate >"$out/log" || { cat "$out/log"; fail "0042 did not apply"; }
grep -q 'applying.*0042' "$out/log" || { cat "$out/log"; fail "db.mjs did not apply 0042"; }
ok "0042 applied by db.mjs migrate"

[ "$(q "$rows")" = "$before" ] || fail "every row is kept, value for value"
ok "every row is kept, value for value"
[ "$(q "select string_agg(hole || ':' || source, ' ' order by hole, source) from public.hole_awards")" = "3:group 3:group 5:comite 7:comite" ] || fail "each row reads as whose it was: $(q "select string_agg(hole || ':' || source, ' ' order by hole, source) from public.hole_awards")"
ok "the claims read as their group's; the ruling and the row whose group was deleted as the Comité's, as the engine read them"
[ "$(q "$policies")" = "$pol" ] || fail "the policies on hole_awards changed"
[ "$(q "$triggers")" = "$trg" ] || fail "the triggers on hole_awards changed"
ok "the policies and triggers on hole_awards are 0041's"

after=$(q "select md5(string_agg(to_jsonb(a)::text, '|' order by a.hole, a.player_id, a.source)) from public.hole_awards a")
key=$(q "select pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.hole_awards'::regclass and contype = 'p'")
"${P[@]}" -d "$DB" -f "$mig" >/dev/null
[ "$(q "select md5(string_agg(to_jsonb(a)::text, '|' order by a.hole, a.player_id, a.source)) from public.hole_awards a")" = "$after" ] || fail "0042 run again changed the rows"
[ "$(q "select pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.hole_awards'::regclass and contype = 'p'")" = "$key" ] || fail "0042 run again changed the key"
ok "0042 run a second time changes nothing"
