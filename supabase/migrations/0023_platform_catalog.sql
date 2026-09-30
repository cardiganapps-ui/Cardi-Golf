-- Admin de Polo, slice 3: the catalog — courses and crews.
--
-- Courses are shared by every tournament, and anyone with an account can
-- add one, so the catalog fills with duplicates ("Quivira", "Quivira Los
-- Cabos", "quivira") and with cards typed wrong. The admin can now see
-- them all, find duplicates and broken cards, fix a card (the existing
-- editor: can_edit_course already lets him), merge a duplicate into the
-- good one, and delete one nobody plays.
--
-- Merging is the delicate one. Rounds, round_tees, players' default tees
-- and scorecard photos move from the dropped course to the kept one, tee
-- by tee as the admin maps them. It refuses when a mapped pair of tees
-- would change how a hole is scored (a different par or stroke index on
-- any hole), when a tee in use is left unmapped, or when a Protegido
-- tournament plays it and is not unlocked. Rating and slope may differ, so
-- the finished rounds that moved get their results recomputed.
--
-- Crews: every crew, its members and outings; remove a member (the owner
-- is replaced by the longest member, the last one out deletes it, as
-- leave_crew does) or delete the crew (its tournaments stay, out of it).

-- ---------------------------------------------------------------------------
-- 1. Courses
-- ---------------------------------------------------------------------------
/** A name reduced to what makes two course names the same course. */
create or replace function public.course_dupe_key(p_name text)
returns text
language sql immutable
set search_path = public
as $$
  select regexp_replace(
    regexp_replace(lower(translate(coalesce(p_name, ''), 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunaeiouun')),
                   '\m(golf|club|course|campo|de|del|la|el|the|country|cc|gc|resort|links)\M', '', 'g'),
    '[^a-z0-9]', '', 'g')
$$;

/** Two course names that are probably the same course: equal keys, or one extends the other ("quivira" / "quiviraloscabos"). */
create or replace function public.course_keys_match(a text, b text)
returns boolean
language sql immutable
set search_path = public
as $$
  select coalesce(a, '') <> '' and coalesce(b, '') <> '' and (
    a = b or (least(length(a), length(b)) >= 5 and (a like b || '%' or b like a || '%'))
  )
$$;

/** What is wrong with a tee's card, if anything: hole count, pars, stroke indexes. */
create or replace function public.tee_problems(p_tee uuid)
returns text[]
language sql stable
set search_path = public
as $$
  with h as (select * from public.holes where tee_id = p_tee),
  n as (select count(*)::int as c from h)
  select array_remove(array[
    case when (select c from n) not in (9, 18) then 'holes' end,
    case when exists (select 1 from h where par not between 3 and 6) then 'par' end,
    -- 18 holes: the stroke indexes are 1..18, each once.
    case when (select c from n) = 18
          and (select array_agg(stroke_index order by stroke_index) from h) is distinct from (select array_agg(x order by x) from generate_series(1, 18) x)
         then 'si' end,
    -- 9 holes: nine different stroke indexes, all within 1..18.
    case when (select c from n) = 9
          and ((select count(distinct stroke_index) from h) <> 9 or exists (select 1 from h where stroke_index not between 1 and 18))
         then 'si' end
  ], null)
$$;
revoke execute on function public.tee_problems(uuid) from public, anon;
grant execute on function public.tee_problems(uuid) to authenticated, service_role;

/** Every course, with its use and its problems. Filters: all, unused, dupes, broken. */
create or replace function public.platform_courses(
  p_q text default null, p_filter text default 'all', p_limit int default 50, p_offset int default 0
)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  q text := nullif(lower(trim(coalesce(p_q, ''))), '');
begin
  if not public.is_platform_admin() then raise exception 'Solo el admin de Polo' using errcode = '42501'; end if;
  return (
    with base as (
      select c.*, public.course_dupe_key(c.name) as dupe_key,
        (select count(*) from public.tees t where t.course_id = c.id) as n_tees,
        (select count(*) from public.rounds r where r.course_id = c.id) as n_rounds,
        (select count(distinct r.tournament_id) from public.rounds r where r.course_id = c.id) as n_tournaments,
        (select u.email from auth.users u where u.id = c.created_by) as creator_email,
        exists (select 1 from public.tees t where t.course_id = c.id and cardinality(public.tee_problems(t.id)) > 0)
          or not exists (select 1 from public.tees t where t.course_id = c.id) as broken
      from public.courses c
    ),
    counted as (
      select b.*, (select count(*) from base o where o.id <> b.id and public.course_keys_match(o.dupe_key, b.dupe_key)) as n_dupes from base b
    ),
    hits as (
      select * from counted x
      where (coalesce(p_filter, 'all') = 'all'
          or (p_filter = 'unused' and x.n_rounds = 0)
          or (p_filter = 'dupes' and x.n_dupes > 0)
          or (p_filter = 'broken' and x.broken))
        and (q is null or lower(x.name) like '%' || q || '%' or lower(coalesce(x.location, '')) like '%' || q || '%')
    )
    select jsonb_build_object(
      'total', (select count(*) from hits),
      'rows', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', h.id, 'name', h.name, 'location', h.location, 'source', h.source, 'createdAt', h.created_at,
          'creatorEmail', h.creator_email, 'tees', h.n_tees, 'rounds', h.n_rounds, 'tournaments', h.n_tournaments,
          'dupeKey', h.dupe_key, 'dupes', h.n_dupes, 'broken', h.broken
        ) order by h.dupe_key, h.n_rounds desc, h.created_at)
        from (select * from hits order by (p_filter = 'dupes') desc, dupe_key, n_rounds desc, created_at
              limit least(greatest(coalesce(p_limit, 50), 1), 200) offset greatest(coalesce(p_offset, 0), 0)) h
      ), '[]'::jsonb)
    )
  );
