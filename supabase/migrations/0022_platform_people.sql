-- Admin de Polo, slice 2: people, and the Comité's own history.
--
-- Personas: every account and every phone that signed in without one, what
-- they belong to, and the few things only the platform admin can do to
-- them: block (and unblock), delete, clear a PIN lock, give a tournament
-- that lost its Comité a new one. Each is a platform_* RPC with the usual
-- guard; each action carries a reason and lands in platform_audit_log.
--
-- Safety rails, all enforced here rather than in the UI:
--   * nobody blocks or deletes themselves or another platform admin;
--   * deleting needs the account's exact email (a phone without one: the
--     word BORRAR) and a reason;
--   * before an account goes, each crew it created is handed to its
--     longest-standing member. crews.created_by cascades on delete, so
--     without this, deleting one person deleted the crew for everyone in it.
--
-- Historial (tournament_audit): the Comité reads its own tournament's
-- audit with names, so an organizer can see what the Admin de Polo did.

-- ---------------------------------------------------------------------------
-- 1. Reads
-- ---------------------------------------------------------------------------
/** Everyone, newest first. Filters: all, accounts, devices, blocked. */
create or replace function public.platform_people(
  p_q text default null, p_filter text default 'all', p_limit int default 50, p_offset int default 0
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
      select u.id, u.email, u.created_at, u.last_sign_in_at, u.banned_until,
        coalesce(u.is_anonymous, false) as anonymous,
        coalesce(u.raw_app_meta_data ->> 'provider', case when coalesce(u.is_anonymous, false) then 'anonymous' else 'email' end) as provider,
        pr.handle, pr.display_name, pr.avatar_url,
        -- A phone without an account is known by the player it claimed.
        (select pl.display_name from public.device_sessions d join public.players pl on pl.id = d.player_id where d.auth_user_id = u.id) as device_player,
        (select t.name from public.device_sessions d join public.tournaments t on t.id = d.tournament_id where d.auth_user_id = u.id) as device_tournament,
        exists (select 1 from public.platform_admins a where a.auth_user_id = u.id) as is_admin
      from auth.users u
      left join public.profiles pr on pr.id = u.id
    ),
    hits as (
      select * from base b
      where (coalesce(p_filter, 'all') = 'all'
          or (p_filter = 'accounts' and not b.anonymous)
          or (p_filter = 'devices' and b.anonymous)
          or (p_filter = 'blocked' and b.banned_until > now()))
        and (q is null
          or lower(coalesce(b.email, '')) like '%' || q || '%'
          or lower(coalesce(b.handle, '')) like '%' || q || '%'
          or lower(coalesce(b.display_name, '')) like '%' || q || '%'
          or lower(coalesce(b.device_player, '')) like '%' || q || '%')
    )
    select jsonb_build_object(
      'total', (select count(*) from hits),
      'rows', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', h.id, 'email', h.email, 'anonymous', h.anonymous, 'provider', h.provider,
          'handle', h.handle, 'displayName', h.display_name, 'avatarUrl', h.avatar_url,
          'devicePlayer', h.device_player, 'deviceTournament', h.device_tournament,
          'createdAt', h.created_at, 'lastSignInAt', h.last_sign_in_at,
          'blocked', coalesce(h.banned_until > now(), false), 'isAdmin', h.is_admin,
          'tournaments', (
            select count(distinct x.tid) from (
              select o.tournament_id as tid from public.tournament_organizers o where o.auth_user_id = h.id
              union select p.tournament_id from public.players p where p.profile_id = h.id
              union select d.tournament_id from public.device_sessions d where d.auth_user_id = h.id
            ) x
          )
        ) order by h.created_at desc)
        from (select * from hits order by created_at desc limit least(greatest(coalesce(p_limit, 50), 1), 200) offset greatest(coalesce(p_offset, 0), 0)) h
      ), '[]'::jsonb)
    )
  );
end;
$$;
revoke execute on function public.platform_people(text, text, int, int) from public, anon;
grant execute on function public.platform_people(text, text, int, int) to authenticated, service_role;

/**
 * One person. Never returns a PIN hash, a link token, a push key or an
 * endpoint: push shows as counts and hosts.
 */
