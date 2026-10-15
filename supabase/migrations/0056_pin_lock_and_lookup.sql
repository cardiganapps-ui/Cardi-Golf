-- 0056: a stranger can't lock a player out of his PIN (SEC-04), and the faces before a PIN carry short names only (SEC-06).
--
-- SEC-04. claim_player locks a phone after 5 wrong PINs (5 minutes) and a player after 15 from any phones (15
-- minutes). Anyone with the link could start a few anonymous users, spend their 5 each on one player, and keep
-- him out of Entrar on the day. The player-wide lock now stops only phones that never held him: a phone with a
-- claim on this player (pin_claims, 0050) that the Comité did not take off gets in with the right PIN whatever
-- strangers tried, and its own wrong PINs count only on its device. A new phone still meets the player-wide
-- lock, which is what slows a guess spread over many users. The answer says which lock it is (`scope`
-- 'device' | 'player'), the Comité sees a locked player (`pin_locks`) and can clear it without changing the
-- PIN (`unlock_player_pin`, audited through the history as a «PIN desbloqueado» line).
--
-- SEC-06. lookup_tournament (0040's body) answered every player's full name to anyone with the link or the
-- code. The face grid needs the short name and the photo (the privacy notice says those are what the link
-- shows); the full name now comes back only to a member of the tournament, like the join code.

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
  known boolean;
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
    return jsonb_build_object('ok', false, 'reason', 'locked', 'scope', 'device', 'lockedUntil', dev.locked_until);
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
  -- A phone that has held this player (and the Comité did not take off) is his: strangers' failures never
  -- lock it out, and its own count only on its device.
  known := exists (select 1 from public.pin_claims c where c.player_id = pl.id and c.auth_user_id = auth.uid() and c.released_by is null);
  select * into pp from public.player_pins where player_id = p_player_id for update;
  if pp.player_id is null then
    return jsonb_build_object('ok', false, 'reason', 'no_pin');
  end if;
  if pp.locked_until is not null and pp.locked_until <= now() then
    update public.player_pins set failed_attempts = 0, locked_until = null where player_id = p_player_id;
    pp.failed_attempts := 0;
    pp.locked_until := null;
  end if;
  if not known and pp.locked_until is not null and pp.locked_until > now() then
    return jsonb_build_object('ok', false, 'reason', 'locked', 'scope', 'player', 'lockedUntil', pp.locked_until);
  end if;

  if pp.pin_hash = crypt(p_pin, pp.pin_hash) then
    -- His own phone getting in leaves the strangers' count as it is: it would hand them fifteen more.
    if not known then
      update public.player_pins set failed_attempts = 0, locked_until = null where player_id = p_player_id;
    end if;
    update public.pin_attempts set failed_attempts = 0, locked_until = null, updated_at = now() where auth_user_id = auth.uid();
    insert into public.device_sessions (auth_user_id, player_id, tournament_id)
    values (auth.uid(), pl.id, pl.tournament_id)
    on conflict (auth_user_id) do update set player_id = excluded.player_id, tournament_id = excluded.tournament_id, created_at = now();
    update public.pin_claims set released_at = now()
    where auth_user_id = auth.uid() and released_at is null and player_id <> pl.id;
    insert into public.pin_claims (tournament_id, player_id, auth_user_id, platform)
    values (pl.tournament_id, pl.id, auth.uid(), public.request_platform())
    on conflict (player_id, auth_user_id) where released_at is null do nothing;
    return jsonb_build_object('ok', true, 'playerId', pl.id, 'tournamentId', pl.tournament_id);
  end if;

  update public.pin_attempts
  set failed_attempts = dev.failed_attempts + 1,
      locked_until = case when dev.failed_attempts + 1 >= dev_max then now() + dev_lock end,
      updated_at = now()
  where auth_user_id = auth.uid();
  if known then
    if dev.failed_attempts + 1 >= dev_max then
      return jsonb_build_object('ok', false, 'reason', 'locked', 'scope', 'device', 'lockedUntil', now() + dev_lock);
    end if;
    return jsonb_build_object('ok', false, 'reason', 'wrong_pin', 'attemptsLeft', dev_max - (dev.failed_attempts + 1));
  end if;
  update public.player_pins
  set failed_attempts = pp.failed_attempts + 1,
      locked_until = case when pp.failed_attempts + 1 >= pl_max then now() + pl_lock end
  where player_id = p_player_id;
  if pp.failed_attempts + 1 >= pl_max then
    return jsonb_build_object('ok', false, 'reason', 'locked', 'scope', 'player', 'lockedUntil', now() + pl_lock);
  end if;
  if dev.failed_attempts + 1 >= dev_max then
    return jsonb_build_object('ok', false, 'reason', 'locked', 'scope', 'device', 'lockedUntil', now() + dev_lock);
  end if;
  return jsonb_build_object('ok', false, 'reason', 'wrong_pin', 'attemptsLeft', least(dev_max - (dev.failed_attempts + 1), pl_max - (pp.failed_attempts + 1)));
end;
$$;

create or replace function public.lookup_tournament(p_code text)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  t public.tournaments;
  me uuid;
  member boolean;
begin
  select * into t from public.tournaments
  where join_code = upper(trim(p_code)) or slug = lower(trim(p_code))
  limit 1;
  if t.id is null then
    return null;
  end if;
  me := public.my_player_id(t.id);
  member := public.is_tournament_member(t.id);
  return jsonb_build_object(
    'id', t.id,
    'slug', t.slug,
    'name', t.name,
    'tagline', t.tagline,
    'logoUrl', t.logo_url,
    'accentColor', t.accent_color,
    'status', t.status,
    'joinCode', case when member then t.join_code end,
    'players', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'displayName', p.display_name, 'fullName', case when member then p.full_name end,
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
grant execute on function public.lookup_tournament(text) to anon, authenticated;

-- The players a stranger's guesses have locked (or are close to), for the Comité: who, how many wrong PINs
-- from phones that never held him, and until when new phones wait. Never the PIN or its hash.
create or replace function public.pin_locks(p_tournament_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
begin
  if not public.is_tournament_organizer(p_tournament_id) then
    raise exception 'Solo el Comité ve los PIN bloqueados' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('playerId', pp.player_id, 'failed', pp.failed_attempts, 'lockedUntil', pp.locked_until)
      order by pp.player_id)
    from public.player_pins pp
    join public.players p on p.id = pp.player_id
    where p.tournament_id = p_tournament_id and pp.locked_until > now()
  ), '[]'::jsonb);
