-- 0013: identity. A person has one profile (their account: email or Google)
-- and can be a player in many tournaments.
--
-- * `profiles` (id = auth uid). Owner-only by RLS; everyone else sees a
--   profile through `profile_card()` and `search_profiles()`.
-- * `players.profile_id` + `profile_status` link a tournament player to a
--   profile: `pending` (the Comité proposed it) or `confirmed` (the person
--   said "soy yo", or held the player's PIN). Only the definer RPCs below
--   write the link; a trigger refuses direct writes from the API roles.
-- * `my_player_id(tid)`: who I am in a tournament, from a confirmed link or
--   from this device's PIN claim. It replaces `current_player_id()` in every
--   helper and policy, so an account plays several live tournaments at once.
--   `current_player_id()` stays (device claim only) for older bundles.
-- * Link tokens carry a device's PIN claim across a sign-in to an existing
--   account (hashed, 15 minutes, one use).
-- * Storage: `profiles/<uid>/…` is writable by its owner.

-- ---------------------------------------------------------------------------
-- Handles
-- ---------------------------------------------------------------------------
create or replace function public.handle_ok(h text)
returns boolean
language sql immutable
set search_path = public
as $$
  select h is not null
    and h ~ '^[a-z0-9][a-z0-9._]{1,18}[a-z0-9]$'
    and h !~ '[._]{2}'
    and h <> all (array[
      'admin', 'administrador', 'api', 'app', 'ajustes', 'amigos', 'avisos', 'ayuda', 'cardigan', 'ceremonia',
      'comite', 'crew', 'crews', 'design', 'editar', 'entrar', 'golf', 'help', 'login', 'null', 'nuevo',
      'organizer', 'organizador', 'perfil', 'perfiles', 'polo', 'profile', 'ronda', 'root', 'settings',
      'sistema', 'soporte', 'support', 'system', 'undefined', 'www', 'yo'
    ])
$$;

/** A handle-shaped base from a display name: "Nicolás Castro" → "nicolas.castro". */
create or replace function public.handle_base(p text)
returns text
language sql immutable
set search_path = public
as $$
  select coalesce(nullif(trim(both '._' from left(trim(both '.' from regexp_replace(
    translate(lower(coalesce(p, '')), 'áàäâãéèëêíìïîóòöôõúùüûñç', 'aaaaaeeeeiiiiooooouuuunc'),
    '[^a-z0-9]+', '.', 'g')), 16)), ''), 'golfista')
$$;

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  handle text not null unique check (public.handle_ok(handle)),
  display_name text not null check (char_length(btrim(display_name)) between 1 and 40),
  full_name text check (char_length(full_name) <= 80),
  avatar_url text check (char_length(avatar_url) <= 500),
  home_club text check (char_length(home_club) <= 80),
  city text check (char_length(city) <= 80),
  bio text check (char_length(bio) <= 280),
  index_source text not null default 'polo' check (index_source in ('polo', 'manual')),
  manual_index numeric(3, 1) check (manual_index between -10 and 54),
  polo_index numeric(3, 1),
  polo_index_rounds integer not null default 0,
  polo_index_at timestamptz,
  discoverable boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

alter table public.profiles enable row level security;
create policy profiles_self_read on public.profiles for select using (id = auth.uid());
create policy profiles_self_update on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());
-- Created by ensure_my_profile(); the index columns are computed (0014).
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (handle, display_name, full_name, avatar_url, home_club, city, bio, index_source, manual_index, discoverable)
  on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- Player ↔ profile links
-- ---------------------------------------------------------------------------
alter table public.players add column profile_id uuid references public.profiles (id) on delete set null;
alter table public.players add column profile_status text check (profile_status in ('pending', 'confirmed'));
alter table public.players add constraint players_profile_link check ((profile_id is null) = (profile_status is null));
-- One link (pending or confirmed) per profile per tournament.
create unique index players_one_link_per_tournament on public.players (tournament_id, profile_id) where profile_id is not null;
create index players_profile_idx on public.players (profile_id) where profile_id is not null;

/** Links change only inside the definer RPCs (they run as the table owner), never straight from the API. */
create or replace function public.players_guard_link()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.profile_id is null then
    new.profile_status := null; -- the profile was deleted (FK set null)
  end if;
  if current_user in ('anon', 'authenticated') and (
    (tg_op = 'INSERT' and new.profile_id is not null)
    or (tg_op = 'UPDATE' and (new.profile_id is distinct from old.profile_id or new.profile_status is distinct from old.profile_status))
  ) then
    raise exception 'El perfil de un jugador se amarra desde su perfil o desde el Comité' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger players_guard_link before insert or update on public.players
  for each row execute function public.players_guard_link();

