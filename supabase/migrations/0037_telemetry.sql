-- Cardi-Golf · 0037 · First-party telemetry (STRAT-02).
--
-- Polo could not see a failure on a player's phone, nor whether a saved hole
-- reached the others in under 2 s. Now each phone sends, in small batches:
-- its errors, how long a save took to be answered and a change to arrive,
-- the web vitals, and a handful of steps (opened a tournament, entered with a
-- PIN, saved a first hole…); and a heartbeat with its build and what its
-- outbox still holds. Nothing here is a fact of a tournament: the boards never
-- read it.
--
-- Written only through two definer RPCs, size-capped and rate-limited (600
-- events an hour and five phones per account), with secret-shaped keys, email
-- addresses and tokens taken out on the way in, at any depth. A
-- tournament id is kept only when the phone belongs to that tournament. Kept
-- 30 days (events) and 90 (devices), pruned by the writes themselves (the
-- harness has no pg_cron). The platform admin reads it in Salud
-- (platform_telemetry); a Comité reads its tournament's phones
-- (tournament_devices). Deleting an account deletes its rows (cascade). Not
-- in the nightly backup: what is pruned here is gone.

create table public.client_events (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  client_at timestamptz,
  auth_user_id uuid not null references auth.users (id) on delete cascade,
  device_id uuid not null,
  tournament_id uuid references public.tournaments (id) on delete set null,
  build bigint,
  build_sha text,
  kind text not null check (kind in ('error', 'sync', 'vital', 'funnel')),
  name text not null check (name ~ '^[a-z][a-z0-9_.:-]{0,63}$'),
  value double precision,
  data jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object' and octet_length(data::text) <= 2048)
);
create index client_events_at on public.client_events (at);
create index client_events_user_at on public.client_events (auth_user_id, at);
create index client_events_tournament on public.client_events (tournament_id) where tournament_id is not null;
alter table public.client_events enable row level security;
revoke all on public.client_events from public, anon, authenticated;

create table public.device_status (
  auth_user_id uuid not null references auth.users (id) on delete cascade,
  device_id uuid not null,
  tournament_id uuid references public.tournaments (id) on delete set null,
  player_id uuid references public.players (id) on delete set null,
  build bigint,
  build_sha text,
  platform text check (platform in ('ios', 'android', 'desktop', 'other')),
  standalone boolean,
  pending integer not null default 0 check (pending >= 0),
  rejected integer not null default 0 check (rejected >= 0),
  oldest_pending_at timestamptz,
  last_sync_at timestamptz,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (auth_user_id, device_id)
);
create index device_status_tournament on public.device_status (tournament_id) where tournament_id is not null;
create index device_status_player on public.device_status (player_id) where player_id is not null;
create index device_status_seen on public.device_status (last_seen_at);
alter table public.device_status enable row level security;
revoke all on public.device_status from public, anon, authenticated;

/** Internal: one value of a client's diagnostic object, without secret-shaped keys, email addresses or tokens, at any depth. */
create or replace function public.telemetry_scrub_value(v jsonb, depth integer default 0)
returns jsonb
language plpgsql immutable
set search_path = public
as $$
declare
  out jsonb;
begin
  if v is null then return null; end if;
  if depth > 4 then return 'null'::jsonb; end if;
  case jsonb_typeof(v)
    when 'string' then
      return to_jsonb(regexp_replace(regexp_replace(v #>> '{}',
        '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', '[correo]', 'g'),
        'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+', '[token]', 'g'));
    when 'object' then
      select coalesce(jsonb_object_agg(k, public.telemetry_scrub_value(x, depth + 1)), '{}'::jsonb) into out
      from jsonb_each(v) e (k, x)
      where k !~* '(email|correo|mail|pin|token|password|secret|apikey|api_key|authorization|cookie|phone|tel)';
      return out;
    when 'array' then
      select coalesce(jsonb_agg(public.telemetry_scrub_value(x, depth + 1)), '[]'::jsonb) into out from jsonb_array_elements(v) a (x);
      return out;
    else
      return v;
  end case;
