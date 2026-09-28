-- 0016: friends, head-to-head, rivalries, notifications, the friends feed.
--
-- * friendships: a asks b (pending), b accepts; either can remove; blocking
--   hides each from the other. Friends see each other's full profile.
-- * notifications: own rows only, one per event (unique key), so replaying
--   or republishing never notifies twice. No amounts, ever. Written only by
--   the definer functions here (notify() is not callable).
-- * rivalries: two friends play with sliding strokes. `strokes` is what
--   `a` receives from `b` (negative: b receives). After each shared complete
--   round from the start date, compare adjusted gross with the strokes
--   applied; the loser receives one more stroke (within the cap), a tie
--   keeps them. Practice rounds (counts_for_stats off) don't count. The history is replayed from scratch whenever an input
--   changes, so a corrected score re-decides every later round.
-- * head_to_head(handle) and friends_feed() are computed on read.

-- ---------------------------------------------------------------------------
-- Friendships
-- ---------------------------------------------------------------------------
create table public.friendships (
  a uuid not null references public.profiles (id) on delete cascade,
  b uuid not null references public.profiles (id) on delete cascade,
  status text not null check (status in ('pending', 'accepted', 'blocked')),
  blocked_by uuid,
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  primary key (a, b),
  check (a <> b)
);
create unique index friendships_pair on public.friendships (least(a, b), greatest(a, b));
alter table public.friendships enable row level security;
create policy friendships_own on public.friendships for select using (a = auth.uid() or b = auth.uid());
revoke insert, update, delete on public.friendships from anon, authenticated;

create or replace function public.are_friends(x uuid, y uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.friendships f where f.status = 'accepted' and ((f.a = x and f.b = y) or (f.a = y and f.b = x)))
$$;

create or replace function public.is_blocked(x uuid, y uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.friendships f where f.status = 'blocked' and ((f.a = x and f.b = y) or (f.a = y and f.b = x)))
$$;

revoke execute on function public.are_friends(uuid, uuid), public.is_blocked(uuid, uuid) from public, anon, authenticated;

/** Full profile: me, a tournament mate, or a friend (never across a block). */
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
        or exists (
          select 1 from public.players p
          where p.profile_id = pid and p.profile_status = 'confirmed' and public.is_tournament_member(p.tournament_id)
        )
      )
    )
  )
$$;

-- ---------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null,
  key text not null,
  actor uuid references public.profiles (id) on delete set null,
  data jsonb not null default '{}',
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (profile_id, key)
);
create index notifications_unread on public.notifications (profile_id) where read_at is null;
alter table public.notifications enable row level security;
create policy notifications_own on public.notifications for select using (profile_id = auth.uid());
revoke insert, update, delete on public.notifications from anon, authenticated;

create or replace function public.notify(p_profile uuid, p_kind text, p_key text, p_actor uuid, p_data jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_profile is null or p_profile is not distinct from p_actor then
    return;
  end if;
  insert into public.notifications (profile_id, kind, key, actor, data)
  values (p_profile, p_kind, p_key, p_actor, coalesce(p_data, '{}'::jsonb))
  on conflict (profile_id, key) do nothing;
end;
$$;
revoke execute on function public.notify(uuid, text, text, uuid, jsonb) from public, anon, authenticated;

/** My inbox, newest first, with who did it. */
create or replace function public.my_notifications(p_limit int default 50)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x.j order by x.created_at desc), '[]'::jsonb) from (
    select n.created_at, jsonb_build_object(
      'id', n.id, 'kind', n.kind, 'data', n.data, 'read', n.read_at is not null, 'createdAt', n.created_at,
      'actor', case when pr.id is null then null else jsonb_build_object('handle', pr.handle, 'displayName', pr.display_name, 'avatarUrl', pr.avatar_url) end
    ) as j
    from public.notifications n left join public.profiles pr on pr.id = n.actor
    where n.profile_id = auth.uid()
    order by n.created_at desc
    limit greatest(1, least(coalesce(p_limit, 50), 200))
  ) x
$$;

create or replace function public.unread_notifications()
returns int language sql stable security definer set search_path = public as $$
  select count(*)::int from public.notifications where profile_id = auth.uid() and read_at is null
$$;

/** Marks some (or, with null, all) of my notifications read. */
create or replace function public.mark_notifications_read(p_ids uuid[] default null)
returns void language sql security definer set search_path = public as $$
  update public.notifications set read_at = now()
  where profile_id = auth.uid() and read_at is null and (p_ids is null or id = any (p_ids))
