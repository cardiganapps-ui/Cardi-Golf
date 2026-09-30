#!/usr/bin/env bash
# Builds the Polo review harness cluster (run once, as root).
#   1. a scratch-local server tree ($PG/inst) = a copy of the system postgres +
#      pg_ctl binaries whose share/extension dir adds the stub extensions
#      (pg_net, supabase_vault) from $PG/ext. Debian's build is relocatable,
#      so the copied binary finds share/ and lib/ next to itself; nothing
#      outside the scratch dir is modified.
#   2. initdb in $PG/data (superuser postgres, trust auth on localhost).
#   3. postgresql.conf / pg_hba.conf, then start on 127.0.0.1:5433.
# The server runs as the postgres OS user. The scratch dir's ancestors are
# 0700 root (and /tmp/claude-0 is reset to 0700 by the tool harness), so the
# postgres processes get the ambient CAP_DAC_READ_SEARCH capability: they can
# traverse into the scratch dir; they still write only what postgres owns.
set -euo pipefail
S=/tmp/claude-0/-home-user-Cardi-Golf/ba82926f-40ab-5a97-99c4-91c99e01493a/scratchpad
PG=$S/pg
# The executables must live where the postgres user can reach them WITHOUT
# capabilities (access(2) ignores capabilities for non-root users), so the
# server tree lives in the postgres user's home; $PG/inst is a symlink to it.
INST=/var/lib/postgresql/polo-harness/inst
REAL_BIN=/usr/lib/postgresql/16/bin
REAL_SHARE=/usr/share/postgresql/16
REAL_LIB=/usr/lib/postgresql/16/lib
BIN=$INST/usr/lib/postgresql/16/bin
SHARE=$INST/usr/share/postgresql/16
AS_PG=(setpriv --reuid=postgres --regid=postgres --init-groups --inh-caps=+dac_read_search --ambient-caps=+dac_read_search --)

chmod 755 "$PG"

# 1. Server tree
mkdir -p "$BIN" "$SHARE/extension"
chmod 755 /var/lib/postgresql/polo-harness
ln -sfn "$INST" "$PG/inst"
cp -f "$REAL_BIN/postgres" "$REAL_BIN/pg_ctl" "$BIN/"
ln -sfn "$REAL_LIB" "$INST/usr/lib/postgresql/16/lib"
for f in "$REAL_SHARE"/*; do
  b=$(basename "$f"); [ "$b" = extension ] && continue
  ln -sfn "$f" "$SHARE/$b"
done
for f in "$REAL_SHARE"/extension/*; do ln -sfn "$f" "$SHARE/extension/$(basename "$f")"; done
cp -f "$PG"/ext/*.control "$PG"/ext/*.sql "$SHARE/extension/"
chmod -R a+rX "$INST"
"$BIN/postgres" --version

# 2. Cluster
mkdir -p "$PG/run"
chown postgres:postgres "$PG/run"
if [ ! -f "$PG/data/PG_VERSION" ]; then
  mkdir -p "$PG/data"
  chown postgres:postgres "$PG/data"
  chmod 700 "$PG/data"
  "${AS_PG[@]}" "$REAL_BIN/initdb" -D "$PG/data" -U postgres --auth=trust \
    --encoding=UTF8 --locale=C.UTF-8 >"$PG/initdb.log" 2>&1
fi
touch "$PG/postgres.log"
chown postgres:postgres "$PG/postgres.log"

# 3. Configuration (appended once; later lines win in postgresql.conf)
if ! grep -q 'Polo review harness' "$PG/data/postgresql.conf"; then
  cat >>"$PG/data/postgresql.conf" <<EOF

# ---- Polo review harness ----
port = 5433
listen_addresses = '127.0.0.1'
unix_socket_directories = '$PG/run'
max_connections = 200
shared_buffers = 256MB
timezone = 'UTC'
log_timezone = 'UTC'
lc_messages = 'C.UTF-8'
# Supabase has logical decoding on (Realtime) and pg_stat_statements preloaded.
wal_level = logical
shared_preload_libraries = 'pg_stat_statements'
# Throwaway test data: durability off for speed (never do this with real data).
fsync = off
synchronous_commit = off
full_page_writes = off
log_line_prefix = '%m [%p] %u@%d '
log_min_error_statement = error
EOF
fi
cat >"$PG/data/pg_hba.conf" <<'EOF'
# Polo review harness: trust on localhost only.
local   all   all                 trust
host    all   all   127.0.0.1/32  trust
host    all   all   ::1/128       trust
EOF
chown postgres:postgres "$PG/data/pg_hba.conf"

"$PG/ctl.sh" start
