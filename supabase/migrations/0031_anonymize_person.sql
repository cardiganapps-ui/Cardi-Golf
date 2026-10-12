-- Cardi-Golf · 0031 · Deleting an account takes the person off what stays (TRUST-03).
--
-- The notice promises that results of tournaments already played may stay
-- «sin tu nombre». The only deletion path (platform_delete_account, 0022)
-- dropped the profile but left every player the account had confirmed as its
-- own with its full name, display name, photo and form guide, kept those in
-- the audit log's images of the row, and wrote the email into the operator's
-- deletion log.
--
-- anonymize_person(uid), internal, runs inside the deletion before the account
-- goes:
--   - every player confirmed-linked to the profile becomes «Jugador borrado»
--     («Borrado» on the boards), with no photo and no form guide. Its holes,
--     handicap and money stay: they are what the other players' results and
--     the tournament's settlement are made of, and the engine reads them.
--   - the audit log's images of those players lose the same fields, the ones
--     the anonymizing update itself writes included.
-- A player only claimed by a phone's PIN, or linked but never confirmed (a
-- Comité proposal, a duplicate's copy), is not touched: it is the Comité's
-- entry, not the person's own declaration.
--
-- The deletion log keeps a hash of the email (sha-256 of the address and the
-- account id), never the address; the deletion rows already written get the
-- same treatment here. Files stay where they are (Storage is not cleared from
-- SQL), unreferenced.
--
-- platform_delete_preview says beforehand how many players will be renamed
-- and in which tournaments.

-- An audit image of a player, without the person.
create or replace function public.redact_person(j jsonb)
returns jsonb
language sql immutable
set search_path = public
as $$
  select case when j is null then null else j || coalesce((
    select jsonb_object_agg(k, v)
    from (values
      ('full_name', to_jsonb('Jugador borrado'::text)),
      ('display_name', to_jsonb('Borrado'::text)),
      ('avatar_url', 'null'::jsonb),
      ('form_guide', 'null'::jsonb)
    ) x (k, v)
    where j ? k
  ), '{}'::jsonb) end
$$;
revoke execute on function public.redact_person(jsonb) from public, anon, authenticated;

/** Internal: the players this account confirmed as its own, renamed, and their audit images redacted. Returns how many. */
create or replace function public.anonymize_person(p_user_id uuid)
returns integer
language plpgsql volatile security definer
set search_path = public
as $$
declare
  ids uuid[];
begin
  select coalesce(array_agg(p.id order by p.id), '{}') into ids
  from public.players p
  where p.profile_id = p_user_id and p.profile_status = 'confirmed';
  if cardinality(ids) = 0 then return 0; end if;
  update public.players
     set full_name = 'Jugador borrado', display_name = 'Borrado', avatar_url = null, form_guide = null
   where id = any (ids);
  -- Every image of those rows, the one this update just wrote included.
  update public.audit_log
     set before = public.redact_person(before), after = public.redact_person(after)
   where table_name = 'players' and row_id = any (select i::text from unnest(ids) i);
  return cardinality(ids);
end;
$$;
revoke execute on function public.anonymize_person(uuid) from public, anon, authenticated;

-- What the deletion log keeps of an email.
create or replace function public.email_fingerprint(p_email text, p_user_id text)
returns text
language sql immutable
set search_path = public, extensions
as $$
  select case when coalesce(p_email, '') = '' then null
    else encode(extensions.digest(lower(trim(p_email)) || ':' || coalesce(p_user_id, ''), 'sha256'), 'hex') end
$$;
revoke execute on function public.email_fingerprint(text, text) from public, anon, authenticated;

create or replace function public.platform_delete_preview(p_user_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
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
    -- Of those, the ones the account confirmed as its own become «Jugador borrado» (TRUST-03).
    'anonymizedPlayers', (select count(*) from public.players p where p.profile_id = p_user_id and p.profile_status = 'confirmed'),
    'anonymizedIn', coalesce((
      select jsonb_agg(distinct t.name order by t.name) from public.players p join public.tournaments t on t.id = p.tournament_id
      where p.profile_id = p_user_id and p.profile_status = 'confirmed'
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

create or replace function public.platform_delete_account(p_user_id uuid, p_confirm text, p_reason text)
returns jsonb
language plpgsql volatile security definer
set search_path = public
as $$
declare
  u auth.users;
  preview jsonb;
  c record;
  heir uuid;
begin
  if not public.is_platform_admin() then raise exception 'Solo el admin de Polo' using errcode = '42501'; end if;
  u := public.platform_person_target(p_user_id, p_reason);
  if coalesce(u.email, '') = '' then
    if upper(trim(coalesce(p_confirm, ''))) <> 'BORRAR' then
      raise exception 'Escribe BORRAR para confirmar' using errcode = '22023';
    end if;
  elsif lower(trim(coalesce(p_confirm, ''))) <> lower(u.email) then
    raise exception 'El correo no coincide' using errcode = '22023';
  end if;
  preview := public.platform_delete_preview(p_user_id);

  for c in select id from public.crews where created_by = p_user_id loop
    select m.profile_id into heir from public.crew_members m
    where m.crew_id = c.id and m.profile_id <> p_user_id
    order by (m.role = 'owner') desc, m.joined_at, m.profile_id limit 1;
    if heir is not null then
      update public.crews set created_by = heir where id = c.id;
      update public.crew_members set role = 'owner' where crew_id = c.id and profile_id = heir;
    end if;
  end loop;

  -- While the links still say whose players they are.
  perform public.anonymize_person(p_user_id);
  perform public.platform_log('delete', 'person', p_user_id::text, null, trim(p_reason),
                              preview || jsonb_build_object('emailHash', public.email_fingerprint(u.email, p_user_id::text), 'anonymous', coalesce(u.is_anonymous, false)));
  delete from auth.users where id = p_user_id;
  return preview;
end;
$$;
revoke execute on function public.platform_delete_account(uuid, text, text) from public, anon;
grant execute on function public.platform_delete_account(uuid, text, text) to authenticated, service_role;

-- Deletions already logged: the email becomes its fingerprint.
update public.platform_audit_log
   set payload = (payload - 'email')
              || case when public.email_fingerprint(payload ->> 'email', target_id) is null then '{}'::jsonb
                      else jsonb_build_object('emailHash', public.email_fingerprint(payload ->> 'email', target_id)) end
 where action = 'delete' and target_kind = 'person' and payload ? 'email';
