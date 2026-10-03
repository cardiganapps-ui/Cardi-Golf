-- The migration ledger, created by the chain itself (DB-22). 0010 and 0024
-- read public._migrations, which until now only scripts/db.mjs created before
-- the first file: replayed by anything else (supabase db reset, a plain psql
-- loop, the db CI job's replay) the chain stopped at 0010.
--
-- scripts/db.mjs records each file it applies here with its checksum and
-- refuses to run when an applied file has changed or gone (DB-17). 0010
-- turns RLS on: nothing outside the owner reads or writes it.
--
-- Idempotent: on a project where db.mjs already made the table, this only
-- adds the checksum column.
create table if not exists public._migrations (
  name text primary key,
  applied_at timestamptz not null default now(),
  checksum text
);
alter table public._migrations add column if not exists checksum text;
