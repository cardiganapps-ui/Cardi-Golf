-- Admin de Polo, slice 4: running Polo — notices, the audit, health, switches.
--
-- Avisos: the admin writes to everyone or to one person. It is an ordinary
-- notification (kind platform_notice) through notify(), so the inbox shows
-- it and the push trigger from 0019 delivers it; nothing new on the wire.
-- A notice to everyone is limited to two a day, and to one person to thirty
-- an hour, enforced here.
--
-- Auditoría: one feed of what the Admin de Polo did — his platform actions
-- (platform_audit_log) and his changes inside tournaments as their Comité
-- (audit_log.actor_platform) — with the full entry on demand, minus
-- anything secret-shaped.
--
-- Salud: the last backup (backup_runs, written by api/backup-cron.ts with
-- the key it already holds), push (configured? subscribers, recent
-- failures — pg_net keeps only a few hours, and says so), the last
-- migration, blocked accounts and PIN locks, the switches.
--
-- Switches (platform_settings): pause new accounts, pause new tournaments,
-- a maintenance banner. Enforced by triggers on profiles and tournaments,
-- so every path that creates one (the wizard, Ronda rápida, duplicate)
-- stops, the admin excepted. Not Supabase's own "disable sign-ups": that
-- would also stop the anonymous phones players join with.

