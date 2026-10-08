#!/usr/bin/env bash
# save_hole against another writer of the same hole at the same moment (0026,
# REL-05). In each case the first session holds its transaction open and the
# second runs during it; each case starts from the same seeded copy.
#   1. Two phones that both saw hole 12 empty: the second waits for the
#      first, sees its row and answers `conflict`, so the first phone's 5
#      stands (a row lock can't hold a row that isn't there yet: save_hole's
#      lock on the hole does).
#   2. The same mutation twice at once (a retry while the first was still
#      out): the second waits and answers the first's answer, replayed.
#   3. An old build's direct update open on a row, and a phone's save that saw
#      the value before it: the save waits for the row and answers
#      `conflict`; the old build's 7 stands.
#   4. The Comité's admin_save_score open on an empty hole, and a phone that
#      saw it empty: the phone waits for the hole and answers `conflict`.
#   5. resolve_score_dispute holds the same lock on the hole while it runs.
#   6. An old build's write of two rows of a hole (in the players' order, a
#      pause between them), and a save of both players listed the other way
#      round: the save locks the rows at once and in that order, so it waits
#      instead of deadlocking.
#   bash race_save_hole.sh <scratch db> <migrated template db> <repo root>
# db-test.sh runs it on the migrated database (step 3b); PG* says where.
set -euo pipefail
DB=$1
TEMPLATE=$2
ROOT=$3
P=(psql -X -q -v ON_ERROR_STOP=1 -At)
out=$(mktemp -d)
drop() { for d in "$DB" "${DB}_s"; do "${P[@]}" -d postgres -c "drop database if exists $d with (force)" >/dev/null; done; }
trap 'rm -rf "$out"; drop' EXIT
drop
"${P[@]}" -d postgres -c "create database ${DB}_s template $TEMPLATE" >/dev/null
"${P[@]}" -d "${DB}_s" -f "$ROOT/supabase/tests/harness/seed-two-tenants.sql" >/dev/null
read -r DEV_A ORG_A ANA BETO R1 <<<"$("${P[@]}" -d "${DB}_s" -c "select string_agg(id::text, ' ' order by key) from harness.seed where key in ('dev_a', 'org_a', 'player_a1', 'player_a2', 'round_a1')")"
read -r LO HI <<<"$("${P[@]}" -d "${DB}_s" -c "select least('$ANA'::uuid, '$BETO'::uuid) || ' ' || greatest('$ANA'::uuid, '$BETO'::uuid)")"
DEV_B=0000000b-0000-4000-8000-00000000000b
"${P[@]}" -d "${DB}_s" >/dev/null <<SQL
insert into auth.users (id, last_sign_in_at, raw_app_meta_data, raw_user_meta_data, is_anonymous)
values ('$DEV_B', now(), '{"provider":"anonymous","providers":["anonymous"]}', '{}', true);
begin; select set_config('request.jwt.claims', harness.claims('$ORG_A'), true); set local role authenticated;
update public.rounds set status = 'live' where id = '$R1'; commit;
begin; select set_config('request.jwt.claims', harness.claims('$DEV_B'), true); set local role authenticated;
select public.claim_player('$BETO', '1234'); commit;
SQL

fresh() { "${P[@]}" -d postgres -c "drop database if exists $DB with (force)" -c "create database $DB template ${DB}_s" >/dev/null; }
# One transaction as a user of the app (role authenticated, that user's claims),
# held open $2 seconds before its commit. Prints each «out:» line and any error.
as_user() {
  local who=$1 hold=$2
  shift 2
  local args=(-c "begin" -c "select set_config('request.jwt.claims', harness.claims('$who'), true) is null" -c "set local role authenticated")
  for s in "$@"; do args+=(-c "$s"); done
  args+=(-c "select pg_sleep($hold) is null" -c "commit")
  "${P[@]}" -d "$DB" "${args[@]}" 2>&1 | grep -E '^out:|ERROR' || true
}
# The SQL of a phone's save of one player's hole: «out:<status>[:replayed…]».
save() { # <hole> <player> <fields> <base, or '' for none> [mutation id]
  local base=''
  [ -n "$4" ] && base=", 'base', '$4'::jsonb"
  echo "select 'out:' || (r ->> 'status') || coalesce(':replayed' || (r ->> 'replayed'), '') from public.save_hole(jsonb_build_object('round_id', '$R1', 'hole', $1,
    'mutation_id', '${5:-$(cat /proc/sys/kernel/random/uuid)}', 'entries', jsonb_build_array(jsonb_build_object('player_id', '$2', 'fields', '$3'::jsonb$base)))) r"
}
stored() { "${P[@]}" -d "$DB" -c "select coalesce((select strokes::text || '/' || coalesce(putts::text, '-') from public.scores where round_id = '$R1' and player_id = '$1' and hole = $2), 'none')"; }
check() { # <case> <want> <got>
  if [ "$2" != "$3" ]; then
    echo "$1: want «$2», got «$3»"
    exit 1
  fi
  echo "ok - $1"
}

