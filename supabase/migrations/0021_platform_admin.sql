-- The Polo platform admin: one account with oversight of every tournament.
--
-- Until now every permission was scoped to one tournament, profile or crew.
-- This adds a platform level with one member (Diego), decided 2026-09-29:
--
--   * «Comité en cualquier torneo». The admin reads every tournament and has
--     its Comité's powers, without being added to it. Every Comité policy and
--     RPC already asks is_tournament_organizer / is_tournament_member, so the
--     admin is OR'd into those helpers, LAST, and nothing else is rewritten.
--     For anyone who is not the admin each new term is false, so the answer
--     is exactly what it was.
--   * What he did as admin is marked: audit_log.actor_platform, and the
--     separate platform_audit_log for actions that have no tournament row.
--   * A tournament can be Protegido. Nobody deletes it, the owner included,
--     and the admin's Comité rights over it need a 30-minute unlock with a
--     reason. For the real April tournament.
--   * The social graph stays private. profile_visible_to_me moves to
--     is_tournament_participant (the old member test, without the admin), so
--     reading every tournament never becomes reading every profile. Policies
--     on profiles, device_sessions, notifications, push_subscriptions,
--     friendships and crews get no platform branch at all.
--
-- Who the admin is lives only in platform_admins (no client access). It is
-- seeded once, here, by email; no code path compares an email at runtime.
-- Everything platform-level is a platform_* security definer RPC that starts
-- with the same guard. No service-role code.

-- ---------------------------------------------------------------------------
-- 1. Identity
-- ---------------------------------------------------------------------------
create table if not exists public.platform_admins (
  auth_user_id uuid primary key references auth.users (id) on delete cascade,
  added_at timestamptz not null default now(),
  note text
);
alter table public.platform_admins enable row level security;
revoke all on public.platform_admins from anon, authenticated;

insert into public.platform_admins (auth_user_id, note)
select id, 'Diego, dueño de Polo' from auth.users
where lower(email) = 'gaxioladiego@gmail.com' and not coalesce(is_anonymous, false)
on conflict do nothing;

/** Is the caller a platform admin? Only ever answers about the caller. */
create or replace function public.is_platform_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select auth.uid() is not null and exists (select 1 from public.platform_admins a where a.auth_user_id = auth.uid())
$$;
revoke execute on function public.is_platform_admin() from public;
grant execute on function public.is_platform_admin() to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Protection
-- ---------------------------------------------------------------------------
alter table public.tournaments add column if not exists is_protected boolean not null default false;

-- Only set_tournament_protected() changes the flag; it marks its transaction.
create or replace function public.tournaments_guard_protect()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if coalesce(current_setting('cardi.protect', true), '') <> '1' then
      new.is_protected := false;
    end if;
    return new;
  end if;
  if tg_op = 'DELETE' then
    if old.is_protected then
      raise exception 'Este torneo está protegido; quítale la protección antes de borrarlo' using errcode = '42501';
    end if;
    return old;
  end if;
  if new.is_protected is distinct from old.is_protected and coalesce(current_setting('cardi.protect', true), '') <> '1' then
    raise exception 'La protección se cambia desde Zona de peligro' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists tournaments_guard_protect on public.tournaments;
create trigger tournaments_guard_protect before insert or update or delete on public.tournaments
  for each row execute function public.tournaments_guard_protect();

create table if not exists public.platform_unlocks (
  auth_user_id uuid not null references auth.users (id) on delete cascade,
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  until timestamptz not null,
  reason text not null,
  at timestamptz not null default now(),
  primary key (auth_user_id, tournament_id)
);
alter table public.platform_unlocks enable row level security;
revoke all on public.platform_unlocks from anon, authenticated;

