#!/usr/bin/env bash
# DB-07: can a nightly dump (api/backup-cron.ts shape) be loaded into a fresh project?
# 1) dump v4_ctl's public tables in BACKUP_TABLES order (as the cron does, service role = bypass RLS)
# 2) fresh DB v4_dr = stubs + 24 migrations (what scripts/db.mjs would build)
# 3) the obvious loader: insert each table in the dump's order, one statement per table, report each outcome
set -uo pipefail
S=/tmp/claude-0/-home-user-Cardi-Golf/ba82926f-40ab-5a97-99c4-91c99e01493a/scratchpad
E=$S/verify/evidence/V4
SRC=${1:-v4_ctl}
P="psql -h 127.0.0.1 -p 5433 -U postgres -X -q -At"
TABLES=$(sed -n 's/^  \([a-z_]*\): .*/\1/p' /home/user/Cardi-Golf/src/lib/backupTables.ts)
echo "tables in BACKUP_TABLES: $(echo $TABLES | wc -w)"

# 1. dump (one JSON per table, like the cron's tables{} map)
mkdir -p $E/dr-dump; rm -f $E/dr-dump/*.json
for t in $TABLES; do
  $P -d $SRC -c "select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.$t x" > $E/dr-dump/$t.json
done
echo "dump rows per table:"; for t in $TABLES; do n=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$E/dr-dump/$t.json','utf8')).length)"); [ "$n" != "0" ] && printf '  %s=%s' $t $n; done; echo
echo "auth.users in the source: $($P -d $SRC -c 'select count(*) from auth.users') (not in the dump: the cron reads public.* only)"

# 2. fresh database from the template (schema only)
$S/pg/bootstrap.sh v4_dr --recreate >/dev/null 2>&1 || { echo "bootstrap failed"; exit 1; }

# 3. naive load in the dump's order; each table in its own transaction, as the service role would (RLS bypassed)
echo "== naive load into v4_dr (insert … select * from jsonb_populate_recordset), in BACKUP_TABLES order"
ok=0; bad=0
for t in $TABLES; do
  n=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$E/dr-dump/$t.json','utf8')).length)")
  [ "$n" = "0" ] && continue
  out=$($P -d v4_dr -v ON_ERROR_STOP=1 -v rows="$(cat $E/dr-dump/$t.json)" 2>&1 <<SQL
insert into public.$t select * from jsonb_populate_recordset(null::public.$t, :'rows'::jsonb);
SQL
)
  if [ $? -eq 0 ]; then ok=$((ok+1)); echo "  ok    $t ($n rows)"; else bad=$((bad+1)); echo "  FAIL  $t ($n rows): $(echo "$out" | grep -m1 -E 'ERROR|DETAIL' | cut -c1-170)"; fi
done
echo "loaded $ok tables, failed $bad"
