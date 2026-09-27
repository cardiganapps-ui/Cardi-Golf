-- Cardi-Golf · 0002 · helpers, RPCs, triggers
-- `current_player_id()` and `is_tournament_organizer()` power every policy.

-- ---------------------------------------------------------------------------
-- Helpers (stable, security definer, search_path pinned)
-- ---------------------------------------------------------------------------
create or replace function public.current_player_id()
returns uuid
language sql stable security definer
set search_path = public
as $$
  select player_id from public.device_sessions where auth_user_id = auth.uid()
$$;

create or replace function public.current_tournament_id()
returns uuid
language sql stable security definer
set search_path = public
as $$
  select tournament_id from public.device_sessions where auth_user_id = auth.uid()
$$;

-- Organizer of the tournament (email account) OR a linked player flagged is_admin.
create or replace function public.is_tournament_organizer(tid uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select
    exists (select 1 from public.tournament_organizers o where o.tournament_id = tid and o.auth_user_id = auth.uid())
    or exists (
      select 1 from public.device_sessions d
      join public.players p on p.id = d.player_id
      where d.auth_user_id = auth.uid() and p.tournament_id = tid and p.is_admin
    )
$$;

-- Anyone linked to the tournament: organizer, admin player, or claimed player.
create or replace function public.is_tournament_member(tid uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select
    public.is_tournament_organizer(tid)
    or exists (select 1 from public.device_sessions d where d.auth_user_id = auth.uid() and d.tournament_id = tid)
$$;

create or replace function public.round_tournament_id(rid uuid)
returns uuid
language sql stable security definer
set search_path = public
as $$
  select tournament_id from public.rounds where id = rid
$$;

create or replace function public.group_tournament_id(gid uuid)
returns uuid
language sql stable security definer
set search_path = public
as $$
  select r.tournament_id from public.groups g join public.rounds r on r.id = g.round_id where g.id = gid
$$;

create or replace function public.player_tournament_id(pid uuid)
returns uuid
language sql stable security definer
set search_path = public
as $$
  select tournament_id from public.players where id = pid
$$;

create or replace function public.lot_tournament_id(lid uuid)
returns uuid
language sql stable security definer
set search_path = public
as $$
  select tournament_id from public.calcutta_lots where id = lid
$$;

-- The current player is in the group that plays `rid` with `pid`.
create or replace function public.shares_group(rid uuid, pid uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.groups g
    join public.group_members me on me.group_id = g.id and me.player_id = public.current_player_id()
    join public.group_members other on other.group_id = g.id and other.player_id = pid
    where g.round_id = rid
  )
$$;

create or replace function public.round_is_live(rid uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from public.rounds where id = rid and status = 'live')
$$;

-- The player's pair card for that round is signed (locked).
create or replace function public.card_is_signed(rid uuid, pid uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.card_signatures s
    join public.pairs p on p.id = s.pair_id
    where s.round_id = rid and (p.player1_id = pid or p.player2_id = pid)
  )
$$;

-- Courses are shared read-only across organizers; only the creator (or an
-- organizer of a tournament using it) edits.
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
$$;

-- ---------------------------------------------------------------------------
-- Join codes and slugs
-- ---------------------------------------------------------------------------
create or replace function public.generate_join_code()
returns text
language plpgsql volatile
set search_path = public
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- no 0/O/1/I
  code text;
begin
  loop
    code := '';
    for i in 1..6 loop
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.tournaments where join_code = code);
  end loop;
  return code;
end;
$$;

create or replace function public.slugify(input text)
returns text
language sql immutable
as $$
  select trim(both '-' from regexp_replace(
    translate(lower(input), 'áéíóúüñ', 'aeiouun'),
    '[^a-z0-9]+', '-', 'g'))
$$;

-- ---------------------------------------------------------------------------
-- RPC: organizer creates a tournament (owner row + organizers upsert)
-- ---------------------------------------------------------------------------
create or replace function public.create_tournament(p_name text, p_settings jsonb, p_slug text default null, p_tagline text default null)
returns public.tournaments
language plpgsql volatile security definer
set search_path = public
as $$
declare
  t public.tournaments;
  base_slug text;
  final_slug text;
  n int := 0;
begin
  if auth.uid() is null or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'Solo un organizador con cuenta puede crear torneos' using errcode = '42501';
  end if;
  insert into public.organizers (auth_user_id, display_name)
  values (auth.uid(), coalesce(auth.jwt() -> 'user_metadata' ->> 'display_name', auth.jwt() ->> 'email'))
  on conflict (auth_user_id) do nothing;

  base_slug := coalesce(nullif(public.slugify(p_slug), ''), nullif(public.slugify(p_name), ''), 'torneo');
  base_slug := left(base_slug, 32);
  final_slug := base_slug;
  while exists (select 1 from public.tournaments where slug = final_slug) loop
    n := n + 1;
    final_slug := base_slug || '-' || n;
  end loop;

  insert into public.tournaments (slug, name, tagline, join_code, settings, created_by)
  values (final_slug, p_name, p_tagline, public.generate_join_code(), p_settings, auth.uid())
  returning * into t;

  insert into public.tournament_organizers (tournament_id, auth_user_id, role) values (t.id, auth.uid(), 'owner');
  return t;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: public lookup for the Entrar screen (by join code or slug). No auth needed
-- beyond a session; returns only what the face grid shows.
-- ---------------------------------------------------------------------------
create or replace function public.lookup_tournament(p_code text)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  t public.tournaments;
begin
  select * into t from public.tournaments
  where join_code = upper(trim(p_code)) or slug = lower(trim(p_code))
  limit 1;
  if t.id is null then
    return null;
  end if;
  return jsonb_build_object(
    'id', t.id,
    'slug', t.slug,
    'name', t.name,
    'tagline', t.tagline,
    'logoUrl', t.logo_url,
    'accentColor', t.accent_color,
    'status', t.status,
    'joinCode', t.join_code,
    'players', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'displayName', p.display_name, 'fullName', p.full_name,
        'tier', p.tier, 'avatarUrl', p.avatar_url, 'isHonoree', p.is_honoree,
        'hasPin', exists (select 1 from public.player_pins pp where pp.player_id = p.id)
      ) order by p.sort_order, p.display_name)
      from public.players p where p.tournament_id = t.id
    ), '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: set / reset a PIN (organizer only)