end;
$$;
revoke execute on function public.platform_courses(text, text, int, int) from public, anon;
grant execute on function public.platform_courses(text, text, int, int) to authenticated, service_role;

/** One course: tees with their cards and problems, where it is played, and its likely duplicates. */
create or replace function public.platform_course(p_course_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  c public.courses;
  k text;
begin
  if not public.is_platform_admin() then raise exception 'Solo el admin de Polo' using errcode = '42501'; end if;
  select * into c from public.courses where id = p_course_id;
  if c.id is null then return null; end if;
  k := public.course_dupe_key(c.name);
  return jsonb_build_object(
    'id', c.id, 'name', c.name, 'location', c.location, 'source', c.source, 'attribution', c.attribution,
    'website', c.website, 'createdAt', c.created_at,
    'creatorEmail', (select u.email from auth.users u where u.id = c.created_by),
    'tees', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id, 'name', t.name, 'color', t.color, 'rating', t.rating, 'slope', t.slope, 'parTotal', t.par_total,
        'problems', to_jsonb(public.tee_problems(t.id)),
        'inUse', (select count(*) from public.round_tees rt where rt.tee_id = t.id)
                 + (select count(*) from public.players p where p.default_tee_id = t.id),
        'holes', coalesce((select jsonb_agg(jsonb_build_object('n', h.number, 'par', h.par, 'si', h.stroke_index) order by h.number)
                           from public.holes h where h.tee_id = t.id), '[]'::jsonb)
      ) order by t.sort_order, t.name)
      from public.tees t where t.course_id = c.id
    ), '[]'::jsonb),
    'usedBy', coalesce((
      select jsonb_agg(jsonb_build_object('tournamentId', x.id, 'name', x.name, 'status', x.status, 'protected', x.is_protected, 'rounds', x.n) order by x.name)
      from (select t.id, t.name, t.status, t.is_protected, count(*) as n
            from public.rounds r join public.tournaments t on t.id = r.tournament_id
            where r.course_id = c.id group by t.id) x
    ), '[]'::jsonb),
    'dupes', coalesce((
      select jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name, 'location', d.location,
                                          'rounds', (select count(*) from public.rounds r where r.course_id = d.id)) order by d.name)
      from public.courses d where d.id <> c.id and public.course_keys_match(public.course_dupe_key(d.name), k)
    ), '[]'::jsonb)
  );
end;
$$;
revoke execute on function public.platform_course(uuid) from public, anon;
grant execute on function public.platform_course(uuid) to authenticated, service_role;

/** Internal: recompute the published results of the finished rounds played on a course. */
create or replace function public.platform_refresh_rounds_on(p_course_id uuid)
returns int
language plpgsql volatile security definer
set search_path = public
as $$
declare
  n int := 0;
  r record;