/** Internal: the admin may act as this tournament's Comité (not protected, or unlocked by him). */
create or replace function public.platform_can_write(tid uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select public.is_platform_admin() and exists (
    select 1 from public.tournaments t
    where t.id = tid and (
      not t.is_protected
      or exists (select 1 from public.platform_unlocks u where u.tournament_id = tid and u.auth_user_id = auth.uid() and u.until > now())
    )
  )
$$;
revoke execute on function public.platform_can_write(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. The tournament helpers
-- ---------------------------------------------------------------------------
/** Internal: organizer by right (a tournament_organizers row, or an admin player). The 0013 body. */
create or replace function public.is_tournament_organizer_own(tid uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select
    exists (select 1 from public.tournament_organizers o where o.tournament_id = tid and o.auth_user_id = auth.uid())
    or exists (select 1 from public.players p where p.id = public.my_player_id(tid) and p.is_admin)
$$;

/** Internal: belongs to the tournament by right: organizer or player. The old member test. */
create or replace function public.is_tournament_participant(tid uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select public.is_tournament_organizer_own(tid) or public.my_player_id(tid) is not null
$$;

create or replace function public.is_tournament_organizer(tid uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select public.is_tournament_organizer_own(tid) or public.platform_can_write(tid)
$$;

create or replace function public.is_tournament_member(tid uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select public.is_tournament_participant(tid) or public.is_platform_admin()
$$;

create or replace function public.is_tournament_owner(tid uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.tournament_organizers o
    where o.tournament_id = tid and o.auth_user_id = auth.uid() and o.role = 'owner'
  ) or public.platform_can_write(tid)
$$;

-- The 0018 body, with is_tournament_member → is_tournament_participant: the
-- admin reads tournaments, not people.
create or replace function public.profile_visible_to_me(pid uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select auth.uid() is not null and (
    pid = auth.uid()
    or (
      not public.is_blocked(auth.uid(), pid)
      and (
        public.are_friends(auth.uid(), pid)
        or public.shares_crew(pid)
        or exists (
          select 1 from public.players p
          where p.profile_id = pid and p.profile_status = 'confirmed' and public.is_tournament_participant(p.tournament_id)
        )
      )
    )
  )
$$;

create or replace function public.can_edit_course(cid uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select
    exists (select 1 from public.courses c where c.id = cid and c.created_by = auth.uid())
    or exists (
      select 1 from public.rounds r where r.course_id = cid and public.is_tournament_organizer(r.tournament_id)
    )
    or public.is_platform_admin()
$$;

create or replace function public.delete_course(p_course_id uuid)
returns void
language plpgsql volatile security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.courses where id = p_course_id) then
    raise exception 'Ese campo ya no existe' using errcode = '22023';
  end if;
  if not exists (select 1 from public.courses where id = p_course_id and created_by = auth.uid()) and not public.is_platform_admin() then
    raise exception 'Solo quien creó el campo puede borrarlo' using errcode = '42501';
  end if;
  if exists (select 1 from public.rounds where course_id = p_course_id) then
    raise exception 'Este campo está en uso en una ronda; quítalo de la ronda primero' using errcode = '22023';
  end if;
  delete from public.courses where id = p_course_id;
end;
$$;

drop policy if exists courses_delete on public.courses;
create policy courses_delete on public.courses for delete using (created_by = auth.uid() or public.is_platform_admin());

-- Deleting stays the owner's (now: or the admin's). Protection is the trigger above.
drop policy if exists tournaments_delete on public.tournaments;
create policy tournaments_delete on public.tournaments for delete using (public.is_tournament_owner(id));

-- The gate. The normal branch is unchanged and wins whenever the caller
-- belongs to the tournament, so an admin who also plays there is a player.
create or replace function public.my_membership(tid uuid)
returns jsonb
language sql stable security definer
set search_path = public
as $$
  with me as (select public.my_player_id(tid) as pid),
  org as (select o.role from public.tournament_organizers o where o.tournament_id = tid and o.auth_user_id = auth.uid())
  select case
    when not public.is_tournament_participant(tid) and public.is_platform_admin()
         and exists (select 1 from public.tournaments t where t.id = tid) then
      jsonb_build_object(
        'playerId', null,
        'role', 'platform',
        'isOrganizer', public.platform_can_write(tid),
        'isAdmin', public.platform_can_write(tid),
        'via', 'platform',
        'protected', (select t.is_protected from public.tournaments t where t.id = tid),
        'unlockedUntil', (select u.until from public.platform_unlocks u where u.tournament_id = tid and u.auth_user_id = auth.uid() and u.until > now())
      )
    else jsonb_build_object(
      'playerId', (select pid from me),
      'role', coalesce((select role from org), case when (select pid from me) is not null then 'member' else 'none' end),
      'isOrganizer', exists (select 1 from org),
      'isAdmin', exists (select 1 from org) or exists (select 1 from public.players p where p.id = (select pid from me) and p.is_admin),
      'via', case
        when exists (select 1 from public.players p where p.tournament_id = tid and p.profile_id = auth.uid() and p.profile_status = 'confirmed') then 'profile'
        when (select pid from me) is not null then 'device'
      end,
      'protected', (select t.is_protected from public.tournaments t where t.id = tid)
    )
  end
$$;

-- ---------------------------------------------------------------------------
-- 4. Audit: mark what the admin did
-- ---------------------------------------------------------------------------
alter table public.audit_log add column if not exists actor_platform boolean not null default false;
create index if not exists audit_log_platform_idx on public.audit_log (at desc) where actor_platform;

-- The 0013 body, plus: the tournaments row's own id is its tournament (it
-- was logged with a null tournament until now), holes get a readable row id,
-- and actor_platform.
create or replace function public.audit_row()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  rid text;
  tid uuid;
  rec jsonb;
begin
  rec := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  rid := case
    when tg_table_name = 'holes' then concat(rec ->> 'tee_id', ':', rec ->> 'number')
    else coalesce(
      rec ->> 'id',
      nullif(concat_ws(':', rec ->> 'round_id', rec ->> 'group_id', rec ->> 'lot_id', rec ->> 'pair_id', rec ->> 'player_id', rec ->> 'hole', rec ->> 'auth_user_id'), ''),
      md5(rec::text)
    )
  end;
  tid := case
    when tg_table_name = 'tournaments' then (rec ->> 'id')::uuid
    when rec ? 'tournament_id' then (rec ->> 'tournament_id')::uuid
    when rec ? 'round_id' then public.round_tournament_id((rec ->> 'round_id')::uuid)
    when rec ? 'group_id' then public.group_tournament_id((rec ->> 'group_id')::uuid)
    when rec ? 'lot_id' then public.lot_tournament_id((rec ->> 'lot_id')::uuid)
    else null
  end;
  insert into public.audit_log (tournament_id, table_name, row_id, actor_auth_user_id, actor_player_id, action, before, after, reason, actor_platform)
  values (
    tid, tg_table_name, rid, auth.uid(), case when tid is not null then public.my_player_id(tid) end, tg_op,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end,
    case when tg_op in ('INSERT', 'UPDATE') then rec ->> 'reason' end,
    auth.uid() is not null and public.is_platform_admin() and (tid is null or not public.is_tournament_participant(tid))
  );
  return coalesce(new, old);
end;
$$;

-- Who runs a tournament, and the course data every tournament scores on,
-- were not audited. Course rows have no tournament: only the admin reads them.
do $$
declare
  t text;
begin
  foreach t in array array['tournament_organizers', 'courses', 'tees', 'holes'] loop
    execute format('drop trigger if exists %I_audit on public.%I', t, t);
    execute format('create trigger %I_audit after insert or update or delete on public.%I for each row execute function public.audit_row()', t, t);
  end loop;
end;
$$;

create table if not exists public.platform_audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor_auth_user_id uuid,
  action text not null,
  target_kind text not null,
  target_id text,
  tournament_id uuid,
  reason text,
  payload jsonb
);
create index if not exists platform_audit_log_at_idx on public.platform_audit_log (at desc);
alter table public.platform_audit_log enable row level security;
revoke all on public.platform_audit_log from anon, authenticated;

/** Internal: record a platform action. Called only from the platform RPCs. */
create or replace function public.platform_log(p_action text, p_kind text, p_target text, p_tournament uuid, p_reason text, p_payload jsonb default null)
returns void
language sql volatile security definer
set search_path = public
as $$
  insert into public.platform_audit_log (actor_auth_user_id, action, target_kind, target_id, tournament_id, reason, payload)
  values (auth.uid(), p_action, p_kind, p_target, p_tournament, p_reason, p_payload)
$$;
revoke execute on function public.platform_log(text, text, text, uuid, text, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Protection RPCs
-- ---------------------------------------------------------------------------
/** The owner, or the admin, turns protection on or off. Turning it off needs a reason. */
create or replace function public.set_tournament_protected(p_tournament_id uuid, p_on boolean, p_reason text default null)
returns void
language plpgsql volatile security definer
set search_path = public
as $$
declare
  own boolean;
begin
  own := exists (select 1 from public.tournament_organizers o where o.tournament_id = p_tournament_id and o.auth_user_id = auth.uid() and o.role = 'owner');
  if not own and not public.is_platform_admin() then
    raise exception 'Solo el dueño del torneo lo protege' using errcode = '42501';
  end if;
  if not exists (select 1 from public.tournaments where id = p_tournament_id) then
    raise exception 'Ese torneo ya no existe' using errcode = '22023';
  end if;
  if not p_on and length(trim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Escribe por qué le quitas la protección' using errcode = '22023';
  end if;
  perform set_config('cardi.protect', '1', true);
  update public.tournaments set is_protected = p_on where id = p_tournament_id;
  perform set_config('cardi.protect', '', true);
  if not p_on then
    delete from public.platform_unlocks where tournament_id = p_tournament_id;
  end if;
  if public.is_platform_admin() and not public.is_tournament_participant(p_tournament_id) then
    perform public.platform_log(case when p_on then 'protect' else 'unprotect' end, 'tournament', p_tournament_id::text, p_tournament_id, nullif(trim(coalesce(p_reason, '')), ''));
  end if;
end;
$$;
revoke execute on function public.set_tournament_protected(uuid, boolean, text) from public, anon;
grant execute on function public.set_tournament_protected(uuid, boolean, text) to authenticated, service_role;

/** The admin opens a protected tournament for writing, for a while, with a reason. */
create or replace function public.platform_unlock(p_tournament_id uuid, p_reason text, p_minutes int default 30)
returns timestamptz
language plpgsql volatile security definer
set search_path = public
as $$
declare
  u timestamptz;
begin
  if not public.is_platform_admin() then raise exception 'Solo el admin de Polo' using errcode = '42501'; end if;
  if not exists (select 1 from public.tournaments where id = p_tournament_id) then
    raise exception 'Ese torneo ya no existe' using errcode = '22023';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Escribe por qué lo desbloqueas' using errcode = '22023';
  end if;
  u := now() + make_interval(mins => least(greatest(coalesce(p_minutes, 30), 5), 120));
  insert into public.platform_unlocks (auth_user_id, tournament_id, until, reason)
  values (auth.uid(), p_tournament_id, u, trim(p_reason))
  on conflict (auth_user_id, tournament_id) do update set until = excluded.until, reason = excluded.reason, at = now();
  perform public.platform_log('unlock', 'tournament', p_tournament_id::text, p_tournament_id, trim(p_reason), jsonb_build_object('until', u));
  return u;
end;
$$;
revoke execute on function public.platform_unlock(uuid, text, int) from public, anon;
grant execute on function public.platform_unlock(uuid, text, int) to authenticated, service_role;

create or replace function public.platform_relock(p_tournament_id uuid)
returns void
language plpgsql volatile security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then raise exception 'Solo el admin de Polo' using errcode = '42501'; end if;
  delete from public.platform_unlocks where tournament_id = p_tournament_id and auth_user_id = auth.uid();
  perform public.platform_log('relock', 'tournament', p_tournament_id::text, p_tournament_id, null);
end;
$$;
revoke execute on function public.platform_relock(uuid) from public, anon;
grant execute on function public.platform_relock(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. Reads for the admin panel
-- ---------------------------------------------------------------------------
/** The numbers on Resumen, plus the latest platform events. */
create or replace function public.platform_overview()
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then raise exception 'Solo el admin de Polo' using errcode = '42501'; end if;
  return jsonb_build_object(
    'accounts', (select count(*) from auth.users where not coalesce(is_anonymous, false)),
    'accounts7d', (select count(*) from auth.users where not coalesce(is_anonymous, false) and created_at > now() - interval '7 days'),
    'devices', (select count(*) from auth.users where coalesce(is_anonymous, false)),
    'profiles', (select count(*) from public.profiles),
    'pushProfiles', (select count(distinct profile_id) from public.push_subscriptions),
    'tournaments', (select count(*) from public.tournaments where not quick),
    'quickRounds', (select count(*) from public.tournaments where quick),
    'byStatus', (select coalesce(jsonb_object_agg(status, n), '{}'::jsonb) from (select status, count(*) n from public.tournaments group by status) s),
    'live', (select count(*) from public.tournaments where status = 'live'),
    'practice', (select count(*) from public.tournaments where not counts_for_stats),
    'protected', (select count(*) from public.tournaments where is_protected),
    'roundsFinished', (select count(*) from public.rounds where status = 'finished'),
    'rounds30d', (select count(*) from public.rounds where status = 'finished' and date > current_date - 30),
    'scores30d', (select count(*) from public.scores where updated_at > now() - interval '30 days'),
    'crews', (select count(*) from public.crews),
    'courses', (select count(*) from public.courses),
    'recent', (
      select coalesce(jsonb_agg(x.e order by x.at desc), '[]'::jsonb) from (
        select * from (
          (select t.created_at as at, jsonb_build_object('kind', 'tournament', 'at', t.created_at, 'id', t.id, 'label', t.name, 'quick', t.quick) as e
           from public.tournaments t order by t.created_at desc limit 12)
          union all
          (select p.created_at, jsonb_build_object('kind', 'profile', 'at', p.created_at, 'id', p.id, 'label', p.display_name, 'handle', p.handle)
           from public.profiles p order by p.created_at desc limit 12)
          union all
          (select l.at, jsonb_build_object('kind', 'platform', 'at', l.at, 'id', l.id, 'label', l.action, 'targetKind', l.target_kind,
                                           'tournamentId', l.tournament_id, 'reason', l.reason)
           from public.platform_audit_log l order by l.at desc limit 12)
        ) u order by u.at desc limit 12
      ) x
    )
  );
end;
$$;
revoke execute on function public.platform_overview() from public, anon;
grant execute on function public.platform_overview() to authenticated, service_role;

/** One row per day, oldest first, in the given time zone. */
create or replace function public.platform_daily(p_days int default 30, p_tz text default 'America/Mazatlan')
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  n int := least(greatest(coalesce(p_days, 30), 7), 90);
  tz text := coalesce(nullif(p_tz, ''), 'America/Mazatlan');
  today date;
begin
  if not public.is_platform_admin() then raise exception 'Solo el admin de Polo' using errcode = '42501'; end if;
  if not exists (select 1 from pg_timezone_names where name = tz) then tz := 'America/Mazatlan'; end if;
  today := (now() at time zone tz)::date;
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'day', d::date,
      'accounts', (select count(*) from auth.users u where not coalesce(u.is_anonymous, false) and (u.created_at at time zone tz)::date = d::date),
      'tournaments', (select count(*) from public.tournaments t where not t.quick and (t.created_at at time zone tz)::date = d::date),
      'quickRounds', (select count(*) from public.tournaments t where t.quick and (t.created_at at time zone tz)::date = d::date),
      'rounds', (select count(*) from public.rounds r where r.status = 'finished' and r.date = d::date),
      'scores', (select count(*) from public.scores s where (s.updated_at at time zone tz)::date = d::date)
    ) order by d), '[]'::jsonb)
    from generate_series(today - (n - 1), today, interval '1 day') d
  );
end;
$$;
revoke execute on function public.platform_daily(int, text) from public, anon;
grant execute on function public.platform_daily(int, text) to authenticated, service_role;

/** Every tournament, searchable. Kinds: quick, crew, practice, real, orphan, protected. */
create or replace function public.platform_tournaments(
  p_q text default null, p_status text default null, p_kind text default null, p_limit int default 50, p_offset int default 0
)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  q text := nullif(lower(trim(coalesce(p_q, ''))), '');
begin
  if not public.is_platform_admin() then raise exception 'Solo el admin de Polo' using errcode = '42501'; end if;
  return (
    with base as (
      select t.*,
        (select count(*) from public.players p where p.tournament_id = t.id) as n_players,
        (select count(*) from public.rounds r where r.tournament_id = t.id) as n_rounds,
        (select count(*) from public.tournament_organizers o where o.tournament_id = t.id) as n_organizers,
        (select u.email from public.tournament_organizers o join auth.users u on u.id = o.auth_user_id
          where o.tournament_id = t.id order by (o.role = 'owner') desc, u.email limit 1) as owner_email,
        (select coalesce(pr.display_name, u.email) from public.tournament_organizers o join auth.users u on u.id = o.auth_user_id
          left join public.profiles pr on pr.id = u.id
          where o.tournament_id = t.id order by (o.role = 'owner') desc, u.email limit 1) as owner_name,
        (select c.name from public.crews c where c.id = t.crew_id) as crew_name
      from public.tournaments t
      where (p_status is null or t.status = p_status)
        and (p_kind is null
          or (p_kind = 'quick' and t.quick)
          or (p_kind = 'crew' and t.crew_id is not null)
          or (p_kind = 'practice' and not t.counts_for_stats)
          or (p_kind = 'real' and not t.quick and t.counts_for_stats)
          or (p_kind = 'protected' and t.is_protected)
          or (p_kind = 'orphan' and not exists (select 1 from public.tournament_organizers o where o.tournament_id = t.id)))
    ),
    hits as (
      select * from base b
      where q is null
        or lower(b.name) like '%' || q || '%'
        or b.slug like '%' || q || '%'
        or lower(b.join_code) = q
        or lower(coalesce(b.owner_email, '')) like '%' || q || '%'
    )
    select jsonb_build_object(
      'total', (select count(*) from hits),
      'rows', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', h.id, 'slug', h.slug, 'name', h.name, 'status', h.status, 'joinCode', h.join_code, 'logoUrl', h.logo_url,
          'quick', h.quick, 'practice', not h.counts_for_stats, 'protected', h.is_protected, 'crewName', h.crew_name,
          'createdAt', h.created_at, 'players', h.n_players, 'rounds', h.n_rounds, 'organizers', h.n_organizers,
          'ownerName', h.owner_name, 'ownerEmail', h.owner_email,
          'lastActivityAt', (select a.at from public.audit_log a where a.tournament_id = h.id order by a.at desc limit 1)
        ) order by h.created_at desc)
        from (select * from hits order by created_at desc limit least(greatest(coalesce(p_limit, 50), 1), 200) offset greatest(coalesce(p_offset, 0), 0)) h
      ), '[]'::jsonb)
    )
  );
