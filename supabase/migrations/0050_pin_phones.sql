-- 0050: the phones that hold each player's PIN (TRUST-24).
--
-- The dispute trail named the PIN, not the phone. Any phone that typed a
-- player's PIN became him without a word, and Comité › Historial showed what
-- it wrote as his: «yo no puse ese 9» had nothing to stand on. Now:
--   * each claim is kept (`pin_claims`): which phone (its anonymous user),
--     what kind (iPhone, Android, computer), since when and until when;
--   * claims show in the history, as every audited row does;
--   * the history says from which of a player's phones each change came,
--     once he has had more than one («teléfono 2 de 2»);
--   * the Comité sees the phones holding each player and can take one off.
--
-- A phone here is an anonymous user. On an iPhone, Safari and the app on the
-- home screen are two of them, so two phones are often one person: the words
-- number the phones and never say someone else wrote.
--
-- Release order: this reaches production before the bundle that reads it
-- (the nightly backup copies `pin_claims` and fails on a missing table).

set local lock_timeout = '10s';

-- The kind of phone that sent this request, read from its user agent, in the words of device_status (0037).
-- An iPad that asks for the desktop site reads as a computer.
create or replace function public.request_platform()
returns text
language plpgsql stable
set search_path = public
as $$
declare
  ua text;
begin
  begin
    ua := coalesce(nullif(current_setting('request.headers', true), '')::json ->> 'user-agent', '');
  exception when others then
    ua := '';
  end;
  return case
    when ua ~* '(iphone|ipod|ipad)' then 'ios'
    when ua ~* 'android' then 'android'
    when ua ~* '(macintosh|windows|linux|cros|x11)' then 'desktop'
    else 'other'
  end;
end;
$$;
revoke execute on function public.request_platform() from public, anon, authenticated;

create table public.pin_claims (
  id bigint generated always as identity primary key,
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  auth_user_id uuid not null references auth.users (id) on delete cascade,
  platform text not null default 'other' check (platform in ('ios', 'android', 'desktop', 'other')),
  claimed_at timestamptz not null default now(),
  released_at timestamptz,
  -- The Comité's account when it took the phone off; null when the phone let go by itself.
  released_by uuid references auth.users (id) on delete set null,
  check (released_at is null or released_at >= claimed_at),
  check (released_by is null or released_at is not null)
);
comment on table public.pin_claims is
  'Each time a phone took a player with his PIN, and when it let go or the Comité took it off (TRUST-24). Written only by claim_player, release_device and release_pin_claim; read only through tournament_audit and player_phones.';
-- One open claim per player and phone: the same phone typing the PIN again keeps its first.
create unique index pin_claims_open_uk on public.pin_claims (player_id, auth_user_id) where released_at is null;
create index pin_claims_tournament_idx on public.pin_claims (tournament_id, player_id, claimed_at);
create index pin_claims_player_idx on public.pin_claims (player_id);
create index pin_claims_user_idx on public.pin_claims (auth_user_id);
create index pin_claims_released_by_idx on public.pin_claims (released_by);
alter table public.pin_claims enable row level security;
-- No policies and no client grants: nobody but the definer functions below.
revoke all on public.pin_claims from public, anon, authenticated;

-- The claims standing now, as they began: the phone's kind from its last heartbeat when it sent one.
-- Before the audit trigger, so the history does not show them all as entering today.
insert into public.pin_claims (tournament_id, player_id, auth_user_id, platform, claimed_at)
select d.tournament_id, d.player_id, d.auth_user_id,
  coalesce((
    select ds.platform from public.device_status ds
    where ds.auth_user_id = d.auth_user_id and ds.platform in ('ios', 'android', 'desktop')
    order by ds.last_seen_at desc limit 1
  ), 'other'),
  d.created_at
from public.device_sessions d
join public.players p on p.id = d.player_id and p.tournament_id = d.tournament_id;

create trigger pin_claims_audit after insert or update or delete on public.pin_claims
  for each row execute function public.audit_row();

-- 0013's claim_player, and the claim kept: the phone lets go of the player it held, and this one's claim
-- begins (a phone that types the same PIN again keeps the one it has).
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

-- «Cambiar de jugador», «No soy yo»: the phone lets go of its player, and its claim ends.
create or replace function public.release_device()
returns void
language sql volatile security definer
set search_path = public
as $$
  update public.pin_claims set released_at = now() where auth_user_id = auth.uid() and released_at is null;
  delete from public.device_sessions where auth_user_id = auth.uid();
$$;

