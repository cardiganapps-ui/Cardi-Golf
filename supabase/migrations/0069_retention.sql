-- 0069: what has done its job is deleted every night (TRUST-18).
--
-- Nothing was ever deleted: sign-in tokens past their 15 minutes, the server's answers to saves long sent,
-- notices from years ago, every anonymous user a browser ever made, and the history of a tournament that no longer
-- exists (a copy of every row it had, which no Comité can read any more). run_retention() deletes, each night,
-- after the backup is safe in R2 (api/backup-cron.ts, as the service role):
--   link_tokens       a link token expired a day ago (create_link_token already sweeps them as it writes)
--   score_mutations   the server's answer to a save, 90 days after it: the outbox retries for minutes, not months
--   notifications     an inbox notice, 12 months after it was sent
--   client_events     telemetry after 30 days, and device_status after 90 days unseen (both already pruned as each
--                     phone writes; this covers the nights nobody writes)
--   anonymous         an anonymous user idle for 180 days (no sign-in, no session refreshed, no phone report) that
--                     holds nothing: no PIN claim now or before, no Comité, no organizer, no history line, no refused
--                     save, no saved answer, no file; only what goes with it (telemetry, its consent record, its
--                     PIN tries). Every key from public to auth.users is read from the catalog at run time, so a
--                     table added later keeps its users until it is listed as disposable here.
--   deleted_tournament_audit  the history of a tournament deleted 90 days ago (its last line older than that)
-- Never a tournament that exists, its scores, money, results or history. Each step runs on its own (one that fails
-- is named on the run and the rest go on), within a batch per night so the route stays inside Vercel's 60 s; what is
-- left goes the next night. Each night is a retention_runs row, which Admin › Salud shows (platform_health).

create table if not exists public.retention_runs (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  ok boolean not null,
  counts jsonb not null default '{}',
  error text
);
create index if not exists retention_runs_at_idx on public.retention_runs (at desc);
alter table public.retention_runs enable row level security;
revoke all on public.retention_runs from anon, authenticated;

create or replace function public.run_retention()
returns jsonb
language plpgsql volatile security definer
set search_path = public
as $$
declare
  counts jsonb := '{}';
  errors text[] := '{}';
  n bigint;
  holds text;
  gone uuid[];
  -- Tables whose rows go with their user: they never keep one.
  disposable text[] := array['client_events', 'device_status', 'legal_acceptances', 'pin_attempts'];
