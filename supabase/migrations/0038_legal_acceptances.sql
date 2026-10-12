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
-- a user keeps at most 100 rows. The time is the phone's, as the acceptance
-- may wait there without signal (clamped to the last eight days). Deleting
-- the account deletes its rows.

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

create function public.accept_legal(p_privacy text, p_terms text, p_context text, p_accepted_at timestamptz default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid uuid := auth.uid();
  -- When the person accepted: the phone's time (an acceptance can wait there without signal), never in the future nor more than eight days back.
  at timestamptz := least(now(), greatest(coalesce(p_accepted_at, now()), now() - interval '8 days'));
  shape constant text := '^[0-9]{4}-[0-9]{2}-[0-9]{2}(\.[0-9]{1,3})?$';
begin
  if uid is null then
    raise exception 'Necesitas una sesión para aceptar el aviso.' using errcode = '42501';
  end if;
  if p_context is null or p_context not in ('pin', 'account', 'organizer', 'quick', 'update') then
    raise exception 'No reconocemos dónde se aceptó.' using errcode = '22023';
  end if;
  if p_privacy is null or p_privacy !~ shape or p_terms is null or p_terms !~ shape then
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
revoke execute on function public.accept_legal(text, text, text, timestamptz) from public, anon;
grant execute on function public.accept_legal(text, text, text, timestamptz) to authenticated;