-- ---------------------------------------------------------------------------
-- Who am I in a tournament
-- ---------------------------------------------------------------------------
create or replace function public.my_player_id(tid uuid)
returns uuid
language sql stable security definer
set search_path = public
as $$
  select coalesce(
    (select p.id from public.players p where p.tournament_id = tid and p.profile_id = auth.uid() and p.profile_status = 'confirmed'),
    (select d.player_id from public.device_sessions d where d.auth_user_id = auth.uid() and d.tournament_id = tid)
  )
$$;

create or replace function public.is_tournament_organizer(tid uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select
    exists (select 1 from public.tournament_organizers o where o.tournament_id = tid and o.auth_user_id = auth.uid())
    or exists (select 1 from public.players p where p.id = public.my_player_id(tid) and p.is_admin)
$$;

create or replace function public.is_tournament_member(tid uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select public.is_tournament_organizer(tid) or public.my_player_id(tid) is not null
$$;

/** An admin player in any tournament (may manage courses). */
create or replace function public.is_admin_player()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select
    exists (
      select 1 from public.device_sessions d
      join public.players p on p.id = d.player_id
      where d.auth_user_id = auth.uid() and p.is_admin
    )
    or exists (select 1 from public.players p where p.profile_id = auth.uid() and p.profile_status = 'confirmed' and p.is_admin)
$$;

create or replace function public.shares_group(rid uuid, pid uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.groups g
    join public.group_members me on me.group_id = g.id and me.player_id = public.my_player_id(public.round_tournament_id(rid))
    join public.group_members other on other.group_id = g.id and other.player_id = pid
    where g.round_id = rid
  )
$$;

create or replace function public.my_tournament_role(tid uuid)
returns text
language sql stable security definer
set search_path = public
as $$
  select case
    when exists (select 1 from public.tournament_organizers o where o.tournament_id = tid and o.auth_user_id = auth.uid() and o.role = 'owner') then 'owner'
    when exists (select 1 from public.tournament_organizers o where o.tournament_id = tid and o.auth_user_id = auth.uid()) then 'admin'
    when public.my_player_id(tid) is not null then 'member'
    else 'none'
  end
$$;

/** Everything the tournament gate needs in one call. */
create or replace function public.my_membership(tid uuid)
returns jsonb
language sql stable security definer
set search_path = public
as $$
  with me as (select public.my_player_id(tid) as pid),
  org as (select o.role from public.tournament_organizers o where o.tournament_id = tid and o.auth_user_id = auth.uid())
  select jsonb_build_object(
    'playerId', (select pid from me),
    'role', coalesce((select role from org), case when (select pid from me) is not null then 'member' else 'none' end),
    'isOrganizer', exists (select 1 from org),
    'isAdmin', exists (select 1 from org) or exists (select 1 from public.players p where p.id = (select pid from me) and p.is_admin),
    'via', case
      when exists (select 1 from public.players p where p.tournament_id = tid and p.profile_id = auth.uid() and p.profile_status = 'confirmed') then 'profile'
      when (select pid from me) is not null then 'device'
    end
  )
$$;

-- ---------------------------------------------------------------------------
-- Policies that named the device's player: now the player in that tournament
-- ---------------------------------------------------------------------------
drop policy if exists card_signatures_insert on public.card_signatures;
create policy card_signatures_insert on public.card_signatures for insert
  with check (
    public.is_tournament_organizer(public.round_tournament_id(round_id))
    or (
      public.round_is_live(round_id)
      and signed_by = public.my_player_id(public.round_tournament_id(round_id))
      and exists (
        select 1 from public.pairs p
        where p.id = card_signatures.pair_id
          and p.tournament_id = public.round_tournament_id(card_signatures.round_id)
          and public.shares_group(card_signatures.round_id, p.player1_id)
          and public.shares_group(card_signatures.round_id, p.player2_id)
          and public.my_player_id(p.tournament_id) <> p.player1_id
          and public.my_player_id(p.tournament_id) <> p.player2_id
      )
    )
  );

drop policy if exists snake_tiebreaks_write on public.snake_tiebreaks;
create policy snake_tiebreaks_write on public.snake_tiebreaks for all
  using (
    public.is_tournament_organizer(public.round_tournament_id(round_id))
    or exists (
      select 1 from public.group_members m
      where m.group_id = snake_tiebreaks.group_id and m.player_id = public.my_player_id(public.round_tournament_id(snake_tiebreaks.round_id))
    )
  )
  with check (
    public.is_tournament_organizer(public.round_tournament_id(round_id))
    or (
      exists (select 1 from public.groups g where g.id = snake_tiebreaks.group_id and g.round_id = snake_tiebreaks.round_id)
      and exists (
        select 1 from public.group_members m
        where m.group_id = snake_tiebreaks.group_id and m.player_id = public.my_player_id(public.round_tournament_id(snake_tiebreaks.round_id))
      )
      and exists (select 1 from public.group_members m where m.group_id = snake_tiebreaks.group_id and m.player_id = snake_tiebreaks.last_holed_player_id)
      and decided_by = public.my_player_id(public.round_tournament_id(round_id))
    )
  );

drop policy if exists hole_awards_write on public.hole_awards;
create policy hole_awards_write on public.hole_awards for all
  using (
    public.is_tournament_organizer(public.round_tournament_id(round_id))
    or exists (
      select 1 from public.group_members m
      where m.group_id = hole_awards.group_id and m.player_id = public.my_player_id(public.round_tournament_id(hole_awards.round_id))
    )
  )
  with check (
    (public.is_tournament_organizer(public.round_tournament_id(round_id)) and public.player_tournament_id(player_id) = public.round_tournament_id(round_id))
    or (
      exists (select 1 from public.groups g where g.id = hole_awards.group_id and g.round_id = hole_awards.round_id)
      and exists (
        select 1 from public.group_members m
        where m.group_id = hole_awards.group_id and m.player_id = public.my_player_id(public.round_tournament_id(hole_awards.round_id))
      )
      and exists (select 1 from public.group_members m where m.group_id = hole_awards.group_id and m.player_id = hole_awards.player_id)
      and decided_by = public.my_player_id(public.round_tournament_id(round_id))
    )
  );

-- ---------------------------------------------------------------------------
-- Functions that recorded the device's player
-- ---------------------------------------------------------------------------
create or replace function public.admin_save_score(p_round_id uuid, p_player_id uuid, p_hole integer, p_strokes integer, p_putts integer, p_picked_up boolean, p_reason text default null)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  tid uuid;
  r text;
begin
  tid := public.round_tournament_id(p_round_id);
  if tid is null or not public.is_tournament_organizer(tid) then
    raise exception 'Solo el Comité puede corregir tarjetas' using errcode = '42501';
  end if;
  if public.player_tournament_id(p_player_id) is distinct from tid then
    raise exception 'Ese jugador no es de este torneo' using errcode = '22023';
  end if;
  r := nullif(btrim(coalesce(p_reason, '')), '');
  if public.card_is_signed(p_round_id, p_player_id) and (r is null or length(r) < 3) then
    raise exception 'La tarjeta está firmada: la corrección necesita razón' using errcode = '22023';
  end if;
  if not p_picked_up and (p_strokes is null or p_strokes < 1 or p_strokes > 15) then
    raise exception 'Los golpes van de 1 a 15' using errcode = '22023';
  end if;
  if p_putts is not null and (p_putts < 0 or p_putts > 15 or (not p_picked_up and p_putts > p_strokes)) then
    raise exception 'Los putts no pueden ser más que los golpes' using errcode = '22023';
  end if;
  perform set_config('cardi.comite', '1', true);
  insert into public.scores (round_id, player_id, hole, strokes, putts, picked_up, entered_by, client_ts, reason, disputed, previous)
  values (p_round_id, p_player_id, p_hole, case when p_picked_up then null else p_strokes end, p_putts, p_picked_up, public.my_player_id(tid), now(), coalesce(r, 'Corrección del Comité'), false, null)
  on conflict (round_id, player_id, hole) do update
    set strokes = excluded.strokes, putts = excluded.putts, picked_up = excluded.picked_up, entered_by = excluded.entered_by,
        client_ts = excluded.client_ts, reason = excluded.reason, disputed = false, previous = null;
end;
$$;

create or replace function public.resolve_score_dispute(p_round_id uuid, p_player_id uuid, p_hole integer, p_keep boolean default true)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  tid uuid;
  s public.scores;
begin
  tid := public.round_tournament_id(p_round_id);
  if tid is null or not public.is_tournament_organizer(tid) then
    raise exception 'Solo el Comité puede resolver discrepancias' using errcode = '42501';
  end if;
  select * into s from public.scores where round_id = p_round_id and player_id = p_player_id and hole = p_hole for update;
  if s.id is null then
    raise exception 'Ese hoyo no tiene captura' using errcode = '22023';
  end if;
  perform set_config('cardi.comite', '1', true);
  if p_keep or s.previous is null then
    update public.scores set disputed = false, previous = null, reason = 'Discrepancia: se conserva el valor actual' where id = s.id;
  else
    update public.scores
    set strokes = (s.previous ->> 'strokes')::int, putts = (s.previous ->> 'putts')::int, picked_up = coalesce((s.previous ->> 'picked_up')::boolean, false),
        entered_by = public.my_player_id(tid), client_ts = now(), disputed = false, previous = null,
        reason = 'Discrepancia: se restaura el valor anterior'
    where id = s.id;
  end if;
end;
$$;

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
  rid := coalesce(
    rec ->> 'id',
    nullif(concat_ws(':', rec ->> 'round_id', rec ->> 'group_id', rec ->> 'lot_id', rec ->> 'pair_id', rec ->> 'player_id', rec ->> 'hole', rec ->> 'auth_user_id'), ''),
    md5(rec::text)
  );
  tid := case
    when rec ? 'tournament_id' then (rec ->> 'tournament_id')::uuid
    when rec ? 'round_id' then public.round_tournament_id((rec ->> 'round_id')::uuid)
    when rec ? 'group_id' then public.group_tournament_id((rec ->> 'group_id')::uuid)
    when rec ? 'lot_id' then public.lot_tournament_id((rec ->> 'lot_id')::uuid)
    else null
  end;
  insert into public.audit_log (tournament_id, table_name, row_id, actor_auth_user_id, actor_player_id, action, before, after, reason)
  values (
    tid, tg_table_name, rid, auth.uid(), case when tid is not null then public.my_player_id(tid) end, tg_op,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end,
    case when tg_op in ('INSERT', 'UPDATE') then rec ->> 'reason' end
  );
  return coalesce(new, old);
end;
$$;

-- ---------------------------------------------------------------------------
-- Entering a tournament
-- ---------------------------------------------------------------------------
/** The face grid, now with who I am (`isMe`), who has a profile, and "¿Eres tú?" links waiting for me. */
create or replace function public.lookup_tournament(p_code text)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  t public.tournaments;
  me uuid;
begin
  if auth.uid() is null then
    raise exception 'Sin sesión' using errcode = '42501';
  end if;
  select * into t from public.tournaments
  where join_code = upper(trim(p_code)) or slug = lower(trim(p_code))
  limit 1;
  if t.id is null then
    return null;
  end if;
  me := public.my_player_id(t.id);
  return jsonb_build_object(
    'id', t.id,
    'slug', t.slug,
    'name', t.name,
    'tagline', t.tagline,
    'logoUrl', t.logo_url,
    'accentColor', t.accent_color,
    'status', t.status,
    'joinCode', case when public.is_tournament_member(t.id) then t.join_code end,
    'players', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'displayName', p.display_name, 'fullName', p.full_name,
        'tier', p.tier, 'avatarUrl', p.avatar_url, 'isHonoree', p.is_honoree,
        'hasPin', exists (select 1 from public.player_pins pp where pp.player_id = p.id),
        'isMe', p.id is not distinct from me,
        'hasProfile', coalesce(p.profile_status = 'confirmed', false),
        'pendingMe', coalesce(p.profile_status = 'pending' and p.profile_id = auth.uid(), false)
      ) order by p.sort_order, p.display_name)
      from public.players p where p.tournament_id = t.id
    ), '[]'::jsonb)
  );
