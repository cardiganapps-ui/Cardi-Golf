-- 0070: a person downloads his data and deletes his account himself; age; what the Comité typed about you
-- (TRUST-09, TRUST-13, TRUST-16).
--
-- 1. my_data_export(): everything Polo keeps about the caller, as one JSON (Editar perfil › «Descargar mis
--    datos»): the account's essentials (never a password, a token or a push key), the profile, the players that
--    are him with their holes, results and money, friends, crews, rivalries, notices, consent records, the phones
--    that entered with his PINs, his phones' technical rows and the operator's accesses. Logged in
--    platform_audit_log as «self_export» (his own line: «Accesos del administrador» never shows it).
-- 2. my_delete_preview() and delete_my_account(confirm): the account deleted by its owner, the same way the
--    Admin de Polo deletes one (0022, 0031): his crews handed to their longest member, anonymize_person, the
--    operator's log keeps a fingerprint of the email, then the auth user goes. The confirmation is the account's
--    email, typed. Refused for an anonymous user (nothing to delete but a phone) and for a platform admin (another
--    admin does it). Logged as «self_delete».
-- 3. Age (TRUST-13): legal_acceptances takes a third document, «adult» (the person said he is 18 or older, under
--    the version of the terms he saw), written by confirm_adult; and tournaments.adults_confirmed_at, the Comité's
--    word that every player is an adult, set by confirm_adults. Money is never refused by the server for it: the
--    wizard and the Comité ask before money is on, and a tournament made before this says so in Comité › Torneo.
-- 4. player_corrections (TRUST-16): a player who sees what the Comité saved about him asks it to fix something
--    (request_player_correction, from his own phone or account); the Comité lists them in Comité › Jugadores
--    (player_corrections) and marks each done (resolve_player_correction). RLS on, no policies, no grants.

-- ---------------------------------------------------------------------------
-- 1. Download
-- ---------------------------------------------------------------------------
create or replace function public.my_data_export()
returns jsonb
language plpgsql volatile security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  u auth.users;
  mine uuid[];