-- ---------------------------------------------------------------------------
-- 1. Switches
-- ---------------------------------------------------------------------------
create table if not exists public.platform_settings (
  key text primary key check (key in ('new_accounts_paused', 'new_tournaments_paused', 'maintenance_banner')),
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
alter table public.platform_settings enable row level security;
revoke all on public.platform_settings from anon, authenticated;

/** The switches, for everyone: the client shows the banner and explains a refusal. */
create or replace function public.app_flags()
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select jsonb_build_object(
    'newAccountsPaused', coalesce((select value = 'true'::jsonb from public.platform_settings where key = 'new_accounts_paused'), false),
    'newTournamentsPaused', coalesce((select value = 'true'::jsonb from public.platform_settings where key = 'new_tournaments_paused'), false),
    'maintenanceBanner', (select value #>> '{}' from public.platform_settings where key = 'maintenance_banner')
  )
$$;
revoke execute on function public.app_flags() from public;
grant execute on function public.app_flags() to anon, authenticated, service_role;

create or replace function public.platform_set_flag(p_key text, p_value jsonb, p_reason text)
returns jsonb
language plpgsql volatile security definer
set search_path = public
as $$
declare
  off boolean;
begin
  if not public.is_platform_admin() then raise exception 'Solo el admin de Polo' using errcode = '42501'; end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'Escribe el motivo' using errcode = '22023'; end if;
  if p_key in ('new_accounts_paused', 'new_tournaments_paused') then
    if jsonb_typeof(p_value) <> 'boolean' then raise exception 'Ese interruptor es sí o no' using errcode = '22023'; end if;
    off := p_value = 'false'::jsonb;
  elsif p_key = 'maintenance_banner' then
    if p_value is not null and jsonb_typeof(p_value) not in ('string', 'null') then raise exception 'El aviso es texto' using errcode = '22023'; end if;
    if length(coalesce(p_value #>> '{}', '')) > 200 then raise exception 'El aviso es de 200 letras máximo' using errcode = '22023'; end if;
    off := p_value is null or jsonb_typeof(p_value) = 'null' or trim(p_value #>> '{}') = '';
  else
    raise exception 'No existe ese interruptor' using errcode = '22023';
  end if;
  if off then
    delete from public.platform_settings where key = p_key;
  else
    insert into public.platform_settings (key, value, updated_by) values (p_key, p_value, auth.uid())
    on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = excluded.updated_by;
  end if;
  perform public.platform_log('set_flag', 'setting', p_key, null, trim(p_reason), jsonb_build_object('value', p_value));
  return public.app_flags();
end;
$$;
revoke execute on function public.platform_set_flag(text, jsonb, text) from public, anon;
grant execute on function public.platform_set_flag(text, jsonb, text) to authenticated, service_role;

create or replace function public.guard_new_tournaments()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.platform_settings where key = 'new_tournaments_paused' and value = 'true'::jsonb)
     and not public.is_platform_admin() then
    raise exception 'Polo no está creando torneos nuevos por un momento. Intenta más tarde.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
drop trigger if exists tournaments_guard_new on public.tournaments;
create trigger tournaments_guard_new before insert on public.tournaments
  for each row execute function public.guard_new_tournaments();

create or replace function public.guard_new_profiles()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.platform_settings where key = 'new_accounts_paused' and value = 'true'::jsonb)
     and not public.is_platform_admin() then
    raise exception 'Polo no está aceptando cuentas nuevas por un momento. Puedes seguir jugando con tu PIN.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
drop trigger if exists profiles_guard_new on public.profiles;
create trigger profiles_guard_new before insert on public.profiles
  for each row execute function public.guard_new_profiles();

-- ---------------------------------------------------------------------------
-- 2. Backups, as the cron reports them
-- ---------------------------------------------------------------------------
create table if not exists public.backup_runs (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  ok boolean not null,
  key text,
  bytes bigint,
  tables int,
  rows bigint,
  error text
);
create index if not exists backup_runs_at_idx on public.backup_runs (at desc);
alter table public.backup_runs enable row level security;
revoke all on public.backup_runs from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Avisos
-- ---------------------------------------------------------------------------
/** Who a notice to everyone reaches: profiles, and how many of them get a push. */
create or replace function public.platform_audience()
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then raise exception 'Solo el admin de Polo' using errcode = '42501'; end if;
  return jsonb_build_object(
    'profiles', (select count(*) from public.profiles),
    'push', (select count(distinct profile_id) from public.push_subscriptions),
    'sentToday', (select count(*) from public.platform_audit_log where action = 'broadcast' and payload ->> 'to' is null and at > now() - interval '24 hours'),
    'recent', coalesce((
      select jsonb_agg(jsonb_build_object('id', l.id, 'at', l.at, 'title', l.payload ->> 'title', 'body', l.payload ->> 'body',
                                          'to', l.payload ->> 'to', 'toName', l.payload ->> 'toName', 'count', (l.payload ->> 'count')::int) order by l.at desc)
      from (select * from public.platform_audit_log where action = 'broadcast' order by at desc limit 10) l
    ), '[]'::jsonb)
  );
end;
$$;
revoke execute on function public.platform_audience() from public, anon;
grant execute on function public.platform_audience() to authenticated, service_role;

/**
 * A notice from the Admin de Polo, to everyone (p_to null) or to one
 * profile. It lands in the inbox and, where push is on, on the phone. The
 * link must be a page inside Polo. Returns how many it reached.
 */
create or replace function public.platform_broadcast(p_title text, p_body text, p_to uuid default null, p_url text default null)
returns int
language plpgsql volatile security definer
set search_path = public
as $$
declare
  title text := trim(coalesce(p_title, ''));
  body text := trim(coalesce(p_body, ''));
  url text := nullif(trim(coalesce(p_url, '')), '');
  k text := 'platform:' || gen_random_uuid();
  data jsonb;
  n int := 0;
  pr record;
begin
  if not public.is_platform_admin() then raise exception 'Solo el admin de Polo' using errcode = '42501'; end if;
  if length(title) not between 1 and 60 then raise exception 'El título es de 1 a 60 letras' using errcode = '22023'; end if;
  if length(body) not between 1 and 280 then raise exception 'El mensaje es de 1 a 280 letras' using errcode = '22023'; end if;
  if url is not null and (url !~ '^/[A-Za-z0-9/_.?=&%-]*$' or url like '//%') then
    raise exception 'La liga es una página de Polo, como /crews' using errcode = '22023';
  end if;
  if p_to is null then
    if (select count(*) from public.platform_audit_log where action = 'broadcast' and payload ->> 'to' is null and at > now() - interval '24 hours') >= 2 then
      raise exception 'Ya mandaste dos avisos a todos hoy' using errcode = '22023';
    end if;
  else
    if not exists (select 1 from public.profiles where id = p_to) then raise exception 'Esa persona no tiene perfil' using errcode = '22023'; end if;
    if (select count(*) from public.platform_audit_log where action = 'broadcast' and payload ->> 'to' is not null and at > now() - interval '1 hour') >= 30 then
      raise exception 'Demasiados avisos en una hora; espera un poco' using errcode = '22023';
    end if;
  end if;
  data := jsonb_build_object('title', title, 'body', body, 'url', url);
  for pr in select id from public.profiles where p_to is null or id = p_to loop
    perform public.notify(pr.id, 'platform_notice', k, null, data);
    n := n + 1;
  end loop;
  perform public.platform_log('broadcast', 'notice', k, null, null,
                              jsonb_build_object('title', title, 'body', body, 'url', url, 'to', p_to, 'count', n,
                                                 'toName', (select display_name from public.profiles where id = p_to)));
  return n;
end;
$$;
revoke execute on function public.platform_broadcast(text, text, uuid, text) from public, anon;
grant execute on function public.platform_broadcast(text, text, uuid, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Auditoría
-- ---------------------------------------------------------------------------
/**
 * What the Admin de Polo did, newest first, paged by time: his platform
 * actions and his changes inside tournaments. p_source: all, platform, comite.
 */
create or replace function public.platform_audit(p_source text default 'all', p_before timestamptz default null, p_limit int default 50, p_q text default null)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  q text := nullif(lower(trim(coalesce(p_q, ''))), '');
  lim int := least(greatest(coalesce(p_limit, 50), 1), 200);
begin
  if not public.is_platform_admin() then raise exception 'Solo el admin de Polo' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(x.j order by x.at desc) from (
      select * from (
        select l.at, jsonb_build_object(
          'source', 'platform', 'id', l.id, 'at', l.at, 'action', l.action, 'targetKind', l.target_kind, 'targetId', l.target_id,
          'tournamentId', l.tournament_id, 'tournament', t.name, 'reason', l.reason,
          'actor', coalesce(pr.display_name, u.email),
          -- What it was about, when the reason does not say: a notice's title, a course's or crew's name, an email.
          'detail', coalesce(l.payload ->> 'title', l.payload ->> 'droppedName', l.payload ->> 'name', l.payload ->> 'email', l.target_id)
        ) as j,
        lower(concat_ws(' ', l.action, l.reason, t.name, l.payload ->> 'title', l.payload ->> 'name', l.payload ->> 'email')) as hay
        from public.platform_audit_log l
        left join public.tournaments t on t.id = l.tournament_id
        left join public.profiles pr on pr.id = l.actor_auth_user_id
        left join auth.users u on u.id = l.actor_auth_user_id
        where coalesce(p_source, 'all') in ('all', 'platform') and (p_before is null or l.at < p_before)
        union all
        select a.at, jsonb_build_object(
          'source', 'comite', 'id', a.id, 'at', a.at, 'action', a.action, 'table', a.table_name, 'rowId', a.row_id,
          'tournamentId', a.tournament_id, 'tournament', t.name, 'reason', a.reason,
          'actor', coalesce(pr.display_name, u.email)
        ),
        lower(concat_ws(' ', a.table_name, a.reason, t.name))
        from public.audit_log a
        left join public.tournaments t on t.id = a.tournament_id
        left join public.profiles pr on pr.id = a.actor_auth_user_id
        left join auth.users u on u.id = a.actor_auth_user_id
        where a.actor_platform and coalesce(p_source, 'all') in ('all', 'comite') and (p_before is null or a.at < p_before)
      ) e
      where q is null or e.hay like '%' || q || '%'
      order by e.at desc
      limit lim
    ) x
  ), '[]'::jsonb);
end;
$$;
revoke execute on function public.platform_audit(text, timestamptz, int, text) from public, anon;
grant execute on function public.platform_audit(text, timestamptz, int, text) to authenticated, service_role;

/** One audit entry in full, minus anything secret-shaped. */
create or replace function public.platform_audit_entry(p_source text, p_id bigint)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  secret text[] := array['pin_hash', 'token_hash', 'p256dh', 'auth', 'endpoint', 'encrypted_password'];
begin
  if not public.is_platform_admin() then raise exception 'Solo el admin de Polo' using errcode = '42501'; end if;
  if p_source = 'platform' then
    return (select jsonb_build_object('source', 'platform', 'id', l.id, 'at', l.at, 'action', l.action, 'targetKind', l.target_kind,
                                      'targetId', l.target_id, 'tournamentId', l.tournament_id, 'reason', l.reason,
                                      'payload', l.payload - secret)
            from public.platform_audit_log l where l.id = p_id);
  end if;
  return (select jsonb_build_object('source', 'comite', 'id', a.id, 'at', a.at, 'action', a.action, 'table', a.table_name,
                                    'rowId', a.row_id, 'tournamentId', a.tournament_id, 'reason', a.reason,
                                    'before', a.before - secret, 'after', a.after - secret)
          from public.audit_log a where a.id = p_id and a.actor_platform);
end;
$$;
revoke execute on function public.platform_audit_entry(text, bigint) from public, anon;
grant execute on function public.platform_audit_entry(text, bigint) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Salud
-- ---------------------------------------------------------------------------
create or replace function public.platform_health()
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  push_configured boolean;
  net jsonb;
begin
  if not public.is_platform_admin() then raise exception 'Solo el admin de Polo' using errcode = '42501'; end if;
  -- Vault and pg_net are extensions; if either is missing or refuses, say "unknown" rather than fail the page.
  begin
    select count(*) = 2 into push_configured from vault.secrets where name in ('push_dispatch_url', 'push_dispatch_secret');
  exception when others then
    push_configured := null;
  end;
  begin
    select jsonb_build_object(
      'total', count(*),
      'failed', count(*) filter (where r.status_code is null or r.status_code >= 400 or r.error_msg is not null),
      'since', min(r.created)
    ) into net
    from net._http_response r where r.created > now() - interval '6 hours';
  exception when others then
    net := null;
  end;
  return jsonb_build_object(
    'backup', jsonb_build_object(
      'last', (select jsonb_build_object('at', b.at, 'ok', b.ok, 'key', b.key, 'bytes', b.bytes, 'tables', b.tables, 'rows', b.rows, 'error', b.error)
               from public.backup_runs b order by b.at desc limit 1),
      'lastOk', (select jsonb_build_object('at', b.at, 'key', b.key, 'bytes', b.bytes, 'tables', b.tables, 'rows', b.rows)
                 from public.backup_runs b where b.ok order by b.at desc limit 1),
      'week', jsonb_build_object(
        'ok', (select count(*) from public.backup_runs where ok and at > now() - interval '7 days'),
        'failed', (select count(*) from public.backup_runs where not ok and at > now() - interval '7 days')
      )
    ),
    'push', jsonb_build_object(
      'configured', push_configured,
      'subscriptions', (select count(*) from public.push_subscriptions),
      'profiles', (select count(distinct profile_id) from public.push_subscriptions),
      'recent', net
    ),
    'database', jsonb_build_object(
      'lastMigration', (select jsonb_build_object('name', m.name, 'at', m.applied_at) from public._migrations m order by m.applied_at desc limit 1),
      'notifications24h', (select count(*) from public.notifications where created_at > now() - interval '24 hours')
    ),
    'people', jsonb_build_object(
      'blocked', (select count(*) from auth.users where banned_until > now()),
      'deviceLocks', (select count(*) from public.pin_attempts where locked_until > now()),
      'playerLocks', (select count(*) from public.player_pins where locked_until > now())
    ),
    'flags', public.app_flags()
  );
end;
$$;
revoke execute on function public.platform_health() from public, anon;
grant execute on function public.platform_health() to authenticated, service_role;
