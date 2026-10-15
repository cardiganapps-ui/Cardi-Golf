-- 0055: push endpoints only on the browsers' push services (SEC-03).
--
-- A subscription's endpoint is an address the dispatch route calls with a POST. Both save functions took any
-- https URL, so a signed-in phone could save one on any host and have our server call it whenever a notice
-- went out. An endpoint is now accepted only on the push services browsers use: Chrome and Edge
-- (fcm.googleapis.com), Firefox (updates.push.services.mozilla.com), Safari (*.push.apple.com) and Windows
-- (*.notify.windows.com), over https on the default port, with no user or password in it. The dispatch route
-- checks the same list before it sends (src/lib/pushEndpoint.ts; pushEndpoint.test.ts holds the two lists
-- equal). Production held no subscriptions when this was written, so no saved row is refused after the fact.

create or replace function public.push_endpoint_ok(p_endpoint text)
returns boolean
language sql immutable
set search_path = public
as $$
  select coalesce(length(p_endpoint) <= 2048, false) and coalesce((
    select h = any (array['fcm.googleapis.com', 'updates.push.services.mozilla.com'])
        or h ~ '^[a-z0-9-]+(\.[a-z0-9-]+)*\.push\.apple\.com$'
        or h ~ '^[a-z0-9-]+(\.[a-z0-9-]+)*\.notify\.windows\.com$'
    from (select lower(substring(p_endpoint from '^https://([A-Za-z0-9.-]+)(?::443)?(?:/[^[:space:]]*)?$')) as h) x
  ), false)
$$;
comment on function public.push_endpoint_ok(text) is
  'SEC-03: true only for an https endpoint on a browser push service (FCM, Mozilla, Apple, Windows). src/lib/pushEndpoint.ts is the same list.';

/** Saves this browser's subscription for my profile (an endpoint moves to whoever saved it last). 0019's, plus the host check. */
create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text default null)
returns void language plpgsql volatile security definer set search_path = public as $$
begin
  if not public.is_account_user(auth.uid()) or not exists (select 1 from public.profiles where id = auth.uid()) then
    raise exception 'Primero guarda tu perfil' using errcode = '42501';
  end if;
  if not public.push_endpoint_ok(p_endpoint) or coalesce(p_p256dh, '') = '' or coalesce(p_auth, '') = ''
     or length(p_p256dh) > 256 or length(p_auth) > 256 then
    raise exception 'Suscripción inválida' using errcode = '22023';
  end if;
  insert into public.push_subscriptions (profile_id, endpoint, p256dh, auth, user_agent)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, left(p_user_agent, 200))
  on conflict (endpoint) do update set profile_id = excluded.profile_id, p256dh = excluded.p256dh, auth = excluded.auth,
    user_agent = excluded.user_agent, last_seen_at = now();
end;
$$;

-- 0052's, plus the host check.
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
  if not public.push_endpoint_ok(p_endpoint) or coalesce(p_p256dh, '') = '' or coalesce(p_auth, '') = ''
     or length(p_p256dh) > 256 or length(p_auth) > 256 then
    raise exception 'Suscripción inválida' using errcode = '22023';
  end if;
  insert into public.pin_push_subscriptions (tournament_id, player_id, auth_user_id, endpoint, p256dh, auth, user_agent)
  values (p_tournament_id, holds, auth.uid(), p_endpoint, p_p256dh, p_auth, left(p_user_agent, 200))
  on conflict (endpoint) do update
    set tournament_id = excluded.tournament_id, player_id = excluded.player_id, auth_user_id = excluded.auth_user_id,
        p256dh = excluded.p256dh, auth = excluded.auth, user_agent = excluded.user_agent, last_seen_at = now();
end;
$$;

-- The tables hold the same rule, so no other writer (a later function, a script with the service key) stores an
-- address the route would refuse to call. Both tables were empty on production when this ran.
alter table public.push_subscriptions add constraint push_subscriptions_endpoint_ok check (public.push_endpoint_ok(endpoint));
alter table public.pin_push_subscriptions add constraint pin_push_subscriptions_endpoint_ok check (public.push_endpoint_ok(endpoint));