end;
$$;
revoke execute on function public.pin_locks(uuid) from public, anon;
grant execute on function public.pin_locks(uuid) to authenticated, service_role;

-- The Comité opens a player's PIN to new phones again, the PIN unchanged. The history says so (an audit row
-- on the player, under its tournament, with no image of the PIN).
create or replace function public.unlock_player_pin(p_player_id uuid)
returns void
language plpgsql volatile security definer
set search_path = public
as $$
declare
  pl public.players;
begin
  select * into pl from public.players where id = p_player_id;
  if pl.id is null or not public.is_tournament_organizer(pl.tournament_id) then
    raise exception 'Solo el Comité desbloquea un PIN' using errcode = '42501';
  end if;
  update public.player_pins set failed_attempts = 0, locked_until = null where player_id = p_player_id and locked_until is not null;
  if found then
    insert into public.audit_log (tournament_id, table_name, row_id, actor_player_id, actor_auth_user_id, action, before, after, reason)
    values (pl.tournament_id, 'player_pins', pl.id, public.my_player_id(pl.tournament_id), auth.uid(), 'UPDATE',
      jsonb_build_object('player_id', pl.id, 'locked', true), jsonb_build_object('player_id', pl.id, 'locked', false), 'PIN desbloqueado');
  end if;
end;
$$;
revoke execute on function public.unlock_player_pin(uuid) from public, anon;
grant execute on function public.unlock_player_pin(uuid) to authenticated, service_role;
