#!/usr/bin/env bash
# resolve_rejected_write (0028, REL-08) against another writer of the same
# hole, or another Comité phone, at the same moment. In each case the first
# session holds its transaction open and the second runs during it; each case
# starts from the same seeded copy, round 1 live, and a row of the inbox for
# Ana's hole (sent from a phone outside the group).
#   1. A phone's save_hole open on an empty hole, and the Comité applying the
#      row with the hole seen empty: the apply waits on save_hole's lock on
#      the hole, then meets the phone's 5/2 and is refused; the 5/2 stands.
#      (Without the lock it reads no row, and once the phone commits it writes
#      its strokes over the phone's, the putts lost.)
#   2. An old build's direct update open on the row (it takes no hole lock),
#      and the Comité applying with the hole as it was before: the apply waits
#      for the row, meets the 7 and is refused; the 7 stands. (Without the row
#      lock it reads the 5 and writes over the 7.)
#   3. Two Comité phones on one row, «Aplicar» and «Descartar»: the second
#      waits for the first and is refused; the row says what the first did.
#   4. An old build's direct insert open on an empty hole (no hole lock, and no
#      row yet for the apply to lock), and the Comité applying with the hole
#      seen empty: the apply's write meets the phone's row, changes nothing
#      and is refused; the phone's 5/2 stands. (With the check apart from the
#      write, the write landed over the 5/2 and the putts were lost.)
#   5. The same with an untouched default refused on that empty hole (the one
#      value sent for it, which the inbox lists): refused the same way.
#   bash race_resolve_rejected.sh <scratch db> <migrated template db> <repo root>
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
read -r DEV_A ORG_A ANA BETO R1 T_A <<<"$("${P[@]}" -d "${DB}_s" -c "select string_agg(id::text, ' ' order by key) from harness.seed where key in ('dev_a', 'org_a', 'player_a1', 'player_a2', 'round_a1', 'tournament_a')")"
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
# A row of the inbox for Ana's hole $1, with the fields $2 (and the rest of the payload $3): its id.
kept() { "${P[@]}" -d "$DB" -c "insert into public.rejected_writes (tournament_id, round_id, hole, player_id, writer_player_id, auth_user_id, payload, reason)
  values ('$T_A', '$R1', $1, '$ANA', '$BETO', '$DEV_B', jsonb_build_object('fields', '$2'::jsonb) || '${3:-{\}}'::jsonb, 'not_in_group') returning id" | head -1; }
# One transaction as a user of the app (role authenticated, that user's claims),
# held open $2 seconds before its commit. Prints each «out:» line and any error.
as_user() {
  local who=$1 hold=$2
  shift 2
  # A resolution prints «out:<status>» or «out:<sqlstate>:<message>».
  local args=(-c "create function pg_temp.resolve(id uuid, action text, reason text, expect jsonb) returns text language plpgsql as \$\$
    begin return 'out:' || (public.resolve_rejected_write(id, action, reason, expect) ->> 'status');
    exception when others then return 'out:' || sqlstate || ':' || sqlerrm; end \$\$"
    -c "grant execute on function pg_temp.resolve(uuid, text, text, jsonb) to authenticated"
    -c "begin" -c "select set_config('request.jwt.claims', harness.claims('$who'), true) is null" -c "set local role authenticated")
  for s in "$@"; do args+=(-c "$s"); done
  args+=(-c "select pg_sleep($hold) is null" -c "commit")
  "${P[@]}" -d "$DB" "${args[@]}" 2>&1 | grep -E '^out:|ERROR' || true
}
save() { # <hole> <player> <fields> <base>
  echo "select 'out:' || (public.save_hole(jsonb_build_object('round_id', '$R1', 'hole', $1, 'mutation_id', gen_random_uuid(),
    'entries', jsonb_build_array(jsonb_build_object('player_id', '$2', 'fields', '$3'::jsonb, 'base', '$4'::jsonb)))) ->> 'status')"
}
resolve() { echo "select pg_temp.resolve('$1', '$2', '$3', $4)"; }
stored() { "${P[@]}" -d "$DB" -c "select coalesce((select strokes::text || '/' || coalesce(putts::text, '-') from public.scores where round_id = '$R1' and player_id = '$ANA' and hole = $1), 'none')"; }
row() { "${P[@]}" -d "$DB" -c "select status || coalesce(' ' || resolution_note, '') from public.rejected_writes where id = '$1'"; }
check() { # <case> <want> <got>
  if [ "$2" != "$3" ]; then
    echo "$1: want «$2», got «$3»"
    exit 1
  fi
  echo "ok - $1"
}

