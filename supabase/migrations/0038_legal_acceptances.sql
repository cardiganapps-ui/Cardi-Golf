-- Cardi-Golf · 0038 · Which version of the notice and the terms each person accepted (TRUST-05).
--
-- Every place that takes someone's data shows «Al continuar aceptas los
-- Términos de uso y el Aviso de privacidad» before the action (PR 88). Now the
-- app records, once the action goes through (a PIN, an account's code, an
-- organizer's sign-in, a Ronda rápida), which version of each document that
-- person accepted and when; and when a version changes, the app shows it once
-- and records that too. A phone without an account records it under its
-- anonymous user, which is who entered with the PIN.
--
-- One row per user, document and version: accepting the same version twice
-- keeps the first time. Nobody reads or writes the table directly: the phone
-- writes through accept_legal and reads its own through my_legal_acceptances.
-- The versions are the app's own («2026-10-12.3»), checked for shape, not
-- against a list, so a release that bumps a version needs no migration;
-- a user keeps at most 100 rows, and a version dated in the future is
-- refused. The time is when the person accepted, by how long ago the phone
-- says it was (it may wait there without signal; at most eight days), and
-- the phone names the user it accepted for, so a session that changed in
-- between records nothing. Deleting the account deletes its rows.

create table public.legal_acceptances (
  id bigint generated always as identity primary key,
  auth_user_id uuid not null references auth.users (id) on delete cascade,
  document text not null check (document in ('privacy', 'terms')),
  version text not null check (version ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}(\.[0-9]{1,3})?$'),
  context text not null check (context in ('pin', 'account', 'organizer', 'quick', 'update')),
  accepted_at timestamptz not null default now(),
  unique (auth_user_id, document, version)
);
alter table public.legal_acceptances enable row level security;
revoke all on public.legal_acceptances from public, anon, authenticated;

-- The newest version the caller accepted of each document, by date and then
-- its «.N» (so «2026-10-12.10» comes after «.9», and an older phone accepting
-- an older version later doesn't make it the latest): {privacy: {version,
-- acceptedAt} | null, terms: …}.
create function public.my_legal_acceptances()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'privacy', (select jsonb_build_object('version', a.version, 'acceptedAt', a.accepted_at) from public.legal_acceptances a
                 where a.auth_user_id = auth.uid() and a.document = 'privacy' order by split_part(a.version, '.', 1) desc, coalesce(nullif(split_part(a.version, '.', 2), '')::int, 0) desc limit 1),
    'terms', (select jsonb_build_object('version', a.version, 'acceptedAt', a.accepted_at) from public.legal_acceptances a
               where a.auth_user_id = auth.uid() and a.document = 'terms' order by split_part(a.version, '.', 1) desc, coalesce(nullif(split_part(a.version, '.', 2), '')::int, 0) desc limit 1))
$$;
revoke execute on function public.my_legal_acceptances() from public, anon;
grant execute on function public.my_legal_acceptances() to authenticated;

create function public.accept_legal(p_privacy text, p_terms text, p_context text, p_age_seconds integer default 0, p_user uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid uuid := auth.uid();
  -- When the person accepted: how long ago, by the phone (an acceptance can wait there without signal), at most eight days; the phone's clock itself plays no part.
  at timestamptz := now() - make_interval(secs => least(greatest(coalesce(p_age_seconds, 0), 0), 8 * 24 * 3600));
  shape constant text := '^[0-9]{4}-[0-9]{2}-[0-9]{2}(\.[0-9]{1,3})?$';
  bad boolean;
begin
  -- The user the phone accepted for: a session that changed meanwhile records nothing for the new one.
  if uid is null or (p_user is not null and p_user <> uid) then
    raise exception 'Necesitas una sesión para aceptar el aviso.' using errcode = '42501';
  end if;
  if p_context is null or p_context not in ('pin', 'account', 'organizer', 'quick', 'update') then
    raise exception 'No reconocemos dónde se aceptó.' using errcode = '22023';
  end if;
  if p_privacy is null or p_privacy !~ shape or p_terms is null or p_terms !~ shape then
    raise exception 'No reconocemos esa versión del aviso o de los términos.' using errcode = '22023';
  end if;
  -- A version is a real date, and not one from the future: a made-up «9999-12-31» would stand as the newest for good.
  begin
    bad := split_part(p_privacy, '.', 1)::date > current_date + 1 or split_part(p_terms, '.', 1)::date > current_date + 1;
  exception when others then
    bad := true;
  end;
  if bad then
    raise exception 'No reconocemos esa versión del aviso o de los términos.' using errcode = '22023';
  end if;
  -- One user's rows, one at a time: the cap below can't be raced past.
  perform pg_advisory_xact_lock(hashtextextended('accept_legal:' || uid::text, 0));
  if (select count(*) from public.legal_acceptances where auth_user_id = uid) <= 98 then
    insert into public.legal_acceptances (auth_user_id, document, version, context, accepted_at)
    values (uid, 'privacy', p_privacy, p_context, at), (uid, 'terms', p_terms, p_context, at)
    on conflict (auth_user_id, document, version) do nothing;
  end if;
  return public.my_legal_acceptances();
end $$;
revoke execute on function public.accept_legal(text, text, text, integer, uuid) from public, anon;
grant execute on function public.accept_legal(text, text, text, integer, uuid) to authenticated;
