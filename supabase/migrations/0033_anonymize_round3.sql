-- Cardi-Golf · 0033 · Deletion, round 3 (TRUST-03, PR 114's second verifier).
--
-- 1. An account that changed its email kept its old address in the
--    operator's log: rows were matched only against the current email. Now a
--    row is the account's when it names the account (payload userId or
--    target_id) or its current email, and each is fingerprinted with the
--    email it holds and the account it names.
-- 2. GoTrue's audit rows about the account written by someone else (an admin
--    action: traits.user_id) survived; they go too. The delete runs in its
--    own block, so a role without the right on that table never aborts a
--    deletion (on production postgres has it, checked 2026-10-12).
-- 3. A pending copy that carries the person's photo under a name the Comité
--    wrote is no longer renamed: it loses the photo and keeps its name, as
--    the notice says.

/** Internal: the players that are the person: confirmed, or pending and carrying the person's name. */
create or replace function public.person_player_ids(p_user_id uuid)
returns uuid[]
language sql stable security definer
set search_path = public
as $$
  with me as (
    select nullif(btrim(pr.full_name), '') as full_name, nullif(btrim(pr.display_name), '') as display_name
    from public.profiles pr where pr.id = p_user_id
  ),
  confirmed as (
    select nullif(btrim(p.full_name), '') as full_name
    from public.players p where p.profile_id = p_user_id and p.profile_status = 'confirmed'
  ),
  names as (
    select lower(n) as n from (
      select full_name from me union all select display_name from me union all select full_name from confirmed
    ) x (n) where n is not null
  )
  select coalesce(array_agg(p.id order by p.id), '{}')
  from public.players p
  where p.profile_id = p_user_id
    and (p.profile_status = 'confirmed'
         or (p.profile_status = 'pending' and lower(btrim(p.full_name)) in (select n from names)))
$$;
revoke execute on function public.person_player_ids(uuid) from public, anon, authenticated;

/** Internal: pending players under another name that still carry the person's photo: they lose the photo only. */
create or replace function public.person_photo_ids(p_user_id uuid)
returns uuid[]
language sql stable security definer
set search_path = public
as $$
  with photos as (
    select a from (
      select nullif(btrim(pr.avatar_url), '') from public.profiles pr where pr.id = p_user_id
      union all
      select nullif(btrim(p.avatar_url), '') from public.players p where p.profile_id = p_user_id and p.profile_status = 'confirmed'
    ) x (a) where a is not null
  )
  select coalesce(array_agg(p.id order by p.id), '{}')
  from public.players p
  where p.profile_id = p_user_id and p.profile_status = 'pending'
    and nullif(btrim(p.avatar_url), '') in (select a from photos)
    and not p.id = any (public.person_player_ids(p_user_id))
$$;
revoke execute on function public.person_photo_ids(uuid) from public, anon, authenticated;

-- An audit image of a player, without the person's photo.
create or replace function public.redact_photo(j jsonb)
returns jsonb
language sql immutable
set search_path = public
as $$
  select case when j is null or not j ? 'avatar_url' then j else j || '{"avatar_url": null}'::jsonb end
$$;
revoke execute on function public.redact_photo(jsonb) from public, anon, authenticated;

create or replace function public.anonymize_person(p_user_id uuid)
returns integer
language plpgsql volatile security definer
set search_path = public
as $$
declare
  ids uuid[] := public.person_player_ids(p_user_id);
  photo_ids uuid[] := public.person_photo_ids(p_user_id);
  mail text;
  me text := p_user_id::text;
begin
  if cardinality(ids) > 0 then
    update public.players
       set full_name = 'Jugador borrado', display_name = 'Borrado', avatar_url = null, form_guide = null
     where id = any (ids);
    -- Every image of those rows, the one this update just wrote included.
    update public.audit_log
       set before = public.redact_person(before), after = public.redact_person(after)
     where table_name = 'players' and row_id = any (select i::text from unnest(ids) i);
  end if;
  if cardinality(photo_ids) > 0 then
    update public.players set avatar_url = null where id = any (photo_ids);
    update public.audit_log
       set before = public.redact_photo(before), after = public.redact_photo(after)
     where table_name = 'players' and row_id = any (select i::text from unnest(photo_ids) i);
  end if;

  -- The operator's log: every row that names this account or holds its email keeps the fingerprint
  -- of the email it holds, keyed by the account it names.
  select email into mail from auth.users where id = p_user_id;
  update public.platform_audit_log l
     set payload = (l.payload - 'email')
                || case when public.email_fingerprint(l.payload ->> 'email', coalesce(l.payload ->> 'userId', l.target_id, me)) is null then '{}'::jsonb
                        else jsonb_build_object('emailHash', public.email_fingerprint(l.payload ->> 'email', coalesce(l.payload ->> 'userId', l.target_id, me))) end
   where l.payload ? 'email'
     and (l.payload ->> 'userId' = me or l.target_id = me
          or (coalesce(mail, '') <> '' and lower(btrim(l.payload ->> 'email')) = lower(btrim(mail))));

  -- GoTrue's own audit rows: what the account did, and what was done to it.
  if to_regclass('auth.audit_log_entries') is not null then
    begin
      execute 'delete from auth.audit_log_entries where payload ->> ''actor_id'' = $1 or payload -> ''traits'' ->> ''user_id'' = $1' using me;
    exception when insufficient_privilege then
      null;
    end;
  end if;
  return cardinality(ids);
end;
$$;
revoke execute on function public.anonymize_person(uuid) from public, anon, authenticated;