$$;

-- ---------------------------------------------------------------------------
-- Friend RPCs
-- ---------------------------------------------------------------------------
create or replace function public.profile_id_by_handle(p_handle text)
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.profiles where handle = lower(btrim(coalesce(p_handle, '')))
$$;
revoke execute on function public.profile_id_by_handle(text) from public, anon, authenticated;

/** Asks for friendship; answers an incoming request as a yes. Returns the resulting status. */
create or replace function public.friend_request(p_handle text)
returns text language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  other uuid;
  f public.friendships;
begin
  if not public.is_account_user(me) then
    raise exception 'Primero guarda tu perfil' using errcode = '42501';
  end if;
  other := public.profile_id_by_handle(p_handle);
  if other is null or other = me then
    return 'not_found';
  end if;
  select * into f from public.friendships where (a = me and b = other) or (a = other and b = me);
  if f.a is not null then
    if f.status = 'blocked' then
      return 'not_found';
    end if;
    if f.status = 'pending' and f.b = me then
      update public.friendships set status = 'accepted', responded_at = now() where a = f.a and b = f.b;
      perform public.notify(other, 'friend_accepted', 'friend_accepted:' || me, me, '{}');
      return 'accepted';
    end if;
    return f.status;
  end if;
  -- Strangers only reach discoverable profiles; tournament mates reach anyone.
  if not (public.profile_visible_to_me(other) or exists (select 1 from public.profiles where id = other and discoverable)) then
    return 'not_found';
  end if;
  insert into public.friendships (a, b, status) values (me, other, 'pending');
  perform public.notify(other, 'friend_request', 'friend_request:' || me, me, '{}');
  return 'pending';
end;
$$;

create or replace function public.friend_respond(p_handle text, p_accept boolean)
returns text language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  other uuid := public.profile_id_by_handle(p_handle);
begin
  if not exists (select 1 from public.friendships where a = other and b = me and status = 'pending') then
    return 'not_found';
  end if;
  if p_accept then
    update public.friendships set status = 'accepted', responded_at = now() where a = other and b = me;
    perform public.notify(other, 'friend_accepted', 'friend_accepted:' || me, me, '{}');
    return 'accepted';
  end if;
  delete from public.friendships where a = other and b = me;
  return 'declined';
end;
$$;

/** Removes a friendship or request, or lifts my own block. Ends an active rivalry between us. */
create or replace function public.friend_remove(p_handle text)
returns void language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  other uuid := public.profile_id_by_handle(p_handle);
begin
  delete from public.friendships
  where ((a = me and b = other) or (a = other and b = me))
    and (status <> 'blocked' or blocked_by = me);
  update public.rivalries set status = 'ended', ended_at = now()
  where status <> 'ended' and ((a = me and b = other) or (a = other and b = me));
end;
$$;

create or replace function public.friend_block(p_handle text)
returns void language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  other uuid := public.profile_id_by_handle(p_handle);
begin
  if other is null or other = me then
    return;
  end if;
  delete from public.friendships where (a = me and b = other) or (a = other and b = me);
  insert into public.friendships (a, b, status, blocked_by) values (me, other, 'blocked', me);
  update public.rivalries set status = 'ended', ended_at = now()
  where status <> 'ended' and ((a = me and b = other) or (a = other and b = me));
end;
$$;

/** Friends, requests both ways, and people I played with who aren't friends yet. */
create or replace function public.my_friends()
returns jsonb language sql stable security definer set search_path = public as $$
  with me as (select auth.uid() as id),
  card as (
    select pr.id, jsonb_build_object('handle', pr.handle, 'displayName', pr.display_name, 'avatarUrl', pr.avatar_url, 'homeClub', pr.home_club,
      'index', case when pr.index_source = 'manual' then pr.manual_index else pr.polo_index end) as j
    from public.profiles pr
  ),
  mates as (
    select p2.profile_id as id, count(distinct p1.tournament_id) as shared
    from public.players p1
    join public.players p2 on p2.tournament_id = p1.tournament_id and p2.profile_status = 'confirmed' and p2.profile_id is not null
    where p1.profile_id = (select id from me) and p1.profile_status = 'confirmed' and p2.profile_id <> (select id from me)
    group by p2.profile_id
  )
  select jsonb_build_object(
    'friends', coalesce((select jsonb_agg(c.j order by c.j ->> 'displayName') from public.friendships f join card c on c.id = case when f.a = (select id from me) then f.b else f.a end
      where f.status = 'accepted' and (select id from me) in (f.a, f.b)), '[]'::jsonb),
    'incoming', coalesce((select jsonb_agg(c.j order by f.created_at desc) from public.friendships f join card c on c.id = f.a
      where f.status = 'pending' and f.b = (select id from me)), '[]'::jsonb),
    'outgoing', coalesce((select jsonb_agg(c.j order by f.created_at desc) from public.friendships f join card c on c.id = f.b
      where f.status = 'pending' and f.a = (select id from me)), '[]'::jsonb),
    'suggestions', coalesce((select jsonb_agg(c.j || jsonb_build_object('shared', m.shared) order by m.shared desc, c.j ->> 'displayName') from mates m join card c on c.id = m.id
      where not exists (select 1 from public.friendships f where (f.a = m.id and f.b = (select id from me)) or (f.b = m.id and f.a = (select id from me)))), '[]'::jsonb)
  )