begin
  for r in select id from public.rounds where course_id = p_course_id and status = 'finished' loop
    perform public.refresh_round_results(r.id);
    n := n + 1;
  end loop;
  return n;
end;
$$;
revoke execute on function public.platform_refresh_rounds_on(uuid) from public, anon, authenticated;

/** After fixing a card that finished rounds were played on: recompute their results (and the Polo index). */
create or replace function public.platform_refresh_course_results(p_course_id uuid)
returns int
language plpgsql volatile security definer
set search_path = public
as $$
declare
  n int;
begin
  if not public.is_platform_admin() then raise exception 'Solo el admin de Polo' using errcode = '42501'; end if;
  n := public.platform_refresh_rounds_on(p_course_id);
  perform public.platform_log('course_refresh', 'course', p_course_id::text, null, null, jsonb_build_object('rounds', n));
  return n;
end;
$$;
revoke execute on function public.platform_refresh_course_results(uuid) from public, anon;
grant execute on function public.platform_refresh_course_results(uuid) to authenticated, service_role;

/**
 * Merge p_drop into p_keep. p_tee_map: {"<drop tee id>": "<keep tee id>"}.
 * Every tee of the dropped course that anything uses must be mapped; each
 * mapped pair must score the same (par and stroke index on every hole).
 */
create or replace function public.platform_merge_courses(p_keep uuid, p_drop uuid, p_tee_map jsonb, p_reason text)
returns jsonb
language plpgsql volatile security definer
set search_path = public
as $$
declare
  kept public.courses;
  dropped public.courses;
  t record;
  target uuid;
  moved_rounds int;
  refreshed int;
begin
  if not public.is_platform_admin() then raise exception 'Solo el admin de Polo' using errcode = '42501'; end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'Escribe el motivo' using errcode = '22023'; end if;
  if p_keep = p_drop then raise exception 'Es el mismo campo' using errcode = '22023'; end if;
  select * into kept from public.courses where id = p_keep;
  select * into dropped from public.courses where id = p_drop;
  if kept.id is null or dropped.id is null then raise exception 'Uno de los campos ya no existe' using errcode = '22023'; end if;
  if exists (
    select 1 from public.rounds r join public.tournaments x on x.id = r.tournament_id
    where r.course_id = p_drop and x.is_protected and not public.platform_can_write(x.id)
  ) then
    raise exception 'Lo juega un torneo protegido; desbloquéalo primero' using errcode = '42501';
  end if;

  for t in select id, name from public.tees where course_id = p_drop loop
    target := nullif(p_tee_map ->> t.id::text, '')::uuid;
    if target is null then
      if exists (select 1 from public.round_tees where tee_id = t.id) or exists (select 1 from public.players where default_tee_id = t.id) then
        raise exception 'Falta decir a qué tee pasa «%»: alguien lo juega', t.name using errcode = '22023';
      end if;
      continue;
    end if;
    if not exists (select 1 from public.tees where id = target and course_id = p_keep) then
      raise exception 'El tee destino de «%» no es del campo que se queda', t.name using errcode = '22023';
    end if;
    -- Same card, hole by hole: the number of holes, and par and stroke index on each.
    if (select count(*) from public.holes where tee_id = t.id) <> (select count(*) from public.holes where tee_id = target)
       or exists (
         select 1 from public.holes a join public.holes b on b.tee_id = target and b.number = a.number
         where a.tee_id = t.id and (a.par <> b.par or a.stroke_index <> b.stroke_index)
       ) then
      raise exception 'Las tarjetas de «%» no coinciden (par o ventaja distintos); corrígelas antes de fusionar', t.name using errcode = '22023';
    end if;
    update public.round_tees set tee_id = target where tee_id = t.id;
    update public.players set default_tee_id = target where default_tee_id = t.id;
  end loop;

  update public.rounds set course_id = p_keep where course_id = p_drop;
  get diagnostics moved_rounds = row_count;
  update public.course_documents set course_id = p_keep where course_id = p_drop;
  delete from public.courses where id = p_drop;
  refreshed := public.platform_refresh_rounds_on(p_keep);

  perform public.platform_log('course_merge', 'course', p_keep::text, null, trim(p_reason),
                              jsonb_build_object('dropped', p_drop, 'droppedName', dropped.name, 'keptName', kept.name,
                                                 'teeMap', p_tee_map, 'rounds', moved_rounds, 'refreshed', refreshed));
  return jsonb_build_object('rounds', moved_rounds, 'refreshed', refreshed);
