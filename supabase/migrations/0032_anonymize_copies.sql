-- Cardi-Golf · 0032 · Deletion also reaches the copies of the person (TRUST-03, round 2).
--
-- 0031 renamed only the players the account confirmed as its own. PR 114's
-- verifier found two flows that copy the person onto players left pending:
--   - a friend's Ronda rápida builds the friend's player from the profile
--     (name, display name, photo: create_quick_round, 0017);
--   - duplicate_tournament copies a confirmed player into the copy as
--     pending, name, photo and form guide included (0013).
-- Both kept the person's name and photo after the deletion. And
-- platform_set_organizer logs the email in plain text, a row 0031's rewrite
-- did not reach.
--
-- Now a player linked to the profile is the person's when it is confirmed,
-- or when it is pending and carries the person's name or photo: the
-- profile's own, or a confirmed player's. A pending player the Comité gave
-- another name keeps it. Every operator-log row that holds the account's
-- email (any action) keeps its fingerprint instead, and GoTrue's own audit
-- rows for the account go, where that table exists (on production it is
-- empty today).

/** Internal: the players that are this person (TRUST-03), for the preview and the deletion alike. */
create or replace function public.person_player_ids(p_user_id uuid)
returns uuid[]
language sql stable security definer
set search_path = public
as $$
  with me as (
    select nullif(btrim(pr.full_name), '') as full_name, nullif(btrim(pr.display_name), '') as display_name, nullif(btrim(pr.avatar_url), '') as avatar_url
    from public.profiles pr where pr.id = p_user_id
  ),
  confirmed as (
    select p.id, nullif(btrim(p.full_name), '') as full_name, nullif(btrim(p.avatar_url), '') as avatar_url
    from public.players p where p.profile_id = p_user_id and p.profile_status = 'confirmed'
  ),
  names as (
    select lower(n) as n from (
      select full_name from me union all select display_name from me union all select full_name from confirmed
    ) x (n) where n is not null
  ),
  photos as (
    select a from (select avatar_url from me union all select avatar_url from confirmed) x (a) where a is not null
  )
  select coalesce(array_agg(p.id order by p.id), '{}')
  from public.players p
  where p.profile_id = p_user_id
    and (p.profile_status = 'confirmed'
         or (p.profile_status = 'pending'
             and (lower(btrim(p.full_name)) in (select n from names)
                  or nullif(btrim(p.avatar_url), '') in (select a from photos))))
$$;
revoke execute on function public.person_player_ids(uuid) from public, anon, authenticated;

create or replace function public.anonymize_person(p_user_id uuid)
returns integer
language plpgsql volatile security definer
set search_path = public
as $$
declare
  ids uuid[] := public.person_player_ids(p_user_id);
  mail text;
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

  -- The operator's log, whatever the action: the email's fingerprint, never the address.
  select email into mail from auth.users where id = p_user_id;
  if coalesce(mail, '') <> '' then
    update public.platform_audit_log
       set payload = (payload - 'email') || jsonb_build_object('emailHash', public.email_fingerprint(mail, p_user_id::text))
     where payload ? 'email' and lower(btrim(payload ->> 'email')) = lower(btrim(mail));
  end if;
  -- GoTrue's own audit rows for the account, where the table exists.
  if to_regclass('auth.audit_log_entries') is not null then
    execute 'delete from auth.audit_log_entries where payload ->> ''actor_id'' = $1' using p_user_id::text;
  end if;
  return cardinality(ids);
end;
$$;
revoke execute on function public.anonymize_person(uuid) from public, anon, authenticated;

create or replace function public.platform_delete_preview(p_user_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  ids uuid[] := public.person_player_ids(p_user_id);
begin
  if not public.is_platform_admin() then raise exception 'Solo el admin de Polo' using errcode = '42501'; end if;
  return jsonb_build_object(
    -- Tournaments whose whole Comité is this account: they stay, with no Comité.
    'orphaned', coalesce((
      select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name) order by t.name)
      from public.tournaments t
      where exists (select 1 from public.tournament_organizers o where o.tournament_id = t.id and o.auth_user_id = p_user_id)
        and not exists (select 1 from public.tournament_organizers o where o.tournament_id = t.id and o.auth_user_id <> p_user_id)
    ), '[]'::jsonb),
    'organizerOf', (select count(*) from public.tournament_organizers o where o.auth_user_id = p_user_id),
    -- Players keep their scores; the link to the profile goes.
    'linkedPlayers', (select count(*) from public.players p where p.profile_id = p_user_id),
    -- Of those, the ones that are the person become «Jugador borrado» (TRUST-03), Protegido tournaments included.
    'anonymizedPlayers', cardinality(ids),
    'anonymizedIn', coalesce((
      select jsonb_agg(distinct t.name order by t.name) from public.players p join public.tournaments t on t.id = p.tournament_id
      where p.id = any (ids)
    ), '[]'::jsonb),
    -- Crews this account created: handed to the longest member, or gone if it was alone.
    'crewsHanded', coalesce((
      select jsonb_agg(c.name order by c.name) from public.crews c
      where c.created_by = p_user_id and exists (select 1 from public.crew_members m where m.crew_id = c.id and m.profile_id <> p_user_id)
    ), '[]'::jsonb),
    'crewsDeleted', coalesce((
      select jsonb_agg(c.name order by c.name) from public.crews c
      where c.created_by = p_user_id and not exists (select 1 from public.crew_members m where m.crew_id = c.id and m.profile_id <> p_user_id)
    ), '[]'::jsonb),
    'friendships', (select count(*) from public.friendships f where f.a = p_user_id or f.b = p_user_id),
    'rivalries', (select count(*) from public.rivalries r where r.a = p_user_id or r.b = p_user_id),
    'notifications', (select count(*) from public.notifications n where n.profile_id = p_user_id),
    'push', (select count(*) from public.push_subscriptions s where s.profile_id = p_user_id),
    'hasProfile', exists (select 1 from public.profiles p where p.id = p_user_id)
  );
end;
$$;
revoke execute on function public.platform_delete_preview(uuid) from public, anon;
grant execute on function public.platform_delete_preview(uuid) to authenticated, service_role;

-- Rows already logged with an email whose account is gone: the fingerprint, keyed by the account the row names.
update public.platform_audit_log l
   set payload = (l.payload - 'email')
              || case when public.email_fingerprint(l.payload ->> 'email', coalesce(l.payload ->> 'userId', l.target_id)) is null then '{}'::jsonb
                      else jsonb_build_object('emailHash', public.email_fingerprint(l.payload ->> 'email', coalesce(l.payload ->> 'userId', l.target_id))) end
 where l.payload ? 'email'
   and not exists (select 1 from auth.users u where lower(u.email) = lower(btrim(l.payload ->> 'email')));
