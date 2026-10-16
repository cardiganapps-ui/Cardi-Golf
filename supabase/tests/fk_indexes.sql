-- Every foreign key has an index, and no index is another's prefix (0065, DB-15). Fails on the first later
-- migration that adds a key without its index, or an index another already serves; prints what to add or drop.
--   A key is covered when an index's leading columns are the key's columns, in any order (a lookup by all of them
--   is an equality on each). The advisor (splinter) asks for the key's own order; the one key it still flags is
--   covered here by its table's unique key on the same two columns (team_members, see 0065).
--   An index is redundant when it is a plain btree whose columns lead another btree on the same table with the
--   same operator classes and collations, and it is not unique (or is unique on exactly the same columns as a
--   unique one), and backs no constraint.
\set ON_ERROR_STOP 1
\set QUIET 1
\pset tuples_only on
\pset format unaligned

create temp view uncovered as
with fk as (
  select c.conrelid, c.conname, c.conkey from pg_constraint c join pg_class t on t.oid = c.conrelid
  where c.contype = 'f' and t.relnamespace = 'public'::regnamespace
), idx as (
  select i.indrelid, string_to_array(i.indkey::text, ' ')::smallint[] as k from pg_index i where i.indisvalid
)
select fk.conrelid::regclass::text || '.' || fk.conname as key from fk
where not exists (
  select 1 from idx where idx.indrelid = fk.conrelid
    and (select array_agg(x order by x) from unnest(idx.k[1:cardinality(fk.conkey)]) x) = (select array_agg(x order by x) from unnest(fk.conkey) x)
);

create temp view redundant as
with i as (
  select x.indexrelid, x.indrelid, x.indisunique, string_to_array(x.indkey::text, ' ')::int[] as k,
    string_to_array(x.indclass::text, ' ')::oid[] as cls, string_to_array(x.indcollation::text, ' ')::oid[] as coll,
    x.indpred is null and x.indexprs is null as plain, am.amname,
    exists (select 1 from pg_constraint c where c.conindid = x.indexrelid) as backs
  from pg_index x join pg_class ic on ic.oid = x.indexrelid join pg_am am on am.oid = ic.relam
  join pg_class t on t.oid = x.indrelid where t.relnamespace = 'public'::regnamespace
)
select a.indexrelid::regclass::text || ' (served by ' || b.indexrelid::regclass::text || ')' as idx
from i a join i b on a.indrelid = b.indrelid and a.indexrelid <> b.indexrelid
where a.plain and b.plain and a.amname = 'btree' and b.amname = 'btree' and not a.backs
  and cardinality(a.k) <= cardinality(b.k) and b.k[1:cardinality(a.k)] = a.k
  and b.cls[1:cardinality(a.k)] = a.cls and b.coll[1:cardinality(a.k)] = a.coll
  and (not a.indisunique or (b.indisunique and cardinality(a.k) = cardinality(b.k) and a.indexrelid > b.indexrelid));

select harness.check(not exists (select 1 from uncovered),
  'every foreign key in public has an index on its columns; missing: ' || coalesce((select string_agg(key, ', ' order by key) from uncovered), 'none'));
select harness.check((select count(*) from pg_constraint c join pg_class t on t.oid = c.conrelid where c.contype = 'f' and t.relnamespace = 'public'::regnamespace) > 100,
  'and there are keys to check');
select harness.check(not exists (select 1 from redundant),
  'no index leads another on the same columns for nothing; redundant: ' || coalesce((select string_agg(idx, ', ' order by idx) from redundant), 'none'));

-- The two rules catch what they are for: a key without an index, and an index another serves.
begin;
create table public._fk_probe (id uuid primary key, player_id uuid references public.players (id), round_id uuid);
create index _fk_probe_round on public._fk_probe (round_id);
create index _fk_probe_round_player on public._fk_probe (round_id, player_id);
select harness.check((select count(*) from uncovered where key like '_fk_probe.%') = 1, 'a key with no index is caught');
select harness.check((select count(*) from redundant where idx like '_fk_probe_round (%') = 1, 'an index another leads with is caught');
rollback;