-- ---------------------------------------------------------------------------
create or replace function public.set_player_pin(p_player_id uuid, p_pin text)
returns void
language plpgsql volatile security definer
set search_path = public, extensions
as $$
declare
  tid uuid;
begin
  select tournament_id into tid from public.players where id = p_player_id;
  if tid is null or not public.is_tournament_organizer(tid) then
    raise exception 'Solo el Comité puede cambiar PINs' using errcode = '42501';
  end if;
  if p_pin !~ '^[0-9]{4}$' then
    raise exception 'El PIN son 4 dígitos' using errcode = '22023';
  end if;
  insert into public.player_pins (player_id, pin_hash, failed_attempts, locked_until, updated_at)
  values (p_player_id, crypt(p_pin, gen_salt('bf', 8)), 0, null, now())
  on conflict (player_id) do update
    set pin_hash = excluded.pin_hash, failed_attempts = 0, locked_until = null, updated_at = now();
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: claim a player with a PIN. 5 failures → locked 5 minutes.
-- Returns {ok, reason?, lockedUntil?, tournamentId?, playerId?}
-- ---------------------------------------------------------------------------
create or replace function public.claim_player(p_player_id uuid, p_pin text)
returns jsonb
language plpgsql volatile security definer
set search_path = public, extensions
as $$
declare
  pp public.player_pins;
  pl public.players;
