-- 0068: what the Admin de Polo opens is logged with a reason, and the people concerned see it (TRUST-17, TRUST-22).
--
-- The operator's writes were marked (audit_log.actor_platform, platform_audit_log), but his reads were silent: the
-- detail of any tournament, account or crew opened with no trace, and his unlocks of a Protegido tournament were in
-- a log only he reads. And the crew panel handed him its join code, a key to every member's full profile.
--   1. platform_tournament, platform_person and platform_crew take a reason (p_reason). Opening one logs a «view»
--      line in platform_audit_log (platform_view): with a reason of 3 to 200 characters after trim_reason, or with
--      none when he already gave one for that target in the last two hours, so a reload or a second tab is no new
--      question; else the call is refused with PV001 («Escribe por qué lo abres»), which the panel answers by
--      asking. His own tournament (he plays or runs it), his own account and a crew he belongs to need none and log
--      nothing. A reason given again within 30 minutes logs nothing new. The old one-argument functions go: two
--      overloads would make PostgREST refuse every call (PGRST203), and an older panel's call reaches the new one
--      through the default and is asked for its reason.
--   2. platform_crew no longer returns the crew's join code.
--   3. tournament_audit merges the operator's lines about that tournament (view, unlock, relock, protect,
--      unprotect, set_organizer) into the Comité's Historial, at their moment, with their reason: «El Admin de Polo
--      abrió este torneo. Motivo: …». The page is still cut and paged by the history's ids: a page holds the
--      operator's lines from the oldest moment of its rows (and the pages before it) up to that of the pages before
--      it, so each line lands on exactly one page, and a full page still ends on a history row. They carry negative ids
--      (the two logs count apart) and table 'platform_audit_log'; never the operator's account, never a payload but
--      an unlock's end and a role. A filter by player, day, hole or correction leaves them out; «Solo Admin de
--      Polo» keeps them.
--   4. Opening a tournament's own pages by its link (the gate, my_membership) is logged as well, once every two
--      hours, as a view with no reason typed (payload {via: 'link'}): the reads behind the boards are the policies',
--      which cannot log, so the gate is where his visit shows. Historial says it was by the link, with no reason.
--   5. my_admin_accesses(): a person's own «Accesos del administrador» (Editar perfil): every operator line about
--      his account (views, blocks, a PIN lock opened) and about the crews he is in now, newest first, with the
--      reason; never who the operator is, never a payload.

drop function if exists public.platform_tournament(uuid);
drop function if exists public.platform_person(uuid);
drop function if exists public.platform_crew(uuid);

/**
 * Internal: the operator opened a tournament, an account or a crew. Logs it with his reason, or lets it through
 * without one when he gave one for that target in the last two hours; else PV001, which the panel answers by asking.
 */
create or replace function public.platform_view(p_kind text, p_target text, p_tournament uuid, p_reason text)
returns void
language plpgsql volatile security definer
set search_path = public
as $$
declare
  why text := public.trim_reason(p_reason);
  last public.platform_audit_log;
begin
  select * into last from public.platform_audit_log l
  where l.actor_auth_user_id = auth.uid() and l.action = 'view' and l.target_kind = p_kind and l.target_id = p_target
  order by l.at desc limit 1;
  if why = '' then
    if last.id is not null and last.at > now() - interval '2 hours' then return; end if;
    raise exception 'Escribe por qué lo abres: queda en el registro, y lo ve a quien le toca.' using errcode = 'PV001';
  end if;
  if char_length(why) < 3 or char_length(why) > 200 then
    raise exception 'El motivo lleva de 3 a 200 caracteres' using errcode = '22023';
  end if;
  -- The same reason again, a moment later (a reload with the reason still in hand): one line is enough.
  if last.id is not null and last.at > now() - interval '30 minutes' and last.reason = why then return; end if;
  perform public.platform_log('view', p_kind, p_target, p_tournament, why);
end;
$$;
revoke execute on function public.platform_view(text, text, uuid, text) from public, anon, authenticated;

/** One tournament for the detail pane: summary, Comité, rounds, counts, latest changes. Opening it is logged (TRUST-22). */
create or replace function public.platform_tournament(p_tournament_id uuid, p_reason text default null)
returns jsonb
language plpgsql volatile security definer
set search_path = public
as $$
declare
  t public.tournaments;