end;
$$;
revoke execute on function public.platform_merge_courses(uuid, uuid, jsonb, text) from public, anon;
grant execute on function public.platform_merge_courses(uuid, uuid, jsonb, text) to authenticated, service_role;

/** Delete a course nobody plays. One in use is merged instead. */
create or replace function public.platform_delete_course(p_course_id uuid, p_reason text)
returns void
language plpgsql volatile security definer
set search_path = public
as $$
declare
  c public.courses;
begin
  if not public.is_platform_admin() then raise exception 'Solo el admin de Polo' using errcode = '42501'; end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'Escribe el motivo' using errcode = '22023'; end if;
  select * into c from public.courses where id = p_course_id;
  if c.id is null then raise exception 'Ese campo ya no existe' using errcode = '22023'; end if;
  if exists (select 1 from public.rounds where course_id = p_course_id)
     or exists (select 1 from public.round_tees rt join public.tees t on t.id = rt.tee_id where t.course_id = p_course_id)
     or exists (select 1 from public.players p join public.tees t on t.id = p.default_tee_id where t.course_id = p_course_id) then
    raise exception 'Este campo se juega; fusiónalo con otro en lugar de borrarlo' using errcode = '22023';
  end if;
  perform public.platform_log('course_delete', 'course', p_course_id::text, null, trim(p_reason), jsonb_build_object('name', c.name));
  delete from public.courses where id = p_course_id;
end;
$$;
revoke execute on function public.platform_delete_course(uuid, text) from public, anon;
grant execute on function public.platform_delete_course(uuid, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Crews
-- ---------------------------------------------------------------------------
create or replace function public.platform_crews(p_q text default null, p_limit int default 50, p_offset int default 0)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  q text := nullif(lower(trim(coalesce(p_q, ''))), '');
begin
  if not public.is_platform_admin() then raise exception 'Solo el admin de Polo' using errcode = '42501'; end if;
  return (
    with hits as (
      select c.*,
        (select count(*) from public.crew_members m where m.crew_id = c.id) as n_members,
        (select count(*) from public.tournaments t where t.crew_id = c.id) as n_outings,
        (select max(t.created_at) from public.tournaments t where t.crew_id = c.id) as last_outing,
        (select p.display_name from public.profiles p where p.id = c.created_by) as owner_name
      from public.crews c
      where q is null or lower(c.name) like '%' || q || '%' or c.slug like '%' || q || '%' or lower(c.join_code) = q
    )
    select jsonb_build_object(
      'total', (select count(*) from hits),
      'rows', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', h.id, 'slug', h.slug, 'name', h.name, 'createdAt', h.created_at, 'ownerName', h.owner_name,
          'members', h.n_members, 'outings', h.n_outings, 'lastOutingAt', h.last_outing
        ) order by coalesce(h.last_outing, h.created_at) desc)
        from (select * from hits order by coalesce(last_outing, created_at) desc
              limit least(greatest(coalesce(p_limit, 50), 1), 200) offset greatest(coalesce(p_offset, 0), 0)) h
      ), '[]'::jsonb)
    )
  );
end;
$$;
revoke execute on function public.platform_crews(text, int, int) from public, anon;
grant execute on function public.platform_crews(text, int, int) to authenticated, service_role;

