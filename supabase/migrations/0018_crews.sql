-- 0018: crews and their season. A crew is the group you always play with:
-- anyone with an account creates one, others join with its 6-character code
-- (or link), and a tournament or Ronda rápida can belong to a crew. The crew
-- page reads everything through crew_page(slug); the season table itself is
-- computed on the client from the published results (src/engine/profile/season.ts).
-- Crew-mates see each other's full profile, like tournament mates.

create table public.crews (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null check (char_length(btrim(name)) between 2 and 60),
  join_code text not null unique,
  created_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.crew_members (
  crew_id uuid not null references public.crews (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (crew_id, profile_id)
);
create index crew_members_profile_idx on public.crew_members (profile_id);

alter table public.tournaments add column if not exists crew_id uuid references public.crews (id) on delete set null;

create or replace function public.is_crew_member(cid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.crew_members where crew_id = cid and profile_id = auth.uid())
$$;

alter table public.crews enable row level security;
alter table public.crew_members enable row level security;
create policy crews_members_read on public.crews for select using (public.is_crew_member(id));
create policy crew_members_read on public.crew_members for select using (public.is_crew_member(crew_id));
revoke insert, update, delete on public.crews, public.crew_members from anon, authenticated;

/** Shares a crew with me. */
create or replace function public.shares_crew(pid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.crew_members a join public.crew_members b on b.crew_id = a.crew_id
    where a.profile_id = auth.uid() and b.profile_id = pid
  )
$$;
revoke execute on function public.shares_crew(uuid) from public, anon, authenticated;

/** Full profile: me, a tournament mate, a friend or a crew-mate (never across a block). */
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
          where p.profile_id = pid and p.profile_status = 'confirmed' and public.is_tournament_member(p.tournament_id)
        )
      )
    )
  )
$$;

create or replace function public.crew_join_code()
returns text language plpgsql volatile set search_path = public as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code text;
begin
  loop
    code := '';
    for i in 1..6 loop
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.crews where join_code = code);
  end loop;
  return code;
end;
$$;

