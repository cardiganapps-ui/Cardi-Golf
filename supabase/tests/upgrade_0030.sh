#!/usr/bin/env bash
# 0030 on a database that already holds tournaments (DB-12): what production
# meets. A database at 0029 (scripts/db.mjs, as production got it) with the
# two-tenant seed, a 12-player tournament with a finished day and a live one
# (results, audit rows, scores edited to version > 1), and every child table
# filled (harness/tenant_fixture.sql); one user trigger disabled and one set
# ALWAYS, to see the backfill put each back as it was. Then 0030 through
# db.mjs migrate, and:
#   1. every row of every table is what it was, but for the new column; the
#      audit log, round_results, scores' version and updated_at untouched;
#   2. every child row's tenant is its parent's;
#   3. triggers, grants and functions are what they were, plus 0030's own;
#   4. each FOR ALL policy became INSERT, UPDATE and DELETE policies with its
#      very USING and WITH CHECK (as Postgres stores them); every other write
#      policy is untouched; every read policy on these tables is the
#      set-based one; no other table's policy moved;
#   5. 0030 run again changes nothing;
#   6. the way back (harness/revert_0030.sql, then 0029's restore_tournament)
#      gives the policies, triggers, grants, functions and rows of 0029 exactly.
#   bash upgrade_0030.sh <scratch db> <repo root>
# db-test.sh runs it in step 3c; PG* says where.
set -euo pipefail
DB=$1
ROOT=$2
P=(psql -X -q -v ON_ERROR_STOP=1 -At)
H=$ROOT/supabase/tests/harness
out=$(mktemp -d)
drop() { for d in "$DB" "${DB}_rev"; do "${P[@]}" -d postgres -c "drop database if exists $d with (force)" >/dev/null; done; }
trap 'rm -rf "$out"; drop' EXIT
fail() { echo "  ✗ $*"; exit 1; }
ok() { echo "  ✓ $*"; }
mig=$ROOT/supabase/migrations/0030_tenant_ids.sql

