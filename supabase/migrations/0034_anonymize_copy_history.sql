-- Cardi-Golf · 0034 · Deletion, round 4 (TRUST-03, PR 114's third verifier).
--
-- A copy the Comité renamed (a duplicate's, say) keeps its new name and,
-- since 0033, loses the person's photo. But its history still showed her:
-- the images from before the Comité renamed it held her name and form guide,
-- readable in Comité › Historial. And the form guide copied from her
-- confirmed player stayed on the row itself.
--
-- Now every image of such a copy that still carries her name is redacted as
-- the person's players are, the photo goes from all of them, and a form
-- guide that is one of her confirmed players' goes from the row and from
-- every image. Her names and form guides are read before anything is
-- renamed.

-- An image of a copy: without the person when it carries one of her names, else without her photo and her form guide.
create or replace function public.redact_copy(j jsonb, names text[], forms text[])
returns jsonb
language sql immutable
set search_path = public
as $$
  select case
    when j is null then null
    when lower(btrim(j ->> 'full_name')) = any (names) then public.redact_person(j)
    else public.redact_photo(j)
      || case when j ? 'form_guide' and j ->> 'form_guide' = any (forms) then '{"form_guide": null}'::jsonb else '{}'::jsonb end
  end
$$;
revoke execute on function public.redact_copy(jsonb, text[], text[]) from public, anon, authenticated;

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
  -- Read before anything is renamed: her names, and the form guides of the players she confirmed.
  names text[] := array(
    select lower(n) from (
      select nullif(btrim(pr.full_name), '') from public.profiles pr where pr.id = p_user_id
      union all select nullif(btrim(pr.display_name), '') from public.profiles pr where pr.id = p_user_id
      union all select nullif(btrim(p.full_name), '') from public.players p where p.profile_id = p_user_id and p.profile_status = 'confirmed'
    ) x (n) where n is not null);
  forms text[] := array(
    select p.form_guide from public.players p
    where p.profile_id = p_user_id and p.profile_status = 'confirmed' and nullif(btrim(p.form_guide), '') is not null);
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
    update public.players
       set avatar_url = null, form_guide = case when form_guide = any (forms) then null else form_guide end
     where id = any (photo_ids);
    -- Every image of those rows: the ones from before the Comité renamed it lose her too.
    update public.audit_log
       set before = public.redact_copy(before, names, forms), after = public.redact_copy(after, names, forms)
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