end;
$$;
revoke execute on function public.telemetry_scrub_value(jsonb, integer) from public, anon, authenticated;

/** Internal: a client's diagnostic object, scrubbed (anything but an object reads as {}). */
create or replace function public.telemetry_scrub(j jsonb)
returns jsonb
language sql immutable
set search_path = public
as $$
  select case when j is null or jsonb_typeof(j) <> 'object' then '{}'::jsonb else public.telemetry_scrub_value(j) end
$$;
revoke execute on function public.telemetry_scrub(jsonb) from public, anon, authenticated;

/** Internal: a client's timestamp, or null; never later than now. */
create or replace function public.telemetry_ts(p text)
returns timestamptz
language plpgsql immutable
set search_path = public
as $$
begin
  if p is null or p !~ '^\d{4}-\d{2}-\d{2}T[0-9:.]+(Z|[+-]\d{2}:?\d{2})$' then return null; end if;
  return p::timestamptz;
exception when others then
  return null;
end;
$$;
revoke execute on function public.telemetry_ts(text) from public, anon, authenticated;

/**
 * A batch of a phone's events: at most 50 per call and 600 per account per
 * hour (the rest are dropped, never an error: telemetry must not fail a
 * phone). Invalid events are skipped. Returns how many were kept.
 */
create or replace function public.log_client_events(p_events jsonb)
returns integer
language plpgsql volatile security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  recent integer;
  kept integer := 0;
  e jsonb;
  tid uuid;
  dev uuid;
  d jsonb;
begin
  if uid is null then raise exception 'Sin sesión' using errcode = '42501'; end if;
  if p_events is null or jsonb_typeof(p_events) <> 'array' or jsonb_array_length(p_events) > 50 then
    raise exception 'Hasta 50 eventos por envío' using errcode = '22023';
  end if;
  -- One account's batches count one after another, so two at once can't both pass the cap.
  perform pg_advisory_xact_lock(hashtext('telemetry:' || uid::text));
  select count(*) into recent from public.client_events where auth_user_id = uid and at > now() - interval '1 hour';

  for e in select x from jsonb_array_elements(p_events) a (x) loop
    exit when recent + kept >= 600;
    -- An event the server can't read is skipped, never the batch.
    begin
      if jsonb_typeof(e) <> 'object' then continue; end if;
      dev := public.try_uuid(e ->> 'deviceId');
      if dev is null or coalesce(e ->> 'kind', '') not in ('error', 'sync', 'vital', 'funnel')
         or coalesce(e ->> 'name', '') !~ '^[a-z][a-z0-9_.:-]{0,63}$' then
        continue;
      end if;
      d := public.telemetry_scrub(e -> 'data');
      if octet_length(d::text) > 2048 then continue; end if;
      tid := public.try_uuid(e ->> 'tournamentId');
      if tid is not null and not public.is_tournament_member(tid) then tid := null; end if;
      insert into public.client_events (auth_user_id, device_id, tournament_id, build, build_sha, kind, name, value, data, client_at)
      values (uid, dev, tid,
              case when e ->> 'build' ~ '^\d{1,12}$' then (e ->> 'build')::bigint end,
              case when e ->> 'buildSha' ~ '^[A-Za-z0-9._-]{1,40}$' then e ->> 'buildSha' end,
              e ->> 'kind', e ->> 'name',
              case when jsonb_typeof(e -> 'value') = 'number' and abs((e ->> 'value')::numeric) < 1e12 then (e ->> 'value')::double precision end,
              d,
              least(public.telemetry_ts(e ->> 'at'), now()));
      kept := kept + 1;
    exception when others then
      null;
    end;
  end loop;

  -- Retention: 30 days, a few hundred rows at a time.
  delete from public.client_events
   where id in (select id from public.client_events where at < now() - interval '30 days' order by at limit 500);
  return kept;
end;
$$;
revoke execute on function public.log_client_events(jsonb) from public, anon;
grant execute on function public.log_client_events(jsonb) to authenticated;

/** A phone's heartbeat: its build and what its outbox holds (counts up to 500), at most once every 15 seconds unless a count changes; five phones per account. */
create or replace function public.heartbeat(p jsonb)
returns void
language plpgsql volatile security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  dev uuid;
  tid uuid;