# A database at 0029, the way production has it.
drop
"${P[@]}" -d postgres -c "create database $DB" >/dev/null
"${P[@]}" -d "$DB" -f "$H/stubs.sql" >/dev/null
mkdir "$out/m29"
for f in "$ROOT"/supabase/migrations/*.sql; do [[ "$(basename "$f")" < "0030" ]] && cp "$f" "$out/m29/"; done
DB_TARGET=local PGDATABASE=$DB POLO_MIGRATIONS_DIR=$out/m29 node "$ROOT/scripts/db.mjs" migrate >"$out/log" || { cat "$out/log"; fail "migrate to 0029"; }
"${P[@]}" -d "$DB" -c "select 1 from public._migrations where name like '0029%'" | grep -q 1 || fail "the database is not at 0029"

# Tournaments in it.
"${P[@]}" -d "$DB" -f "$H/seed-two-tenants.sql" >/dev/null
bash "$H/perf/seed.sh" "$DB" 12 >/dev/null
cat >"$out/fixture.sql" <<SQL
\set ON_ERROR_STOP 1
select id as org_a from harness.seed where key = 'org_a' \gset
select id as org_b from harness.seed where key = 'org_b' \gset
select id as dev_a from harness.seed where key = 'dev_a' \gset
select id as dev_x from harness.seed where key = 'dev_x' \gset
select id as padmin from harness.seed where key = 'platform_admin' \gset
select id as t_a from harness.seed where key = 'tournament_a' \gset
select id as t_b from harness.seed where key = 'tournament_b' \gset
select id as ana from harness.seed where key = 'player_a1' \gset
select id as beto from harness.seed where key = 'player_a2' \gset
select id as carla from harness.seed where key = 'player_b1' \gset
select id as dani from harness.seed where key = 'player_b2' \gset
select id as r_a from harness.seed where key = 'round_a1' \gset
select id as r_b from harness.seed where key = 'round_b1' \gset
select id as g_a from harness.seed where key = 'group_a1' \gset
select id as g_b from harness.seed where key = 'group_b1' \gset
begin;
\i $H/tenant_fixture.sql
insert into public.card_signatures (round_id, pair_id, signed_by) values
  (:'r_a', 'a2000000-0000-4000-8000-000000000002', :'ana'), (:'r_b', 'b2000000-0000-4000-8000-000000000002', :'carla');
commit;
-- Scores edited after they were written (version and updated_at move), as a live day has them.
update public.scores set putts = putts where hole <= 3;
-- A trigger someone turned off, and one set to fire always: the backfill must leave both as they are.
alter table public.hole_awards disable trigger hole_awards_audit;
alter table public.scores enable always trigger scores_touch;
SQL
"${P[@]}" -d "$DB" -f "$out/fixture.sql" >/dev/null

CHILD="'groups','group_members','round_tees','scores','snake_tiebreaks','card_signatures','handicap_overrides','hole_awards','photos','calcutta_bids','calcutta_buybacks'"
TOUCHED="$CHILD,'tournaments','players','rounds','pairs','teams','team_members','calcutta_lots','payments','game_entries','game_results','round_results','money_adjustments','tees','holes'"
# What a database holds: one line per table (rows, md5 of every row; the child tables' new column left out unless $2 = full).
snap() {
  local db=$1 mode=${2:-}
  "${P[@]}" -d "$db" -c "
    do \$\$
    declare t text; n bigint; h text;
    begin
      create temp table _snap (tbl text, n bigint, h text);
      for t in select c.relname from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and c.relname <> '_migrations' order by 1 loop
        execute format('select count(*), md5(coalesce(string_agg(r, chr(10) order by r), '''')) from (select (to_jsonb(x) %s)::text as r from public.%I x) z',
          case when '$mode' <> 'full' and t in ($CHILD) then '- ''tournament_id''' else '' end, t) into n, h;
        insert into _snap values (t, n, h);
      end loop;
    end \$\$;
    select tbl || ' ' || n || ' ' || h from _snap order by tbl;"
}
schema() {
  local db=$1
  "${P[@]}" -d "$db" -c "select 'trigger ' || tgrelid::regclass || ' ' || tgname || ' ' || tgenabled::text from pg_trigger where not tgisinternal and tgrelid::regclass::text not like 'pg\_%' order by 1" >"$out/$2.triggers"
  "${P[@]}" -d "$db" -c "select 'grant ' || c.relname || ' ' || coalesce(c.relacl::text, '') from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' order by 1" >"$out/$2.grants"
  "${P[@]}" -d "$db" -c "select 'function ' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ') ' || md5(pg_get_functiondef(p.oid)) || ' ' || coalesce(p.proacl::text, '') from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind = 'f' order by 1" >"$out/$2.functions"
  "${P[@]}" -F '|' -d "$db" -c "select tablename, policyname, cmd, roles::text, coalesce(qual, ''), coalesce(with_check, '') from pg_policies where schemaname = 'public' order by 1, 2" >"$out/$2.policies"
}

snap "$DB" >"$out/before.data"
schema "$DB" before
"${P[@]}" -d "$DB" -c "create table harness.pol_before as select tablename::text, policyname::text, cmd::text, roles::text, coalesce(qual, '') as qual, coalesce(with_check, '') as with_check from pg_policies where schemaname = 'public'"
grep -q "hole_awards hole_awards_audit D" "$out/before.triggers" && grep -q "scores scores_touch A" "$out/before.triggers" || fail "the test triggers were not set up"
rows=$(awk '{s += $2} END {print s}' "$out/before.data")
ok "a database at 0029 with $rows rows ($(grep '^scores ' "$out/before.data" | cut -d' ' -f2) scores, $(grep '^audit_log ' "$out/before.data" | cut -d' ' -f2) audit rows, $(grep '^round_results ' "$out/before.data" | cut -d' ' -f2) results)"

# 0030, as production gets it.
start=$(date +%s%N)
DB_TARGET=local PGDATABASE=$DB node "$ROOT/scripts/db.mjs" migrate >"$out/log" || { cat "$out/log"; fail "0030 did not apply"; }
grep -q 'applying.*0030' "$out/log" || { cat "$out/log"; fail "db.mjs did not apply 0030"; }
ms=$(( ($(date +%s%N) - start) / 1000000 ))
ok "0030 applied by db.mjs migrate in ${ms} ms (process start included)"

# 1. Rows.
snap "$DB" >"$out/after.data"
diff "$out/before.data" "$out/after.data" >"$out/d" || { cat "$out/d"; fail "a row changed (other than the new column): audit log, results, versions and times must not move"; }
ok "every row of all $(wc -l <"$out/before.data") tables is as it was, but for the new column: no audit row, no result, no version or updated_at moved"

# 2. Tenants.
bad=$("${P[@]}" -d "$DB" -c "
  select (select count(*) from public.groups x join public.rounds p on p.id = x.round_id where x.tournament_id <> p.tournament_id)
       + (select count(*) from public.group_members x join public.groups p on p.id = x.group_id where x.tournament_id <> p.tournament_id)
       + (select count(*) from public.round_tees x join public.rounds p on p.id = x.round_id where x.tournament_id <> p.tournament_id)
       + (select count(*) from public.scores x join public.rounds p on p.id = x.round_id where x.tournament_id <> p.tournament_id)
       + (select count(*) from public.snake_tiebreaks x join public.rounds p on p.id = x.round_id where x.tournament_id <> p.tournament_id)
       + (select count(*) from public.card_signatures x join public.rounds p on p.id = x.round_id where x.tournament_id <> p.tournament_id)
       + (select count(*) from public.handicap_overrides x join public.rounds p on p.id = x.round_id where x.tournament_id <> p.tournament_id)
       + (select count(*) from public.hole_awards x join public.rounds p on p.id = x.round_id where x.tournament_id <> p.tournament_id)
       + (select count(*) from public.photos x join public.rounds p on p.id = x.round_id where x.tournament_id <> p.tournament_id)
       + (select count(*) from public.calcutta_bids x join public.calcutta_lots p on p.id = x.lot_id where x.tournament_id <> p.tournament_id)
       + (select count(*) from public.calcutta_buybacks x join public.calcutta_lots p on p.id = x.lot_id where x.tournament_id <> p.tournament_id)")
[ "$bad" = 0 ] || fail "$bad child rows name another tournament than their parent's"
ok "every child row's tenant is its parent's tournament"

# 3. Triggers, grants, functions.
schema "$DB" after
diff "$out/before.triggers" <(grep -v '_tenant O$' "$out/after.triggers") >"$out/d" || { cat "$out/d"; fail "a trigger changed (each must come back in its own mode)"; }
[ "$(grep -c '_tenant O$' "$out/after.triggers")" = 11 ] || fail "not 11 tenant triggers"
ok "every trigger is back in its mode (one disabled, one ALWAYS stayed so), plus the 11 tenant triggers"
diff "$out/before.grants" "$out/after.grants" >"$out/d" || { cat "$out/d"; fail "a table's grants changed"; }
ok "no table's grants changed"
diff <(grep -v '^function restore_tournament(' "$out/before.functions") \
     <(grep -v -e '^function restore_tournament(' -e '^function my_tournament_ids()' -e '^function tenant_from_' "$out/after.functions") >"$out/d" || { cat "$out/d"; fail "a function changed that 0030 does not own"; }
ok "functions: only restore_tournament replaced, my_tournament_ids and the three tenant_from_* added"

# 4. Policies, compared as Postgres stores them.
"${P[@]}" -d "$DB" -F '|' -c "
  create temp table pol_after as select tablename::text, policyname::text, cmd::text, roles::text, coalesce(qual, '') as qual, coalesce(with_check, '') as with_check from pg_policies where schemaname = 'public';
  create temp table expect as
    -- other tables: as before
    select * from harness.pol_before where tablename not in ($TOUCHED)
    -- touched tables: writes that were not FOR ALL stay as they were
    union all select * from harness.pol_before where tablename in ($TOUCHED) and cmd not in ('ALL', 'SELECT')
    -- each FOR ALL becomes three, with its own expressions
    union all select tablename, replace(policyname, '_write', '_insert'), 'INSERT', roles, '', with_check from harness.pol_before where tablename in ($TOUCHED) and cmd = 'ALL'
    union all select tablename, replace(policyname, '_write', '_update'), 'UPDATE', roles, qual, with_check from harness.pol_before where tablename in ($TOUCHED) and cmd = 'ALL'
    union all select tablename, replace(policyname, '_write', '_delete'), 'DELETE', roles, qual, '' from harness.pol_before where tablename in ($TOUCHED) and cmd = 'ALL'
    -- reads: the course tables keep theirs; the tournament tables become set-based, for signed-in roles
    union all select * from harness.pol_before where tablename in ('tees', 'holes') and cmd = 'SELECT'
    union all select tablename, policyname, 'SELECT', '{authenticated}',
      '(' || case tablename when 'tournaments' then 'id' else 'tournament_id' end || ' = ANY (( SELECT my_tournament_ids() AS my_tournament_ids)::uuid[]))', ''
      from harness.pol_before where tablename in ($TOUCHED) and tablename not in ('tees', 'holes') and cmd = 'SELECT';
  select 'missing or different: ' || e.tablename || ' ' || e.policyname || ' ' || e.cmd from expect e where not exists (select 1 from pol_after a where (a.*) = (e.*))
  union all select 'unexpected: ' || a.tablename || ' ' || a.policyname || ' ' || a.cmd || ' ' || a.qual || ' / ' || a.with_check from pol_after a where not exists (select 1 from expect e where (a.*) = (e.*));
" >"$out/d"
[ ! -s "$out/d" ] || { cat "$out/d"; fail "the policies are not 0029's with only the reads made set-based and FOR ALL split"; }
n_all=$("${P[@]}" -d "$DB" -c "select count(*) from harness.pol_before where tablename in ($TOUCHED) and cmd = 'ALL'")
n_read=$("${P[@]}" -d "$DB" -c "select count(*) from harness.pol_before where tablename in ($TOUCHED) and tablename not in ('tees', 'holes') and cmd = 'SELECT'")
ok "policies: $n_all FOR ALL split into INSERT/UPDATE/DELETE with their own expressions, $n_read reads set-based, every other policy as it was"
"${P[@]}" -d "$DB" -c "drop table harness.pol_before"

# 5. Again: nothing moves.
snap "$DB" full >"$out/after.full"
schema "$DB" after1
"${P[@]}" -d "$DB" -1 -f "$mig" >"$out/log" 2>&1 || { cat "$out/log"; fail "0030 run a second time failed"; }
snap "$DB" full >"$out/again.full"
schema "$DB" again
for k in full; do diff "$out/after.$k" "$out/again.$k" >"$out/d" || { cat "$out/d"; fail "a second run changed rows"; }; done
for k in triggers grants functions policies; do diff "$out/after1.$k" "$out/again.$k" >"$out/d" || { cat "$out/d"; fail "a second run changed $k"; }; done
ok "0030 run a second time changes nothing (rows with the tenant, triggers, grants, functions, policies)"

# 6. The way back.
"${P[@]}" -d postgres -c "create database ${DB}_rev template $DB" >/dev/null
{ cat "$H/revert_0030.sql"; sed -n '/^create or replace function public.restore_tournament/,/^grant execute on function public.restore_tournament/p' "$ROOT/supabase/migrations/0029_close_gate.sql"; } >"$out/revert.sql"
"${P[@]}" -d "${DB}_rev" -1 -f "$out/revert.sql" >"$out/log" 2>&1 || { cat "$out/log"; fail "the revert did not apply"; }
snap "${DB}_rev" full >"$out/rev.data"
schema "${DB}_rev" rev
diff "$out/before.data" "$out/rev.data" >"$out/d" || { cat "$out/d"; fail "the revert changed rows"; }
for k in triggers grants functions policies; do diff "$out/before.$k" "$out/rev.$k" >"$out/d" || { cat "$out/d"; fail "after the revert, $k differ from 0029"; }; done
ok "the way back gives 0029's policies, triggers, grants, functions and rows exactly"