end;
$$;

/** Face + PIN. An account already confirmed as another player of this tournament gets `already_linked`. */
create or replace function public.claim_player(p_player_id uuid, p_pin text)
returns jsonb
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  pp public.player_pins;
  pl public.players;
  dev public.pin_attempts;
  linked uuid;
  dev_max constant int := 5;
  dev_lock constant interval := interval '5 minutes';
  pl_max constant int := 15;
  pl_lock constant interval := interval '15 minutes';
begin
  if auth.uid() is null then
    raise exception 'Sin sesión' using errcode = '42501';
  end if;
  insert into public.pin_attempts (auth_user_id) values (auth.uid()) on conflict (auth_user_id) do nothing;
  select * into dev from public.pin_attempts where auth_user_id = auth.uid() for update;
  if dev.locked_until is not null and dev.locked_until <= now() then
    update public.pin_attempts set failed_attempts = 0, locked_until = null, updated_at = now() where auth_user_id = auth.uid();
    dev.failed_attempts := 0;
    dev.locked_until := null;
  end if;
  if dev.locked_until is not null and dev.locked_until > now() then
    return jsonb_build_object('ok', false, 'reason', 'locked', 'lockedUntil', dev.locked_until);
  end if;

  select * into pl from public.players where id = p_player_id;
  if pl.id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  select p.id into linked from public.players p
  where p.tournament_id = pl.tournament_id and p.profile_id = auth.uid() and p.profile_status = 'confirmed';
  if linked is not null and linked <> pl.id then
    return jsonb_build_object('ok', false, 'reason', 'already_linked', 'playerId', linked);
  end if;
  select * into pp from public.player_pins where player_id = p_player_id for update;
  if pp.player_id is null then
    return jsonb_build_object('ok', false, 'reason', 'no_pin');
  end if;
  if pp.locked_until is not null and pp.locked_until <= now() then
    update public.player_pins set failed_attempts = 0, locked_until = null where player_id = p_player_id;
    pp.failed_attempts := 0;
    pp.locked_until := null;
  end if;
  if pp.locked_until is not null and pp.locked_until > now() then
    return jsonb_build_object('ok', false, 'reason', 'locked', 'lockedUntil', pp.locked_until);
  end if;

  if pp.pin_hash = crypt(p_pin, pp.pin_hash) then
    update public.player_pins set failed_attempts = 0, locked_until = null where player_id = p_player_id;
    update public.pin_attempts set failed_attempts = 0, locked_until = null, updated_at = now() where auth_user_id = auth.uid();
    insert into public.device_sessions (auth_user_id, player_id, tournament_id)
    values (auth.uid(), pl.id, pl.tournament_id)
    on conflict (auth_user_id) do update set player_id = excluded.player_id, tournament_id = excluded.tournament_id, created_at = now();
    return jsonb_build_object('ok', true, 'playerId', pl.id, 'tournamentId', pl.tournament_id);
  end if;

  update public.pin_attempts
  set failed_attempts = dev.failed_attempts + 1,
      locked_until = case when dev.failed_attempts + 1 >= dev_max then now() + dev_lock end,
      updated_at = now()
  where auth_user_id = auth.uid();
  update public.player_pins
  set failed_attempts = pp.failed_attempts + 1,
      locked_until = case when pp.failed_attempts + 1 >= pl_max then now() + pl_lock end
  where player_id = p_player_id;
  if pp.failed_attempts + 1 >= pl_max then
    return jsonb_build_object('ok', false, 'reason', 'locked', 'lockedUntil', now() + pl_lock);
  end if;
  if dev.failed_attempts + 1 >= dev_max then
    return jsonb_build_object('ok', false, 'reason', 'locked', 'lockedUntil', now() + dev_lock);
  end if;
  return jsonb_build_object('ok', false, 'reason', 'wrong_pin', 'attemptsLeft', least(dev_max - (dev.failed_attempts + 1), pl_max - (pp.failed_attempts + 1)));
