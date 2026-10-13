#!/usr/bin/env bash
# save_group_awards (0044, ARCH-13) from two phones of one group at the same
# moment. In each case the first session holds its transaction open and the
# second runs during it; each case starts from the same seeded copy, round 1
# live, Ana's phone and Beto's phone in group 1.
#   1. Different winners (Ana's phone says Ana, Beto's says Beto): the second
#      waits for the first's lock on the hole, then replaces its winners. The
#      hole holds one claim, the last. (Without the lock the second's delete
#      can't see the first's uncommitted row, and both winners stay.)
#   2. The same winner from both: the second waits, then replaces the first's
#      row with its own. (Without the lock the second's insert meets the
#      first's row and fails on a duplicate key, its change refused.)
#   bash race_one_transaction.sh <scratch db> <migrated template db> <repo root>
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
read -r DEV_A G1 ORG_A ANA BETO R1 <<<"$("${P[@]}" -d "${DB}_s" -c "select string_agg(id::text, ' ' order by key) from harness.seed where key in ('dev_a', 'group_a1', 'org_a', 'player_a1', 'player_a2', 'round_a1')")"
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
# One transaction as a phone (role authenticated, its claims), held open $2 seconds before its commit.
# A save prints «out:ok»; anything else, its error.
as_phone() {
  local who=$1 hold=$2 winner=$3
  "${P[@]}" -d "$DB" -c "begin" -c "select set_config('request.jwt.claims', harness.claims('$who'), true) is null" -c "set local role authenticated" \
    -c "select 'out:ok' from public.save_group_awards('$R1', '$G1', 'closest', 3, array['$winner']::uuid[], null)" \
    -c "select pg_sleep($hold) is null" -c "commit" 2>&1 | grep -E '^out:|ERROR' || true
}
hole() { "${P[@]}" -d "$DB" -c "select coalesce(string_agg(p.display_name || ':' || d.display_name, ' ' order by p.display_name), '-') from public.hole_awards a join public.players p on p.id = a.player_id join public.players d on d.id = a.decided_by where a.round_id = '$R1' and a.hole = 3"; }
check() { # <case> <want> <got>
  if [ "$2" != "$3" ]; then
    echo "$1: want «$2», got «$3»"
    exit 1
  fi
  echo "ok - $1"
}

# 1. Different winners at once
fresh
as_phone "$DEV_A" 3 "$ANA" >"$out/a" &
sleep 1
as_phone "$DEV_B" 0 "$BETO" >"$out/b"
wait
check "two phones of a group, different winners at once (first, second, the hole)" "out:ok out:ok Beto:Beto" "$(cat "$out/a") $(cat "$out/b") $(hole)"

# 2. The same winner at once
fresh
as_phone "$DEV_A" 3 "$ANA" >"$out/a" &
sleep 1
as_phone "$DEV_B" 0 "$ANA" >"$out/b"
wait
check "two phones of a group, the same winner at once (first, second, the hole)" "out:ok out:ok Ana:Beto" "$(cat "$out/a") $(cat "$out/b") $(hole)"
