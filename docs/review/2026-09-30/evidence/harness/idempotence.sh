#!/usr/bin/env bash
# Idempotence check (informational). In a fresh copy of polo_template:
#  A. each migration re-applied ALONE on top of the final state, inside
#     begin … rollback: does it fail, and if not, what would it silently change
#     (function bodies, policies, ACLs, triggers, constraints)?
#  B. the whole chain replayed in order on top of itself, each file in its own
#     transaction like scripts/db.mjs (as if public._migrations were emptied),
#     continuing past failures; then the end state is diffed against the template.
set -uo pipefail
PG=/tmp/claude-0/-home-user-Cardi-Golf/ba82926f-40ab-5a97-99c4-91c99e01493a/scratchpad/pg
MIG=/home/user/Cardi-Golf/supabase/migrations
OUT=$PG/idem
PSQL=(psql -h 127.0.0.1 -p 5433 -U postgres -X)
mkdir -p "$OUT"
rm -f "$OUT"/*

recreate() {
  "${PSQL[@]}" -d postgres -q -c "drop database if exists $1 with (force)" -c "create database $1 template polo_template"
}

# Definitions snapshot: one row per object with a hash of its definition.
SNAP="select 'function' as kind, p.oid::regprocedure::text as name, md5(pg_get_functiondef(p.oid)) as h
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prokind in ('f','p')
      union all select 'function_acl', p.oid::regprocedure::text, md5(coalesce(p.proacl::text, '<default>'))
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'
      union all select 'policy', schemaname || '.' || tablename || '.' || policyname,
        md5(coalesce(cmd,'') || '|' || roles::text || '|' || coalesce(qual,'') || '|' || coalesce(with_check,'') || '|' || permissive)
        from pg_policies where schemaname in ('public','storage')
      union all select 'table_acl', c.oid::regclass::text, md5(coalesce(c.relacl::text, '<default>') || c.relrowsecurity::text)
        from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind in ('r','v','S')
      union all select 'column_acl', a.attrelid::regclass::text || '.' || a.attname, md5(a.attacl::text)
        from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and a.attacl is not null
      union all select 'trigger', t.tgrelid::regclass::text || '.' || t.tgname, md5(pg_get_triggerdef(t.oid))
        from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and not t.tgisinternal
      union all select 'constraint', conrelid::regclass::text || '.' || conname, md5(pg_get_constraintdef(oid))
        from pg_constraint where connamespace = 'public'::regnamespace
      union all select 'index', indexrelid::regclass::text, md5(pg_get_indexdef(indexrelid))
        from pg_index i join pg_class c on c.oid = i.indrelid where c.relnamespace = 'public'::regnamespace
      union all select 'column', a.attrelid::regclass::text || '.' || a.attname, md5(format_type(a.atttypid, a.atttypmod) || a.attnotnull::text || coalesce(pg_get_expr(d.adbin, d.adrelid), ''))
        from pg_attribute a join pg_class c on c.oid = a.attrelid left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
        where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and a.attnum > 0 and not a.attisdropped"

# ---------------------------------------------------------------- A
recreate idem_check
"${PSQL[@]}" -d idem_check -q -c "create table public._idem_base as $SNAP" -c "revoke all on public._idem_base from anon, authenticated, service_role"
echo -e "file\tresult\tdetail" >"$OUT/A.tsv"
for path in $(ls "$MIG"/*.sql | sort); do
  f=$(basename "$path")
  script=$OUT/A-$f
  {
    echo '\set ON_ERROR_STOP 1'
    echo 'begin;'
    cat "$path"
    echo ''
    echo '\set ON_ERROR_STOP 1'
    echo "\\o $OUT/A-$f.diff"
    echo "with now_ as ($SNAP), base as (select * from public._idem_base where not (kind = 'table_acl' and name = '_idem_base'))
          select coalesce(n.kind, b.kind) as kind, coalesce(n.name, b.name) as name,
                 case when b.h is null then 'added' when n.h is null then 'removed' else 'changed' end as change
          from now_ n full join base b on b.kind = n.kind and b.name = n.name
          where n.h is distinct from b.h and coalesce(n.name, b.name) not like '\_idem\_base%'
          order by 1, 2;"
    echo '\o'
    echo 'rollback;'
  } >"$script"
  if "${PSQL[@]}" -d idem_check -f "$script" >"$OUT/A-$f.log" 2>&1; then
    n=$(grep -cE '\|' "$OUT/A-$f.diff" 2>/dev/null || true)
    n=$(( n > 1 ? n - 1 : 0 ))
    echo -e "$f\tre-runs OK\t$n definition(s) would change" >>"$OUT/A.tsv"
  else
    err=$(grep -m1 -E 'ERROR' "$OUT/A-$f.log" | sed -E 's|^psql:[^:]*/A-[^:]*:([0-9]+): |line \1 (wrapped +1): |')
    echo -e "$f\tFAILS\t$err" >>"$OUT/A.tsv"
  fi
done

# ---------------------------------------------------------------- B
recreate idem_chain
"${PSQL[@]}" -d idem_chain -q -c "create table public._idem_base as $SNAP" -c "revoke all on public._idem_base from anon, authenticated, service_role"
echo -e "file\tresult\tdetail" >"$OUT/B.tsv"
for path in $(ls "$MIG"/*.sql | sort); do
  f=$(basename "$path")
  { echo '\set ON_ERROR_STOP 1'; echo 'begin;'; cat "$path"; echo ''; echo 'commit;'; } >"$OUT/B-$f"
  if "${PSQL[@]}" -d idem_chain -f "$OUT/B-$f" >"$OUT/B-$f.log" 2>&1; then
    echo -e "$f\tapplied again\t" >>"$OUT/B.tsv"
  else
    err=$(grep -m1 -E 'ERROR' "$OUT/B-$f.log" | sed -E 's|^psql:[^:]*/B-[^:]*:([0-9]+): |line \1 (wrapped +1): |')
    echo -e "$f\tFAILED (rolled back)\t$err" >>"$OUT/B.tsv"
  fi
done
"${PSQL[@]}" -d idem_chain -At -F $'\t' -c "with now_ as ($SNAP), base as (select * from public._idem_base)
  select coalesce(n.kind, b.kind), coalesce(n.name, b.name), case when b.h is null then 'added' when n.h is null then 'removed' else 'changed' end
  from now_ n full join base b on b.kind = n.kind and b.name = n.name
  where n.h is distinct from b.h and coalesce(n.name, b.name) not like '\_idem\_base%' order by 1, 2" >"$OUT/B-final-diff.tsv"
echo done