$$;

/** What I am to this profile: none, outgoing, incoming, friends or blocked (by me; their block reads as none). */
create or replace function public.friendship_with(p_handle text)
returns text language sql stable security definer set search_path = public as $$
  select coalesce((
    select case
      when f.status = 'accepted' then 'friends'
      when f.status = 'blocked' and f.blocked_by = auth.uid() then 'blocked'
      when f.status = 'blocked' then 'none'
      when f.a = auth.uid() then 'outgoing'
      else 'incoming'
    end
    from public.friendships f
    where (f.a = auth.uid() and f.b = public.profile_id_by_handle(p_handle)) or (f.b = auth.uid() and f.a = public.profile_id_by_handle(p_handle))
  ), 'none')
$$;

-- ---------------------------------------------------------------------------
-- Rivalries
-- ---------------------------------------------------------------------------
create table public.rivalries (
  id uuid primary key default gen_random_uuid(),
  a uuid not null references public.profiles (id) on delete cascade,
  b uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'active', 'ended')),
  start_strokes integer not null,
  cap integer not null default 18 check (cap between 1 and 36),
  strokes integer not null,
  started_at timestamptz,
  created_at timestamptz not null default now(),
  ended_at timestamptz,
  check (a <> b),
  check (abs(start_strokes) <= cap)
);
create unique index rivalries_one_open on public.rivalries (least(a, b), greatest(a, b)) where status <> 'ended';

create table public.rivalry_rounds (
  rivalry_id uuid not null references public.rivalries (id) on delete cascade,
  round_id uuid not null references public.rounds (id) on delete cascade,
  played_on date,
  a_ags integer not null,
  b_ags integer not null,
  strokes_before integer not null,
  winner text not null check (winner in ('a', 'b', 'tie')),
  strokes_after integer not null,
  primary key (rivalry_id, round_id)
);
alter table public.rivalries enable row level security;
alter table public.rivalry_rounds enable row level security;
create policy rivalries_own on public.rivalries for select using (a = auth.uid() or b = auth.uid());
create policy rivalry_rounds_own on public.rivalry_rounds for select using (
  exists (select 1 from public.rivalries r where r.id = rivalry_rounds.rivalry_id and (r.a = auth.uid() or r.b = auth.uid()))
);
revoke insert, update, delete on public.rivalries, public.rivalry_rounds from anon, authenticated;

/** Complete rounds both profiles played (same round), with their adjusted gross; newest last. */
create or replace function public.shared_rounds(x uuid, y uuid)
returns table (round_id uuid, tournament_id uuid, played_on date, round_number int, course text, x_ags int, y_ags int, x_gross int, y_gross int, x_ch int, y_ch int, practice boolean, computed_at timestamptz)
language sql stable security definer set search_path = public as $$
  select rx.round_id, rx.tournament_id, rx.played_on, rx.round_number, rx.course_name, rx.ags, ry.ags, rx.gross, ry.gross, rx.course_hcp, ry.course_hcp,
    not t.counts_for_stats, greatest(rx.computed_at, ry.computed_at)
  from public.round_results rx
  join public.players px on px.id = rx.player_id and px.profile_id = x and px.profile_status = 'confirmed'
  join public.round_results ry on ry.round_id = rx.round_id
  join public.players py on py.id = ry.player_id and py.profile_id = y and py.profile_status = 'confirmed'
  join public.tournaments t on t.id = rx.tournament_id
  where rx.complete and ry.complete and rx.ags is not null and ry.ags is not null
  order by rx.played_on nulls first, rx.round_number, rx.computed_at