end;
$$;

/** Duplicar torneo: links travel as `pending`, so each person confirms with one tap. */
create or replace function public.duplicate_tournament(p_source_id uuid, p_name text)
returns public.tournaments
language plpgsql security definer
set search_path = public
as $$
declare
  src public.tournaments;
  t public.tournaments;
begin
  select * into src from public.tournaments where id = p_source_id;
  if src.id is null or not public.is_tournament_organizer(src.id) then
    raise exception 'Sin permiso' using errcode = '42501';
  end if;
  t := public.create_tournament(p_name, src.settings, null, src.tagline);
  update public.tournaments set logo_url = src.logo_url, accent_color = src.accent_color where id = t.id;
  insert into public.players (tournament_id, full_name, display_name, tier, base_hcp, handicap_source, handicap_index, estimate_inputs, default_tee_id, is_honoree, is_admin, avatar_url, form_guide, sort_order, profile_id, profile_status)
  select t.id, full_name, display_name, tier, base_hcp, handicap_source, handicap_index, estimate_inputs, default_tee_id, is_honoree, is_admin, avatar_url, form_guide, sort_order,
    profile_id, case when profile_id is not null then 'pending' end
  from public.players where tournament_id = src.id;
  insert into public.rounds (tournament_id, number, date, course_id, holes, status)
  select t.id, number, date, course_id, holes, 'scheduled' from public.rounds where tournament_id = src.id;
  select * into t from public.tournaments where id = t.id;
  return t;
