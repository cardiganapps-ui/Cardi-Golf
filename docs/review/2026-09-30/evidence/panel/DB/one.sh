#!/usr/bin/env bash
# one.sh <db> <sub-uuid-sql> <sql>: run <sql> as that user in a fresh backend and print fn call counts
db=$1; sub=$2; sql=$3
psql -h 127.0.0.1 -p 5433 -U postgres -X -At -d "$db" <<SQL
set track_functions = 'all';
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', $sub, 'role', 'authenticated', 'is_anonymous', true)::text, true) \g /dev/null
set local statement_timeout = '8s';
explain (analyze, costs off, summary on, format json) $sql;
reset role;
select string_agg(funcname || '=' || calls, ' ' order by calls desc) from pg_stat_xact_user_functions where calls > 0;
rollback;
SQL