begin
  if uid is null then raise exception 'Sin sesión' using errcode = '42501'; end if;
  if p is null or jsonb_typeof(p) <> 'object' then raise exception 'Latido inválido' using errcode = '22023'; end if;
  dev := public.try_uuid(p ->> 'deviceId');
  if dev is null then raise exception 'Latido inválido' using errcode = '22023'; end if;
  tid := public.try_uuid(p ->> 'tournamentId');
  if tid is not null and not public.is_tournament_member(tid) then tid := null; end if;

  insert into public.device_status as d (auth_user_id, device_id, tournament_id, player_id, build, build_sha, platform, standalone,
                                         pending, rejected, oldest_pending_at, last_sync_at)
  values (uid, dev, tid,
          case when tid is not null then public.my_player_id(tid) end,
          case when p ->> 'build' ~ '^\d{1,12}$' then (p ->> 'build')::bigint end,
          case when p ->> 'buildSha' ~ '^[A-Za-z0-9._-]{1,40}$' then p ->> 'buildSha' end,
          case when p ->> 'platform' in ('ios', 'android', 'desktop', 'other') then p ->> 'platform' end,
          case when jsonb_typeof(p -> 'standalone') = 'boolean' then (p ->> 'standalone')::boolean end,
          case when p ->> 'pending' ~ '^\d{1,6}$' then least((p ->> 'pending')::integer, 500) else 0 end,
          case when p ->> 'rejected' ~ '^\d{1,6}$' then least((p ->> 'rejected')::integer, 500) else 0 end,
          least(public.telemetry_ts(p ->> 'oldestPendingAt'), now()),
          least(public.telemetry_ts(p ->> 'lastSyncAt'), now()))
  on conflict (auth_user_id, device_id) do update
     set tournament_id = excluded.tournament_id, player_id = excluded.player_id, build = excluded.build, build_sha = excluded.build_sha,
         platform = excluded.platform, standalone = excluded.standalone, pending = excluded.pending, rejected = excluded.rejected,
         oldest_pending_at = excluded.oldest_pending_at, last_sync_at = excluded.last_sync_at, last_seen_at = now()
   where d.last_seen_at < now() - interval '15 seconds'
      or d.pending is distinct from excluded.pending or d.rejected is distinct from excluded.rejected
      or d.tournament_id is distinct from excluded.tournament_id;

  -- At most five phones per account: a browser that keeps inventing device ids replaces its own oldest.
  delete from public.device_status d
   where d.auth_user_id = uid
     and d.device_id not in (select x.device_id from public.device_status x where x.auth_user_id = uid order by x.last_seen_at desc, x.device_id limit 5);

  -- Retention: a phone not seen in 90 days goes.
  delete from public.device_status
   where (auth_user_id, device_id) in (select auth_user_id, device_id from public.device_status where last_seen_at < now() - interval '90 days' limit 200);
end;
$$;
revoke execute on function public.heartbeat(jsonb) from public, anon;
grant execute on function public.heartbeat(jsonb) to authenticated;