begin
  if not public.is_platform_admin() then raise exception 'Solo el admin de Polo' using errcode = '42501'; end if;
  select * into t from public.tournaments where id = p_tournament_id;
  if t.id is null then return null; end if;
  if not public.is_tournament_participant(t.id) then
    perform public.platform_view('tournament', t.id::text, t.id, p_reason);
  end if;
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
revoke execute on function public.platform_tournament(uuid, text) from public, anon;
grant execute on function public.platform_tournament(uuid, text) to authenticated, service_role;

/**
 * One person. Never returns a PIN hash, a link token, a push key or an
 * endpoint: push shows as counts and hosts. Opening it is logged (TRUST-22).
 */
create or replace function public.platform_person(p_user_id uuid, p_reason text default null)
returns jsonb
language plpgsql volatile security definer
set search_path = public
as $$
declare
  u auth.users;
  pr public.profiles;
begin
  if not public.is_platform_admin() then raise exception 'Solo el admin de Polo' using errcode = '42501'; end if;
  select * into u from auth.users where id = p_user_id;
  if u.id is null then return null; end if;
  if u.id <> auth.uid() then
    perform public.platform_view('person', u.id::text, null, p_reason);
  end if;
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
revoke execute on function public.platform_person(uuid, text) from public, anon;
grant execute on function public.platform_person(uuid, text) to authenticated, service_role;

/** One crew: its members, outings and the operator's lines about it; never its join code (TRUST-17). Opening it is logged. */
create or replace function public.platform_crew(p_crew_id uuid, p_reason text default null)
returns jsonb
language plpgsql volatile security definer
set search_path = public
as $$
declare
  c public.crews;
begin
  if not public.is_platform_admin() then raise exception 'Solo el admin de Polo' using errcode = '42501'; end if;
  select * into c from public.crews where id = p_crew_id;
  if c.id is null then return null; end if;
  if not exists (select 1 from public.crew_members m where m.crew_id = c.id and m.profile_id = auth.uid()) then
    perform public.platform_view('crew', c.id::text, null, p_reason);
  end if;
  return jsonb_build_object(
    'id', c.id, 'slug', c.slug, 'name', c.name, 'createdAt', c.created_at, 'ownerId', c.created_by,
    'members', coalesce((
      select jsonb_agg(jsonb_build_object('profileId', m.profile_id, 'handle', p.handle, 'displayName', p.display_name,
                                          'avatarUrl', p.avatar_url, 'role', m.role, 'joinedAt', m.joined_at)
                       order by (m.role = 'owner') desc, m.joined_at)
      from public.crew_members m join public.profiles p on p.id = m.profile_id where m.crew_id = c.id
    ), '[]'::jsonb),
    'outings', coalesce((
      select jsonb_agg(jsonb_build_object('tournamentId', t.id, 'name', t.name, 'status', t.status, 'quick', t.quick,
                                          'practice', not t.counts_for_stats, 'createdAt', t.created_at) order by t.created_at desc)
      from public.tournaments t where t.crew_id = c.id
    ), '[]'::jsonb),
    'activity', coalesce((
      select jsonb_agg(jsonb_build_object('id', l.id, 'at', l.at, 'action', l.action, 'reason', l.reason) order by l.at desc)
      from (select * from public.platform_audit_log l where l.target_kind = 'crew' and l.target_id = c.id::text order by l.at desc limit 20) l
    ), '[]'::jsonb)
  );
end;
$$;
revoke execute on function public.platform_crew(uuid, text) from public, anon;
grant execute on function public.platform_crew(uuid, text) to authenticated, service_role;

