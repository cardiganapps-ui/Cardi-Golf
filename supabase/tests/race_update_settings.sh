#!/usr/bin/env bash
# update_settings (0043, ARCH-13) against another save of the same
# tournament at the same moment. In each case the first session holds its
# transaction open and the second runs during it; each case starts from the
# same seeded copy, tournament A's entry at $500.
#   1. Two Comité screens on different keys (Torneo's entry, Juegos' labels),
#      each having seen the row as it was: the second waits for the first's
#      row lock, then finds its own key as it saw it and is written. Both
#      changes stay.
#   2. Two screens on the same key, both from $500: the second waits, then
#      meets the first's $600, is refused and named it; the $600 stands.
#      (Without the lock both read $500 and the second wrote over the first.)
#   3. An old build's direct update of the whole settings open ($650): the
#      save from $500 waits for the row, meets the $650 and is refused.
#   bash race_update_settings.sh <scratch db> <migrated template db> <repo root>
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
read -r ORG_A T_A <<<"$("${P[@]}" -d "${DB}_s" -c "select string_agg(id::text, ' ' order by key) from harness.seed where key in ('org_a', 'tournament_a')")"

fresh() { "${P[@]}" -d postgres -c "drop database if exists $DB with (force)" -c "create database $DB template ${DB}_s" >/dev/null; }
# One transaction as the Comité (role authenticated, org_a's claims), held open $1 seconds before its commit.
# A save prints «out:ok» or «out:changed:<keys>»; anything else, its error.
as_org() {
  local hold=$1
  shift
  local args=(-c "begin" -c "select set_config('request.jwt.claims', harness.claims('$ORG_A'), true) is null" -c "set local role authenticated")
  for s in "$@"; do args+=(-c "$s"); done
  args+=(-c "select pg_sleep($hold) is null" -c "commit")
  "${P[@]}" -d "$DB" "${args[@]}" 2>&1 | grep -E '^out:|ERROR' || true
}
save() { # <seen settings> <set settings>
  echo "select 'out:' || case when (r ->> 'ok')::boolean then 'ok' else 'changed:' || (r -> 'changed')::text end
    from public.update_settings('$T_A', jsonb_build_object('settings', '$1'::jsonb), jsonb_build_object('settings', '$2'::jsonb)) r"
}
stored() { "${P[@]}" -d "$DB" -c "select (settings -> 'entryFee')::text || ' ' || coalesce(settings #>> '{labels,lastPlace}', '-') from public.tournaments where id = '$T_A'"; }
check() { # <case> <want> <got>
  if [ "$2" != "$3" ]; then
    echo "$1: want «$2», got «$3»"
    exit 1
  fi
  echo "ok - $1"
}
LABELS=$("${P[@]}" -d "${DB}_s" -c "select settings -> 'labels' from public.tournaments where id = '$T_A'")

# 1. Different keys at once
fresh
as_org 3 "$(save '{"entryFee":500}' '{"entryFee":600}')" >"$out/a" &
sleep 1
as_org 0 "$(save "{\"labels\":$LABELS}" '{"labels":{"lastPlace":"La Cuchara","honoree":"El novio"}}')" >"$out/b"
wait
check "two screens on different keys at once (first, second, stored)" "out:ok out:ok 600 La Cuchara" "$(cat "$out/a") $(cat "$out/b") $(stored)"

# 2. The same key at once, both from $500
fresh
as_org 3 "$(save '{"entryFee":500}' '{"entryFee":600}')" >"$out/a" &
sleep 1
as_org 0 "$(save '{"entryFee":500}' '{"entryFee":700}')" >"$out/b"
wait
check "two screens on the same key at once (first, second, stored)" "out:ok out:changed:[\"settings.entryFee\"] 600 Último lugar" "$(cat "$out/a") $(cat "$out/b") $(stored)"

# 3. An old build's direct update of the whole settings open
fresh
as_org 3 "update public.tournaments set settings = jsonb_set(settings, '{entryFee}', '650') where id = '$T_A'" >"$out/a" &
sleep 1
as_org 0 "$(save '{"entryFee":500}' '{"entryFee":700}')" >"$out/b"
wait
check "an old build's whole-settings update open, a save from before it (save, stored)" "out:changed:[\"settings.entryFee\"] 650 Último lugar" "$(cat "$out/a")$(cat "$out/b") $(stored)"
