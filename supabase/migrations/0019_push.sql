-- 0019: web push. Each notification (0016) is also sent to the phones where
-- its owner allowed push. A trigger posts one pg_net request per
-- notification to the app's /api/push-dispatch with that profile's
-- subscriptions; the route signs and sends them (VAPID) and reports dead
-- ones back through push_prune. Nothing here uses the service-role key:
-- the route and the database share one secret, kept in Vault
-- (push_dispatch_secret) and on Vercel (PUSH_DISPATCH_SECRET), never in git.
-- The route's URL is also in Vault (push_dispatch_url). Without them the
-- trigger does nothing, so the inbox keeps working with push off.

create extension if not exists pg_net with schema extensions;

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index push_subscriptions_profile_idx on public.push_subscriptions (profile_id);
alter table public.push_subscriptions enable row level security;
create policy push_subscriptions_own on public.push_subscriptions for select using (profile_id = auth.uid());
revoke insert, update, delete on public.push_subscriptions from anon, authenticated;

/** Saves this browser's subscription for my profile (an endpoint moves to whoever saved it last). */
create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text default null)
returns void language plpgsql volatile security definer set search_path = public as $$
begin
  if not public.is_account_user(auth.uid()) or not exists (select 1 from public.profiles where id = auth.uid()) then
    raise exception 'Primero guarda tu perfil' using errcode = '42501';
  end if;
  if coalesce(p_endpoint, '') !~ '^https://' or coalesce(p_p256dh, '') = '' or coalesce(p_auth, '') = '' then
    raise exception 'Suscripción inválida' using errcode = '22023';
  end if;
  insert into public.push_subscriptions (profile_id, endpoint, p256dh, auth, user_agent)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, left(p_user_agent, 200))
  on conflict (endpoint) do update set profile_id = excluded.profile_id, p256dh = excluded.p256dh, auth = excluded.auth,
    user_agent = excluded.user_agent, last_seen_at = now();
end;
$$;

create or replace function public.delete_push_subscription(p_endpoint text)
returns void language sql volatile security definer set search_path = public as $$
  delete from public.push_subscriptions where endpoint = p_endpoint and profile_id = auth.uid()
$$;

create or replace function public.push_secret(p_name text)
returns text language sql stable security definer set search_path = public as $$
  select decrypted_secret from vault.decrypted_secrets where name = p_name limit 1
$$;
revoke execute on function public.push_secret(text) from public, anon, authenticated;

/** The dispatch route reports endpoints the push service rejected for good (404/410). */
create or replace function public.push_prune(p_secret text, p_endpoints text[])
returns int language plpgsql volatile security definer set search_path = public as $$
declare
  s text := public.push_secret('push_dispatch_secret');
  n int;
begin
  if s is null or p_secret is distinct from s then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  delete from public.push_subscriptions where endpoint = any (coalesce(p_endpoints, '{}'));
  get diagnostics n = row_count;
  return n;
end;
$$;
grant execute on function public.push_prune(text, text[]) to anon, authenticated;

/** One request per notification, only when its owner has subscriptions and push is configured. */
create or replace function public.notifications_push()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
declare
  url text := public.push_secret('push_dispatch_url');
  secret text := public.push_secret('push_dispatch_secret');
  subs jsonb;
begin
  if url is null or secret is null then
    return null;
  end if;
  select jsonb_agg(jsonb_build_object('endpoint', endpoint, 'keys', jsonb_build_object('p256dh', p256dh, 'auth', auth)))
  into subs from public.push_subscriptions where profile_id = new.profile_id;
  if subs is null then
    return null;
  end if;
  perform net.http_post(
    url := url,
    body := jsonb_build_object(
      'subscriptions', subs,
      'notice', jsonb_build_object('id', new.id, 'kind', new.kind, 'data', new.data,
        'actor', (select jsonb_build_object('handle', handle, 'displayName', display_name) from public.profiles where id = new.actor)),
      'unread', (select count(*) from public.notifications where profile_id = new.profile_id and read_at is null)
    ),
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || secret),
    timeout_milliseconds := 5000
  );
  return null;
end;
$$;
create trigger notifications_push after insert on public.notifications for each row execute function public.notifications_push();
