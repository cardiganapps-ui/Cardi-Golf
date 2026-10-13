-- Each phone hears its own tournament (0049, DB-05). The app filters every
-- binding of its live channel by tournament (src/data/realtimeTables.ts):
-- `tournament_id=eq.<id>`, the tournament row `id=eq.<id>`. Read from the
-- catalog after every migration, for every table in the supabase_realtime
-- publication:
--   * it has the column its binding is filtered on (Realtime refuses a
--     filter on a column the table lacks, and the whole channel with it,
--     REL-01), never null (a row without it would reach no phone);
--   * a table whose filter is not its primary key logs its whole old row
--     (replica identity full): Postgres Changes reads a delete's filter from
--     what the delete logged, so without it the phone hears none of that
--     table's deletes, its own tournament's included.
-- A table published later without either fails here.
\set ON_ERROR_STOP 1
\set QUIET 1
\pset tuples_only on
\pset format unaligned

create temp view published as
select c.oid, c.relname as name, c.relreplident as identity,
  case when c.relname = 'tournaments' then 'id' else 'tournament_id' end as filter_column
from pg_publication_tables pt
join pg_namespace n on n.nspname = pt.schemaname
join pg_class c on c.relnamespace = n.oid and c.relname = pt.tablename
where pt.pubname = 'supabase_realtime' and pt.schemaname = 'public';

create temp view filter_columns as
select p.name, p.filter_column, p.identity, a.attnotnull as not_null, a.attname is not null as present
from published p
left join pg_attribute a on a.attrelid = p.oid and a.attname = p.filter_column and not a.attisdropped;

select harness.check((select count(*) from published) >= 22, 'the publication holds the tournament tables: ' || (select count(*) from published));

select harness.check(not exists (select 1 from filter_columns where not present),
  'every published table has the column its binding is filtered on; missing: ' || coalesce((select string_agg(name, ', ' order by name) from filter_columns where not present), 'none'));

select harness.check(not exists (select 1 from filter_columns where present and not not_null),
  'that column is never null; nullable: ' || coalesce((select string_agg(name, ', ' order by name) from filter_columns where present and not not_null), 'none'));

select harness.check(not exists (select 1 from filter_columns where filter_column = 'tournament_id' and identity <> 'f'),
  'every table filtered on tournament_id logs its whole old row; not yet: ' || coalesce((select string_agg(name, ', ' order by name) from filter_columns where filter_column = 'tournament_id' and identity <> 'f'), 'none'));

-- The tournament row is filtered on its primary key, which every delete logs whatever the table's identity.
select harness.check(exists (
  select 1 from pg_index i
  join pg_attribute a on a.attrelid = i.indrelid and a.attnum = i.indkey[0]
  where i.indrelid = 'public.tournaments'::regclass and i.indisprimary and i.indnatts = 1 and a.attname = 'id'
), 'the tournament row''s filter is its whole primary key');

select 'realtime filters: ok';