begin
  if me is null then raise exception 'Necesitas una sesión' using errcode = '42501'; end if;
  select * into u from auth.users where id = me;
  -- The players that are him: linked to his profile, or the one this phone holds by PIN.
  select coalesce(array_agg(distinct x), '{}') into mine from (
    select p.id x from public.players p where p.profile_id = me
    union select d.player_id from public.device_sessions d where d.auth_user_id = me
  ) s;
  perform public.platform_log('self_export', 'person', me::text, null, null);
  return jsonb_build_object(
    'exportedAt', now(),
    'account', jsonb_build_object('email', u.email, 'anonymous', coalesce(u.is_anonymous, false), 'createdAt', u.created_at,
                                  'lastSignInAt', u.last_sign_in_at, 'confirmedAt', u.email_confirmed_at,
                                  'providers', coalesce(u.raw_app_meta_data -> 'providers', '[]'::jsonb)),
    'profile', (select to_jsonb(p) from public.profiles p where p.id = me),
    'players', coalesce((
      select jsonb_agg(to_jsonb(p) || jsonb_build_object('tournament', t.name) order by t.created_at, p.id)
      from public.players p join public.tournaments t on t.id = p.tournament_id where p.id = any (mine)
    ), '[]'::jsonb),
    'holes', coalesce((
      select jsonb_agg(jsonb_build_object('tournament', t.name, 'round', r.number, 'date', r.date, 'hole', s.hole,
                                          'strokes', s.strokes, 'putts', s.putts, 'pickedUp', s.picked_up, 'updatedAt', s.updated_at)
                       order by t.created_at, r.number, s.hole)
      from public.scores s join public.rounds r on r.id = s.round_id join public.tournaments t on t.id = r.tournament_id
      where s.player_id = any (mine)
    ), '[]'::jsonb),
    'roundResults', coalesce((select jsonb_agg(to_jsonb(x) order by x.round_id) from public.round_results x where x.player_id = any (mine)), '[]'::jsonb),
    'tournamentResults', coalesce((select jsonb_agg(to_jsonb(x) order by x.tournament_id) from public.tournament_results x where x.player_id = any (mine)), '[]'::jsonb),
    'money', coalesce((select jsonb_agg(to_jsonb(x) order by x.tournament_id) from public.tournament_money x where x.player_id = any (mine)), '[]'::jsonb),
    'friends', coalesce((
      select jsonb_agg(jsonb_build_object('handle', o.handle, 'name', o.display_name, 'status', f.status, 'askedByMe', f.a = me, 'since', f.created_at) order by f.created_at)
      from public.friendships f join public.profiles o on o.id = case when f.a = me then f.b else f.a end
      where (f.a = me or f.b = me) and not (f.status = 'blocked' and f.blocked_by is distinct from me)
    ), '[]'::jsonb),
    'crews', coalesce((
      select jsonb_agg(jsonb_build_object('name', c.name, 'slug', c.slug, 'role', m.role, 'joinedAt', m.joined_at) order by m.joined_at)
      from public.crew_members m join public.crews c on c.id = m.crew_id where m.profile_id = me
    ), '[]'::jsonb),
    'rivalries', coalesce((
      select jsonb_agg(to_jsonb(r) - 'a' - 'b' || jsonb_build_object('with', (select o.handle from public.profiles o where o.id = case when r.a = me then r.b else r.a end)) order by r.created_at)
      from public.rivalries r where r.a = me or r.b = me
    ), '[]'::jsonb),
    'notifications', coalesce((select jsonb_agg(to_jsonb(n) - 'profile_id' - 'actor' order by n.created_at) from public.notifications n where n.profile_id = me), '[]'::jsonb),
    'legalAcceptances', coalesce((select jsonb_agg(jsonb_build_object('document', l.document, 'version', l.version, 'context', l.context, 'acceptedAt', l.accepted_at) order by l.accepted_at)
                                 from public.legal_acceptances l where l.auth_user_id = me), '[]'::jsonb),
    -- His browsers' push addresses: where and since when, never the address or its keys.
    'pushSubscriptions', coalesce((select jsonb_agg(jsonb_build_object('service', split_part(split_part(s.endpoint, '://', 2), '/', 1), 'createdAt', s.created_at) order by s.created_at)
                                  from public.push_subscriptions s where s.profile_id = me), '[]'::jsonb),
    'pinPhones', coalesce((
      select jsonb_agg(jsonb_build_object('tournament', t.name, 'player', p.display_name, 'phone', c.platform, 'since', c.claimed_at, 'until', c.released_at) order by c.claimed_at)
      from public.pin_claims c join public.players p on p.id = c.player_id join public.tournaments t on t.id = c.tournament_id
      where c.auth_user_id = me or c.player_id = any (mine)
    ), '[]'::jsonb),
    'devices', coalesce((select jsonb_agg(jsonb_build_object('build', d.build, 'platform', d.platform, 'homeScreen', d.standalone, 'firstSeen', d.first_seen_at, 'lastSeen', d.last_seen_at) order by d.first_seen_at)
                        from public.device_status d where d.auth_user_id = me), '[]'::jsonb),
    'adminAccesses', public.my_admin_accesses(200)
  );
end;
$$;
comment on function public.my_data_export() is 'Everything Polo keeps about the caller, as one JSON (TRUST-09): Editar perfil › «Descargar mis datos».';
revoke execute on function public.my_data_export() from public, anon;
grant execute on function public.my_data_export() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Delete
-- ---------------------------------------------------------------------------
/** Internal: what deleting this account takes and leaves (0031's preview, with the players anonymize_person renames). */
create or replace function public.account_delete_preview(p_user_id uuid)
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select jsonb_build_object(
    'orphaned', coalesce((
      select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name) order by t.name)
      from public.tournaments t
      where exists (select 1 from public.tournament_organizers o where o.tournament_id = t.id and o.auth_user_id = p_user_id)
        and not exists (select 1 from public.tournament_organizers o where o.tournament_id = t.id and o.auth_user_id <> p_user_id)
    ), '[]'::jsonb),
    'anonymizedPlayers', cardinality(public.person_player_ids(p_user_id)),
    'anonymizedIn', coalesce((
      select jsonb_agg(distinct t.name order by t.name) from public.players p join public.tournaments t on t.id = p.tournament_id
      where p.id = any (public.person_player_ids(p_user_id))
    ), '[]'::jsonb),
    'crewsHanded', coalesce((
      select jsonb_agg(c.name order by c.name) from public.crews c
      where c.created_by = p_user_id and exists (select 1 from public.crew_members m where m.crew_id = c.id and m.profile_id <> p_user_id)
    ), '[]'::jsonb),
    'crewsDeleted', coalesce((
      select jsonb_agg(c.name order by c.name) from public.crews c
      where c.created_by = p_user_id and not exists (select 1 from public.crew_members m where m.crew_id = c.id and m.profile_id <> p_user_id)
    ), '[]'::jsonb)
  )
$$;
revoke execute on function public.account_delete_preview(uuid) from public, anon, authenticated;