end;
$$;

-- ---------------------------------------------------------------------------
-- Profiles: create, see, search
-- ---------------------------------------------------------------------------
/** The caller's profile, created on first call from the account (name and photo from email or Google). */
create or replace function public.ensure_my_profile()
returns public.profiles
language plpgsql security definer
set search_path = public
as $$
declare
  u auth.users;
  pr public.profiles;
  meta jsonb;
  dn text;
  base text;
  cand text;
  n int := 0;
begin
  if auth.uid() is null then
    raise exception 'Sin sesión' using errcode = '42501';
  end if;
  select * into pr from public.profiles where id = auth.uid();
  if pr.id is not null then
    return pr;
  end if;
  select * into u from auth.users where id = auth.uid();
  if u.id is null or coalesce(u.is_anonymous, false) or u.email is null then
    raise exception 'Primero guarda tu perfil con tu correo o con Google' using errcode = '42501';
  end if;
  meta := coalesce(u.raw_user_meta_data, '{}'::jsonb);
  dn := nullif(btrim(coalesce(meta ->> 'display_name', meta ->> 'full_name', meta ->> 'name', '')), '');
  if dn is null then
    dn := nullif(initcap(btrim(regexp_replace(split_part(u.email, '@', 1), '[._+-]+', ' ', 'g'))), '');
  end if;
  dn := left(coalesce(dn, 'Golfista'), 40);
  base := public.handle_base(dn);
  cand := base;
  while not public.handle_ok(cand) or exists (select 1 from public.profiles where handle = cand) loop
    n := n + 1;
    cand := rtrim(left(base, 16), '._') || n::text;
    if n > 500 then
      cand := 'golfista' || substr(md5(random()::text), 1, 6);
    end if;
  end loop;
  insert into public.profiles (id, handle, display_name, full_name, avatar_url)
  values (
    auth.uid(), cand, dn,
    left(nullif(btrim(coalesce(meta ->> 'full_name', meta ->> 'name', '')), ''), 80),
    left(nullif(coalesce(meta ->> 'avatar_url', meta ->> 'picture', ''), ''), 500)
  )
  on conflict (id) do nothing;
  select * into pr from public.profiles where id = auth.uid();
  return pr;
