-- 0051: push for the players who enter with a PIN, on tournament days (PWA-10).
--
-- Push reached accounts only, and only for social events: a subscription
-- belonged to a profile (0019), and a notification was a profile's (0016).
-- The first tournament's twelve players enter with their face and a PIN, on
-- anonymous phones, so none of them could get a single notice on the trip.
-- Now:
--   * a PIN phone can turn on the notices of the player it holds
--     (`pin_push_subscriptions`, written by save_pin_push), and the address
--     goes as soon as the phone stops holding him: «Cambiar de jugador»,
--     another player's PIN, the Comité taking it off, the player or the
--     account deleted. A trigger on device_sessions sees every one of them;
--   * a tournament tells its players four things, each once
--     (`player_notices`, unique per player and key), never an amount:
--     a day goes live (to its players), a card is ready to sign (to the
--     players who sign it, when the pairs game signs cards), a snake
--     tiebreak the group went on from without answering (to the group), and
--     the results (to every player: until now only linked profiles heard
--     them). A player whose profile is his hears it in his account's inbox
--     as well (notify, 0016), and on its phones;
--   * the phone that caused it is not told: it is the one on screen.
--
-- The way out is 0019's: each notice row posts one pg_net request to
-- /api/push-dispatch with the player's phones, the route signs and sends
-- them, and dead addresses come back through push_prune, which now clears
-- them here too. No scheduler: a reminder before a tee time needs pg_cron,
-- which production has not been checked for.
--
-- A notice is never worth a hole: what raises it is caught, the write it
-- rode on stands. A restore brings back what was, not news, so its writes
-- (rounds, holes, signatures) are under `cardi.restore` and tell nobody.
--
-- Release order: this reaches production before the bundle that calls
-- save_pin_push (and the nightly backup copies both tables). After it,
-- scripts/push-check.mjs runs the PIN chain end to end.

set local lock_timeout = '10s';

-- ---------------------------------------------------------------------------
-- 1. A PIN phone's address, for the player it holds
-- ---------------------------------------------------------------------------
create table public.pin_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  auth_user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
comment on table public.pin_push_subscriptions is
  'The push address of a phone that entered with a PIN, for the player it holds (PWA-10). Written only by save_pin_push; gone when the phone stops holding him (device_sessions_drop_push), or when the push service says it is dead (push_prune).';
create index pin_push_subscriptions_player_idx on public.pin_push_subscriptions (player_id);
create index pin_push_subscriptions_tournament_idx on public.pin_push_subscriptions (tournament_id);
create index pin_push_subscriptions_user_idx on public.pin_push_subscriptions (auth_user_id);
alter table public.pin_push_subscriptions enable row level security;
-- No policies and no client grants: only the definer functions below.
revoke all on public.pin_push_subscriptions from public, anon, authenticated;

-- This phone turns on the notices of the player it holds in that tournament by PIN. The player is the
-- claim's, never one the phone names. An address moves to whoever saved it last, as 0019's do.
create or replace function public.save_pin_push(p_tournament_id uuid, p_endpoint text, p_p256dh text, p_auth text, p_user_agent text default null)
returns void
language plpgsql volatile security definer
set search_path = public
as $$
declare
  holds uuid;
begin
  select d.player_id into holds from public.device_sessions d
  where d.auth_user_id = auth.uid() and d.tournament_id = p_tournament_id;
  if auth.uid() is null or holds is null then
    raise exception 'Entra con tu PIN para recibir los avisos del torneo' using errcode = '42501';
  end if;
  if coalesce(p_endpoint, '') !~ '^https://' or coalesce(p_p256dh, '') = '' or coalesce(p_auth, '') = ''
     or length(p_endpoint) > 2048 or length(p_p256dh) > 256 or length(p_auth) > 256 then
    raise exception 'Suscripción inválida' using errcode = '22023';
  end if;
  insert into public.pin_push_subscriptions (tournament_id, player_id, auth_user_id, endpoint, p256dh, auth, user_agent)
  values (p_tournament_id, holds, auth.uid(), p_endpoint, p_p256dh, p_auth, left(p_user_agent, 200))
  on conflict (endpoint) do update
    set tournament_id = excluded.tournament_id, player_id = excluded.player_id, auth_user_id = excluded.auth_user_id,
        p256dh = excluded.p256dh, auth = excluded.auth, user_agent = excluded.user_agent, last_seen_at = now();
end;
$$;
revoke execute on function public.save_pin_push(uuid, text, text, text, text) from public, anon;
grant execute on function public.save_pin_push(uuid, text, text, text, text) to authenticated;

-- Whether this browser's address hears the player this phone holds in that tournament now (with no
-- tournament: in any, so turning the account's notices off never drops an address a PIN player still uses).
create or replace function public.pin_push_on(p_tournament_id uuid, p_endpoint text)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.pin_push_subscriptions s
    join public.device_sessions d on d.auth_user_id = s.auth_user_id and d.player_id = s.player_id and d.tournament_id = s.tournament_id
    where s.endpoint = p_endpoint and s.auth_user_id = auth.uid() and (p_tournament_id is null or s.tournament_id = p_tournament_id)
  )
$$;
revoke execute on function public.pin_push_on(uuid, text) from public, anon;
grant execute on function public.pin_push_on(uuid, text) to authenticated;

-- «Apagar en este teléfono».
create or replace function public.delete_pin_push(p_endpoint text)
returns void
language sql volatile security definer
set search_path = public
as $$
  delete from public.pin_push_subscriptions where endpoint = p_endpoint and auth_user_id = auth.uid()