begin
  if auth.uid() is null then
    raise exception 'Sin sesión' using errcode = '42501';
  end if;
  select * into pl from public.players where id = p_player_id;
  if pl.id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  select * into pp from public.player_pins where player_id = p_player_id for update;
  if pp.player_id is null then
    return jsonb_build_object('ok', false, 'reason', 'no_pin');
  end if;
  if pp.locked_until is not null and pp.locked_until > now() then
    return jsonb_build_object('ok', false, 'reason', 'locked', 'lockedUntil', pp.locked_until);
  end if;
  if pp.pin_hash = crypt(p_pin, pp.pin_hash) then
    update public.player_pins set failed_attempts = 0, locked_until = null where player_id = p_player_id;
    insert into public.device_sessions (auth_user_id, player_id, tournament_id)
    values (auth.uid(), pl.id, pl.tournament_id)
    on conflict (auth_user_id) do update set player_id = excluded.player_id, tournament_id = excluded.tournament_id, created_at = now();
    return jsonb_build_object('ok', true, 'playerId', pl.id, 'tournamentId', pl.tournament_id);
  end if;
  update public.player_pins
  set failed_attempts = pp.failed_attempts + 1,
      locked_until = case when pp.failed_attempts + 1 >= 5 then now() + interval '5 minutes' else null end
  where player_id = p_player_id;
  if pp.failed_attempts + 1 >= 5 then
    return jsonb_build_object('ok', false, 'reason', 'locked', 'lockedUntil', now() + interval '5 minutes');
  end if;
  return jsonb_build_object('ok', false, 'reason', 'wrong_pin', 'attemptsLeft', 5 - (pp.failed_attempts + 1));
end;
$$;

-- Unlink this device from its player.
create or replace function public.release_device()
returns void
language sql volatile security definer
set search_path = public
as $$
  delete from public.device_sessions where auth_user_id = auth.uid()
$$;

-- ---------------------------------------------------------------------------
-- RPC: which players in the tournament already have a PIN (organizer view)
-- ---------------------------------------------------------------------------
create or replace function public.players_with_pin(p_tournament_id uuid)
returns setof uuid
language sql stable security definer
set search_path = public
as $$
  select pp.player_id from public.player_pins pp
  join public.players p on p.id = pp.player_id
  where p.tournament_id = p_tournament_id and public.is_tournament_organizer(p_tournament_id)
$$;

-- ---------------------------------------------------------------------------
-- RPC: duplicate a tournament (settings, course refs, players; no scores)
-- ---------------------------------------------------------------------------
create or replace function public.duplicate_tournament(p_source_id uuid, p_name text)
returns public.tournaments
language plpgsql volatile security definer
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
  insert into public.players (tournament_id, full_name, display_name, tier, base_hcp, handicap_source, handicap_index, estimate_inputs, default_tee_id, is_honoree, is_admin, avatar_url, form_guide, sort_order)
  select t.id, full_name, display_name, tier, base_hcp, handicap_source, handicap_index, estimate_inputs, default_tee_id, is_honoree, is_admin, avatar_url, form_guide, sort_order
  from public.players where tournament_id = src.id;
  insert into public.rounds (tournament_id, number, date, course_id, holes, status)
  select t.id, number, date, course_id, holes, 'scheduled' from public.rounds where tournament_id = src.id;
  select * into t from public.tournaments where id = t.id;
  return t;
end;
$$;

-- ---------------------------------------------------------------------------
-- Triggers: updated_at, audit log
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger scores_touch before update on public.scores
  for each row execute function public.touch_updated_at();

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
  rid := coalesce(rec ->> 'id', rec ->> 'round_id' || ':' || coalesce(rec ->> 'player_id', rec ->> 'group_id', rec ->> 'pair_id', ''));
  tid := case
    when rec ? 'tournament_id' then (rec ->> 'tournament_id')::uuid
    when rec ? 'round_id' then public.round_tournament_id((rec ->> 'round_id')::uuid)
    when rec ? 'group_id' then public.group_tournament_id((rec ->> 'group_id')::uuid)
    when rec ? 'lot_id' then public.lot_tournament_id((rec ->> 'lot_id')::uuid)
    else null
  end;
  insert into public.audit_log (tournament_id, table_name, row_id, actor_auth_user_id, actor_player_id, action, before, after, reason)
  values (
    tid, tg_table_name, rid, auth.uid(), public.current_player_id(), tg_op,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end,
    case when tg_op in ('INSERT', 'UPDATE') then rec ->> 'reason' end
  );
  return coalesce(new, old);
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['scores', 'handicap_overrides', 'players', 'pairs', 'groups', 'group_members', 'round_tees', 'rounds',
                           'calcutta_lots', 'calcutta_bids', 'calcutta_buybacks', 'payments', 'snake_tiebreaks', 'card_signatures', 'tournaments']
  loop
    execute format('create trigger %I_audit after insert or update or delete on public.%I for each row execute function public.audit_row()', t, t);
  end loop;
end;
$$;