begin
  begin
    delete from public.profile_link_tokens where expires_at < now() - interval '1 day';
    get diagnostics n = row_count;
    counts := counts || jsonb_build_object('link_tokens', n);
  exception when others then errors := errors || ('link_tokens: ' || sqlerrm);
  end;

  begin
    delete from public.score_mutations
     where mutation_id in (select mutation_id from public.score_mutations where created_at < now() - interval '90 days' limit 20000);
    get diagnostics n = row_count;
    counts := counts || jsonb_build_object('score_mutations', n);
  exception when others then errors := errors || ('score_mutations: ' || sqlerrm);
  end;

  begin
    delete from public.notifications
     where id in (select id from public.notifications where created_at < now() - interval '12 months' limit 20000);
    get diagnostics n = row_count;
    counts := counts || jsonb_build_object('notifications', n);
  exception when others then errors := errors || ('notifications: ' || sqlerrm);
  end;

  begin
    delete from public.client_events where id in (select id from public.client_events where at < now() - interval '30 days' limit 20000);
    get diagnostics n = row_count;
    counts := counts || jsonb_build_object('client_events', n);
    delete from public.device_status where last_seen_at < now() - interval '90 days';
    get diagnostics n = row_count;
    counts := counts || jsonb_build_object('device_status', n);
  exception when others then errors := errors || ('client_events: ' || sqlerrm);
  end;

  begin
    -- Every key from public to auth.users but the disposable ones: a user any of them names holds something.
    select string_agg(format('not exists (select 1 from public.%I x where x.%I = u.id)', cl.relname, a.attname), ' and ')
      into holds
    from pg_constraint c
    join pg_class cl on cl.oid = c.conrelid
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f' and c.confrelid = 'auth.users'::regclass and cl.relnamespace = 'public'::regnamespace
      and array_length(c.conkey, 1) = 1 and cl.relname <> all (disposable);
    execute format($q$
      select coalesce(array_agg(id), '{}') from (
        select u.id from auth.users u
        where u.is_anonymous
          and greatest(u.created_at, u.last_sign_in_at, u.updated_at) < now() - interval '180 days'
          and not exists (select 1 from auth.sessions s where s.user_id = u.id and greatest(s.created_at, s.updated_at, s.refreshed_at::timestamptz) > now() - interval '180 days')
          and not exists (select 1 from public.device_status d where d.auth_user_id = u.id and d.last_seen_at > now() - interval '180 days')
          -- What names a user without a key: the history, the refused saves, the saved answers, a file.
          and not exists (select 1 from public.audit_log l where l.actor_auth_user_id = u.id)
          and not exists (select 1 from public.rejected_writes w where w.auth_user_id = u.id)
          and not exists (select 1 from public.score_mutations m where m.auth_user_id = u.id)
          and not exists (select 1 from storage.objects o where o.owner = u.id)
          and %s
        order by u.created_at
        limit 500
      ) x $q$, coalesce(holds, 'true'))
      into gone;
    delete from auth.users where id = any (gone);
    get diagnostics n = row_count;
    counts := counts || jsonb_build_object('anonymous', n);
    -- GoTrue's own lines about them, as anonymize_person does for a deleted account.
    if cardinality(gone) > 0 and to_regclass('auth.audit_log_entries') is not null then
      begin
        execute 'delete from auth.audit_log_entries where payload ->> ''actor_id'' = any ($1) or payload -> ''traits'' ->> ''user_id'' = any ($1)'
          using (select array_agg(g::text) from unnest(gone) g);
      exception when insufficient_privilege then
        null;
      end;
    end if;
  exception when others then errors := errors || ('anonymous: ' || sqlerrm);
  end;

  begin
    delete from public.audit_log l
     where l.id in (
       select a.id from public.audit_log a
       where a.tournament_id in (
         select d.tournament_id from public.audit_log d
         where d.tournament_id is not null
           and not exists (select 1 from public.tournaments t where t.id = d.tournament_id)
         group by d.tournament_id
         having max(d.at) < now() - interval '90 days'
       )
       limit 50000
     );
    get diagnostics n = row_count;
    counts := counts || jsonb_build_object('deleted_tournament_audit', n);
  exception when others then errors := errors || ('deleted_tournament_audit: ' || sqlerrm);
  end;

  insert into public.retention_runs (ok, counts, error)
  values (cardinality(errors) = 0, counts, nullif(left(array_to_string(errors, '; '), 500), ''));
  return jsonb_build_object('ok', cardinality(errors) = 0, 'counts', counts, 'errors', to_jsonb(errors));
end;
$$;
comment on function public.run_retention() is
  'The nightly deletion of what has done its job (TRUST-18): expired link tokens, old save answers, notices and telemetry, idle anonymous users that hold nothing, and the history of tournaments deleted 90 days ago. Never a tournament that exists.';
revoke execute on function public.run_retention() from public, anon, authenticated;
grant execute on function public.run_retention() to service_role;

-- 0024's platform_health, plus the nightly deletion's last run.
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
    'retention', jsonb_build_object(
      'last', (select jsonb_build_object('at', r.at, 'ok', r.ok, 'counts', r.counts, 'error', r.error)
               from public.retention_runs r order by r.at desc limit 1),
      'week', (select coalesce(jsonb_object_agg(k, s), '{}'::jsonb) from (
                 select e.key as k, sum(e.value::bigint) as s
                 from public.retention_runs r, jsonb_each_text(r.counts) e
                 where r.at > now() - interval '7 days' group by e.key) w)
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
