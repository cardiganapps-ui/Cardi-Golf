#!/usr/bin/env bash
# Start / stop / status of the shared Polo harness cluster (127.0.0.1:5433).
#   $S/pg/ctl.sh start|stop|restart|status
# Runs pg_ctl as the postgres OS user (with the ambient CAP_DAC_READ_SEARCH
# capability, so it can reach the 0700 scratch dir) and with the
# server tree in /var/lib/postgresql/polo-harness/inst (so the stub pg_net /
# supabase_vault extensions are found).
# Please don't stop it: other reviewers use it. Start is idempotent.
set -euo pipefail
PG=/tmp/claude-0/-home-user-Cardi-Golf/ba82926f-40ab-5a97-99c4-91c99e01493a/scratchpad/pg
PGCTL=/var/lib/postgresql/polo-harness/inst/usr/lib/postgresql/16/bin/pg_ctl
AS_PG=(setpriv --reuid=postgres --regid=postgres --init-groups --inh-caps=+dac_read_search --ambient-caps=+dac_read_search --)
cmd=${1:-status}
case "$cmd" in
  start)
    if "${AS_PG[@]}" "$PGCTL" -D "$PG/data" status >/dev/null 2>&1; then
      echo "already running"
    else
      "${AS_PG[@]}" "$PGCTL" -D "$PG/data" -l "$PG/postgres.log" -w -t 60 start
    fi ;;
  stop) "${AS_PG[@]}" "$PGCTL" -D "$PG/data" -m fast -w stop ;;
  restart) "${AS_PG[@]}" "$PGCTL" -D "$PG/data" -l "$PG/postgres.log" -m fast -w -t 60 restart ;;
  status) "${AS_PG[@]}" "$PGCTL" -D "$PG/data" status ;;
  *) echo "usage: $0 start|stop|restart|status" >&2; exit 2 ;;
esac