-- 0063's tournament_audit, plus the operator's lines about the tournament (TRUST-22).
create or replace function public.tournament_audit(p_tournament_id uuid, p_before bigint default null, p_limit int default 50, p_filter jsonb default null)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  f jsonb := case when jsonb_typeof(p_filter) = 'object' then p_filter else '{}'::jsonb end;
  f_player text := public.try_uuid(f ->> 'player')::text;
  f_round text := public.try_uuid(f ->> 'round')::text;
  f_hole text := case when jsonb_typeof(f -> 'hole') = 'number' and (f ->> 'hole') ~ '^[0-9]{1,2}$' then f ->> 'hole' end;
  -- A key left out is false, not null: `not null` would drop every row.
  f_corrections boolean := coalesce((f -> 'corrections') = 'true'::jsonb, false);
  f_platform boolean := coalesce((f -> 'platform') = 'true'::jsonb, false);
  -- Never in an image: secrets, and every account id (0050's two, and the three it missed).
  hidden text[] := array['pin_hash', 'token_hash', 'p256dh', 'auth', 'endpoint', 'auth_user_id', 'released_by', 'created_by', 'voided_by', 'profile_id'];
  lim int := least(greatest(coalesce(p_limit, 50), 1), 200);
  page jsonb;
  ops jsonb;
  hi timestamptz;
  lo timestamptz;
begin
  if not public.is_tournament_organizer(p_tournament_id) then
    raise exception 'Solo el Comité ve el historial' using errcode = '42501';
  end if;
  page := coalesce((
    select jsonb_agg(jsonb_build_object(
      -- An organizer's row has no id of its own: audit_row keys it by its account, which is no one's to see.
      'id', a.id, 'at', a.at, 'table', a.table_name, 'action', a.action,
      'rowId', case when a.table_name = 'tournament_organizers' then null else a.row_id end,
      'platform', a.actor_platform,
      'actor', case when a.actor_platform then null else coalesce(pl.display_name, pr.display_name) end,
      'phone', case when not a.actor_platform and ph.total > 1 then jsonb_build_object('n', ph.n, 'of', ph.total, 'kind', ph.platform) end,
      'reason', a.reason,
      'before', a.before - hidden,
      'after', a.after - hidden
    ) order by a.id desc)
    from (
      select l.* from public.audit_log l
      cross join lateral (select coalesce(l.after, l.before) as rec) r
      where l.tournament_id = p_tournament_id and (p_before is null or l.id < p_before)
        and (f_player is null
             or (l.table_name = 'players' and l.row_id = f_player)
             or f_player in (r.rec ->> 'player_id', r.rec ->> 'player1_id', r.rec ->> 'player2_id', r.rec ->> 'from_player_id',
                             r.rec ->> 'to_player_id', r.rec ->> 'owner_id', r.rec ->> 'bidder_id'))
        and (f_round is null or (l.table_name = 'rounds' and l.row_id = f_round) or r.rec ->> 'round_id' = f_round)
        and (f_hole is null or (l.table_name in ('scores', 'snake_tiebreaks', 'hole_awards') and r.rec ->> 'hole' = f_hole))
        and (not f_corrections or (l.table_name = 'scores' and (l.action = 'DELETE' or (l.after ->> 'reason') is not null)))
        and (not f_platform or l.actor_platform)
      order by l.id desc
      limit lim
    ) a
    left join public.players pl on pl.id = a.actor_player_id
    left join public.profiles pr on pr.id = a.actor_auth_user_id
    left join public.tournament_phones(p_tournament_id) ph on ph.player_id = a.actor_player_id and ph.auth_user_id = a.actor_auth_user_id
  ), '[]'::jsonb);

  -- The operator's lines are about the whole tournament: a filter by player, day, hole or correction leaves them out.
  if f_player is not null or f_round is not null or f_hole is not null or f_corrections then
    return page;
  end if;
  -- This page's stretch of time: after the oldest moment it or the pages before it reach (none past the last page),
  -- up to the oldest moment the pages before it reach. Taken as the oldest, not the last row's, so a slow
  -- transaction's row (an earlier moment under a later id) never makes two pages' stretches overlap.
  hi := case when p_before is null then 'infinity'::timestamptz
             else coalesce((select min(l.at) from public.audit_log l
                            where l.tournament_id = p_tournament_id and l.id >= p_before and (not f_platform or l.actor_platform)),
                           '-infinity'::timestamptz) end;
  lo := case when jsonb_array_length(page) < lim then '-infinity'::timestamptz
             else least(hi, (select min((e ->> 'at')::timestamptz) from jsonb_array_elements(page) e)) end;
  ops := (
    select jsonb_agg(jsonb_build_object(
      'id', -l.id, 'at', l.at, 'table', 'platform_audit_log', 'action', l.action, 'rowId', null, 'platform', true,
      'actor', null, 'phone', null, 'reason', l.reason, 'before', null,
      'after', case l.action when 'unlock' then jsonb_build_object('until', l.payload -> 'until')
                             when 'set_organizer' then jsonb_build_object('role', l.payload -> 'role')
                             when 'view' then case when l.payload ->> 'via' = 'link' then jsonb_build_object('via', 'link') end end
    ) order by l.at desc, l.id desc)
    from public.platform_audit_log l
    where l.tournament_id = p_tournament_id and l.action in ('view', 'unlock', 'relock', 'protect', 'unprotect', 'set_organizer')
      and l.at > lo and l.at <= hi
  );
  if ops is null then return page; end if;
  -- Each line right after the last history row at or after its moment (first when none is), so the history rows
  -- keep their order and a line never sits above a newer row.
  return (
    select jsonb_agg(x.e order by x.pos, x.kind, x.at desc)
    from (
      select p.e, p.ord as pos, 0 as kind, null::timestamptz as at from jsonb_array_elements(page) with ordinality p(e, ord)
      union all
      select o.e, coalesce((select max(p.ord) from jsonb_array_elements(page) with ordinality p(e, ord)
                            where (p.e ->> 'at')::timestamptz >= (o.e ->> 'at')::timestamptz), 0), 1, (o.e ->> 'at')::timestamptz
      from jsonb_array_elements(ops) o(e)
    ) x
  );
end;
$$;
comment on function public.tournament_audit(uuid, bigint, int, jsonb) is
  'The Comité''s history of its tournament, newest first, paged by id; p_filter narrows it by player, round, hole, the Comité''s corrections or the Admin de Polo (TRUST-19); the operator''s views, unlocks and protection changes are merged in at their moment (TRUST-22).';
revoke execute on function public.tournament_audit(uuid, bigint, int, jsonb) from public, anon;
grant execute on function public.tournament_audit(uuid, bigint, int, jsonb) to authenticated, service_role;

-- 0021's gate, plus (TRUST-22): the operator's visit by the link is a view line, at most once every two hours.
create or replace function public.my_membership(tid uuid)
returns jsonb
language plpgsql volatile security definer
set search_path = public
as $$
declare
  pid uuid := public.my_player_id(tid);
  org_role text := (select o.role from public.tournament_organizers o where o.tournament_id = tid and o.auth_user_id = auth.uid());
begin
  if not public.is_tournament_participant(tid) and public.is_platform_admin()
     and exists (select 1 from public.tournaments t where t.id = tid) then
    if not exists (select 1 from public.platform_audit_log l
                   where l.actor_auth_user_id = auth.uid() and l.action = 'view' and l.target_kind = 'tournament'
                     and l.target_id = tid::text and l.at > now() - interval '2 hours') then
      perform public.platform_log('view', 'tournament', tid::text, tid, null, jsonb_build_object('via', 'link'));
    end if;
    return jsonb_build_object(
      'playerId', null,
      'role', 'platform',
      'isOrganizer', public.platform_can_write(tid),
      'isAdmin', public.platform_can_write(tid),
      'via', 'platform',
      'protected', (select t.is_protected from public.tournaments t where t.id = tid),
      'unlockedUntil', (select u.until from public.platform_unlocks u where u.tournament_id = tid and u.auth_user_id = auth.uid() and u.until > now())
    );
  end if;
  return jsonb_build_object(
    'playerId', pid,
    'role', coalesce(org_role, case when pid is not null then 'member' else 'none' end),
    'isOrganizer', org_role is not null,
    'isAdmin', org_role is not null or exists (select 1 from public.players p where p.id = pid and p.is_admin),
    'via', case
      when exists (select 1 from public.players p where p.tournament_id = tid and p.profile_id = auth.uid() and p.profile_status = 'confirmed') then 'profile'
      when pid is not null then 'device'
    end,
    'protected', (select t.is_protected from public.tournaments t where t.id = tid)
  );
end;
$$;

/**
 * A person's own «Accesos del administrador» (TRUST-22): what the operator did or opened about his account and the
 * crews he is in now, newest first. Never who the operator is, never a payload.
 */
create or replace function public.my_admin_accesses(p_limit int default 50)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception 'Necesitas una sesión' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', l.id, 'at', l.at, 'action', l.action, 'kind', l.target_kind, 'reason', l.reason,
                                        'crew', case when l.target_kind = 'crew' then (select c.name from public.crews c where c.id::text = l.target_id) end)
                     order by l.at desc, l.id desc)
    from (
      select l.* from public.platform_audit_log l
      where ((l.target_kind = 'person' and l.target_id = me::text)
          or (l.target_kind = 'crew' and l.target_id in (select m.crew_id::text from public.crew_members m where m.profile_id = me)))
        -- What the person did himself is his, not an access (a later self-service line, logged here too).
        and l.actor_auth_user_id is distinct from me
      order by l.at desc, l.id desc
      limit least(greatest(coalesce(p_limit, 50), 1), 200)
    ) l
  ), '[]'::jsonb);
end;
$$;
revoke execute on function public.my_admin_accesses(int) from public, anon;
grant execute on function public.my_admin_accesses(int) to authenticated, service_role;

-- The person's lines are read by target: one index for both readers (the panel's activity and my_admin_accesses).
create index if not exists platform_audit_log_target_idx on public.platform_audit_log (target_kind, target_id, at desc);
create index if not exists platform_audit_log_tournament_idx on public.platform_audit_log (tournament_id, at desc) where tournament_id is not null;
