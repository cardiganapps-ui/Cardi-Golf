-- 0071: a crew's owner decides who is in it (TRUST-11).
--
-- Anyone with a crew's code joined at once and saw every member's full profile, and the owner could change the
-- code but not take anyone out (only the Admin de Polo could). Now:
--   1. crew_remove_member(crew, handle): the owner takes a member out (never himself: «Salir del crew» is for that,
--      with leave_crew's hand-over). The member is told nothing; he no longer shares the crew, so he sees the others'
--      card only, as any stranger.
--   2. crews.approval («Aprobar solicitudes»): with it on, a code no longer lets anyone in. It leaves a request
--      (crew_requests) the owner accepts or declines (crew_respond); the owner hears of each request once and the
--      person of a yes. join_crew_request(code) says which: joined, requested or invalid; join_crew (older bundles)
--      answers the slug only when it joined.
--   3. A code can expire: rotate_crew_code(crew, valid_days) makes a new one, good for that many days (1 to 90) or
--      with no end (null, as before). An expired code is no code: crew_preview answers null and nobody joins.
--   4. crew_page says the owner's settings (approval, the code's end) and, to the owner only, who waits.

alter table public.crews add column if not exists approval boolean not null default false;
alter table public.crews add column if not exists code_expires_at timestamptz;