create or replace function public.platform_person(p_user_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  u auth.users;
  pr public.profiles;
begin
  if not public.is_platform_admin() then raise exception 'Solo el admin de Polo' using errcode = '42501'; end if;
  select * into u from auth.users where id = p_user_id;
  if u.id is null then return null; end if;
  select * into pr from public.profiles where id = p_user_id;
  return jsonb_build_object(
    'id', u.id,
    'email', u.email,
    'anonymous', coalesce(u.is_anonymous, false),
    'provider', coalesce(u.raw_app_meta_data ->> 'provider', case when coalesce(u.is_anonymous, false) then 'anonymous' else 'email' end),
    'providers', coalesce(u.raw_app_meta_data -> 'providers', '[]'::jsonb),
    'createdAt', u.created_at,
    'lastSignInAt', u.last_sign_in_at,
    'confirmedAt', u.email_confirmed_at,
    'blocked', coalesce(u.banned_until > now(), false),
    'isAdmin', exists (select 1 from public.platform_admins a where a.auth_user_id = u.id),
    'isSelf', u.id = auth.uid(),
    'profile', case when pr.id is null then null else jsonb_build_object(
      'handle', pr.handle, 'displayName', pr.display_name, 'fullName', pr.full_name, 'avatarUrl', pr.avatar_url,
      'homeClub', pr.home_club, 'city', pr.city, 'discoverable', pr.discoverable,
      'index', case when pr.index_source = 'manual' then pr.manual_index else pr.polo_index end,
      'indexSource', pr.index_source, 'createdAt', pr.created_at
    ) end,
    'tournaments', coalesce((
      select jsonb_agg(x order by x ->> 'createdAt' desc) from (
        select jsonb_build_object(
          'tournamentId', t.id, 'slug', t.slug, 'name', t.name, 'status', t.status, 'quick', t.quick,
          'practice', not t.counts_for_stats, 'createdAt', t.created_at,
          'role', (select o.role from public.tournament_organizers o where o.tournament_id = t.id and o.auth_user_id = u.id),
          'playerId', coalesce(
            (select p.id from public.players p where p.tournament_id = t.id and p.profile_id = u.id),
            (select d.player_id from public.device_sessions d where d.tournament_id = t.id and d.auth_user_id = u.id)),
          'playerName', coalesce(
            (select p.display_name from public.players p where p.tournament_id = t.id and p.profile_id = u.id),
            (select pl.display_name from public.device_sessions d join public.players pl on pl.id = d.player_id where d.tournament_id = t.id and d.auth_user_id = u.id)),
          'link', coalesce(
            (select p.profile_status from public.players p where p.tournament_id = t.id and p.profile_id = u.id),
            (select 'device' from public.device_sessions d where d.tournament_id = t.id and d.auth_user_id = u.id))
        ) x
        from public.tournaments t
        where exists (select 1 from public.tournament_organizers o where o.tournament_id = t.id and o.auth_user_id = u.id)
           or exists (select 1 from public.players p where p.tournament_id = t.id and p.profile_id = u.id)
           or exists (select 1 from public.device_sessions d where d.tournament_id = t.id and d.auth_user_id = u.id)
      ) s
    ), '[]'::jsonb),
    'crews', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'slug', c.slug, 'name', c.name, 'role', m.role,
                                          'members', (select count(*) from public.crew_members m2 where m2.crew_id = c.id))
                       order by c.name)
      from public.crew_members m join public.crews c on c.id = m.crew_id where m.profile_id = u.id
    ), '[]'::jsonb),
    'friends', (select count(*) from public.friendships f where (f.a = u.id or f.b = u.id) and f.status = 'accepted'),
    'pendingFriends', (select count(*) from public.friendships f where (f.a = u.id or f.b = u.id) and f.status = 'pending'),
    'push', jsonb_build_object(
      'count', (select count(*) from public.push_subscriptions s where s.profile_id = u.id),
      'hosts', coalesce((select jsonb_agg(distinct split_part(split_part(s.endpoint, '://', 2), '/', 1)) from public.push_subscriptions s where s.profile_id = u.id), '[]'::jsonb)
    ),
    'deviceLock', (
      select jsonb_build_object('failed', a.failed_attempts, 'lockedUntil', a.locked_until)
      from public.pin_attempts a where a.auth_user_id = u.id and (a.failed_attempts > 0 or a.locked_until > now())
    ),
    'playerLocks', coalesce((
      select jsonb_agg(jsonb_build_object('playerId', pp.player_id, 'name', pl.display_name, 'tournament', t.name,
                                          'failed', pp.failed_attempts, 'lockedUntil', pp.locked_until))
      from public.player_pins pp
      join public.players pl on pl.id = pp.player_id
      join public.tournaments t on t.id = pl.tournament_id
      where (pp.failed_attempts > 0 or pp.locked_until > now())
        and (pl.profile_id = u.id or exists (select 1 from public.device_sessions d where d.player_id = pl.id and d.auth_user_id = u.id))
    ), '[]'::jsonb),
    'activity', coalesce((
      select jsonb_agg(jsonb_build_object('id', l.id, 'at', l.at, 'action', l.action, 'reason', l.reason) order by l.at desc)
      from (select * from public.platform_audit_log l where l.target_kind = 'person' and l.target_id = u.id::text order by l.at desc limit 20) l
    ), '[]'::jsonb)
  );
