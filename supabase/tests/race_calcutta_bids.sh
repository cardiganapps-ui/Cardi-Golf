#!/usr/bin/env bash
# The Calcutta's rules (0048, MONEY-19) with two Comité phones on the same
# lot at once. In each case the first session holds its transaction open and
# the second runs during it; each case starts from the same seeded copy: Ana's
# lot open in tournament A, Beto's bid of $500 standing, steps of $250.
#   1. Both raise to $750: the second waits for the lot, then meets the
#      first's $750 and is refused with the next bid named. One $750 stands.
#      (Without the lock both read $500 and both $750s went in.)
#   2. A bid of $750 open while the other phone's hammer, from a board that
#      still showed $500, comes: the hammer waits, then is refused naming the
#      $750; the lot stays open.
#   3. The hammer at $500 open while a bid of $750 comes: the bid waits, then
#      meets a sold lot and is refused; the lot is sold at $500 to Beto.
#   bash race_calcutta_bids.sh <scratch db> <migrated template db> <repo root>
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
read -r ORG_A ANA BETO T_A <<<"$("${P[@]}" -d "${DB}_s" -c "select string_agg(id::text, ' ' order by key) from harness.seed where key in ('org_a', 'player_a1', 'player_a2', 'tournament_a')")"
LOT=c4820000-0000-4000-8000-000000000001
"${P[@]}" -d "${DB}_s" -c "insert into public.calcutta_lots (id, tournament_id, player_id, lot_number, status) values ('$LOT', '$T_A', '$ANA', 1, 'open')" \
  -c "insert into public.calcutta_bids (lot_id, bidder_id, amount) values ('$LOT', '$BETO', 500)" >/dev/null

fresh() { "${P[@]}" -d postgres -c "drop database if exists $DB with (force)" -c "create database $DB template ${DB}_s" >/dev/null; }
# One transaction as the Comité (role authenticated, org_a's claims), held open $1 seconds before its commit.
# A write prints «out:<what it wrote>»; a refusal, its message.
as_org() {
  local hold=$1
  shift
  local args=(-c "begin" -c "select set_config('request.jwt.claims', harness.claims('$ORG_A'), true) is null" -c "set local role authenticated")
  for s in "$@"; do args+=(-c "$s"); done
  args+=(-c "select pg_sleep($hold) is null" -c "commit")
  "${P[@]}" -d "$DB" "${args[@]}" 2>&1 | grep -E '^out:|ERROR' | sed -E 's/^.*ERROR: +//' || true
}
bid() { echo "insert into public.calcutta_bids (lot_id, bidder_id, amount) values ('$LOT', '$1', $2) returning 'out:bid ' || amount"; }
sell() { echo "update public.calcutta_lots set status = 'sold', owner_id = '$1', price = $2, sold_at = now() where id = '$LOT' returning 'out:sold ' || price"; }
stored() { "${P[@]}" -d "$DB" -c "select status || ' ' || coalesce(price::text, '-') || ' ' || (select string_agg(amount::text, ',' order by amount) from public.calcutta_bids where lot_id = l.id) from public.calcutta_lots l where id = '$LOT'"; }
check() { # <case> <want> <got>
  if [ "$2" != "$3" ]; then
    echo "$1: want «$2», got «$3»"
    exit 1
  fi
  echo "ok - $1"
}

# 1. Both raise to $750 at once
fresh
as_org 3 "$(bid "$ANA" 750)" >"$out/a" &
sleep 1
as_org 0 "$(bid "$ANA" 750)" >"$out/b"
wait
check "two phones raise the same lot to \$750 at once (first, second, stored)" "out:bid 750 | Las pujas suben de \$250 en \$250: la siguiente es \$1,000 | open - 500,750" "$(cat "$out/a") | $(cat "$out/b") | $(stored)"

# 2. A bid open, then a hammer from a board before it
fresh
as_org 3 "$(bid "$ANA" 750)" >"$out/a" &
sleep 1
as_org 0 "$(sell "$BETO" 500)" >"$out/b"
wait
check "a hammer at the old \$500 while a \$750 bid is open (bid, hammer, stored)" "out:bid 750 | El lote se vende a la puja más alta: \$750 de Ana | open - 500,750" "$(cat "$out/a") | $(cat "$out/b") | $(stored)"

# 3. The hammer open, then a bid
fresh
as_org 3 "$(sell "$BETO" 500)" >"$out/a" &
sleep 1
as_org 0 "$(bid "$ANA" 750)" >"$out/b"
wait
check "a bid while the hammer is open (hammer, bid, stored)" "out:sold 500 | Ese lote no está en subasta: se puja por el lote abierto | sold 500 500" "$(cat "$out/a") | $(cat "$out/b") | $(stored)"