create table if not exists public.crew_requests (
  crew_id uuid not null references public.crews (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (crew_id, profile_id)
);
create index if not exists crew_requests_profile_idx on public.crew_requests (profile_id);
alter table public.crew_requests enable row level security;
revoke all on public.crew_requests from anon, authenticated;

/** Internal: the crew a code opens now (not expired), or none. */
create or replace function public.crew_by_code(p_code text)
returns public.crews
language sql stable security definer
set search_path = public
as $$
  select c.* from public.crews c
  where c.join_code = upper(btrim(coalesce(p_code, ''))) and (c.code_expires_at is null or c.code_expires_at > now())
$$;
revoke execute on function public.crew_by_code(text) from public, anon, authenticated;

/** Internal: the caller owns this crew. */
create or replace function public.is_crew_owner(cid uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from public.crew_members m where m.crew_id = cid and m.profile_id = auth.uid() and m.role = 'owner')
$$;
revoke execute on function public.is_crew_owner(uuid) from public, anon, authenticated;

/** 0018's preview, minus expired codes, plus whether it asks for approval and whether I already asked. */
create or replace function public.crew_preview(p_code text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('name', c.name, 'slug', c.slug, 'members', (select count(*) from public.crew_members m where m.crew_id = c.id),
                            'isMember', public.is_crew_member(c.id), 'approval', c.approval,
                            'requested', exists (select 1 from public.crew_requests r where r.crew_id = c.id and r.profile_id = auth.uid()))
  from public.crew_by_code(p_code) c
  where public.is_account_user(auth.uid()) and c.id is not null
$$;

/** Joins by code, or leaves a request when the crew approves who enters. {status: joined | requested | invalid, slug}. */
create or replace function public.join_crew_request(p_code text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  c public.crews;
begin
  if not public.is_account_user(me) or not exists (select 1 from public.profiles where id = me) then
    raise exception 'Primero guarda tu perfil' using errcode = '42501';
  end if;
  c := public.crew_by_code(p_code);
  if c.id is null then
    return jsonb_build_object('status', 'invalid');
  end if;
  if public.is_crew_member(c.id) then
    return jsonb_build_object('status', 'joined', 'slug', c.slug);
  end if;
  if c.approval then
    insert into public.crew_requests (crew_id, profile_id) values (c.id, me) on conflict do nothing;
    -- Once per person and crew, whatever happens after (the notice's key).
    perform public.notify(m.profile_id, 'crew_request', 'crew_request:' || c.id || ':' || me, me, jsonb_build_object('crew', c.name, 'slug', c.slug))
    from public.crew_members m where m.crew_id = c.id and m.role = 'owner';
    return jsonb_build_object('status', 'requested', 'slug', c.slug);
  end if;
  insert into public.crew_members (crew_id, profile_id) values (c.id, me) on conflict do nothing;
  if found then
    perform public.notify(m.profile_id, 'crew_join', 'crew_join:' || c.id || ':' || me, me, jsonb_build_object('crew', c.name, 'slug', c.slug))
    from public.crew_members m where m.crew_id = c.id and m.role = 'owner';
  end if;
  return jsonb_build_object('status', 'joined', 'slug', c.slug);
end;
$$;
revoke execute on function public.join_crew_request(text) from public, anon;
grant execute on function public.join_crew_request(text) to authenticated, service_role;

/** 0018's join, for older bundles: the slug once in, null otherwise (a bad code, an expired one, or a request left). */
create or replace function public.join_crew(p_code text)
returns text language plpgsql volatile security definer set search_path = public as $$
declare
  r jsonb := public.join_crew_request(p_code);
begin
  return case when r ->> 'status' = 'joined' then r ->> 'slug' end;
end;
$$;

/** The owner's list of who waits to enter. */
create or replace function public.crew_requests(p_crew_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_crew_owner(p_crew_id) then
    raise exception 'Solo quien administra el crew ve las solicitudes' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('handle', p.handle, 'displayName', p.display_name, 'avatarUrl', p.avatar_url, 'at', r.created_at) order by r.created_at)
    from public.crew_requests r join public.profiles p on p.id = r.profile_id where r.crew_id = p_crew_id
  ), '[]'::jsonb);
end;
$$;
revoke execute on function public.crew_requests(uuid) from public, anon;
grant execute on function public.crew_requests(uuid) to authenticated, service_role;

/** The owner lets a request in, or declines it (the person is told only of a yes). */
create or replace function public.crew_respond(p_crew_id uuid, p_handle text, p_accept boolean)
returns void language plpgsql volatile security definer set search_path = public as $$
declare
  who uuid := (select p.id from public.profiles p where p.handle = lower(btrim(coalesce(p_handle, ''))));
  c public.crews;
begin
  if not public.is_crew_owner(p_crew_id) then
    raise exception 'Solo quien administra el crew contesta las solicitudes' using errcode = '42501';
  end if;
  delete from public.crew_requests where crew_id = p_crew_id and profile_id = who;
  if not found then raise exception 'Esa solicitud ya no está' using errcode = '22023'; end if;
  if coalesce(p_accept, false) then
    select * into c from public.crews where id = p_crew_id;
    insert into public.crew_members (crew_id, profile_id) values (p_crew_id, who) on conflict do nothing;
    perform public.notify(who, 'crew_accepted', 'crew_accepted:' || p_crew_id || ':' || who, auth.uid(), jsonb_build_object('crew', c.name, 'slug', c.slug));
  end if;
end;
$$;
revoke execute on function public.crew_respond(uuid, text, boolean) from public, anon;
grant execute on function public.crew_respond(uuid, text, boolean) to authenticated, service_role;

/** The owner takes a member out. Never himself: leaving is leave_crew, which hands the crew on. */
create or replace function public.crew_remove_member(p_crew_id uuid, p_handle text)
returns void language plpgsql volatile security definer set search_path = public as $$
declare
  who uuid := (select p.id from public.profiles p where p.handle = lower(btrim(coalesce(p_handle, ''))));
begin
  if not public.is_crew_owner(p_crew_id) then
    raise exception 'Solo quien administra el crew saca a alguien' using errcode = '42501';
  end if;
  if who = auth.uid() then
    raise exception 'Para salir tú, usa «Salir del crew»' using errcode = '22023';
  end if;
  delete from public.crew_members where crew_id = p_crew_id and profile_id = who and role <> 'owner';
  if not found then raise exception 'No es de este crew' using errcode = '22023'; end if;
end;
$$;
revoke execute on function public.crew_remove_member(uuid, text) from public, anon;
grant execute on function public.crew_remove_member(uuid, text) to authenticated, service_role;

/** The owner turns «Aprobar solicitudes» on or off. Off lets nobody in by itself: the waiting requests stay to answer. */
create or replace function public.set_crew_approval(p_crew_id uuid, p_on boolean)
returns void language plpgsql volatile security definer set search_path = public as $$
begin
  if not public.is_crew_owner(p_crew_id) then
    raise exception 'Solo quien administra el crew lo cambia' using errcode = '42501';
  end if;
  update public.crews set approval = coalesce(p_on, false) where id = p_crew_id;
end;
$$;
revoke execute on function public.set_crew_approval(uuid, boolean) from public, anon;
grant execute on function public.set_crew_approval(uuid, boolean) to authenticated, service_role;

-- 0018's rotate, plus how long the new code is good for. The one-argument call reaches this one by the default.
drop function if exists public.rotate_crew_code(uuid);
create or replace function public.rotate_crew_code(p_crew_id uuid, p_valid_days int default null)
returns text language plpgsql volatile security definer set search_path = public as $$
declare
  code text;
begin
  if not public.is_crew_owner(p_crew_id) then
    raise exception 'Solo quien administra el crew cambia el código' using errcode = '42501';
  end if;
  if p_valid_days is not null and (p_valid_days < 1 or p_valid_days > 90) then
    raise exception 'El código dura de 1 a 90 días, o sin fin' using errcode = '22023';
  end if;
  code := public.crew_join_code();
  update public.crews set join_code = code, code_expires_at = case when p_valid_days is null then null else now() + make_interval(days => p_valid_days) end
  where id = p_crew_id;
  return code;
end;
$$;
revoke execute on function public.rotate_crew_code(uuid, int) from public, anon;
grant execute on function public.rotate_crew_code(uuid, int) to authenticated, service_role;

-- 0018's page, plus the owner's settings and, to him, who waits.
create or replace function public.crew_page(p_slug text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  c public.crews;
  is_owner boolean;
begin
  select * into c from public.crews where slug = p_slug;
  if c.id is null or not public.is_crew_member(c.id) then
    return null;
  end if;
  is_owner := public.is_crew_owner(c.id);
  return jsonb_build_object(
    'crew', jsonb_build_object('id', c.id, 'slug', c.slug, 'name', c.name, 'joinCode', c.join_code,
      'role', (select role from public.crew_members where crew_id = c.id and profile_id = auth.uid()), 'createdAt', c.created_at,
      'approval', c.approval, 'codeExpiresAt', c.code_expires_at,
      'codeExpired', c.code_expires_at is not null and c.code_expires_at <= now()),
    'members', coalesce((
      select jsonb_agg(jsonb_build_object('handle', pr.handle, 'displayName', pr.display_name, 'avatarUrl', pr.avatar_url,
        'index', public.profile_index(pr.id), 'role', m.role, 'joinedAt', m.joined_at) order by m.role, pr.display_name)
      from public.crew_members m join public.profiles pr on pr.id = m.profile_id where m.crew_id = c.id
    ), '[]'::jsonb),
    'requests', case when is_owner then coalesce((
      select jsonb_agg(jsonb_build_object('handle', p.handle, 'displayName', p.display_name, 'avatarUrl', p.avatar_url, 'at', r.created_at) order by r.created_at)
      from public.crew_requests r join public.profiles p on p.id = r.profile_id where r.crew_id = c.id
    ), '[]'::jsonb) else '[]'::jsonb end,
    'outings', coalesce((
      select jsonb_agg(jsonb_build_object('tournamentId', t.id, 'slug', t.slug, 'name', t.name, 'status', t.status, 'quick', t.quick,
        'practice', not t.counts_for_stats, 'date', d.first_date, 'players', (select count(*) from public.players p where p.tournament_id = t.id))
        order by coalesce(d.first_date, t.created_at::date) desc)
      from public.tournaments t
      left join lateral (select min(r.date) as first_date from public.rounds r where r.tournament_id = t.id) d on true
      where t.crew_id = c.id
    ), '[]'::jsonb),
    'results', coalesce((
      select jsonb_agg(jsonb_build_object('tournamentId', t.id, 'date', coalesce(d.first_date, t.created_at::date), 'handle', pr.handle,
        'rank', tr.rank, 'rankLabel', tr.rank_label, 'field', tr.field,
        -- Everyone at that place, members or not: a member tied with a guest shares the points.
        'tied', (select count(*) from public.tournament_results x where x.tournament_id = t.id and x.rank = tr.rank)))
      from public.tournaments t
      left join lateral (select min(r.date) as first_date from public.rounds r where r.tournament_id = t.id) d on true
      join public.tournament_results tr on tr.tournament_id = t.id
      join public.players p on p.id = tr.player_id and p.profile_status = 'confirmed'
      join public.crew_members m on m.crew_id = c.id and m.profile_id = p.profile_id
      join public.profiles pr on pr.id = p.profile_id
      where t.crew_id = c.id and t.status = 'finished' and t.counts_for_stats
    ), '[]'::jsonb)
  );
end;
$$;
