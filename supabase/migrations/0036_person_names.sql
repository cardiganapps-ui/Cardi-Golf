-- Cardi-Golf · 0036 · One list of the person's names (TRUST-03, PR 114's fifth verifier, P3).
--
-- anonymize_person (0035) read her names from the profile and from her
-- confirmed players' full and short names, but person_player_ids (0033) read
-- only the full ones. So a pending copy the Comité named with her confirmed
-- short name («Zoé») was treated as a copy, not as her: the row kept «Zoé»
-- while its history was redacted in full. Both now read person_names(uid).

/** Internal: the person's names, lowercased: the profile's full and short name, and her confirmed players'. */
create or replace function public.person_names(p_user_id uuid)
returns text[]
language sql stable security definer
set search_path = public
as $$
  select coalesce(array_agg(distinct lower(n)), '{}')
  from (
    select nullif(btrim(pr.full_name), '') from public.profiles pr where pr.id = p_user_id
    union all select nullif(btrim(pr.display_name), '') from public.profiles pr where pr.id = p_user_id
    union all select nullif(btrim(p.full_name), '') from public.players p where p.profile_id = p_user_id and p.profile_status = 'confirmed'
    union all select nullif(btrim(p.display_name), '') from public.players p where p.profile_id = p_user_id and p.profile_status = 'confirmed'
  ) x (n)
  where n is not null
$$;
revoke execute on function public.person_names(uuid) from public, anon, authenticated;

/** Internal: the players that are the person: confirmed, or pending and carrying one of her names. */
create or replace function public.person_player_ids(p_user_id uuid)
returns uuid[]
language sql stable security definer
set search_path = public
as $$
  select coalesce(array_agg(p.id order by p.id), '{}')
  from public.players p
  where p.profile_id = p_user_id
    and (p.profile_status = 'confirmed'
         or (p.profile_status = 'pending' and lower(btrim(p.full_name)) = any (public.person_names(p_user_id))))
$$;
revoke execute on function public.person_player_ids(uuid) from public, anon, authenticated;

create or replace function public.anonymize_person(p_user_id uuid)
returns integer
language plpgsql volatile security definer
set search_path = public
as $$
declare
  ids uuid[] := public.person_player_ids(p_user_id);
  copy_ids uuid[];
  mail text;
  me text := p_user_id::text;
  -- Read before anything is renamed: her names, her photos, and the form guides of the players she confirmed.
  names text[] := public.person_names(p_user_id);
  photos text[] := array(
    select a from (
      select nullif(btrim(pr.avatar_url), '') from public.profiles pr where pr.id = p_user_id
      union all select nullif(btrim(p.avatar_url), '') from public.players p where p.profile_id = p_user_id and p.profile_status = 'confirmed'
    ) x (a) where a is not null);
  forms text[] := array(
    select p.form_guide from public.players p
    where p.profile_id = p_user_id and p.profile_status = 'confirmed' and nullif(btrim(p.form_guide), '') is not null);
begin
  select coalesce(array_agg(p.id order by p.id), '{}') into copy_ids
  from public.players p
  where p.profile_id = p_user_id and p.profile_status = 'pending' and not p.id = any (ids);

  if cardinality(ids) > 0 then
    update public.players
       set full_name = 'Jugador borrado', display_name = 'Borrado', avatar_url = null, form_guide = null
     where id = any (ids);
    -- Every image of those rows, the one this update just wrote included.
    update public.audit_log
       set before = public.redact_person(before), after = public.redact_person(after)
     where table_name = 'players' and row_id = any (select i::text from unnest(ids) i);
  end if;
  if cardinality(copy_ids) > 0 then
    update public.players
       set avatar_url = case when nullif(btrim(avatar_url), '') = any (photos) then null else avatar_url end,
           form_guide = case when form_guide = any (forms) then null else form_guide end,
           display_name = case when lower(btrim(display_name)) = any (names) then full_name else display_name end
     where id = any (copy_ids);
    -- Every image of those rows: the ones from before the Comité renamed it lose her too.
    update public.audit_log
       set before = public.redact_copy(before, names, forms, photos), after = public.redact_copy(after, names, forms, photos)
     where table_name = 'players' and row_id = any (select i::text from unnest(copy_ids) i);
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