# 1. Two phones save one empty hole at once
fresh
as_user "$DEV_A" 3 "$(save 12 "$ANA" '{"strokes":5,"picked_up":false}' '{}')" >"$out/a" &
sleep 1
as_user "$DEV_B" 0 "$(save 12 "$ANA" '{"strokes":6,"picked_up":false}' '{}')" >"$out/b"
wait
check "two phones saving one empty hole at once (first, second, stored)" "out:ok out:conflict 5/-" "$(cat "$out/a") $(cat "$out/b") $(stored "$ANA" 12)"

# 2. The same mutation twice at once
fresh
M=$(cat /proc/sys/kernel/random/uuid)
as_user "$DEV_A" 2 "$(save 1 "$ANA" '{"strokes":4,"picked_up":false}' '{}' "$M")" >"$out/a" &
sleep 0.7
as_user "$DEV_A" 0 "$(save 1 "$ANA" '{"strokes":9,"picked_up":false}' '{}' "$M")" >"$out/b"
wait
check "the same mutation twice at once: the second waits and answers the first's answer (first, second, stored)" "out:ok out:ok:replayedtrue 4/-" "$(cat "$out/a") $(cat "$out/b") $(stored "$ANA" 1)"

# 3. An old build's direct update open on a row; a phone's save that saw the value before it
fresh
as_user "$DEV_A" 0 "$(save 5 "$ANA" '{"strokes":5,"putts":2,"picked_up":false}' '{}')" >/dev/null
as_user "$DEV_B" 2 "update public.scores set strokes = 7 where round_id = '$R1' and player_id = '$ANA' and hole = 5" >"$out/a" &
sleep 0.7
as_user "$DEV_A" 0 "$(save 5 "$ANA" '{"strokes":6}' '{"strokes":5}')" >"$out/b"
wait
check "an old build's update open, a stale save during it (save, stored)" "out:conflict 7/2" "$(cat "$out/a")$(cat "$out/b") $(stored "$ANA" 5)"

# 4. The Comité's correction open on an empty hole; a phone that saw it empty
fresh
as_user "$ORG_A" 2 "select 'out:admin' from public.admin_save_score('$R1', '$ANA', 8, 5, 2, false, 'Tarjeta de papel')" >"$out/a" &
sleep 0.7
as_user "$DEV_B" 0 "$(save 8 "$ANA" '{"strokes":7,"putts":2,"picked_up":false}' '{}')" >"$out/b"
wait
check "admin_save_score open, a phone that saw the hole empty (admin, phone, stored)" "out:admin out:conflict 5/2" "$(cat "$out/a") $(cat "$out/b") $(stored "$ANA" 8)"

# 5. resolve_score_dispute holds the hole's lock
fresh
as_user "$DEV_A" 0 "$(save 9 "$ANA" '{"strokes":5,"putts":2,"picked_up":false}' '{}')" >/dev/null
as_user "$DEV_B" 0 "$(save 9 "$ANA" '{"strokes":6}' '{"strokes":5}')" >/dev/null
as_user "$ORG_A" 2 "select 'out:resolved' from public.resolve_score_dispute('$R1', '$ANA', 9, false)" >"$out/a" &
sleep 0.7
"${P[@]}" -d "$DB" -c "select 'out:' || pg_try_advisory_xact_lock(hashtextextended('save_hole:$R1:9', 0))" >"$out/b"
wait
check "resolve_score_dispute open: the hole's lock is taken (resolve, lock free?, stored)" "out:resolved out:false 5/2" "$(cat "$out/a") $(cat "$out/b") $(stored "$ANA" 9)"

# 6. An old build's two rows of a hole in the players' order; a save listing them the other way round
both() { # <hole> <first player> <second player> <fields>
  echo "select 'out:' || (public.save_hole(jsonb_build_object('round_id', '$R1', 'hole', $1, 'mutation_id', gen_random_uuid(), 'entries', jsonb_build_array(
    jsonb_build_object('player_id', '$2', 'fields', '$4'::jsonb), jsonb_build_object('player_id', '$3', 'fields', '$4'::jsonb)))) ->> 'status')"
}
fresh
as_user "$DEV_A" 0 "$(both 7 "$ANA" "$BETO" '{"strokes":4,"putts":2,"picked_up":false}')" >/dev/null
as_user "$DEV_B" 0 "update public.scores set putts = 1 where round_id = '$R1' and player_id = '$LO' and hole = 7 returning 'out:first'" \
  "select pg_sleep(2) is null" "update public.scores set putts = 1 where round_id = '$R1' and player_id = '$HI' and hole = 7 returning 'out:second'" >"$out/a" &
sleep 0.5
as_user "$DEV_A" 0 "$(both 7 "$HI" "$LO" '{"putts":3}')" >"$out/b"
wait
check "an old build's two rows and a save of both the other way round: no deadlock (old build, save, stored)" "out:first out:second out:ok 4/3 4/3" \
  "$(tr '\n' ' ' <"$out/a")$(cat "$out/b") $(stored "$LO" 7) $(stored "$HI" 7)"