/** Salud: errors, sync times, vitals, phones and steps over the last hours (1 to 720). */
create or replace function public.platform_telemetry(p_hours integer default 24)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  since timestamptz;
begin
  if not public.is_platform_admin() then raise exception 'Solo el admin de Polo' using errcode = '42501'; end if;
  since := now() - make_interval(hours => least(greatest(coalesce(p_hours, 24), 1), 720));
  return jsonb_build_object(
    'since', since,
    'events', (select count(*) from public.client_events where at >= since),
    'errors', coalesce((
      select jsonb_agg(g order by g.count desc, g.last_at desc) from (
        select e.name, left(coalesce(e.data ->> 'message', ''), 160) as summary, e.build, max(e.build_sha) as "buildSha",
               count(*)::int as count, count(distinct e.device_id)::int as devices, min(e.at) as first_at, max(e.at) as last_at,
               max(left(coalesce(e.data ->> 'route', ''), 80)) as route
        from public.client_events e
        where e.kind = 'error' and e.at >= since
        group by e.name, left(coalesce(e.data ->> 'message', ''), 160), e.build
        order by count(*) desc, max(e.at) desc
        limit 20
      ) g), '[]'::jsonb),
    'sync', coalesce((
      select jsonb_agg(s order by s.name) from (
        select e.name, count(*)::int as count,
               round(percentile_cont(0.5) within group (order by e.value)::numeric)::int as p50,
               round(percentile_cont(0.95) within group (order by e.value)::numeric)::int as p95,
               count(*) filter (where e.value > 2000)::int as over2s
        from public.client_events e
        where e.kind = 'sync' and e.at >= since and e.value is not null
        group by e.name
      ) s), '[]'::jsonb),
    'syncByTournament', coalesce((
      select jsonb_agg(s order by s.count desc) from (
        select e.tournament_id as "tournamentId", t.name as tournament, count(*)::int as count,
               round(percentile_cont(0.5) within group (order by e.value)::numeric)::int as p50,
               round(percentile_cont(0.95) within group (order by e.value)::numeric)::int as p95
        from public.client_events e join public.tournaments t on t.id = e.tournament_id
        where e.kind = 'sync' and e.name = 'apply_lag' and e.at >= since and e.value is not null
        group by e.tournament_id, t.name
        order by count(*) desc
        limit 10
      ) s), '[]'::jsonb),
    'vitals', coalesce((
      select jsonb_agg(v order by v.name) from (
        select e.name, count(*)::int as count,
               round(percentile_cont(0.75) within group (order by e.value)::numeric, 3) as p75
        from public.client_events e
        where e.kind = 'vital' and e.at >= since and e.value is not null
        group by e.name
      ) v), '[]'::jsonb),
    'funnel', coalesce((
      select jsonb_agg(f order by f.count desc) from (
        select e.name, count(*)::int as count, count(distinct e.auth_user_id)::int as people
        from public.client_events e
        where e.kind = 'funnel' and e.at >= since
        group by e.name
      ) f), '[]'::jsonb),
    'devices', jsonb_build_object(
      'seen', (select count(*) from public.device_status where last_seen_at >= since),
      'withPending', (select count(*) from public.device_status where last_seen_at >= since and pending > 0),
      'pending', (select coalesce(sum(pending), 0) from public.device_status where last_seen_at >= since),
      'rejected', (select coalesce(sum(rejected), 0) from public.device_status where last_seen_at >= since),
      'oldestPendingAt', (select min(oldest_pending_at) from public.device_status where last_seen_at >= since and pending > 0),
      'builds', coalesce((
        select jsonb_agg(b order by b.build desc nulls last) from (
          select d.build, max(d.build_sha) as "buildSha", count(*)::int as count
          from public.device_status d where d.last_seen_at >= since
          group by d.build
        ) b), '[]'::jsonb)
    )
  );
end;
$$;
revoke execute on function public.platform_telemetry(integer) from public, anon;
grant execute on function public.platform_telemetry(integer) to authenticated, service_role;

/** The Comité: its tournament's phones seen in the last 7 days, with what each still has to send. */
create or replace function public.tournament_devices(p_tournament_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
begin
  if p_tournament_id is null or not public.is_tournament_organizer(p_tournament_id) then
    raise exception 'Solo el Comité' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'playerId', d.player_id, 'player', p.display_name, 'build', d.build, 'buildSha', d.build_sha,
             'platform', d.platform, 'standalone', d.standalone, 'pending', d.pending, 'rejected', d.rejected,
             'oldestPendingAt', d.oldest_pending_at, 'lastSyncAt', d.last_sync_at, 'lastSeenAt', d.last_seen_at)
           order by d.pending desc, d.last_seen_at desc)
    from public.device_status d left join public.players p on p.id = d.player_id
    where d.tournament_id = p_tournament_id and d.last_seen_at > now() - interval '7 days'), '[]'::jsonb);
end;
$$;
revoke execute on function public.tournament_devices(uuid) from public, anon;
grant execute on function public.tournament_devices(uuid) to authenticated;