$$;
revoke execute on function public.delete_pin_push(text) from public, anon;
grant execute on function public.delete_pin_push(text) to authenticated;

-- The phone stops holding the player, the address goes: release_device, claim_player of another player,
-- the Comité's release_pin_claim, redeem_link_token moving the claim, a player or an account deleted
-- (their cascades delete the claim). Whatever path changed the claim, this sees it.
create or replace function public.device_sessions_drop_push()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  delete from public.pin_push_subscriptions s
  where s.auth_user_id = old.auth_user_id
    and not exists (
      select 1 from public.device_sessions d
      where d.auth_user_id = s.auth_user_id and d.player_id = s.player_id and d.tournament_id = s.tournament_id
    );
  return null;
end;
$$;
revoke execute on function public.device_sessions_drop_push() from public, anon, authenticated;
create trigger device_sessions_drop_push after update or delete on public.device_sessions
  for each row execute function public.device_sessions_drop_push();

-- 0019's, and a PIN phone's dead address too.
create or replace function public.push_prune(p_secret text, p_endpoints text[])
returns int
language plpgsql volatile security definer
set search_path = public
as $$
declare
  s text := public.push_secret('push_dispatch_secret');
  n int;
  m int;
begin
  if s is null or p_secret is distinct from s then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  delete from public.push_subscriptions where endpoint = any (coalesce(p_endpoints, '{}'));
  get diagnostics n = row_count;
  delete from public.pin_push_subscriptions where endpoint = any (coalesce(p_endpoints, '{}'));
  get diagnostics m = row_count;
  return n + m;
end;
$$;
grant execute on function public.push_prune(text, text[]) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. The notices a tournament sends its players
-- ---------------------------------------------------------------------------
-- One row per player and event: what was said, once. `data` carries the tournament, the day, the group
-- and the hole, never a person's name and never an amount (an account's copy goes through notify()).
create table public.player_notices (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  kind text not null check (kind in ('round_live', 'card_to_sign', 'snake_tiebreak', 'results')),
  key text not null,
  data jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique (player_id, key)
);
comment on table public.player_notices is
  'Each notice a tournament sent one of its players (PWA-10), once per event: a day live, a card to sign, a snake tiebreak waiting, the results. Written only by notify_player; each row is posted to the phones holding the player by PIN (player_notices_push).';
create index player_notices_tournament_idx on public.player_notices (tournament_id);
alter table public.player_notices enable row level security;
revoke all on public.player_notices from public, anon, authenticated;

-- One notice to one player, once per key: his account's inbox (and its phones) when the player is his
-- profile's, never the account that caused it, and the phones that hold him by PIN (the trigger below).
-- Internal: only the definer functions here call it.
create or replace function public.notify_player(p_player_id uuid, p_kind text, p_key text, p_data jsonb)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  pl public.players;
begin
  select * into pl from public.players where id = p_player_id;
  if pl.id is null then
    return;
  end if;
  if pl.profile_status = 'confirmed' and pl.profile_id is distinct from auth.uid() then
    perform public.notify(pl.profile_id, p_kind, p_key, null, p_data);
  end if;
  insert into public.player_notices (tournament_id, player_id, kind, key, data)
  values (pl.tournament_id, pl.id, p_kind, p_key, coalesce(p_data, '{}'::jsonb))
  on conflict (player_id, key) do nothing;
end;
$$;
revoke execute on function public.notify_player(uuid, text, text, jsonb) from public, anon, authenticated;

-- A new notice goes to the phones that hold the player by PIN now, as 0019's notifications_push sends a
-- profile's: one request, only when push is configured and some phone is there. Not the phone that caused
-- it, and not an address that is also the player's account's (that one hears it through notify, once).
-- No unread count: a PIN phone has no inbox, so the icon's count is left alone.
create or replace function public.player_notices_push()
returns trigger
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  url text := public.push_secret('push_dispatch_url');
  secret text := public.push_secret('push_dispatch_secret');
  subs jsonb;
begin
  if url is null or secret is null then
    return null;
  end if;
  select jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'keys', jsonb_build_object('p256dh', s.p256dh, 'auth', s.auth)) order by s.created_at, s.id)
  into subs
  from public.pin_push_subscriptions s
  join public.device_sessions d on d.auth_user_id = s.auth_user_id and d.player_id = s.player_id and d.tournament_id = s.tournament_id
  where s.player_id = new.player_id and s.tournament_id = new.tournament_id
    and s.auth_user_id is distinct from auth.uid()
    and not exists (
      select 1 from public.push_subscriptions a
      join public.players p on p.profile_id = a.profile_id and p.profile_status = 'confirmed'
      where p.id = new.player_id and a.endpoint = s.endpoint
    );
  if subs is null then
    return null;
  end if;
  perform net.http_post(
    url := url,
    body := jsonb_build_object('subscriptions', subs, 'notice', jsonb_build_object('id', new.id, 'kind', new.kind, 'data', new.data, 'actor', null)),
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || secret),
    timeout_milliseconds := 5000
  );
  return null;
end;
$$;
revoke execute on function public.player_notices_push() from public, anon, authenticated;
create trigger player_notices_push after insert on public.player_notices for each row execute function public.player_notices_push();

-- ---------------------------------------------------------------------------
-- 3. The events
-- ---------------------------------------------------------------------------
-- A day goes live: its players (the ones in its groups; a day with no groups yet, the whole tournament),
-- each with his group, the hole it starts on and its tee time. Once per day, whatever goes back and forth.
create or replace function public.rounds_notify_live()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  t public.tournaments;
  x record;