/** Creates a crew with me as owner. Returns { id, slug, joinCode }. */
create or replace function public.create_crew(p_name text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  base text;
  s text;
  n int := 0;
  c public.crews;
begin
  if not public.is_account_user(me) or not exists (select 1 from public.profiles where id = me) then
    raise exception 'Primero guarda tu perfil' using errcode = '42501';
  end if;
  p_name := btrim(coalesce(p_name, ''));
  if char_length(p_name) < 2 or char_length(p_name) > 60 then
    raise exception 'El crew necesita un nombre de 2 a 60 letras' using errcode = '22023';
  end if;
  base := coalesce(nullif(rtrim(left(public.slugify(p_name), 32), '-'), ''), 'crew');
  s := base;
  while exists (select 1 from public.crews where slug = s) loop
    n := n + 1;
    s := base || '-' || n;
  end loop;
  insert into public.crews (slug, name, join_code, created_by) values (s, p_name, public.crew_join_code(), me) returning * into c;
  insert into public.crew_members (crew_id, profile_id, role) values (c.id, me, 'owner');
  return jsonb_build_object('id', c.id, 'slug', c.slug, 'joinCode', c.join_code);
end;
$$;

/** The name behind a code, for the join screen. Accounts only. */
create or replace function public.crew_preview(p_code text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('name', c.name, 'slug', c.slug, 'members', (select count(*) from public.crew_members m where m.crew_id = c.id), 'isMember', public.is_crew_member(c.id))
  from public.crews c
  where public.is_account_user(auth.uid()) and c.join_code = upper(btrim(coalesce(p_code, '')))
$$;

/** Joins by code; the owner hears about it. Returns the slug, or null for a bad code. */
create or replace function public.join_crew(p_code text)
returns text language plpgsql volatile security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  c public.crews;
begin
  if not public.is_account_user(me) or not exists (select 1 from public.profiles where id = me) then
    raise exception 'Primero guarda tu perfil' using errcode = '42501';
  end if;
  select * into c from public.crews where join_code = upper(btrim(coalesce(p_code, '')));
  if c.id is null then
    return null;
  end if;
  insert into public.crew_members (crew_id, profile_id) values (c.id, me) on conflict do nothing;
  if found then
    perform public.notify(m.profile_id, 'crew_join', 'crew_join:' || c.id || ':' || me, me, jsonb_build_object('crew', c.name, 'slug', c.slug))
    from public.crew_members m where m.crew_id = c.id and m.role = 'owner';
  end if;
  return c.slug;
end;
$$;

/** Leaves a crew. The last member leaving deletes it; an owner leaving hands it to the longest member. */
create or replace function public.leave_crew(p_crew_id uuid)
returns void language plpgsql volatile security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  was_owner boolean;
begin
  delete from public.crew_members where crew_id = p_crew_id and profile_id = me returning role = 'owner' into was_owner;
  if not exists (select 1 from public.crew_members where crew_id = p_crew_id) then
    delete from public.crews where id = p_crew_id;
  elsif was_owner and not exists (select 1 from public.crew_members where crew_id = p_crew_id and role = 'owner') then
    update public.crew_members set role = 'owner'
    where crew_id = p_crew_id and profile_id = (select profile_id from public.crew_members where crew_id = p_crew_id order by joined_at limit 1);
  end if;
end;
$$;

/** Owner only: a new join code (the old link stops working). */
create or replace function public.rotate_crew_code(p_crew_id uuid)
returns text language plpgsql volatile security definer set search_path = public as $$
declare
  code text;
begin
  if not exists (select 1 from public.crew_members where crew_id = p_crew_id and profile_id = auth.uid() and role = 'owner') then
    raise exception 'Solo quien administra el crew cambia el código' using errcode = '42501';
  end if;
  code := public.crew_join_code();
  update public.crews set join_code = code where id = p_crew_id;
  return code;
end;
$$;

/** My crews with their member count. */
create or replace function public.my_crews()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'slug', c.slug, 'name', c.name, 'role', m.role,
    'members', (select count(*) from public.crew_members x where x.crew_id = c.id)) order by c.name), '[]'::jsonb)
  from public.crew_members m join public.crews c on c.id = m.crew_id
  where m.profile_id = auth.uid()
$$;

/** Puts a tournament in a crew (or out of it, with null). The Comité, and a member of that crew. */
create or replace function public.set_tournament_crew(p_tournament_id uuid, p_crew_id uuid)
returns void language plpgsql volatile security definer set search_path = public as $$
begin
  if not public.is_tournament_organizer(p_tournament_id) then
    raise exception 'Solo el Comité cambia el crew del torneo' using errcode = '42501';
  end if;
  if p_crew_id is not null and not public.is_crew_member(p_crew_id) then
    raise exception 'No eres de ese crew' using errcode = '42501';
  end if;
  update public.tournaments set crew_id = p_crew_id where id = p_tournament_id;
end;
$$;

/**
 * The crew page, for members: the crew, its members, its outings (the crew's
 * tournaments, with their first round date), and the published results of
 * members in finished outings that count, for the season table.
 */
create or replace function public.crew_page(p_slug text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  c public.crews;
begin
  select * into c from public.crews where slug = p_slug;
  if c.id is null or not public.is_crew_member(c.id) then
    return null;
  end if;
  return jsonb_build_object(
    'crew', jsonb_build_object('id', c.id, 'slug', c.slug, 'name', c.name, 'joinCode', c.join_code,
      'role', (select role from public.crew_members where crew_id = c.id and profile_id = auth.uid()), 'createdAt', c.created_at),
    'members', coalesce((
      select jsonb_agg(jsonb_build_object('handle', pr.handle, 'displayName', pr.display_name, 'avatarUrl', pr.avatar_url,
        'index', public.profile_index(pr.id), 'role', m.role, 'joinedAt', m.joined_at) order by m.role, pr.display_name)
      from public.crew_members m join public.profiles pr on pr.id = m.profile_id where m.crew_id = c.id
    ), '[]'::jsonb),
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