$$;
revoke execute on function public.shared_rounds(uuid, uuid) from public, anon, authenticated;

/** Replays a rivalry from its start; notifies both players of each newly decided round, once. */
create or replace function public.recompute_rivalry(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  r public.rivalries;
  s int;
  x record;
  w text;
  after int;
begin
  select * into r from public.rivalries where id = p_id;
  if r.id is null then
    return;
  end if;
  delete from public.rivalry_rounds where rivalry_id = r.id;
  if r.status = 'pending' or r.started_at is null then
    update public.rivalries set strokes = start_strokes where id = r.id;
    return;
  end if;
  s := r.start_strokes;
  for x in
    select * from public.shared_rounds(r.a, r.b) sr
    where not sr.practice
      and coalesce(sr.played_on, sr.computed_at::date) >= r.started_at::date
      and (r.ended_at is null or coalesce(sr.played_on, sr.computed_at::date) <= r.ended_at::date)
  loop
    -- a plays off `s` strokes (b off −s when negative); lowest adjusted net wins.
    w := case when x.x_ags - s < x.y_ags then 'a' when x.x_ags - s > x.y_ags then 'b' else 'tie' end;
    -- The loser receives one more stroke: a loses → a gets +1; b loses → a gets −1.
    after := case w when 'b' then least(s + 1, r.cap) when 'a' then greatest(s - 1, -r.cap) else s end;
    insert into public.rivalry_rounds (rivalry_id, round_id, played_on, a_ags, b_ags, strokes_before, winner, strokes_after)
    values (r.id, x.round_id, x.played_on, x.x_ags, x.y_ags, s, w, after);
    perform public.notify(r.a, 'rivalry_round', 'rivalry_round:' || r.id || ':' || x.round_id, r.b, jsonb_build_object('rivalryId', r.id));
    perform public.notify(r.b, 'rivalry_round', 'rivalry_round:' || r.id || ':' || x.round_id, r.a, jsonb_build_object('rivalryId', r.id));
    s := after;
  end loop;
  update public.rivalries set strokes = s where id = r.id;
end;
$$;
revoke execute on function public.recompute_rivalry(uuid) from public, anon, authenticated;

create or replace function public.recompute_rivalries_of(pid uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  rid uuid;
begin
  for rid in select r.id from public.rivalries r where pid in (r.a, r.b) and r.status <> 'pending' loop
    perform public.recompute_rivalry(rid);
  end loop;
end;
$$;
revoke execute on function public.recompute_rivalries_of(uuid) from public, anon, authenticated;

/** Strokes I'd receive from them, from our indexes (rounded, capped). Null without both indexes. */
create or replace function public.rivalry_suggestion(p_handle text)
returns int language sql stable security definer set search_path = public as $$
  select case when mi is null or oi is null then null else greatest(-18, least(18, round(mi - oi)::int)) end
  from (
    select (select case when index_source = 'manual' then manual_index else polo_index end from public.profiles where id = auth.uid()) as mi,
           (select case when index_source = 'manual' then manual_index else polo_index end from public.profiles where id = public.profile_id_by_handle(p_handle)) as oi
  ) x
$$;

/** Proposes a rivalry to a friend: `p_strokes` is what I receive from them (negative: they receive). */
create or replace function public.rivalry_propose(p_handle text, p_strokes int, p_cap int default 18)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  other uuid := public.profile_id_by_handle(p_handle);
  rid uuid;
begin
  if other is null or not public.are_friends(me, other) then
    raise exception 'Las rivalidades son entre amigos' using errcode = '42501';
  end if;
  if abs(coalesce(p_strokes, 0)) > coalesce(p_cap, 18) then
    raise exception 'Los golpes no pueden pasar del tope' using errcode = '22023';
  end if;
  insert into public.rivalries (a, b, status, start_strokes, cap, strokes)
  values (me, other, 'pending', coalesce(p_strokes, 0), coalesce(p_cap, 18), coalesce(p_strokes, 0))
  returning id into rid;
  perform public.notify(other, 'rivalry_proposed', 'rivalry_proposed:' || rid, me, jsonb_build_object('rivalryId', rid));
  return rid;
exception when unique_violation then
  raise exception 'Ya tienen una rivalidad abierta' using errcode = '23505';
end;
$$;

create or replace function public.rivalry_respond(p_id uuid, p_accept boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  r public.rivalries;
begin
  select * into r from public.rivalries where id = p_id and b = auth.uid() and status = 'pending';
  if r.id is null then
    raise exception 'Esa propuesta ya no está' using errcode = '22023';
  end if;
  if p_accept then
    update public.rivalries set status = 'active', started_at = now() where id = r.id;
    perform public.notify(r.a, 'rivalry_accepted', 'rivalry_accepted:' || r.id, r.b, jsonb_build_object('rivalryId', r.id));
    perform public.recompute_rivalry(r.id);
  else
    delete from public.rivalries where id = r.id;
  end if;
end;
$$;

create or replace function public.rivalry_end(p_id uuid)
returns void language sql security definer set search_path = public as $$
  update public.rivalries set status = 'ended', ended_at = now()
  where id = p_id and auth.uid() in (a, b) and status <> 'ended'
$$;

-- ---------------------------------------------------------------------------
-- Head to head
-- ---------------------------------------------------------------------------
/** Our shared rounds, the record on net and gross, and our rivalry (open, else the last). */
create or replace function public.head_to_head(p_handle text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  other uuid := public.profile_id_by_handle(p_handle);
  riv public.rivalries;
begin
  if other is null or other = me or not public.profile_visible_to_me(other) then
    return null;
  end if;
  select * into riv from public.rivalries
  where (a = me and b = other) or (a = other and b = me)
  order by (status = 'ended'), created_at desc limit 1;
  return jsonb_build_object(
    'rounds', coalesce((
      select jsonb_agg(jsonb_build_object(
        'roundId', sr.round_id, 'playedOn', sr.played_on, 'roundNumber', sr.round_number, 'course', sr.course, 'practice', sr.practice,
        'tournament', t.name, 'slug', t.slug,
        'myGross', sr.x_gross, 'theirGross', sr.y_gross, 'myAgs', sr.x_ags, 'theirAgs', sr.y_ags,
        'myNet', sr.x_ags - sr.x_ch, 'theirNet', sr.y_ags - sr.y_ch
      ) order by sr.played_on desc nulls last, sr.round_number desc)
      from public.shared_rounds(me, other) sr join public.tournaments t on t.id = sr.tournament_id
    ), '[]'::jsonb),
    'rivalry', case when riv.id is null then null else jsonb_build_object(
      'id', riv.id, 'status', riv.status, 'iProposed', riv.a = me, 'cap', riv.cap,
      -- From my side: strokes I receive (negative: I give).
      'myStrokes', case when riv.a = me then riv.strokes else -riv.strokes end,
      'startStrokes', case when riv.a = me then riv.start_strokes else -riv.start_strokes end,
      'startedAt', riv.started_at,
      'history', coalesce((
        select jsonb_agg(jsonb_build_object(
          'roundId', rr.round_id, 'playedOn', rr.played_on,
          'myAgs', case when riv.a = me then rr.a_ags else rr.b_ags end,
          'theirAgs', case when riv.a = me then rr.b_ags else rr.a_ags end,
          'result', case when rr.winner = 'tie' then 'tie' when (rr.winner = 'a') = (riv.a = me) then 'won' else 'lost' end,
          'before', case when riv.a = me then rr.strokes_before else -rr.strokes_before end,
          'after', case when riv.a = me then rr.strokes_after else -rr.strokes_after end
        ) order by rr.played_on desc nulls last)
        from public.rivalry_rounds rr where rr.rivalry_id = riv.id
      ), '[]'::jsonb)
    ) end,
    'suggestion', public.rivalry_suggestion(p_handle),
    'friends', public.are_friends(me, other)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- The friends feed (computed on read)
-- ---------------------------------------------------------------------------
create or replace function public.friends_feed(p_limit int default 40)
returns jsonb language sql stable security definer set search_path = public as $$
  with me as (select auth.uid() as id),
  circle as (
    select case when f.a = (select id from me) then f.b else f.a end as pid
    from public.friendships f where f.status = 'accepted' and (select id from me) in (f.a, f.b)
  ),
  who as (select pr.id, pr.handle, pr.display_name, pr.avatar_url from public.profiles pr join circle c on c.pid = pr.id),
  finishes as (
    select tr.published_at as at, 'finish' as kind, w.id as pid, jsonb_build_object('tournament', t.name, 'slug', t.slug, 'rankLabel', tr.rank_label, 'field', tr.field) as data
    from public.tournament_results tr
    join public.players p on p.id = tr.player_id and p.profile_status = 'confirmed'
    join who w on w.id = p.profile_id
    join public.tournaments t on t.id = tr.tournament_id
    where tr.rank_label is not null
  ),
  rounds as (
    select rr.computed_at as at, 'round' as kind, w.id as pid,
      jsonb_build_object('course', rr.course_name, 'tournament', t.name, 'slug', t.slug, 'gross', rr.gross, 'birdies', rr.birdies, 'eagles', rr.eagles,
        'best', rr.gross is not null and rr.holes = 18 and rr.gross = (
          select min(r2.gross) from public.round_results r2 join public.players p2 on p2.id = r2.player_id
          where p2.profile_id = w.id and p2.profile_status = 'confirmed' and r2.holes = 18 and r2.gross is not null)
        and (select count(*) from public.round_results r3 join public.players p3 on p3.id = r3.player_id
          where p3.profile_id = w.id and p3.profile_status = 'confirmed' and r3.holes = 18 and r3.gross is not null) > 1) as data
    from public.round_results rr
    join public.players p on p.id = rr.player_id and p.profile_status = 'confirmed'
    join who w on w.id = p.profile_id
    join public.tournaments t on t.id = rr.tournament_id
    where rr.complete and (rr.birdies + rr.eagles >= 3 or rr.eagles > 0)
  ),
  rivals as (
    select coalesce(rr.played_on::timestamptz, now()) as at, 'rivalry' as kind,
      case when rv.a = (select id from me) then rv.b else rv.a end as pid,
      jsonb_build_object('rivalryId', rv.id, 'result',
        case when rr.winner = 'tie' then 'tie' when (rr.winner = 'a') = (rv.a = (select id from me)) then 'won' else 'lost' end) as data
    from public.rivalry_rounds rr join public.rivalries rv on rv.id = rr.rivalry_id
    where (select id from me) in (rv.a, rv.b)
  ),
  items as (select * from finishes union all select * from rounds union all select * from rivals)
  select coalesce(jsonb_agg(jsonb_build_object('kind', i.kind, 'at', i.at, 'data', i.data,
    'who', jsonb_build_object('handle', pr.handle, 'displayName', pr.display_name, 'avatarUrl', pr.avatar_url)) order by i.at desc), '[]'::jsonb)
  from (select * from items order by at desc limit greatest(1, least(coalesce(p_limit, 40), 100))) i
  join public.profiles pr on pr.id = i.pid
$$;

-- ---------------------------------------------------------------------------
-- Triggers that feed the inbox and keep rivalries replayed
-- ---------------------------------------------------------------------------
/** Round results changed: indexes (0015) and now the rivalries of the profiles involved. */
create or replace function public.round_results_reindex()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.recompute_profile_index(x.pid), public.recompute_rivalries_of(x.pid)
  from (select distinct p.profile_id as pid from changed c join public.players p on p.id = c.player_id where p.profile_id is not null) x;
  return null;
end;
$$;

/** Links changed: indexes, rivalries, and "¿Eres tú?" for a new proposal. */
create or replace function public.players_reindex()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    perform public.recompute_profile_index(old.profile_id);
    perform public.recompute_rivalries_of(old.profile_id);
    return null;
  end if;
  if old.profile_id is distinct from new.profile_id or old.profile_status is distinct from new.profile_status then
    perform public.recompute_profile_index(old.profile_id);
    perform public.recompute_rivalries_of(old.profile_id);
    if new.profile_id is distinct from old.profile_id then
      perform public.recompute_profile_index(new.profile_id);
      perform public.recompute_rivalries_of(new.profile_id);
    end if;
    if new.profile_status = 'pending' then
      perform public.notify(new.profile_id, 'link_pending', 'link_pending:' || new.id, null,
        jsonb_build_object('tournament', (select name from public.tournaments where id = new.tournament_id), 'player', new.display_name));
    end if;
  end if;
  return null;
end;
$$;

/** A finished tournament published its results: each linked player hears once. */
create or replace function public.tournament_results_notify()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.notify(p.profile_id, 'results', 'results:' || n.tournament_id, null,
    jsonb_build_object('tournament', t.name, 'slug', t.slug, 'rankLabel', n.rank_label, 'field', n.field))
  from (select * from changed) n
  join public.players p on p.id = n.player_id and p.profile_status = 'confirmed'
  join public.tournaments t on t.id = n.tournament_id;
  return null;
end;
$$;
create trigger tournament_results_notify after insert on public.tournament_results
  referencing new table as changed for each statement execute function public.tournament_results_notify();