end;
$$;

/** True when I may see this profile in full: it is me, or we are in a tournament together (as members or its Comité). */
create or replace function public.profile_visible_to_me(pid uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select auth.uid() is not null and (
    pid = auth.uid()
    or exists (
      select 1 from public.players p
      where p.profile_id = pid and p.profile_status = 'confirmed' and public.is_tournament_member(p.tournament_id)
    )
  )
$$;

create or replace function public.profile_card(p_handle text)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  pr public.profiles;
  rel boolean;
begin
  if auth.uid() is null then
    return null;
  end if;
  select * into pr from public.profiles where handle = lower(btrim(coalesce(p_handle, '')));
  if pr.id is null then
    return null;
  end if;
  rel := public.profile_visible_to_me(pr.id);
  -- Strangers: only accounts, only discoverable profiles, and only the card.
  if not rel and not (pr.discoverable and public.is_account_user(auth.uid())) then
    return null;
  end if;
  return jsonb_build_object(
    'handle', pr.handle,
    'displayName', pr.display_name,
    'avatarUrl', pr.avatar_url,
    'homeClub', pr.home_club,
    'city', pr.city,
    'index', case when pr.index_source = 'manual' then pr.manual_index else pr.polo_index end,
    'indexSource', pr.index_source,
    'indexRounds', pr.polo_index_rounds,
    'isMe', pr.id = auth.uid(),
    'related', rel,
    'fullName', case when rel then pr.full_name end,
    'bio', case when rel then pr.bio end,
    'memberSince', pr.created_at
  );
end;
$$;

/** Accounts only; at least two letters; matches handle or name, accents ignored. */
create or replace function public.search_profiles(q text)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  qq text := translate(lower(btrim(coalesce(q, ''))), 'áàäâãéèëêíìïîóòöôõúùüûñç@', 'aaaaaeeeeiiiiooooouuuunc');
  pat text;
begin
  if not public.is_account_user(auth.uid()) or char_length(qq) < 2 then
    return '[]'::jsonb;
  end if;
  pat := replace(replace(replace(qq, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  return coalesce((
    select jsonb_agg(jsonb_build_object('handle', s.handle, 'displayName', s.display_name, 'avatarUrl', s.avatar_url, 'homeClub', s.home_club, 'city', s.city) order by s.exact desc, s.display_name)
    from (
      select pr.handle, pr.display_name, pr.avatar_url, pr.home_club, pr.city, pr.handle = qq as exact
      from public.profiles pr
      where pr.id <> auth.uid()
        and (pr.discoverable or public.profile_visible_to_me(pr.id))
        and (
          pr.handle like pat
          or translate(lower(pr.display_name), 'áàäâãéèëêíìïîóòöôõúùüûñç', 'aaaaaeeeeiiiiooooouuuunc') like pat
          or translate(lower(pr.display_name), 'áàäâãéèëêíìïîóòöôõúùüûñç', 'aaaaaeeeeiiiiooooouuuunc') like '% ' || pat
        )
      order by pr.handle = qq desc, pr.display_name
      limit 20
    ) s
  ), '[]'::jsonb);
end;
$$;

/** My tournament players (confirmed and "¿Eres tú?"), newest first. */
create or replace function public.my_links()
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'playerId', p.id, 'displayName', p.display_name, 'linkStatus', p.profile_status,
    'tournamentId', t.id, 'slug', t.slug, 'name', t.name, 'tournamentStatus', t.status, 'logoUrl', t.logo_url, 'createdAt', t.created_at
  ) order by t.created_at desc), '[]'::jsonb)
  from public.players p join public.tournaments t on t.id = p.tournament_id
  where p.profile_id = auth.uid()
$$;

/** Profiles of a tournament's players, for its members: confirmed links, plus pending ones for the Comité. */
create or replace function public.tournament_profiles(tid uuid)
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'playerId', p.id, 'handle', pr.handle, 'displayName', pr.display_name, 'avatarUrl', pr.avatar_url, 'status', p.profile_status
  )), '[]'::jsonb)
  from public.players p join public.profiles pr on pr.id = p.profile_id
  where p.tournament_id = tid
    and public.is_tournament_member(tid)
    and (p.profile_status = 'confirmed' or public.is_tournament_organizer(tid))