# 1. A phone's save open on an empty hole; the Comité applies, having seen it empty
fresh
W=$(kept 6 '{"strokes":6}')
as_user "$DEV_A" 3 "$(save 6 "$ANA" '{"strokes":5,"putts":2,"picked_up":false}' '{}')" >"$out/a" &
sleep 1
as_user "$ORG_A" 0 "$(resolve "$W" apply 'Ana confirma 6' "'{}'::jsonb")" >"$out/b"
wait
check "a phone's save open, an apply that saw the hole empty (phone, apply, stored, row)" \
  "out:ok out:22023:El hoyo cambió mientras lo revisabas; vuelve a mirarlo 5/2 open" "$(cat "$out/a") $(cat "$out/b") $(stored 6) $(row "$W")"

# 2. An old build's direct update open on the row; the Comité applies with the hole as it was before
fresh
as_user "$DEV_A" 0 "$(save 7 "$ANA" '{"strokes":5,"putts":2,"picked_up":false}' '{}')" >/dev/null
W=$(kept 7 '{"putts":1}')
as_user "$DEV_B" 3 "update public.scores set strokes = 7 where round_id = '$R1' and player_id = '$ANA' and hole = 7" >"$out/a" &
sleep 1
as_user "$ORG_A" 0 "$(resolve "$W" apply 'Un putt' "'{\"strokes\":5,\"putts\":2,\"picked_up\":false}'::jsonb")" >"$out/b"
wait
check "an old build's update open, an apply from before it (apply, stored, row)" \
  "out:22023:El hoyo cambió mientras lo revisabas; vuelve a mirarlo 7/2 open" "$(cat "$out/a")$(cat "$out/b") $(stored 7) $(row "$W")"

# 3. Two Comité phones on one row at once
fresh
W=$(kept 8 '{"strokes":4,"putts":2}')
as_user "$ORG_A" 3 "$(resolve "$W" apply 'Aplicar uno' "'{}'::jsonb")" >"$out/a" &
sleep 1
as_user "$ORG_A" 0 "$(resolve "$W" dismiss 'Descartar otro' null)" >"$out/b"
wait
check "«Aplicar» open, «Descartar» on the same row (first, second, stored, row)" \
  "out:applied out:22023:Esa captura ya estaba resuelta 4/2 applied Aplicar uno" "$(cat "$out/a") $(cat "$out/b") $(stored 8) $(row "$W")"

# 4. An old build's direct insert open on an empty hole; the Comité applies, having seen it empty
fresh
W=$(kept 9 '{"strokes":6}')
insert="insert into public.scores (round_id, player_id, hole, strokes, putts, picked_up, entered_by, client_ts) values ('$R1', '$ANA', 9, 5, 2, false, '$BETO', now())"
as_user "$DEV_B" 3 "$insert" >"$out/a" &
sleep 1
as_user "$ORG_A" 0 "$(resolve "$W" apply 'Ana confirma 6' "'{}'::jsonb")" >"$out/b"
wait
check "an old build's insert open on an empty hole, an apply that saw it empty (apply, stored, row)" \
  "out:22023:El hoyo cambió mientras lo revisabas; vuelve a mirarlo 5/2 open" "$(cat "$out/a")$(cat "$out/b") $(stored 9) $(row "$W")"

# 5. The same, the row an untouched default refused on that empty hole
fresh
W=$(kept 10 '{"strokes":4,"putts":2,"picked_up":false}' '{"base":{},"auto":true}')
listed=$("${P[@]}" -d "$DB" -c "begin" -c "select set_config('request.jwt.claims', harness.claims('$ORG_A'), true) is null" -c "set local role authenticated" \
  -c "select public.rejected_inbox('$T_A') @> jsonb_build_array(jsonb_build_object('id', '$W'))" -c "rollback" | tail -1)
as_user "$DEV_B" 3 "${insert/, 9, 5, 2,/, 10, 5, 2,}" >"$out/a" &
sleep 1
as_user "$ORG_A" 0 "$(resolve "$W" apply 'Todos par' "'{}'::jsonb")" >"$out/b"
wait
check "an old build's insert open, an apply of the listed default on the empty hole (listed, apply, stored, row)" \
  "t out:22023:El hoyo cambió mientras lo revisabas; vuelve a mirarlo 5/2 open" "$listed $(cat "$out/a")$(cat "$out/b") $(stored 10) $(row "$W")"