create or replace function public.platform_crew(p_crew_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  c public.crews;
begin
  if not public.is_platform_admin() then raise exception 'Solo el admin de Polo' using errcode = '42501'; end if;
  select * into c from public.crews where id = p_crew_id;
  if c.id is null then return null; end if;
  return jsonb_build_object(
    'id', c.id, 'slug', c.slug, 'name', c.name, 'joinCode', c.join_code, 'createdAt', c.created_at, 'ownerId', c.created_by,
    'members', coalesce((
      select jsonb_agg(jsonb_build_object('profileId', m.profile_id, 'handle', p.handle, 'displayName', p.display_name,
                                          'avatarUrl', p.avatar_url, 'role', m.role, 'joinedAt', m.joined_at)
                       order by (m.role = 'owner') desc, m.joined_at)
      from public.crew_members m join public.profiles p on p.id = m.profile_id where m.crew_id = c.id
    ), '[]'::jsonb),
    'outings', coalesce((
      select jsonb_agg(jsonb_build_object('tournamentId', t.id, 'name', t.name, 'status', t.status, 'quick', t.quick,
                                          'practice', not t.counts_for_stats, 'createdAt', t.created_at) order by t.created_at desc)
      from public.tournaments t where t.crew_id = c.id
    ), '[]'::jsonb),
    'activity', coalesce((
      select jsonb_agg(jsonb_build_object('id', l.id, 'at', l.at, 'action', l.action, 'reason', l.reason) order by l.at desc)
      from (select * from public.platform_audit_log l where l.target_kind = 'crew' and l.target_id = c.id::text order by l.at desc limit 20) l
    ), '[]'::jsonb)
  );
end;
$$;
revoke execute on function public.platform_crew(uuid) from public, anon;
grant execute on function public.platform_crew(uuid) to authenticated, service_role;

/**
 * Take someone out of a crew. Taking out the owner hands the crew to the
 * longest member; taking out the last member deletes the crew (as
 * leave_crew does). Returns what became of it: 'removed', 'handed', 'deleted'.
 */
create or replace function public.platform_crew_remove_member(p_crew_id uuid, p_profile_id uuid, p_reason text)
returns text
language plpgsql volatile security definer
set search_path = public
as $$
declare
  c public.crews;
  heir uuid;
  outcome text := 'removed';
begin
  if not public.is_platform_admin() then raise exception 'Solo el admin de Polo' using errcode = '42501'; end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'Escribe el motivo' using errcode = '22023'; end if;
  select * into c from public.crews where id = p_crew_id;
  if c.id is null then raise exception 'Ese crew ya no existe' using errcode = '22023'; end if;
  if not exists (select 1 from public.crew_members where crew_id = c.id and profile_id = p_profile_id) then
    raise exception 'No es de este crew' using errcode = '22023';
  end if;
  select m.profile_id into heir from public.crew_members m
  where m.crew_id = c.id and m.profile_id <> p_profile_id
  order by (m.role = 'owner') desc, m.joined_at, m.profile_id limit 1;
  if heir is null then
    delete from public.crews where id = c.id;
    outcome := 'deleted';
  else
    if c.created_by = p_profile_id then
      update public.crews set created_by = heir where id = c.id;
      update public.crew_members set role = 'owner' where crew_id = c.id and profile_id = heir;
      outcome := 'handed';
    end if;
    delete from public.crew_members where crew_id = c.id and profile_id = p_profile_id;
  end if;
  perform public.platform_log('crew_remove_member', 'crew', c.id::text, null, trim(p_reason),
                              jsonb_build_object('profileId', p_profile_id, 'outcome', outcome, 'name', c.name));
  return outcome;
end;
$$;
revoke execute on function public.platform_crew_remove_member(uuid, uuid, text) from public, anon;
grant execute on function public.platform_crew_remove_member(uuid, uuid, text) to authenticated, service_role;

/** Delete a crew. Its tournaments stay, out of the crew. The confirmation is its exact name. */
create or replace function public.platform_delete_crew(p_crew_id uuid, p_confirm text, p_reason text)
returns void
language plpgsql volatile security definer
set search_path = public
as $$
declare
  c public.crews;
begin
  if not public.is_platform_admin() then raise exception 'Solo el admin de Polo' using errcode = '42501'; end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'Escribe el motivo' using errcode = '22023'; end if;
  select * into c from public.crews where id = p_crew_id;
  if c.id is null then raise exception 'Ese crew ya no existe' using errcode = '22023'; end if;
  if trim(coalesce(p_confirm, '')) <> c.name then raise exception 'El nombre no coincide' using errcode = '22023'; end if;
  perform public.platform_log('crew_delete', 'crew', c.id::text, null, trim(p_reason),
                              jsonb_build_object('name', c.name, 'members', (select count(*) from public.crew_members where crew_id = c.id),
                                                 'outings', (select count(*) from public.tournaments where crew_id = c.id)));
  delete from public.crews where id = c.id;
end;
$$;
revoke execute on function public.platform_delete_crew(uuid, text, text) from public, anon;
grant execute on function public.platform_delete_crew(uuid, text, text) to authenticated, service_role;