$$;

-- ---------------------------------------------------------------------------
-- Linking
-- ---------------------------------------------------------------------------
/**
 * Internal: link a player to a profile as confirmed, once the caller's right
 * to it is proven. Drops a pending link the profile had elsewhere in the
 * tournament, refuses when the profile is already confirmed as someone else
 * there, and points this device's claim at the linked player.
 */
create or replace function public.confirm_link(p_profile uuid, p_player uuid)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  pl public.players;
  other public.players;
begin
  select * into pl from public.players where id = p_player for update;
  if pl.id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if pl.profile_id = p_profile and pl.profile_status = 'confirmed' then
    return jsonb_build_object('ok', true, 'playerId', pl.id, 'tournamentId', pl.tournament_id);
  end if;
  if pl.profile_status = 'confirmed' then
    return jsonb_build_object('ok', false, 'reason', 'taken');
  end if;
  select * into other from public.players where tournament_id = pl.tournament_id and profile_id = p_profile and id <> pl.id for update;
  if other.id is not null then
    if other.profile_status = 'confirmed' then
      return jsonb_build_object('ok', false, 'reason', 'already_linked', 'playerId', other.id);
    end if;
    update public.players set profile_id = null where id = other.id;
  end if;
  update public.players set profile_id = p_profile, profile_status = 'confirmed' where id = pl.id;
  update public.device_sessions set player_id = pl.id, created_at = now()
  where auth_user_id = p_profile and tournament_id = pl.tournament_id and player_id <> pl.id;
  return jsonb_build_object('ok', true, 'playerId', pl.id, 'tournamentId', pl.tournament_id);
end;
$$;
revoke execute on function public.confirm_link(uuid, uuid) from public, anon, authenticated;

/** "Soy yo": needs a pending link to me, or this device's PIN claim on the player. */
create or replace function public.link_my_profile(p_player_id uuid)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  pl public.players;
begin
  if not public.is_account_user(auth.uid()) then
    raise exception 'Primero guarda tu perfil con tu correo o con Google' using errcode = '42501';
  end if;
  perform public.ensure_my_profile();
  select * into pl from public.players where id = p_player_id;
  if pl.id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  -- coalesce: an unlinked player compares as null, and `not (null or false)` would let anyone through.
  if not (
    coalesce(pl.profile_id = auth.uid() and pl.profile_status = 'pending', false)
    or exists (select 1 from public.device_sessions d where d.auth_user_id = auth.uid() and d.player_id = pl.id)
  ) then
    return jsonb_build_object('ok', false, 'reason', 'not_yours');
  end if;
  return public.confirm_link(auth.uid(), pl.id);
end;
$$;

/** "No soy yo" / unlink: drops my link (pending or confirmed) from a player. */
create or replace function public.unlink_my_profile(p_player_id uuid)
returns boolean
language plpgsql security definer
set search_path = public
as $$
begin
  update public.players set profile_id = null where id = p_player_id and profile_id = auth.uid();
  return found;
end;
$$;

/** The Comité proposes a profile for a player (pending until the person confirms; their own profile confirms at once). */
create or replace function public.comite_link_profile(p_player_id uuid, p_handle text)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  pl public.players;
  pr public.profiles;
