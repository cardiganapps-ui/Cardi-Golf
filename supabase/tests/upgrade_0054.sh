#!/usr/bin/env bash
# 0054 on a database whose cards are already signed the pairs' way (UX-23). A
# database at 0053 with the two-tenant seed: tournament A plays the pairs game
# (no `cardSigning` key, as every tournament stored before 0054), Ceci and
# Dani join Ana and Beto's group, and both pairs' cards of day 1 are signed,
# one over a hole in discrepancy. Then 0054 through db.mjs migrate, and:
#   1. every signature is kept, value for value, keyed by its pair, with no
#      player; no audit row and no score changed on the way;
#   2. the tournament reads as the pairs' rule, and the triggers on
#      card_signatures are the ones 0053 had;
#   3. 0054 run a second time changes nothing.
#   bash upgrade_0054.sh <scratch db> <repo root>
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
mig=$ROOT/supabase/migrations/0054_card_signing.sql

drop
"${P[@]}" -d postgres -c "create database $DB" >/dev/null
"${P[@]}" -d "$DB" -f "$H/stubs.sql" >/dev/null 2>&1
mkdir "$out/m53"
for f in "$ROOT"/supabase/migrations/*.sql; do
  if [[ "$(basename "$f")" < "0054" ]]; then cp "$f" "$out/m53/"; fi
done
DB_TARGET=local PGDATABASE=$DB POLO_MIGRATIONS_DIR=$out/m53 node "$ROOT/scripts/db.mjs" migrate >"$out/log" || { cat "$out/log"; fail "migrate to 0053"; }
"${P[@]}" -d "$DB" -f "$H/seed-two-tenants.sql" >/dev/null

"${P[@]}" -d "$DB" >/dev/null <<'SQL'
create temp table k as select
  (select id from harness.seed where key = 'tournament_a') t,
  (select id from harness.seed where key = 'round_a1') r,
  (select id from harness.seed where key = 'group_a1') g1,
  (select id from harness.seed where key = 'player_a1') ana,
  (select id from harness.seed where key = 'player_a2') beto;
update public.tournaments set settings = jsonb_set(settings, '{modules,pairs,enabled}', 'true') where id = (select t from k);
insert into public.players (id, tournament_id, full_name, display_name, sort_order)
  select '54000000-0000-4000-8000-000000000003'::uuid, t, 'Ceci Alfa', 'Ceci', 2 from k
  union all select '54000000-0000-4000-8000-000000000004'::uuid, t, 'Dani Alfa', 'Dani', 3 from k;
insert into public.group_members (group_id, player_id)
  select g1, '54000000-0000-4000-8000-000000000003'::uuid from k union all select g1, '54000000-0000-4000-8000-000000000004'::uuid from k;
insert into public.pairs (id, tournament_id, player1_id, player2_id, kind)
  select '54000000-0000-4000-8000-0000000000ad'::uuid, t, ana, '54000000-0000-4000-8000-000000000004'::uuid, 'AD' from k
  union all select '54000000-0000-4000-8000-0000000000bc'::uuid, t, beto, '54000000-0000-4000-8000-000000000003'::uuid, 'BC' from k;
update public.rounds set status = 'live' where id = (select r from k);
insert into public.scores (round_id, player_id, hole, strokes, putts, picked_up, entered_by)
  select r, p, 1, 4, 2, false, ana from k, unnest(array[ana, beto, '54000000-0000-4000-8000-000000000003'::uuid, '54000000-0000-4000-8000-000000000004'::uuid]) p;
-- Another phone's value over Dani's 1st: a discrepancy, left for the signature below to settle.
update public.scores set strokes = 5, entered_by = (select beto from k) where player_id = '54000000-0000-4000-8000-000000000004';
insert into public.card_signatures (round_id, pair_id, signed_by, signed_at)
  select r, '54000000-0000-4000-8000-0000000000bc'::uuid, ana, '2027-04-09 15:00+00'::timestamptz from k
  union all select r, '54000000-0000-4000-8000-0000000000ad'::uuid, beto, '2027-04-09 15:01+00'::timestamptz from k;
SQL

q() { "${P[@]}" -d "$DB" -c "$1"; }
rows="select coalesce(string_agg(to_jsonb(a)::text, '|' order by a.pair_id), '') from (select round_id, pair_id, signed_by, signed_at, tournament_id from public.card_signatures) a"
scores="select md5(string_agg(to_jsonb(s)::text, '|' order by s.id)) from public.scores s"
triggers="select string_agg(tgname || ':' || pg_get_triggerdef(oid), '|' order by tgname) from pg_trigger where tgrelid = 'public.card_signatures'::regclass and not tgisinternal"
before=$(q "$rows")
sc=$(q "$scores")
trg=$(q "$triggers")
audits=$(q "select count(*) from public.audit_log")
[ "$(q "select count(*) from public.card_signatures")" = "2" ] || fail "the 0053 database holds the two signatures"
[ "$(q "select count(*) from public.scores where disputed")" = "0" ] || fail "the signature settled Dani's discrepancy before 0054"

# 0054 and nothing after it.
mkdir "$out/m54"
for f in "$ROOT"/supabase/migrations/*.sql; do
  if [[ "$(basename "$f")" < "0055" ]]; then cp "$f" "$out/m54/"; fi
done
DB_TARGET=local PGDATABASE=$DB POLO_MIGRATIONS_DIR=$out/m54 node "$ROOT/scripts/db.mjs" migrate >"$out/log" || { cat "$out/log"; fail "0054 did not apply"; }
grep -q 'applying.*0054' "$out/log" || { cat "$out/log"; fail "db.mjs did not apply 0054"; }
ok "0054 applied by db.mjs migrate"

[ "$(q "$rows")" = "$before" ] || fail "every signature is kept, value for value"
[ "$(q "select count(*) from public.card_signatures where card_id = pair_id and player_id is null")" = "2" ] || fail "each keyed by its pair, with no player"
[ "$(q "$scores")" = "$sc" ] || fail "a score changed"
[ "$(q "select count(*) from public.audit_log")" = "$audits" ] || fail "the migration wrote audit rows"
ok "every signature is kept, value for value, keyed by its pair; no score or audit row moved"
[ "$(q "select public.card_signing_mode(settings) from public.tournaments where id = (select id from harness.seed where key = 'tournament_a')")" = "pairs" ] || fail "tournament A does not read as the pairs' rule"
[ "$(q "select public.card_signing_mode(settings) from public.tournaments where id = (select id from harness.seed where key = 'tournament_b')")" = "none" ] || fail "tournament B (no pairs game) does not read as no signing"
[ "$(q "$triggers")" = "$trg" ] || fail "the triggers on card_signatures changed"
ok "the stored tournaments read as before (A by the pairs, B unsigned); the triggers are 0053's"

after=$(q "select md5(string_agg(to_jsonb(a)::text, '|' order by a.card_id)) from public.card_signatures a")
cons=$(q "select string_agg(conname || ':' || pg_get_constraintdef(oid), '|' order by conname) from pg_constraint where conrelid = 'public.card_signatures'::regclass")
"${P[@]}" -1 -d "$DB" -f "$mig" >/dev/null
[ "$(q "select md5(string_agg(to_jsonb(a)::text, '|' order by a.card_id)) from public.card_signatures a")" = "$after" ] || fail "0054 run again changed the rows"
[ "$(q "select string_agg(conname || ':' || pg_get_constraintdef(oid), '|' order by conname) from pg_constraint where conrelid = 'public.card_signatures'::regclass")" = "$cons" ] || fail "0054 run again changed the keys"
ok "0054 run a second time changes nothing"