end;
$$;
revoke execute on function public.platform_person(uuid) from public, anon;
grant execute on function public.platform_person(uuid) to authenticated, service_role;

/** What deleting this account would take with it, and what it leaves behind. */
create or replace function public.platform_delete_preview(p_user_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then raise exception 'Solo el admin de Polo' using errcode = '42501'; end if;
  return jsonb_build_object(
    -- Tournaments whose whole Comité is this account: they stay, with no Comité.
    'orphaned', coalesce((
      select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name) order by t.name)
      from public.tournaments t
      where exists (select 1 from public.tournament_organizers o where o.tournament_id = t.id and o.auth_user_id = p_user_id)
        and not exists (select 1 from public.tournament_organizers o where o.tournament_id = t.id and o.auth_user_id <> p_user_id)
    ), '[]'::jsonb),
    'organizerOf', (select count(*) from public.tournament_organizers o where o.auth_user_id = p_user_id),
    -- Players keep their scores; the link to the profile goes.
    'linkedPlayers', (select count(*) from public.players p where p.profile_id = p_user_id),
    -- Crews this account created: handed to the longest member, or gone if it was alone.
    'crewsHanded', coalesce((
      select jsonb_agg(c.name order by c.name) from public.crews c
      where c.created_by = p_user_id and exists (select 1 from public.crew_members m where m.crew_id = c.id and m.profile_id <> p_user_id)
    ), '[]'::jsonb),
    'crewsDeleted', coalesce((
      select jsonb_agg(c.name order by c.name) from public.crews c
      where c.created_by = p_user_id and not exists (select 1 from public.crew_members m where m.crew_id = c.id and m.profile_id <> p_user_id)
    ), '[]'::jsonb),
    'friendships', (select count(*) from public.friendships f where f.a = p_user_id or f.b = p_user_id),
    'rivalries', (select count(*) from public.rivalries r where r.a = p_user_id or r.b = p_user_id),
    'notifications', (select count(*) from public.notifications n where n.profile_id = p_user_id),
    'push', (select count(*) from public.push_subscriptions s where s.profile_id = p_user_id),
    'hasProfile', exists (select 1 from public.profiles p where p.id = p_user_id)
  );
