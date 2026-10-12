-- Cardi-Golf · 0039 · The nightly backup in one consistent snapshot, with accounts and files (DB-07).
--
-- The backup (api/backup-cron.ts) read each table with its own HTTP
-- requests, so a night when someone was scoring could keep a hole's score
-- from one moment and its round's state from another. It also had no
-- accounts (every profile, organizer, PIN claim and Comité row points at
-- auth.users) and no list of the files in Storage, so a restore had nothing
-- to hang them on.
--
-- backup_snapshot(p_tables) reads every table it is given in one SQL
-- statement, hence one snapshot, and with it, from that same snapshot:
-- - the highest audit_log id, so the route reads the history (append-only,
--   40 MB, too big for one request) up to exactly that row;
-- - each account's essentials: id, email, phone, anonymous or not, when it
--   was created, confirmed and banned, its app and user metadata (provider,
--   display name). Never a password hash, a token or a session;
-- - each account's sign-in identities (email, Google): provider, provider id,
--   identity data;
-- - each file's place and metadata in Storage (the files themselves go to
--   R2 beside the backup).
--
-- p_tables is {table: "order, columns"}, each a table of public with those
-- columns: a table that does not exist fails the whole call by name, so a
-- backup never looks whole without it. Only the service role (the backup
-- route) and postgres may call it.

create function public.backup_snapshot(p_tables jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  t text;
  cols text;
  c text;
  ord text;
  parts text[] := '{}';
  q text;
  result jsonb;
begin
  if p_tables is null or jsonb_typeof(p_tables) <> 'object' then
    raise exception 'El respaldo necesita la lista de tablas.' using errcode = '22023';
  end if;
  for t, cols in select key, value #>> '{}' from jsonb_each(p_tables) order by key loop
    if to_regclass(format('public.%I', t)) is null then
      raise exception '%: la tabla no existe en esta base de datos.', t using errcode = '22023';
    end if;
    ord := '';
    foreach c in array string_to_array(coalesce(cols, ''), ',') loop
      c := btrim(c);
      if not exists (select 1 from pg_attribute a where a.attrelid = format('public.%I', t)::regclass and a.attname = c and a.attnum > 0 and not a.attisdropped) then
        raise exception '%: no tiene la columna %.', t, c using errcode = '22023';
      end if;
      ord := ord || case when ord = '' then '' else ', ' end || format('x.%I', c);
    end loop;
    if ord = '' then
      raise exception '%: falta con qué ordenarla.', t using errcode = '22023';
    end if;
    parts := parts || format('jsonb_build_object(%L, (select coalesce(jsonb_agg(to_jsonb(x) order by %s), ''[]''::jsonb) from public.%I x))', t, ord, t);
  end loop;
  -- One statement, so one snapshot: every table, the history's last row, the accounts and the files as of the same instant.
  q := 'select jsonb_build_object('
    || '''snapshotAt'', now(), '
    || '''auditMaxId'', (select max(id) from public.audit_log), '
    || '''tables'', ' || coalesce(nullif(array_to_string(parts, ' || '), ''), '''{}''::jsonb') || ', '
    || '''auth'', jsonb_build_object('
    || '''users'', (select coalesce(jsonb_agg(jsonb_build_object(''id'', u.id, ''email'', u.email, ''phone'', u.phone, ''is_anonymous'', u.is_anonymous, '
    ||   '''created_at'', u.created_at, ''email_confirmed_at'', u.email_confirmed_at, ''banned_until'', u.banned_until, '
    ||   '''raw_app_meta_data'', u.raw_app_meta_data, ''raw_user_meta_data'', u.raw_user_meta_data) order by u.id), ''[]''::jsonb) from auth.users u), '
    || '''identities'', (select coalesce(jsonb_agg(jsonb_build_object(''id'', i.id, ''user_id'', i.user_id, ''provider'', i.provider, ''provider_id'', i.provider_id, '
    ||   '''identity_data'', i.identity_data, ''created_at'', i.created_at) order by i.id), ''[]''::jsonb) from auth.identities i)), '
    || '''storage'', jsonb_build_object('
    || '''objects'', (select coalesce(jsonb_agg(jsonb_build_object(''bucket_id'', o.bucket_id, ''name'', o.name, ''owner'', o.owner, '
    ||   '''created_at'', o.created_at, ''updated_at'', o.updated_at, ''metadata'', o.metadata) order by o.bucket_id, o.name), ''[]''::jsonb) from storage.objects o)))';
  execute q into result;
  return result;
end $$;
revoke execute on function public.backup_snapshot(jsonb) from public, anon, authenticated;
grant execute on function public.backup_snapshot(jsonb) to service_role;