end;
$$;
revoke execute on function public.platform_tournaments(text, text, text, int, int) from public, anon;
grant execute on function public.platform_tournaments(text, text, text, int, int) to authenticated, service_role;

/** One tournament for the detail pane: summary, Comité, rounds, counts, latest changes. */
create or replace function public.platform_tournament(p_tournament_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  t public.tournaments;
begin
  if not public.is_platform_admin() then raise exception 'Solo el admin de Polo' using errcode = '42501'; end if;
  select * into t from public.tournaments where id = p_tournament_id;
  if t.id is null then return null; end if;
  return jsonb_build_object(
    'id', t.id, 'slug', t.slug, 'name', t.name, 'tagline', t.tagline, 'logoUrl', t.logo_url, 'status', t.status,
    'joinCode', t.join_code, 'quick', t.quick, 'practice', not t.counts_for_stats, 'protected', t.is_protected,
    'createdAt', t.created_at, 'timezone', t.timezone, 'currency', t.currency,
    'crew', (select jsonb_build_object('id', c.id, 'slug', c.slug, 'name', c.name) from public.crews c where c.id = t.crew_id),
    'unlockedUntil', (select u.until from public.platform_unlocks u where u.tournament_id = t.id and u.auth_user_id = auth.uid() and u.until > now()),
    'organizers', coalesce((
      select jsonb_agg(jsonb_build_object('userId', o.auth_user_id, 'role', o.role, 'email', u.email,
                                          'name', coalesce(pr.display_name, u.email), 'handle', pr.handle)
                       order by (o.role = 'owner') desc, u.email)
      from public.tournament_organizers o join auth.users u on u.id = o.auth_user_id
      left join public.profiles pr on pr.id = u.id
      where o.tournament_id = t.id
    ), '[]'::jsonb),
    'rounds', coalesce((
      select jsonb_agg(jsonb_build_object('id', r.id, 'number', r.number, 'date', r.date, 'status', r.status,
                                          'course', (select c.name from public.courses c where c.id = r.course_id),
                                          'scores', (select count(*) from public.scores s where s.round_id = r.id))
                       order by r.number)
      from public.rounds r where r.tournament_id = t.id
    ), '[]'::jsonb),
    'counts', jsonb_build_object(
      'players', (select count(*) from public.players p where p.tournament_id = t.id),
      'linked', (select count(*) from public.players p where p.tournament_id = t.id and p.profile_status = 'confirmed'),
      'devices', (select count(*) from public.device_sessions d where d.tournament_id = t.id),
      'groups', (select count(*) from public.groups g join public.rounds r on r.id = g.round_id where r.tournament_id = t.id),
      'payments', (select count(*) from public.payments p where p.tournament_id = t.id),
      'disputes', (select count(*) from public.scores s join public.rounds r on r.id = s.round_id where r.tournament_id = t.id and s.disputed)
    ),
    'audit', coalesce((
      select jsonb_agg(x order by (x ->> 'at') desc) from (
        select jsonb_build_object('id', a.id, 'at', a.at, 'table', a.table_name, 'action', a.action, 'platform', a.actor_platform,
                                  'actor', coalesce(pl.display_name, pr.display_name, case when a.actor_auth_user_id is null then null else 'Cuenta' end),
                                  'reason', a.reason) x
        from public.audit_log a
        left join public.players pl on pl.id = a.actor_player_id
        left join public.profiles pr on pr.id = a.actor_auth_user_id
        where a.tournament_id = t.id
        order by a.at desc limit 20
      ) s
    ), '[]'::jsonb)
  );
end;
$$;
revoke execute on function public.platform_tournament(uuid) from public, anon;
grant execute on function public.platform_tournament(uuid) to authenticated, service_role;