end;
$$;
revoke execute on function public.platform_delete_preview(uuid) from public, anon;
grant execute on function public.platform_delete_preview(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Actions
-- ---------------------------------------------------------------------------
/** Internal: the refusals every action on a person shares. */
create or replace function public.platform_person_target(p_user_id uuid, p_reason text)
returns auth.users
language plpgsql stable security definer
set search_path = public
as $$
declare
  u auth.users;
begin
  select * into u from auth.users where id = p_user_id;
  if u.id is null then raise exception 'Esa cuenta ya no existe' using errcode = '22023'; end if;
  if u.id = auth.uid() then raise exception 'No puedes hacerte esto a ti mismo' using errcode = '42501'; end if;
  if exists (select 1 from public.platform_admins a where a.auth_user_id = u.id) then
    raise exception 'Es admin de Polo' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'Escribe el motivo' using errcode = '22023'; end if;
  return u;
end;
$$;
revoke execute on function public.platform_person_target(uuid, text) from public, anon, authenticated;

/**
 * Block: no new sign-in and no token refresh (Supabase Auth honors
 * banned_until), and every session ends now. A token already issued can
 * still work until it expires, up to an hour.
 */
create or replace function public.platform_block(p_user_id uuid, p_reason text)
returns void
language plpgsql volatile security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then raise exception 'Solo el admin de Polo' using errcode = '42501'; end if;
  perform public.platform_person_target(p_user_id, p_reason);
  update auth.users set banned_until = now() + interval '100 years' where id = p_user_id;
  delete from auth.sessions where user_id = p_user_id;
  perform public.platform_log('block', 'person', p_user_id::text, null, trim(p_reason));
end;
$$;
revoke execute on function public.platform_block(uuid, text) from public, anon;
grant execute on function public.platform_block(uuid, text) to authenticated, service_role;

create or replace function public.platform_unblock(p_user_id uuid, p_reason text)
returns void
language plpgsql volatile security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then raise exception 'Solo el admin de Polo' using errcode = '42501'; end if;
  perform public.platform_person_target(p_user_id, p_reason);
  update auth.users set banned_until = null where id = p_user_id;
  perform public.platform_log('unblock', 'person', p_user_id::text, null, trim(p_reason));
end;
$$;
revoke execute on function public.platform_unblock(uuid, text) from public, anon;
grant execute on function public.platform_unblock(uuid, text) to authenticated, service_role;

/**
 * Delete an account for good. The confirmation is its exact email (a phone
 * without an account: BORRAR). Crews it created go to their longest member
 * first; tournaments it organized stay (with no Comité if it was the only
 * one); players keep their scores and lose the link.
 */
create or replace function public.platform_delete_account(p_user_id uuid, p_confirm text, p_reason text)
returns jsonb
language plpgsql volatile security definer
set search_path = public
as $$
declare
  u auth.users;
  preview jsonb;
  c record;
  heir uuid;
begin
  if not public.is_platform_admin() then raise exception 'Solo el admin de Polo' using errcode = '42501'; end if;
  u := public.platform_person_target(p_user_id, p_reason);
  if coalesce(u.email, '') = '' then
    if upper(trim(coalesce(p_confirm, ''))) <> 'BORRAR' then
      raise exception 'Escribe BORRAR para confirmar' using errcode = '22023';
    end if;
  elsif lower(trim(coalesce(p_confirm, ''))) <> lower(u.email) then
    raise exception 'El correo no coincide' using errcode = '22023';
  end if;
  preview := public.platform_delete_preview(p_user_id);

  for c in select id from public.crews where created_by = p_user_id loop
    select m.profile_id into heir from public.crew_members m
    where m.crew_id = c.id and m.profile_id <> p_user_id
    order by (m.role = 'owner') desc, m.joined_at, m.profile_id limit 1;
    if heir is not null then
      update public.crews set created_by = heir where id = c.id;
      update public.crew_members set role = 'owner' where crew_id = c.id and profile_id = heir;
    end if;
  end loop;

  perform public.platform_log('delete', 'person', p_user_id::text, null, trim(p_reason),
                              preview || jsonb_build_object('email', u.email, 'anonymous', coalesce(u.is_anonymous, false)));
  delete from auth.users where id = p_user_id;
  return preview;
end;
$$;
revoke execute on function public.platform_delete_account(uuid, text, text) from public, anon;
grant execute on function public.platform_delete_account(uuid, text, text) to authenticated, service_role;

/**
 * Clear PIN locks: this account's device lock, or one player's lock (the
 * player's PIN is untouched; only the failed count and the lock go).
 */
create or replace function public.platform_reset_pin_lock(p_user_id uuid default null, p_player_id uuid default null, p_reason text default null)
returns void
language plpgsql volatile security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then raise exception 'Solo el admin de Polo' using errcode = '42501'; end if;
  if p_user_id is null and p_player_id is null then raise exception 'Falta a quién' using errcode = '22023'; end if;
  if p_user_id is not null then
    update public.pin_attempts set failed_attempts = 0, locked_until = null, updated_at = now() where auth_user_id = p_user_id;
  end if;
  if p_player_id is not null then
    update public.player_pins set failed_attempts = 0, locked_until = null where player_id = p_player_id;
  end if;
  perform public.platform_log('pin_unlock', 'person', coalesce(p_user_id::text, p_player_id::text),
                              public.player_tournament_id(p_player_id), nullif(trim(coalesce(p_reason, '')), ''),
                              jsonb_build_object('playerId', p_player_id));
end;
$$;
revoke execute on function public.platform_reset_pin_lock(uuid, uuid, text) from public, anon;
grant execute on function public.platform_reset_pin_lock(uuid, uuid, text) to authenticated, service_role;

/**
 * Give a tournament a Comité member (owner or admin), or take one away
 * (null). For a tournament whose organizer is gone. Only accounts, never a
 * phone without one; a Protegido tournament needs its unlock first.
 */
create or replace function public.platform_set_organizer(p_tournament_id uuid, p_user_id uuid, p_role text, p_reason text)
returns void
language plpgsql volatile security definer
set search_path = public
as $$
declare
  u auth.users;
begin
  if not public.is_platform_admin() then raise exception 'Solo el admin de Polo' using errcode = '42501'; end if;
  if not public.platform_can_write(p_tournament_id) then
    raise exception 'Ese torneo está protegido; desbloquéalo primero' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'Escribe el motivo' using errcode = '22023'; end if;
  if p_role is not null and p_role not in ('owner', 'admin') then raise exception 'Rol inválido' using errcode = '22023'; end if;
  select * into u from auth.users where id = p_user_id;
  if u.id is null or coalesce(u.is_anonymous, false) then
    raise exception 'Solo una cuenta con correo puede ser del Comité' using errcode = '22023';
  end if;
  if p_role is null then
    delete from public.tournament_organizers where tournament_id = p_tournament_id and auth_user_id = p_user_id;
  else
    insert into public.organizers (auth_user_id, display_name)
    values (u.id, coalesce((select display_name from public.profiles where id = u.id), u.email))
    on conflict (auth_user_id) do nothing;
    insert into public.tournament_organizers (tournament_id, auth_user_id, role)
    values (p_tournament_id, p_user_id, p_role)
    on conflict (tournament_id, auth_user_id) do update set role = excluded.role;
  end if;
  perform public.platform_log('set_organizer', 'tournament', p_tournament_id::text, p_tournament_id, trim(p_reason),
                              jsonb_build_object('userId', p_user_id, 'email', u.email, 'role', p_role));
end;
$$;
revoke execute on function public.platform_set_organizer(uuid, uuid, text, text) from public, anon;
grant execute on function public.platform_set_organizer(uuid, uuid, text, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Historial: the Comité reads its own audit, with names
-- ---------------------------------------------------------------------------
/**
 * The tournament's audit, newest first, paged by id. Who did it is a name
 * (the player, else the account's profile, else «Comité»), or the Admin de
 * Polo. Row contents come as they are minus anything secret-shaped.
 */
create or replace function public.tournament_audit(p_tournament_id uuid, p_before bigint default null, p_limit int default 50)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
begin
  if not public.is_tournament_organizer(p_tournament_id) then
    raise exception 'Solo el Comité ve el historial' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', a.id, 'at', a.at, 'table', a.table_name, 'action', a.action, 'rowId', a.row_id,
      'platform', a.actor_platform,
      'actor', case when a.actor_platform then null else coalesce(pl.display_name, pr.display_name) end,
      'reason', a.reason,
      'before', a.before - array['pin_hash', 'token_hash', 'p256dh', 'auth', 'endpoint'],
      'after', a.after - array['pin_hash', 'token_hash', 'p256dh', 'auth', 'endpoint']
    ) order by a.id desc)
    from (
      select * from public.audit_log
      where tournament_id = p_tournament_id and (p_before is null or id < p_before)
      order by id desc
      limit least(greatest(coalesce(p_limit, 50), 1), 200)
    ) a
    left join public.players pl on pl.id = a.actor_player_id
    left join public.profiles pr on pr.id = a.actor_auth_user_id
  ), '[]'::jsonb);
end;
$$;
revoke execute on function public.tournament_audit(uuid, bigint, int) from public, anon;
grant execute on function public.tournament_audit(uuid, bigint, int) to authenticated, service_role;