begin
  if coalesce(current_setting('cardi.restore', true), '') = '1' then
    return null;
  end if;
  begin
    select * into t from public.tournaments where id = new.tournament_id;
    for x in
      select p.id as player_id, g.number as group_no, g.start_hole, g.tee_time
      from public.players p
      left join public.group_members m on m.player_id = p.id and m.group_id in (select gg.id from public.groups gg where gg.round_id = new.id)
      left join public.groups g on g.id = m.group_id
      where p.tournament_id = new.tournament_id
        and (m.group_id is not null or not exists (select 1 from public.groups gg where gg.round_id = new.id))
      order by p.id
    loop
      perform public.notify_player(x.player_id, 'round_live', 'round_live:' || new.id, jsonb_build_object(
        'tournament', t.name, 'slug', t.slug, 'round', new.number,
        'group', x.group_no, 'startHole', x.start_hole, 'teeTime', to_char(x.tee_time, 'HH24:MI')));
    end loop;
  exception when others then
    -- A notice is never worth the day: it goes live all the same.
    raise warning 'round_live notices: % (%)', sqlerrm, sqlstate;
  end;
  return null;
end;
$$;
revoke execute on function public.rounds_notify_live() from public, anon, authenticated;
create trigger rounds_notify_live after update of status on public.rounds
  for each row when (new.status = 'live' and old.status is distinct from 'live')
  execute function public.rounds_notify_live();

-- What a group's card asks of its players now, each said once (as src/engine reads the card):
--   * a card ready to sign, when the pairs game signs cards: the whole group has every hole (what the
--     Tarjeta waits for to show «Firmar») and a pair's card is unsigned; its signers are the rest of the group;
--   * a snake tiebreak the group went on from: the first hole of its play order where two or more took the
--     snake's putts and nobody said who holed out last (src/engine/modules/snake), once a later hole was saved
--     (`p_holes`, the holes the change wrote) or a card signed (`p_holes` null). The phone that saved that
--     hole asked first, and its answer goes before its next hole: only a group that went on without one hears.
-- Only while the day is live (a phone answers or signs only then). Internal.
create or replace function public.group_notices(p_round_id uuid, p_group_id uuid, p_holes int[])
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  r public.rounds;
  g public.groups;
  t public.tournaments;
  members uuid[];
  n int;
  base jsonb;
  pr public.pairs;
  who uuid;
  raw text;
  threshold int;
  pending int;
  pending_at int;
  latest int;
  h int;
  cands uuid[];
