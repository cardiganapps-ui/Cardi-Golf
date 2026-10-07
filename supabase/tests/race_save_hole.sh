#!/usr/bin/env bash
# Two phones that both saw hole 12 empty save it at the same moment (0026,
# REL-05): the first holds its transaction open; the second must wait for it,
# see its row, and answer `conflict`, so the first phone's 5 stands. Without
# save_hole's lock on the hole both answered `ok` and the second's 6 replaced
# the 5 unseen: a row lock can't hold a row that isn't there yet.
#   bash race_save_hole.sh <scratch db> <migrated template db> <repo root>
# db-test.sh runs it on the migrated database (step 3b); PG* says where.
set -euo pipefail
DB=$1
TEMPLATE=$2
ROOT=$3
P=(psql -X -q -v ON_ERROR_STOP=1 -At)
out=$(mktemp -d)
trap 'rm -rf "$out"; "${P[@]}" -d postgres -c "drop database if exists $DB with (force)" >/dev/null' EXIT
"${P[@]}" -d postgres -c "drop database if exists $DB with (force)" -c "create database $DB template $TEMPLATE" >/dev/null
"${P[@]}" -d "$DB" -f "$ROOT/supabase/tests/harness/seed-two-tenants.sql" >/dev/null
read -r DEV_A ORG_A ANA BETO R1 <<<"$("${P[@]}" -d "$DB" -c "select string_agg(id::text, ' ' order by key) from harness.seed where key in ('dev_a', 'org_a', 'player_a1', 'player_a2', 'round_a1')")"
DEV_B=0000000b-0000-4000-8000-00000000000b
"${P[@]}" -d "$DB" >/dev/null <<SQL
insert into auth.users (id, last_sign_in_at, raw_app_meta_data, raw_user_meta_data, is_anonymous)
values ('$DEV_B', now(), '{"provider":"anonymous","providers":["anonymous"]}', '{}', true);
begin; select set_config('request.jwt.claims', harness.claims('$ORG_A'), true); set local role authenticated;
update public.rounds set status = 'live' where id = '$R1'; commit;
begin; select set_config('request.jwt.claims', harness.claims('$DEV_B'), true); set local role authenticated;
select public.claim_player('$BETO', '1234'); commit;
SQL
# One phone's save of Ana's 12th, as it saw the hole (empty), held open for $3 seconds.
save() {
  "${P[@]}" -d "$DB" -c "begin" -c "select set_config('request.jwt.claims', harness.claims('$1'), true)" -c "set local role authenticated" \
    -c "select public.save_hole(jsonb_build_object('round_id', '$R1', 'hole', 12, 'mutation_id', gen_random_uuid(), 'entries',
          jsonb_build_array(jsonb_build_object('player_id', '$ANA', 'fields', jsonb_build_object('strokes', $2, 'picked_up', false), 'base', '{}'::jsonb)))) ->> 'status'" \
    -c "select pg_sleep($3)" -c "commit" | grep -xE 'ok|partial|conflict|rejected|not_member'
}
save "$DEV_A" 5 3 >"$out/a" &
sleep 1
save "$DEV_B" 6 0 >"$out/b"
wait
got="$(cat "$out/a") $(cat "$out/b") $("${P[@]}" -d "$DB" -c "select strokes from public.scores where round_id = '$R1' and player_id = '$ANA' and hole = 12")"
if [ "$got" != "ok conflict 5" ]; then
  echo "two phones saving one empty hole at once: want «ok conflict 5» (first, second, stored), got «$got»"
  exit 1
fi