begin
  select * into pl from public.players where id = p_player_id for update;
  if pl.id is null or not public.is_tournament_organizer(pl.tournament_id) then
    raise exception 'Solo el Comité amarra perfiles' using errcode = '42501';
  end if;
  select * into pr from public.profiles where handle = lower(btrim(coalesce(p_handle, '')));
  if pr.id is null or not (pr.discoverable or public.profile_visible_to_me(pr.id)) then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if pl.profile_id = pr.id then
    return jsonb_build_object('ok', true, 'status', pl.profile_status);
  end if;
  if pl.profile_status = 'confirmed' then
    return jsonb_build_object('ok', false, 'reason', 'taken');
  end if;
  if exists (select 1 from public.players where tournament_id = pl.tournament_id and profile_id = pr.id) then
    return jsonb_build_object('ok', false, 'reason', 'already_linked');
  end if;
  if pr.id = auth.uid() then
    return public.confirm_link(pr.id, pl.id) || jsonb_build_object('status', 'confirmed');
  end if;
  update public.players set profile_id = pr.id, profile_status = 'pending' where id = pl.id;
  return jsonb_build_object('ok', true, 'status', 'pending');
end;
$$;

create or replace function public.comite_unlink_profile(p_player_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  tid uuid;
begin
  tid := public.player_tournament_id(p_player_id);
  if tid is null or not public.is_tournament_organizer(tid) then
    raise exception 'Solo el Comité amarra perfiles' using errcode = '42501';
  end if;
  update public.players set profile_id = null where id = p_player_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Link tokens: carry a device's PIN claim across a sign-in to an existing account
-- ---------------------------------------------------------------------------
create table public.profile_link_tokens (
  token_hash text primary key,
  created_by uuid not null,
  player_id uuid not null references public.players (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by uuid
);
alter table public.profile_link_tokens enable row level security;
revoke all on public.profile_link_tokens from anon, authenticated;

/** Before signing in to an existing account: a one-use token for the player this device holds. */
create or replace function public.create_link_token()
returns text
language plpgsql security definer
set search_path = public
as $$
declare
  d public.device_sessions;
  tok text;
begin
  select * into d from public.device_sessions where auth_user_id = auth.uid();
  if d.player_id is null then
    raise exception 'Este teléfono todavía no entra como jugador' using errcode = '22023';
  end if;
  delete from public.profile_link_tokens where expires_at < now() - interval '1 day';
  tok := encode(extensions.gen_random_bytes(24), 'hex');
  insert into public.profile_link_tokens (token_hash, created_by, player_id, expires_at)
  values (encode(extensions.digest(tok, 'sha256'), 'hex'), auth.uid(), d.player_id, now() + interval '15 minutes');
  return tok;
end;
$$;

/** After signing in: links the token's player to this account (confirmed). */
create or replace function public.redeem_link_token(p_token text)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  tk public.profile_link_tokens;
begin
  if not public.is_account_user(auth.uid()) then
    raise exception 'Primero entra con tu correo o con Google' using errcode = '42501';
  end if;
  select * into tk from public.profile_link_tokens
  where token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
  for update;
  if tk.token_hash is null or tk.used_at is not null or tk.expires_at < now() then
    return jsonb_build_object('ok', false, 'reason', 'expired');
  end if;
  update public.profile_link_tokens set used_at = now(), used_by = auth.uid() where token_hash = tk.token_hash;
  perform public.ensure_my_profile();
  return public.confirm_link(auth.uid(), tk.player_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Storage: profiles/<uid>/… belongs to that account
-- ---------------------------------------------------------------------------
drop policy if exists assets_member_write on storage.objects;
create policy assets_member_write on storage.objects for insert to authenticated
  with check (
    bucket_id = 'tournament-assets' and auth.uid() is not null and (
      (split_part(name, '/', 1) = 'courses' and public.can_manage_courses())
      or (split_part(name, '/', 1) = 'profiles' and split_part(name, '/', 2) = auth.uid()::text and public.is_account_user(auth.uid()))
      or public.is_tournament_member(public.try_uuid(split_part(name, '/', 1)))
    )
  );

drop policy if exists assets_organizer_update on storage.objects;
create policy assets_organizer_update on storage.objects for update to authenticated
  using (
    bucket_id = 'tournament-assets' and auth.uid() is not null and (
      (split_part(name, '/', 1) = 'courses' and public.can_manage_courses())
      or (split_part(name, '/', 1) = 'profiles' and split_part(name, '/', 2) = auth.uid()::text and public.is_account_user(auth.uid()))
      or public.is_tournament_organizer(public.try_uuid(split_part(name, '/', 1)))
    )
  );

drop policy if exists assets_organizer_delete on storage.objects;
create policy assets_organizer_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'tournament-assets' and auth.uid() is not null and (
      (split_part(name, '/', 1) = 'courses' and public.can_manage_courses())
      or (split_part(name, '/', 1) = 'profiles' and split_part(name, '/', 2) = auth.uid()::text and public.is_account_user(auth.uid()))
      or public.is_tournament_organizer(public.try_uuid(split_part(name, '/', 1)))
    )
  );