begin
  -- One group at a time: two phones saving its last two holes at once, each sees the other's.
  perform pg_advisory_xact_lock(hashtextextended('group_notices:' || p_group_id::text, 0));
  select * into r from public.rounds where id = p_round_id;
  select * into g from public.groups where id = p_group_id and round_id = p_round_id;
  if r.id is null or g.id is null or r.status <> 'live' then
    return;
  end if;
  select * into t from public.tournaments where id = r.tournament_id;
  select array_agg(m.player_id order by m.player_id) into members from public.group_members m where m.group_id = g.id;
  if members is null then
    return;
  end if;
  n := r.holes;
  base := jsonb_build_object('tournament', t.name, 'slug', t.slug, 'round', r.number, 'group', g.number);

  if coalesce(t.settings #>> '{modules,pairs,enabled}', '') = 'true' and not exists (
    select 1 from unnest(members) pid
    where (select count(*) from public.scores s
           where s.round_id = r.id and s.player_id = pid and s.hole between 1 and n and (s.strokes is not null or s.picked_up)) < n
  ) then
    for pr in
      select p.* from public.pairs p
      where p.tournament_id = t.id and p.player1_id = any (members) and p.player2_id = any (members)
        and not exists (select 1 from public.card_signatures cs where cs.round_id = r.id and cs.pair_id = p.id)
      order by p.id
    loop
      foreach who in array members loop
        if who <> pr.player1_id and who <> pr.player2_id then
          perform public.notify_player(who, 'card_to_sign', 'card_to_sign:' || r.id || ':' || pr.id, base);
        end if;
      end loop;
    end loop;
  end if;

  if coalesce(t.settings #>> '{modules,snake,enabled}', '') = 'true' then
    raw := t.settings #>> '{modules,snake,puttsThreshold}';
    threshold := case when raw ~ '^[0-9]{1,2}$' then least(10, greatest(2, raw::int)) else 3 end;
    for i in 0 .. n - 1 loop
      h := ((g.start_hole - 1 + i) % n) + 1;
      select array_agg(s.player_id) into cands from public.scores s
      where s.round_id = r.id and s.hole = h and s.player_id = any (members)
        and (s.strokes is not null or s.picked_up) and s.putts is not null and s.putts >= threshold;
      if coalesce(cardinality(cands), 0) >= 2 and not exists (
        select 1 from public.snake_tiebreaks tb
        where tb.round_id = r.id and tb.group_id = g.id and tb.hole = h and tb.last_holed_player_id = any (cands)
      ) then
        pending := h;
        pending_at := i;
        exit;
      end if;
    end loop;
    if pending is not null then
      if p_holes is null then
        latest := n;
      else
        select max((((x - g.start_hole) % n) + n) % n) into latest from unnest(p_holes) x where x between 1 and n;
      end if;
      if latest > pending_at then
        foreach who in array members loop
          perform public.notify_player(who, 'snake_tiebreak', 'snake_tiebreak:' || r.id || ':' || g.id || ':' || pending,
            base || jsonb_build_object('hole', pending, 'game', coalesce(nullif(btrim(t.settings #>> '{modules,snake,label}'), ''), 'La Víbora')));
        end loop;
      end if;
    end if;
  end if;
end;
$$;
revoke execute on function public.group_notices(uuid, uuid, int[]) from public, anon, authenticated;

-- Holes saved: each group they belong to, in a live day, one group at a time (in id order, so two
-- statements touching the same groups wait for each other, never deadlock).
create or replace function public.scores_notify()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  x record;
begin
  if coalesce(current_setting('cardi.restore', true), '') = '1' then
    return null;
  end if;
  begin
    for x in
      select c.round_id, m.group_id, array_agg(distinct c.hole) as holes
      from changed c
      join public.rounds r on r.id = c.round_id and r.status = 'live'
      join public.groups g on g.round_id = c.round_id
      join public.group_members m on m.group_id = g.id and m.player_id = c.player_id
      group by c.round_id, m.group_id
      order by m.group_id
    loop
      perform public.group_notices(x.round_id, x.group_id, x.holes);
    end loop;
  exception when others then
    -- A notice is never worth a hole: the save stands, and the group's next change asks again.
    raise warning 'group notices: % (%)', sqlerrm, sqlstate;
  end;
  return null;
end;
$$;
revoke execute on function public.scores_notify() from public, anon, authenticated;
create trigger scores_notify_ins after insert on public.scores referencing new table as changed for each statement execute function public.scores_notify();
create trigger scores_notify_upd after update on public.scores referencing new table as changed for each statement execute function public.scores_notify();

-- A card signed: its group is done with that day, so a tiebreak still waiting there (the last hole's, which
-- no later hole follows) is said now.
create or replace function public.card_signatures_notify()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  gid uuid;
begin
  if coalesce(current_setting('cardi.restore', true), '') = '1' then
    return null;
  end if;
  begin
    select g.id into gid
    from public.pairs p
    join public.groups g on g.round_id = new.round_id
    where p.id = new.pair_id
      and exists (select 1 from public.group_members m where m.group_id = g.id and m.player_id = p.player1_id)
      and exists (select 1 from public.group_members m where m.group_id = g.id and m.player_id = p.player2_id)
    order by g.number
    limit 1;
    if gid is not null then
      perform public.group_notices(new.round_id, gid, null);
    end if;
  exception when others then
    raise warning 'group notices: % (%)', sqlerrm, sqlstate;
  end;
  return null;
end;
$$;
revoke execute on function public.card_signatures_notify() from public, anon, authenticated;
create trigger card_signatures_notify after insert on public.card_signatures for each row execute function public.card_signatures_notify();

-- Results published: every player hears his place, the PIN ones too (0016 tells the confirmed profiles,
-- and notify_player's copy for them is the same key, so nobody hears twice). A republish is the same key.
create or replace function public.tournament_results_notify_players()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  begin
    perform public.notify_player(n.player_id, 'results', 'results:' || n.tournament_id,
      jsonb_build_object('tournament', t.name, 'slug', t.slug, 'rankLabel', n.rank_label, 'field', n.field))
    from (select * from changed order by player_id) n
    join public.tournaments t on t.id = n.tournament_id;
  exception when others then
    raise warning 'results notices: % (%)', sqlerrm, sqlstate;
  end;
  return null;
end;
$$;
revoke execute on function public.tournament_results_notify_players() from public, anon, authenticated;
create trigger tournament_results_notify_players after insert on public.tournament_results
  referencing new table as changed for each statement execute function public.tournament_results_notify_players();

-- ---------------------------------------------------------------------------
-- 4. restore_tournament: 0048's, its days, holes and signatures written under cardi.restore
-- ---------------------------------------------------------------------------
create or replace function public.restore_tournament(p_tournament_id uuid, p_backup jsonb)
returns jsonb
language plpgsql volatile security definer
set search_path = public
as $$
declare
  tb jsonb;
  n_players int;
  n_rounds int;
  n_scores int;
  was text;
  quiet text;
begin
  if not public.is_tournament_organizer(p_tournament_id) then
    raise exception 'Solo el Comité puede restaurar un respaldo' using errcode = '42501';
  end if;
  if (p_backup ->> 'version')::int is distinct from 1 then
    raise exception 'Versión de respaldo no soportada' using errcode = '22023';
  end if;
  if (p_backup ->> 'tournamentId')::uuid is distinct from p_tournament_id then
    raise exception 'wrong-tournament' using errcode = '22023';
  end if;
  tb := coalesce(p_backup -> 'tables', '{}'::jsonb);

  create temp table r_tournaments on commit drop as select * from jsonb_populate_recordset(null::public.tournaments, coalesce(tb -> 'tournaments', '[]'::jsonb));
  create temp table r_players on commit drop as select * from jsonb_populate_recordset(null::public.players, coalesce(tb -> 'players', '[]'::jsonb));
  create temp table r_rounds on commit drop as select * from jsonb_populate_recordset(null::public.rounds, coalesce(tb -> 'rounds', '[]'::jsonb));
  create temp table r_pairs on commit drop as select * from jsonb_populate_recordset(null::public.pairs, coalesce(tb -> 'pairs', '[]'::jsonb));
  create temp table r_teams on commit drop as select * from jsonb_populate_recordset(null::public.teams, coalesce(tb -> 'teams', '[]'::jsonb));
  create temp table r_team_members on commit drop as select * from jsonb_populate_recordset(null::public.team_members, coalesce(tb -> 'team_members', '[]'::jsonb));
  create temp table r_groups on commit drop as select * from jsonb_populate_recordset(null::public.groups, coalesce(tb -> 'groups', '[]'::jsonb));
  create temp table r_group_members on commit drop as select * from jsonb_populate_recordset(null::public.group_members, coalesce(tb -> 'group_members', '[]'::jsonb));
  create temp table r_round_tees on commit drop as select * from jsonb_populate_recordset(null::public.round_tees, coalesce(tb -> 'round_tees', '[]'::jsonb));
  create temp table r_scores on commit drop as select * from jsonb_populate_recordset(null::public.scores, coalesce(tb -> 'scores', '[]'::jsonb));
  create temp table r_snake_tiebreaks on commit drop as select * from jsonb_populate_recordset(null::public.snake_tiebreaks, coalesce(tb -> 'snake_tiebreaks', '[]'::jsonb));
  create temp table r_card_signatures on commit drop as select * from jsonb_populate_recordset(null::public.card_signatures, coalesce(tb -> 'card_signatures', '[]'::jsonb));
  create temp table r_handicap_overrides on commit drop as select * from jsonb_populate_recordset(null::public.handicap_overrides, coalesce(tb -> 'handicap_overrides', '[]'::jsonb));
  create temp table r_calcutta_lots on commit drop as select * from jsonb_populate_recordset(null::public.calcutta_lots, coalesce(tb -> 'calcutta_lots', '[]'::jsonb));
  create temp table r_calcutta_bids on commit drop as select * from jsonb_populate_recordset(null::public.calcutta_bids, coalesce(tb -> 'calcutta_bids', '[]'::jsonb));
  create temp table r_calcutta_buybacks on commit drop as select * from jsonb_populate_recordset(null::public.calcutta_buybacks, coalesce(tb -> 'calcutta_buybacks', '[]'::jsonb));
  create temp table r_payments on commit drop as select * from jsonb_populate_recordset(null::public.payments, coalesce(tb -> 'payments', '[]'::jsonb));
  create temp table r_money_adjustments on commit drop as select * from jsonb_populate_recordset(null::public.money_adjustments, coalesce(tb -> 'money_adjustments', '[]'::jsonb));
  create temp table r_game_entries on commit drop as select * from jsonb_populate_recordset(null::public.game_entries, coalesce(tb -> 'game_entries', '[]'::jsonb));
  create temp table r_hole_awards on commit drop as select * from jsonb_populate_recordset(null::public.hole_awards, coalesce(tb -> 'hole_awards', '[]'::jsonb));
  create temp table r_game_results on commit drop as select * from jsonb_populate_recordset(null::public.game_results, coalesce(tb -> 'game_results', '[]'::jsonb));

  -- Tenant: every row of the backup belongs to this tournament.
  if exists (select 1 from r_tournaments where id is distinct from p_tournament_id)
     or exists (select 1 from r_players where tournament_id is distinct from p_tournament_id)
     or exists (select 1 from r_rounds where tournament_id is distinct from p_tournament_id)
     or exists (select 1 from r_pairs where tournament_id is distinct from p_tournament_id)
     or exists (select 1 from r_teams where tournament_id is distinct from p_tournament_id)
     or exists (select 1 from r_team_members where tournament_id is distinct from p_tournament_id)
     or exists (select 1 from r_calcutta_lots where tournament_id is distinct from p_tournament_id)
     or exists (select 1 from r_payments where tournament_id is distinct from p_tournament_id)
     or exists (select 1 from r_money_adjustments where tournament_id is distinct from p_tournament_id)
     or exists (select 1 from r_game_entries where tournament_id is distinct from p_tournament_id)
     or exists (select 1 from r_game_results where tournament_id is distinct from p_tournament_id)
     -- The child tables carry the tenant too since 0030; a backup from before has none (null), and gets this one.
     or exists (select 1 from r_groups where tournament_id <> p_tournament_id)
     or exists (select 1 from r_group_members where tournament_id <> p_tournament_id)
     or exists (select 1 from r_round_tees where tournament_id <> p_tournament_id)
     or exists (select 1 from r_scores where tournament_id <> p_tournament_id)
     or exists (select 1 from r_snake_tiebreaks where tournament_id <> p_tournament_id)
     or exists (select 1 from r_card_signatures where tournament_id <> p_tournament_id)
     or exists (select 1 from r_handicap_overrides where tournament_id <> p_tournament_id)
     or exists (select 1 from r_hole_awards where tournament_id <> p_tournament_id)
     or exists (select 1 from r_calcutta_bids where tournament_id <> p_tournament_id)
     or exists (select 1 from r_calcutta_buybacks where tournament_id <> p_tournament_id) then
    raise exception 'El respaldo tiene filas de otro torneo' using errcode = '22023';
  end if;
  -- Ids (NEW-12): a row the backup names is never a row another tournament
  -- already has, directly or through its round or lot. Since 0010 players and
  -- rounds were upserted by id, so a backup listing another tournament's ids
  -- rewrote them there (its names, its handicaps, its round's status), and its
  -- scores and groups landed in that round. Checked before anything is written.
  if exists (select 1 from r_players x join public.players y on y.id = x.id where y.tournament_id <> p_tournament_id)
     or exists (select 1 from r_rounds x join public.rounds y on y.id = x.id where y.tournament_id <> p_tournament_id)
     or exists (select 1 from r_pairs x join public.pairs y on y.id = x.id where y.tournament_id <> p_tournament_id)
     or exists (select 1 from r_teams x join public.teams y on y.id = x.id where y.tournament_id <> p_tournament_id)
     or exists (select 1 from r_calcutta_lots x join public.calcutta_lots y on y.id = x.id where y.tournament_id <> p_tournament_id)
     or exists (select 1 from r_payments x join public.payments y on y.id = x.id where y.tournament_id <> p_tournament_id)
     or exists (select 1 from r_money_adjustments x join public.money_adjustments y on y.id = x.id where y.tournament_id <> p_tournament_id)
     or exists (select 1 from r_groups x join public.groups y on y.id = x.id join public.rounds r on r.id = y.round_id where r.tournament_id <> p_tournament_id)
     or exists (select 1 from r_scores x join public.scores y on y.id = x.id join public.rounds r on r.id = y.round_id where r.tournament_id <> p_tournament_id)
     or exists (select 1 from r_calcutta_bids x join public.calcutta_bids y on y.id = x.id join public.calcutta_lots l on l.id = y.lot_id where l.tournament_id <> p_tournament_id) then
    raise exception 'El respaldo trae filas que son de otro torneo; no se restauró nada' using errcode = '22023';
  end if;
  if exists (select 1 from r_players where id is null) or exists (select 1 from r_rounds where id is null)
     or exists (select 1 from r_pairs where id is null) or exists (select 1 from r_groups where id is null)
     or exists (select 1 from r_teams where id is null)
     or exists (select 1 from r_calcutta_lots where id is null) then
    raise exception 'El respaldo está incompleto (filas sin id)' using errcode = '22023';
  end if;
  -- One call is one decision (paid, flagged and voided whole): a row with no
  -- call would come back as a call of its own, splitting a refund. The export
  -- always carries it, so a backup without it was edited: refused.
  if exists (select 1 from r_money_adjustments where call_id is null) then
    raise exception 'El respaldo trae decisiones del Comité incompletas; no se restauró nada' using errcode = '22023';
  end if;
  -- References: everything points at rows the backup also carries (and, by the
  -- check above, those are this tournament's or new).
  if exists (select 1 from r_groups g where not exists (select 1 from r_rounds r where r.id = g.round_id))
     or exists (select 1 from r_group_members m where not exists (select 1 from r_groups g where g.id = m.group_id) or not exists (select 1 from r_players p where p.id = m.player_id))
     or exists (select 1 from r_round_tees x where not exists (select 1 from r_rounds r where r.id = x.round_id) or not exists (select 1 from r_players p where p.id = x.player_id))
     or exists (select 1 from r_scores s where not exists (select 1 from r_rounds r where r.id = s.round_id) or not exists (select 1 from r_players p where p.id = s.player_id))
     or exists (select 1 from r_snake_tiebreaks x where not exists (select 1 from r_rounds r where r.id = x.round_id) or not exists (select 1 from r_groups g where g.id = x.group_id) or not exists (select 1 from r_players p where p.id = x.last_holed_player_id))
     or exists (select 1 from r_card_signatures x where not exists (select 1 from r_rounds r where r.id = x.round_id) or not exists (select 1 from r_pairs p where p.id = x.pair_id))
     or exists (select 1 from r_handicap_overrides x where not exists (select 1 from r_rounds r where r.id = x.round_id) or not exists (select 1 from r_players p where p.id = x.player_id))
     or exists (select 1 from r_pairs x where not exists (select 1 from r_players p where p.id = x.player1_id) or not exists (select 1 from r_players p where p.id = x.player2_id))
     or exists (select 1 from r_team_members x where not exists (select 1 from r_teams tm where tm.id = x.team_id) or not exists (select 1 from r_players p where p.id = x.player_id))
     or exists (select 1 from r_calcutta_lots x where not exists (select 1 from r_players p where p.id = x.player_id) or (x.owner_id is not null and not exists (select 1 from r_players p where p.id = x.owner_id)))
     or exists (select 1 from r_calcutta_bids x where not exists (select 1 from r_calcutta_lots l where l.id = x.lot_id) or not exists (select 1 from r_players p where p.id = x.bidder_id))
     or exists (select 1 from r_calcutta_buybacks x where not exists (select 1 from r_calcutta_lots l where l.id = x.lot_id))
     or exists (select 1 from r_payments x where (x.from_player_id is not null and not exists (select 1 from r_players p where p.id = x.from_player_id)) or (x.to_player_id is not null and not exists (select 1 from r_players p where p.id = x.to_player_id)))
     or exists (select 1 from r_money_adjustments x where x.to_player_id is not null and not exists (select 1 from r_players p where p.id = x.to_player_id))
     or exists (select 1 from r_game_entries x where not exists (select 1 from r_players p where p.id = x.player_id))
     or exists (select 1 from r_game_results x where not exists (select 1 from r_players p where p.id = x.player_id))
     or exists (select 1 from r_hole_awards x where not exists (select 1 from r_rounds r where r.id = x.round_id) or not exists (select 1 from r_players p where p.id = x.player_id) or (x.group_id is not null and not exists (select 1 from r_groups g where g.id = x.group_id))) then
    raise exception 'El respaldo está incompleto: hay filas que apuntan a datos que no trae' using errcode = '22023';
  end if;

  -- Defaults for columns older backups did not have; courses are not restored, so drop dangling tee refs.
  update r_scores set id = gen_random_uuid() where id is null;
  -- (the API session runs with safeupdate: every UPDATE/DELETE needs a WHERE)
  update r_scores set disputed = false, previous = null, reason = null, picked_up = coalesce(picked_up, false), updated_at = coalesce(updated_at, now()) where true;
  update r_players set default_tee_id = null where default_tee_id is not null and not exists (select 1 from public.tees t where t.id = r_players.default_tee_id);
  update r_rounds set course_id = null where course_id is not null and not exists (select 1 from public.courses c where c.id = r_rounds.course_id);
  delete from r_round_tees where not exists (select 1 from public.tees t where t.id = r_round_tees.tee_id);
  update r_scores set entered_by = null where entered_by is not null and not exists (select 1 from r_players p where p.id = r_scores.entered_by);
  update r_snake_tiebreaks set decided_by = null where decided_by is not null and not exists (select 1 from r_players p where p.id = r_snake_tiebreaks.decided_by);
  update r_card_signatures set signed_by = null where signed_by is not null and not exists (select 1 from r_players p where p.id = r_card_signatures.signed_by);
  update r_handicap_overrides set "by" = null where "by" is not null and not exists (select 1 from r_players p where p.id = r_handicap_overrides."by");
  update r_hole_awards set decided_by = null where decided_by is not null and not exists (select 1 from r_players p where p.id = r_hole_awards.decided_by);

  -- Wipe dependents (players and rounds are upserted so PINs and device links survive).
  update public.tournaments set current_round_id = null, banker_player_id = null where id = p_tournament_id;
  delete from public.payments where tournament_id = p_tournament_id;
  delete from public.money_adjustments where tournament_id = p_tournament_id;
  delete from public.calcutta_lots where tournament_id = p_tournament_id;
  delete from public.card_signatures where round_id in (select id from public.rounds where tournament_id = p_tournament_id);
  delete from public.handicap_overrides where round_id in (select id from public.rounds where tournament_id = p_tournament_id);
  delete from public.snake_tiebreaks where round_id in (select id from public.rounds where tournament_id = p_tournament_id);
  delete from public.scores where round_id in (select id from public.rounds where tournament_id = p_tournament_id);
  delete from public.round_tees where round_id in (select id from public.rounds where tournament_id = p_tournament_id);
  delete from public.game_entries where tournament_id = p_tournament_id;
  delete from public.game_results where tournament_id = p_tournament_id;
  delete from public.hole_awards where round_id in (select id from public.rounds where tournament_id = p_tournament_id);
  delete from public.groups where round_id in (select id from public.rounds where tournament_id = p_tournament_id);
  delete from public.pairs where tournament_id = p_tournament_id;
  delete from public.teams where tournament_id = p_tournament_id;

  -- The players as the backup has them, their handicaps and the record of a change after they were fixed
  -- included, whatever the lock says now (0046's players_handicap_lock lets this write through).
  was := coalesce(current_setting('cardi.restore', true), '');
  perform set_config('cardi.restore', '1', true);
  insert into public.players (id, tournament_id, full_name, display_name, tier, base_hcp, handicap_source, handicap_index, estimate_inputs, default_tee_id, is_honoree, is_admin, avatar_url, form_guide, sort_order, created_at, handicap_note)
  select id, p_tournament_id, full_name, display_name, tier, coalesce(base_hcp, 18), coalesce(handicap_source, 'manual'), handicap_index, estimate_inputs, default_tee_id, coalesce(is_honoree, false), coalesce(is_admin, false), avatar_url, form_guide, coalesce(sort_order, 0), coalesce(created_at, now()), handicap_note
  from r_players
  on conflict (id) do update set
    full_name = excluded.full_name, display_name = excluded.display_name, tier = excluded.tier, base_hcp = excluded.base_hcp,
    handicap_source = excluded.handicap_source, handicap_index = excluded.handicap_index, estimate_inputs = excluded.estimate_inputs,
    default_tee_id = excluded.default_tee_id, is_honoree = excluded.is_honoree, is_admin = excluded.is_admin, avatar_url = excluded.avatar_url,
    form_guide = excluded.form_guide, sort_order = excluded.sort_order, handicap_note = excluded.handicap_note;
  perform set_config('cardi.restore', was, true);
  delete from public.players where tournament_id = p_tournament_id and not exists (select 1 from r_players r where r.id = players.id);

  -- What the backup brings back is no news: its days, holes and signatures tell no player anything (0051).
  quiet := coalesce(current_setting('cardi.restore', true), '');
  perform set_config('cardi.restore', '1', true);
  update public.rounds set number = number + 1000 where tournament_id = p_tournament_id;
  insert into public.rounds (id, tournament_id, number, date, course_id, holes, status)
  select id, p_tournament_id, number, date, course_id, coalesce(holes, 18), coalesce(status, 'scheduled') from r_rounds
  on conflict (id) do update set number = excluded.number, date = excluded.date, course_id = excluded.course_id, holes = excluded.holes, status = excluded.status;
  delete from public.rounds where tournament_id = p_tournament_id and not exists (select 1 from r_rounds r where r.id = rounds.id);

  insert into public.groups (id, tournament_id, round_id, number, tee_time, start_hole) select id, p_tournament_id, round_id, number, tee_time, coalesce(start_hole, 1) from r_groups;
  insert into public.group_members (group_id, player_id, tournament_id) select group_id, player_id, p_tournament_id from r_group_members on conflict do nothing;
  insert into public.round_tees (round_id, player_id, tee_id, tournament_id) select round_id, player_id, tee_id, p_tournament_id from r_round_tees on conflict do nothing;
  insert into public.pairs (id, tournament_id, name, player1_id, player2_id, kind, picked_by_honoree, drawn_at)
  select id, p_tournament_id, name, player1_id, player2_id, kind, coalesce(picked_by_honoree, false), drawn_at from r_pairs;
  insert into public.teams (id, tournament_id, name, number, drawn_at)
  select id, p_tournament_id, name, coalesce(number, 1), drawn_at from r_teams;
  insert into public.team_members (team_id, player_id, tournament_id)
  select team_id, player_id, p_tournament_id from r_team_members on conflict do nothing;
  insert into public.scores (id, tournament_id, round_id, player_id, hole, strokes, putts, picked_up, entered_by, client_ts, updated_at, disputed, previous, reason)
  select id, p_tournament_id, round_id, player_id, hole, strokes, putts, picked_up, entered_by, client_ts, updated_at, false, null, null from r_scores;
  insert into public.snake_tiebreaks (tournament_id, round_id, group_id, hole, last_holed_player_id, decided_by, created_at)
  select p_tournament_id, round_id, group_id, hole, last_holed_player_id, decided_by, coalesce(created_at, now()) from r_snake_tiebreaks on conflict do nothing;
  insert into public.card_signatures (tournament_id, round_id, pair_id, signed_by, signed_at)
  select p_tournament_id, round_id, pair_id, signed_by, coalesce(signed_at, now()) from r_card_signatures on conflict do nothing;
  insert into public.handicap_overrides (tournament_id, round_id, player_id, playing_hcp, reason, "by", at)
  select p_tournament_id, round_id, player_id, playing_hcp, reason, "by", coalesce(at, now()) from r_handicap_overrides on conflict do nothing;
  -- The auction as the backup has it, sold lots and every bid: the Calcutta's rules (0048) let these through.
  was := coalesce(current_setting('cardi.restore', true), '');
  perform set_config('cardi.restore', '1', true);
  insert into public.calcutta_lots (id, tournament_id, player_id, lot_number, status, price, owner_id, sold_at)
  select id, p_tournament_id, player_id, lot_number, coalesce(status, 'pending'), price, owner_id, sold_at from r_calcutta_lots;
  insert into public.calcutta_bids (id, tournament_id, lot_id, bidder_id, amount, created_at)
  select coalesce(id, gen_random_uuid()), p_tournament_id, lot_id, bidder_id, amount, coalesce(created_at, now()) from r_calcutta_bids;
  perform set_config('cardi.restore', was, true);
  insert into public.calcutta_buybacks (lot_id, tournament_id, pct, amount, paid) select lot_id, p_tournament_id, pct, amount, coalesce(paid, false) from r_calcutta_buybacks on conflict do nothing;
  insert into public.payments (id, tournament_id, from_player_id, to_player_id, amount, kind, paid, note, created_at)
  select coalesce(id, gen_random_uuid()), p_tournament_id, from_player_id, to_player_id, amount, kind, coalesce(paid, false), note, coalesce(created_at, now()) from r_payments;
  insert into public.money_adjustments (id, tournament_id, source_key, kind, to_player_id, amount, reason, call_id, created_by, created_at, voided_at, voided_by, void_reason)
  select coalesce(id, gen_random_uuid()), p_tournament_id, source_key, kind, to_player_id, amount, reason, call_id, created_by, coalesce(created_at, now()), voided_at, voided_by, void_reason from r_money_adjustments;
  insert into public.game_entries (tournament_id, game_id, player_id, created_at)
  select p_tournament_id, game_id, player_id, coalesce(created_at, now()) from r_game_entries on conflict do nothing;
  insert into public.game_results (tournament_id, game_id, player_id, share, created_at)
  select p_tournament_id, game_id, player_id, coalesce(share, 1), coalesce(created_at, now()) from r_game_results on conflict do nothing;
  insert into public.hole_awards (tournament_id, round_id, group_id, hole, game_id, player_id, decided_by, created_at)
  select p_tournament_id, round_id, group_id, hole, game_id, player_id, decided_by, coalesce(created_at, now()) from r_hole_awards on conflict do nothing;
  perform set_config('cardi.restore', quiet, true);

  -- The backup's status as it was, Terminado included: the close gate (0029) lets this one write through.
  was := coalesce(current_setting('cardi.restore', true), '');
  perform set_config('cardi.restore', '1', true);
  update public.tournaments t
  set name = coalesce(r.name, t.name), tagline = r.tagline, logo_url = r.logo_url, accent_color = r.accent_color,
      status = coalesce(r.status, t.status), settings = coalesce(r.settings, t.settings),
      handicaps_locked_at = r.handicaps_locked_at,
      timezone = coalesce(r.timezone, t.timezone), currency = coalesce(r.currency, t.currency),
      current_round_id = case when exists (select 1 from r_rounds x where x.id = r.current_round_id) then r.current_round_id end,
      banker_player_id = case when exists (select 1 from r_players x where x.id = r.banker_player_id) then r.banker_player_id end
  from r_tournaments r
  where t.id = p_tournament_id;
  perform set_config('cardi.restore', was, true);

  select count(*) into n_players from r_players;
  select count(*) into n_rounds from r_rounds;
  select count(*) into n_scores from r_scores;
  return jsonb_build_object('players', n_players, 'rounds', n_rounds, 'scores', n_scores);
end;
$$;
revoke execute on function public.restore_tournament(uuid, jsonb) from public, anon;
grant execute on function public.restore_tournament(uuid, jsonb) to authenticated, service_role;