/** What deleting my account would take and leave, for the confirmation (TRUST-09). */
create or replace function public.my_delete_preview()
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Necesitas una sesión' using errcode = '42501'; end if;
  return public.account_delete_preview(auth.uid());
end;
$$;
revoke execute on function public.my_delete_preview() from public, anon;
grant execute on function public.my_delete_preview() to authenticated, service_role;

/** The owner deletes his own account, as the Admin de Polo would (0031): the confirmation is its email, typed. */
create or replace function public.delete_my_account(p_confirm text)
returns jsonb
language plpgsql volatile security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  u auth.users;
  preview jsonb;
  c record;
  heir uuid;
begin
  if me is null then raise exception 'Necesitas una sesión' using errcode = '42501'; end if;
  select * into u from auth.users where id = me;
  if u.id is null then raise exception 'Esa cuenta ya no existe' using errcode = '22023'; end if;
  if coalesce(u.is_anonymous, false) or coalesce(u.email, '') = '' then
    raise exception 'Solo se borra así una cuenta con correo' using errcode = '42501';
  end if;
  if exists (select 1 from public.platform_admins a where a.auth_user_id = me) then
    raise exception 'Eres admin de Polo: que otro admin borre tu cuenta' using errcode = '42501';
  end if;
  if lower(btrim(coalesce(p_confirm, ''))) <> lower(btrim(u.email)) then
    raise exception 'El correo no coincide' using errcode = '22023';
  end if;
  preview := public.account_delete_preview(me);

  for c in select id from public.crews where created_by = me loop
    select m.profile_id into heir from public.crew_members m
    where m.crew_id = c.id and m.profile_id <> me
    order by (m.role = 'owner') desc, m.joined_at, m.profile_id limit 1;
    if heir is not null then
      update public.crews set created_by = heir where id = c.id;
      update public.crew_members set role = 'owner' where crew_id = c.id and profile_id = heir;
    end if;
  end loop;

  -- While the links still say whose players they are.
  perform public.anonymize_person(me);
  perform public.platform_log('self_delete', 'person', me::text, null, null,
                              preview || jsonb_build_object('emailHash', public.email_fingerprint(u.email, me::text)));
  delete from auth.users where id = me;
  return preview;
end;
$$;
comment on function public.delete_my_account(text) is 'The owner deletes his own account (TRUST-09), the way platform_delete_account does (0031): crews handed on, players anonymized, the email fingerprinted in the log.';
revoke execute on function public.delete_my_account(text) from public, anon;
grant execute on function public.delete_my_account(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Age
-- ---------------------------------------------------------------------------
alter table public.legal_acceptances drop constraint if exists legal_acceptances_document_check;
alter table public.legal_acceptances add constraint legal_acceptances_document_check check (document in ('privacy', 'terms', 'adult'));

/** The person said he is 18 or older, under the terms he saw (TRUST-13). The same checks as accept_legal (0038). */
create or replace function public.confirm_adult(p_terms text, p_context text, p_age_seconds integer default 0, p_user uuid default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid uuid := auth.uid();
  at timestamptz := now() - make_interval(secs => least(greatest(coalesce(p_age_seconds, 0), 0), 8 * 24 * 3600));
  bad boolean;
begin
  if uid is null or (p_user is not null and p_user <> uid) then
    raise exception 'Necesitas una sesión para confirmar tu edad.' using errcode = '42501';
  end if;
  if p_context is null or p_context not in ('pin', 'account', 'organizer', 'quick', 'update') then
    raise exception 'No reconocemos dónde se confirmó.' using errcode = '22023';
  end if;
  if p_terms is null or p_terms !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}(\.[0-9]{1,3})?$' then
    raise exception 'No reconocemos esa versión de los términos.' using errcode = '22023';
  end if;
  begin
    bad := split_part(p_terms, '.', 1)::date > current_date + 1;
  exception when others then
    bad := true;
  end;
  if bad then raise exception 'No reconocemos esa versión de los términos.' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('accept_legal:' || uid::text, 0));
  if (select count(*) from public.legal_acceptances where auth_user_id = uid) <= 99 then
    insert into public.legal_acceptances (auth_user_id, document, version, context, accepted_at)
    values (uid, 'adult', p_terms, p_context, at)
    on conflict (auth_user_id, document, version) do nothing;
  end if;
end $$;
revoke execute on function public.confirm_adult(text, text, integer, uuid) from public, anon;
grant execute on function public.confirm_adult(text, text, integer, uuid) to authenticated;

alter table public.tournaments add column if not exists adults_confirmed_at timestamptz;
comment on column public.tournaments.adults_confirmed_at is
  'When the Comité said every player is 18 or older (TRUST-13): the wizard and Comité › Torneo ask before money is on. Null: not said.';