-- Each phone that ever held a player in the tournament, in the order it first took him: what «teléfono 2 de 3» counts.
-- Internal: only the definer functions below call it, as the owner.
create or replace function public.tournament_phones(p_tournament_id uuid)
returns table (player_id uuid, auth_user_id uuid, n bigint, total bigint, platform text)
language sql stable
set search_path = public
as $$
  select c.player_id, c.auth_user_id,
    row_number() over (partition by c.player_id order by min(c.claimed_at), min(c.id)),
    count(*) over (partition by c.player_id),
    (array_agg(c.platform order by c.claimed_at desc, c.id desc))[1]
  from public.pin_claims c
  where c.tournament_id = p_tournament_id
  group by c.player_id, c.auth_user_id
$$;
revoke execute on function public.tournament_phones(uuid) from public, anon, authenticated;

-- 0022's history, and from which phone: once the player has had more than one, each change he made says which
-- (never for a change made from his own account). Account ids leave the images too: the Comité never sees one.
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
      'phone', case when not a.actor_platform and ph.total > 1 then jsonb_build_object('n', ph.n, 'of', ph.total, 'kind', ph.platform) end,
      'reason', a.reason,
      'before', a.before - array['pin_hash', 'token_hash', 'p256dh', 'auth', 'endpoint', 'auth_user_id', 'released_by'],
      'after', a.after - array['pin_hash', 'token_hash', 'p256dh', 'auth', 'endpoint', 'auth_user_id', 'released_by']
    ) order by a.id desc)
    from (
      select * from public.audit_log
      where tournament_id = p_tournament_id and (p_before is null or id < p_before)
      order by id desc
      limit least(greatest(coalesce(p_limit, 50), 1), 200)
    ) a
    left join public.players pl on pl.id = a.actor_player_id
    left join public.profiles pr on pr.id = a.actor_auth_user_id
    left join public.tournament_phones(p_tournament_id) ph on ph.player_id = a.actor_player_id and ph.auth_user_id = a.actor_auth_user_id
  ), '[]'::jsonb);
end;
$$;
revoke execute on function public.tournament_audit(uuid, bigint, int) from public, anon;
grant execute on function public.tournament_audit(uuid, bigint, int) to authenticated, service_role;

-- The phones holding each player now, for the Comité: what kind, since when, and its number among his phones.
-- Never an account id: the claim's own id is what «Sacar» sends.
create or replace function public.player_phones(p_tournament_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
begin
  if not public.is_tournament_organizer(p_tournament_id) then
    raise exception 'Solo el Comité ve los teléfonos de cada jugador' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', c.id, 'playerId', c.player_id, 'kind', c.platform, 'since', c.claimed_at, 'n', ph.n, 'of', ph.total)
      order by c.player_id, ph.n)
    from public.pin_claims c
    join public.tournament_phones(p_tournament_id) ph on ph.player_id = c.player_id and ph.auth_user_id = c.auth_user_id
    where c.tournament_id = p_tournament_id and c.released_at is null
  ), '[]'::jsonb);
end;
$$;
revoke execute on function public.player_phones(uuid) from public, anon;
grant execute on function public.player_phones(uuid) to authenticated, service_role;

-- The Comité takes a phone off a player, with its reason: that phone has to type the PIN again (and a new PIN
-- keeps it out). What it had waiting to send waits for that PIN (REL-16).
create or replace function public.release_pin_claim(p_claim_id bigint, p_reason text)
returns void
language plpgsql volatile security definer
set search_path = public
as $$
declare
  c public.pin_claims;
  v_reason text := public.trim_reason(p_reason);
begin
  select * into c from public.pin_claims where id = p_claim_id for update;
  if c.id is null or not public.is_tournament_organizer(c.tournament_id) then
    raise exception 'Solo el Comité quita un teléfono' using errcode = '42501';
  end if;
  if char_length(v_reason) < 3 then
    raise exception 'Escribe el motivo, al menos 3 letras' using errcode = '22023';
  end if;
  if char_length(v_reason) > 200 then
    raise exception 'El motivo es muy largo: 200 letras como máximo' using errcode = '22023';
  end if;
  if c.released_at is not null then
    raise exception 'Ese teléfono ya no entra como ese jugador' using errcode = '22023';
  end if;
  perform set_config('cardi.reason', v_reason, true);
  update public.pin_claims set released_at = now(), released_by = auth.uid() where id = c.id;
  perform set_config('cardi.reason', '', true);
  delete from public.device_sessions where auth_user_id = c.auth_user_id and player_id = c.player_id;
end;
$$;
revoke execute on function public.release_pin_claim(bigint, text) from public, anon;
grant execute on function public.release_pin_claim(bigint, text) to authenticated, service_role;
