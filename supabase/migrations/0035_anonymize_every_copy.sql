-- Cardi-Golf · 0035 · Deletion, round 5 (TRUST-03, PR 114's fourth verifier).
--
-- 0033 and 0034 cleaned a pending copy only when it still carried the
-- person's photo. A copy the Comité renamed and gave no photo, or another
-- photo, matched nothing: its history kept her name and photo and the row
-- kept her form guide. And a copy renamed in full name only kept her short
-- name, which is what the boards show.
--
-- Now every pending player linked to the profile that is not one of hers
-- (person_player_ids) is treated as a copy, and loses exactly what is hers:
-- her photo, her form guide, her short name (it shows the Comité's full name
-- instead), and in every image of its history the same, the images that
-- still carry one of her names redacted in full. What the Comité gave it of
-- its own (a name, a photo) stays.

-- An image of a copy: without the person in full when it carries one of her names, else without what of it is hers.
create or replace function public.redact_copy(j jsonb, names text[], forms text[], photos text[])
returns jsonb
language sql immutable
set search_path = public
as $$
  select case
    when j is null then null
    when lower(btrim(j ->> 'full_name')) = any (names) then public.redact_person(j)
    else j
      || case when j ? 'avatar_url' and nullif(btrim(j ->> 'avatar_url'), '') = any (photos) then '{"avatar_url": null}'::jsonb else '{}'::jsonb end
      || case when j ? 'form_guide' and j ->> 'form_guide' = any (forms) then '{"form_guide": null}'::jsonb else '{}'::jsonb end
      || case when j ? 'display_name' and lower(btrim(j ->> 'display_name')) = any (names)
              then jsonb_build_object('display_name', coalesce(nullif(btrim(j ->> 'full_name'), ''), 'Borrado')) else '{}'::jsonb end
  end
$$;
revoke execute on function public.redact_copy(jsonb, text[], text[], text[]) from public, anon, authenticated;

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
  names text[] := array(
    select lower(n) from (
      select nullif(btrim(pr.full_name), '') from public.profiles pr where pr.id = p_user_id
      union all select nullif(btrim(pr.display_name), '') from public.profiles pr where pr.id = p_user_id
      union all select nullif(btrim(p.full_name), '') from public.players p where p.profile_id = p_user_id and p.profile_status = 'confirmed'
      union all select nullif(btrim(p.display_name), '') from public.players p where p.profile_id = p_user_id and p.profile_status = 'confirmed'
    ) x (n) where n is not null);
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