/** The Comité says every player is an adult (on), or takes it back (off). Audited as the tournament row's change. */
create or replace function public.confirm_adults(p_tournament_id uuid, p_on boolean)
returns timestamptz
language plpgsql volatile security definer
set search_path = public
as $$
declare
  at timestamptz;
begin
  if not public.is_tournament_organizer(p_tournament_id) then
    raise exception 'Solo el Comité lo confirma' using errcode = '42501';
  end if;
  update public.tournaments set adults_confirmed_at = case when coalesce(p_on, false) then coalesce(adults_confirmed_at, now()) end
  where id = p_tournament_id
  returning adults_confirmed_at into at;
  return at;
end;
$$;
revoke execute on function public.confirm_adults(uuid, boolean) from public, anon;
grant execute on function public.confirm_adults(uuid, boolean) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. «Pedir corrección»
-- ---------------------------------------------------------------------------
create table if not exists public.player_corrections (
  id bigint generated always as identity primary key,
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  player_id uuid not null,
  message text not null check (char_length(message) between 3 and 500),
  created_at timestamptz not null default now(),
  done_at timestamptz,
  -- A player of its own tournament (0057's rule for every key to players).
  constraint player_corrections_player_fkey foreign key (tournament_id, player_id) references public.players (tournament_id, id) on delete cascade
);
create index if not exists player_corrections_tournament_idx on public.player_corrections (tournament_id, created_at desc);
create index if not exists player_corrections_player_idx on public.player_corrections (tournament_id, player_id);
alter table public.player_corrections enable row level security;
revoke all on public.player_corrections from anon, authenticated;
drop trigger if exists player_corrections_audit on public.player_corrections;
create trigger player_corrections_audit after insert or update or delete on public.player_corrections for each row execute function public.audit_row();

/** A player asks the Comité to fix what it saved about him (TRUST-16): only his own player, at most five open. */
create or replace function public.request_player_correction(p_tournament_id uuid, p_message text)
returns bigint
language plpgsql volatile security definer
set search_path = public
as $$
declare
  pid uuid := public.my_player_id(p_tournament_id);
  msg text := public.trim_reason(p_message);
  id bigint;
begin
  if pid is null then raise exception 'Solo un jugador del torneo pide una corrección de sus datos' using errcode = '42501'; end if;
  if char_length(msg) < 3 or char_length(msg) > 500 then
    raise exception 'Escribe qué hay que corregir (de 3 a 500 letras)' using errcode = '22023';
  end if;
  if (select count(*) from public.player_corrections c where c.player_id = pid and c.done_at is null) >= 5 then
    raise exception 'Ya tienes cinco pedidos abiertos: espera a que el Comité los vea' using errcode = '22023';
  end if;
  insert into public.player_corrections (tournament_id, player_id, message) values (p_tournament_id, pid, msg) returning player_corrections.id into id;
  return id;
end;
$$;
revoke execute on function public.request_player_correction(uuid, text) from public, anon;
grant execute on function public.request_player_correction(uuid, text) to authenticated, service_role;

/** The Comité's list: open first, then the latest done ones (TRUST-16). */
create or replace function public.player_corrections(p_tournament_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
begin
  if not public.is_tournament_organizer(p_tournament_id) then
    raise exception 'Solo el Comité ve los pedidos de corrección' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', c.id, 'playerId', c.player_id, 'text', c.message, 'at', c.created_at, 'doneAt', c.done_at)
                     order by (c.done_at is null) desc, c.created_at desc)
    from (select * from public.player_corrections x where x.tournament_id = p_tournament_id
          order by (x.done_at is null) desc, x.created_at desc limit 100) c
  ), '[]'::jsonb);
end;
$$;
revoke execute on function public.player_corrections(uuid) from public, anon;
grant execute on function public.player_corrections(uuid) to authenticated, service_role;

/** The Comité marks a request done. */
create or replace function public.resolve_player_correction(p_id bigint)
returns void
language plpgsql volatile security definer
set search_path = public
as $$
declare
  tid uuid := (select c.tournament_id from public.player_corrections c where c.id = p_id);
begin
  if tid is null or not public.is_tournament_organizer(tid) then
    raise exception 'Solo el Comité marca un pedido' using errcode = '42501';
  end if;
  update public.player_corrections set done_at = coalesce(done_at, now()) where id = p_id;
end;
$$;
revoke execute on function public.resolve_player_correction(bigint) from public, anon;
grant execute on function public.resolve_player_correction(bigint) to authenticated, service_role;
