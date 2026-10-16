-- The course catalog: how courses arrive, which cards a person checked, and the seed (STRAT-14).
--
-- docs/strategy/course-catalog.md, steps 1 to 4. No hole is scored without a course's card, and it is the first
-- thing a new organizer stalls on: the trip's Day 1 course has no card in either provider.
--
-- 1. The card's history on the course row. `card_changed_at`: the last time the card (its tees and holes) changed
--    in any way after the course was first saved: a tee or a hole added, changed or taken out. `card_corrected_at`
--    and `card_corrected_by`: the last change or removal of what the card already held (a hole's par, stroke index
--    or yards; a tee's name, color, rating, slope, par or gender; a tee or hole taken out), so a card whose tees came
--    later (a course created from a location-only hit, then its photo) is not a corrected card. What the card held
--    before and after, and who changed it, is the audit log's (0021 audits courses, tees and holes). The transaction
--    that created the course (save_course, catalog_import_course) is its first save, never a change: a course row
--    holds its transaction's start in `created_at`, which is `now()` all through that transaction. A save that
--    writes every hole again with the same values changes nothing (save_course upserts every hole).
--
-- 2. Verified cards. `verified_at`, `verified_by` (the account) and `verified_via` (`platform` | `comite`): a person
--    compared the card with the club's printed one. Any later change of the card (the same changes as above,
--    additions included) takes the mark off, through the same triggers. Unverified cards stay usable.
--    - The Admin de Polo: platform_verify_course(course, on, reason), on or off, logged through platform_log
--      (`course_verify`, `course_unverify`). A card with no tee, or a tee with a problem (tee_problems), is not
--      verified.
--    - The Comité: verify_course(course, tournament, reason), on only. The rule is conservative on purpose; every
--      part must hold:
--        a. the caller is that tournament's Comité (is_tournament_organizer);
--        b. the tournament is Terminado, counts for stats (not an Ensayo) and is no Ronda rápida;
--        c. one of its days on this course is finished with every one of its holes scored for at least one player
--           (the course was really played, not just picked);
--        d. the card has not changed in any way since the tournament's first hole on this course was saved
--           (`card_changed_at` before the first score of any of its days there, by the audit log and the scores'
--           own stamps, whichever is earlier): they played the card as it stands;
--        e. every tee of the course has a sound card (tee_problems empty), and there is at least one;
--        f. a reason of 3 to 200 letters (trim_reason), which lands on the course's audit line (`cardi.reason`).
--      A card already verified answers as it is and writes nothing. Taking the mark off is the Admin de Polo's, or
--      any change to the card.
--    Nobody writes these columns directly (`courses_card_guard`, every role): only the functions here and the card
--    triggers, each under `cardi.course_card`, and an account's deletion nulling who verified or corrected. A new
--    course starts unverified and unchanged.
--
-- 3. catalog_import_course(p): scripts/seed-courses.mjs imports a provider's complete card through it, the service
--    role only. Complete means every tee has 18 holes numbered 1 to 18, a par of 3 to 6 on each, stroke indexes 1 to
--    18 each once, a rating and a slope of 55 to 155; anything less is refused whole (22023). It never touches an
--    existing course: one whose name matches (course_dupe_key, course_keys_match, as the Admin de Polo's duplicates
--    are found) or that came from the same provider id answers `exists` with that course and writes nothing. One
--    import at a time (a transaction lock), so two runs never add the same course twice.
--
-- 4. The funnel (platform_funnel, 0067's body plus `courses`): for the funnel's tournaments, each distinct course
--    their days play, split by how it arrived (`courses.source`: `search` for a provider, `photo` for a scorecard
--    photo, `manual` typed) and by whether it was already in the catalog when the tournament was created (`found`)
--    or was added after (`added`), for every tournament (`all`) and for each organizer's first one (`first`: the
--    earliest tournament his account created that is no Ronda rápida). Counted per tournament and course. Keys are
--    added, none renamed: a client from before reads the funnel as it did.
--
-- 5. platform_courses and platform_course (0023's bodies) say each course's verification and last correction, and
--    the list filters `verified`, `unverified` and `corrected` (corrected since it was first saved, the latest
--    first).

-- ---------------------------------------------------------------------------
-- 1. Columns
-- ---------------------------------------------------------------------------
alter table public.courses
  add column verified_at timestamptz,
  add column verified_by uuid references auth.users (id) on delete set null,
  add column verified_via text check (verified_via in ('platform', 'comite')),
  add column card_changed_at timestamptz,
  add column card_corrected_at timestamptz,
  add column card_corrected_by uuid references auth.users (id) on delete set null,
  add constraint courses_verified_shape check ((verified_at is null) = (verified_via is null));
create index courses_verified_by_idx on public.courses (verified_by);
create index courses_card_corrected_by_idx on public.courses (card_corrected_by);

comment on column public.courses.verified_at is 'When a person compared the card with the club''s printed one (STRAT-14); null after any later change to the card.';
comment on column public.courses.card_changed_at is 'The last change of the card (tees, holes) after the course was first saved, additions included.';
comment on column public.courses.card_corrected_at is 'The last change or removal of what the card already held, after the course was first saved.';

-- ---------------------------------------------------------------------------
-- 2. Nobody writes them directly
-- ---------------------------------------------------------------------------
create or replace function public.courses_card_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(current_setting('cardi.course_card', true), '') = 'on' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.verified_at is not null or new.verified_by is not null or new.verified_via is not null
       or new.card_changed_at is not null or new.card_corrected_at is not null or new.card_corrected_by is not null then
      raise exception 'Una tarjeta nueva no llega verificada ni corregida' using errcode = '42501';
    end if;
  -- An account deleted sets its `verified_by` and `card_corrected_by` to null (on delete set null): that, and only
  -- that, is let through.
  elsif (old.verified_at, old.verified_via, old.card_changed_at, old.card_corrected_at)
        is distinct from (new.verified_at, new.verified_via, new.card_changed_at, new.card_corrected_at)
     or (new.verified_by is not null and new.verified_by is distinct from old.verified_by)
     or (new.card_corrected_by is not null and new.card_corrected_by is distinct from old.card_corrected_by) then
    raise exception 'La marca de tarjeta verificada solo se cambia desde Polo' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke execute on function public.courses_card_guard() from public, anon, authenticated, service_role;
create trigger courses_card_guard before insert or update on public.courses
  for each row execute function public.courses_card_guard();

-- ---------------------------------------------------------------------------
-- 3. A change to the card takes the mark off and is dated
-- ---------------------------------------------------------------------------
/** Internal: the card of course p_course changed (p_correction: what it held changed or went). */
create or replace function public.course_card_mark(p_course uuid, p_correction boolean)
returns void
language plpgsql volatile security definer
set search_path = public
as $$
begin
  if p_course is null then
    return;
  end if;
  perform set_config('cardi.course_card', 'on', true);
  -- Never in the transaction that created the course (its first save), and once per transaction and kind.
  update public.courses c
     set verified_at = null, verified_by = null, verified_via = null,
         card_changed_at = now(),
         card_corrected_at = case when p_correction then now() else c.card_corrected_at end,
         card_corrected_by = case when p_correction then auth.uid() else c.card_corrected_by end
   where c.id = p_course
     and c.created_at <> now()
     and (c.verified_at is not null
          or c.card_changed_at is distinct from now()
          or (p_correction and (c.card_corrected_at is distinct from now() or c.card_corrected_by is distinct from auth.uid())));
  perform set_config('cardi.course_card', '', true);
end;
$$;
revoke execute on function public.course_card_mark(uuid, boolean) from public, anon, authenticated, service_role;

create or replace function public.tees_card_changed()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.course_card_mark(new.course_id, false);
  elsif tg_op = 'DELETE' then
    -- A tee going with its course (a cascade) finds no course: nothing to mark.
    perform public.course_card_mark(old.course_id, true);
  else
    if (old.course_id, old.name, old.color, old.rating, old.slope, old.par_total, old.gender)
       is not distinct from (new.course_id, new.name, new.color, new.rating, new.slope, new.par_total, new.gender) then
      return null; -- its place in the list (sort_order) is not the card
    end if;
    perform public.course_card_mark(new.course_id, true);
    if old.course_id is distinct from new.course_id then
      perform public.course_card_mark(old.course_id, true);
    end if;
  end if;
  return null;
end;
$$;
revoke execute on function public.tees_card_changed() from public, anon, authenticated, service_role;
create trigger tees_card_changed after insert or update or delete on public.tees
  for each row execute function public.tees_card_changed();

create or replace function public.holes_card_changed()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  tee uuid;
begin
  if tg_op = 'UPDATE' and (old.tee_id, old.number, old.par, old.stroke_index, old.yards)
                          is not distinct from (new.tee_id, new.number, new.par, new.stroke_index, new.yards) then
    return null;
  end if;
  tee := case when tg_op = 'DELETE' then old.tee_id else new.tee_id end;
  -- A hole going with its tee (a cascade) finds no tee: the tee's own delete marks the course.
  perform public.course_card_mark((select t.course_id from public.tees t where t.id = tee), tg_op <> 'INSERT');
  if tg_op = 'UPDATE' and old.tee_id is distinct from new.tee_id then
    perform public.course_card_mark((select t.course_id from public.tees t where t.id = old.tee_id), true);
  end if;
  return null;
end;
$$;
revoke execute on function public.holes_card_changed() from public, anon, authenticated, service_role;
create trigger holes_card_changed after insert or update or delete on public.holes
  for each row execute function public.holes_card_changed();

-- ---------------------------------------------------------------------------
-- 4. Verifying a card
-- ---------------------------------------------------------------------------
/** Internal: whether every tee of the course has a sound card, and there is one. */
create or replace function public.course_card_sound(p_course uuid)
returns boolean
language sql stable
set search_path = public
as $$
  select exists (select 1 from public.tees t where t.course_id = p_course)
     and not exists (select 1 from public.tees t where t.course_id = p_course and cardinality(public.tee_problems(t.id)) > 0)
$$;
revoke execute on function public.course_card_sound(uuid) from public, anon, authenticated;

/** The Admin de Polo marks a card verified (he compared it with the printed one) or takes the mark off. */
create or replace function public.platform_verify_course(p_course_id uuid, p_on boolean, p_reason text)
returns jsonb
language plpgsql volatile security definer
set search_path = public
as $$
declare
  c public.courses;
  why text := public.trim_reason(p_reason);
begin
  if not public.is_platform_admin() then raise exception 'Solo el admin de Polo' using errcode = '42501'; end if;
  if char_length(why) < 3 or char_length(why) > 200 then raise exception 'Escribe el motivo (de 3 a 200 letras)' using errcode = '22023'; end if;
  select * into c from public.courses where id = p_course_id for update;
  if c.id is null then raise exception 'Ese campo ya no existe' using errcode = '22023'; end if;
  if coalesce(p_on, false) and not public.course_card_sound(c.id) then
    raise exception 'Corrige la tarjeta antes de verificarla: tiene un tee sin hoyos completos o con errores' using errcode = '22023';
  end if;
  perform set_config('cardi.reason', why, true);
  perform set_config('cardi.course_card', 'on', true);
  if coalesce(p_on, false) then
    update public.courses set verified_at = now(), verified_by = auth.uid(), verified_via = 'platform' where id = c.id;
  else
    update public.courses set verified_at = null, verified_by = null, verified_via = null where id = c.id;
  end if;
  perform set_config('cardi.course_card', '', true);
  perform set_config('cardi.reason', '', true);
  perform public.platform_log(case when coalesce(p_on, false) then 'course_verify' else 'course_unverify' end, 'course', c.id::text, null, why,
                              jsonb_build_object('name', c.name, 'was', c.verified_via));
  return jsonb_build_object('verifiedAt', (select verified_at from public.courses where id = c.id));
end;
$$;
revoke execute on function public.platform_verify_course(uuid, boolean, text) from public, anon;
grant execute on function public.platform_verify_course(uuid, boolean, text) to authenticated, service_role;

/**
 * The Comité of a tournament that played the course verifies its card: the rule in the header (a to f).
 * Refused with the reason in Spanish (22023), or 42501 for anyone but that Comité.
 */
create or replace function public.verify_course(p_course_id uuid, p_tournament_id uuid, p_reason text)
returns jsonb
language plpgsql volatile security definer
set search_path = public
as $$
declare
  c public.courses;
  t public.tournaments;
  why text := public.trim_reason(p_reason);
  first_hole timestamptz;
begin
  if p_tournament_id is null or not public.is_tournament_organizer(p_tournament_id) then
    raise exception 'Solo el Comité de un torneo que jugó el campo verifica su tarjeta' using errcode = '42501';
  end if;
  if char_length(why) < 3 or char_length(why) > 200 then raise exception 'Escribe el motivo (de 3 a 200 letras)' using errcode = '22023'; end if;
  select * into c from public.courses where id = p_course_id for update;
  if c.id is null then raise exception 'Ese campo ya no existe' using errcode = '22023'; end if;
  if c.verified_at is not null then
    return jsonb_build_object('verifiedAt', c.verified_at);
  end if;
  select * into t from public.tournaments where id = p_tournament_id;
  if t.status <> 'finished' or t.quick or not t.counts_for_stats then
    raise exception 'Solo el Comité de un torneo terminado verifica la tarjeta (un ensayo o una ronda rápida no)' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.rounds r
    where r.tournament_id = t.id and r.course_id = c.id and r.status = 'finished'
      and (select count(distinct s.hole) from public.scores s where s.round_id = r.id and s.hole between 1 and r.holes) = r.holes
  ) then
    raise exception 'El torneo no terminó un día completo en este campo' using errcode = '22023';
  end if;
  -- The tournament's first hole on this course: the history's first line, or a score's own stamp if earlier.
  select least(
    (select min(l.at) from public.audit_log l
      where l.tournament_id = t.id and l.table_name = 'scores'
        and public.try_uuid(coalesce(l.after ->> 'round_id', l.before ->> 'round_id')) in
            (select r.id from public.rounds r where r.tournament_id = t.id and r.course_id = c.id)),
    (select min(s.updated_at) from public.scores s join public.rounds r on r.id = s.round_id
      where r.tournament_id = t.id and r.course_id = c.id)
  ) into first_hole;
  if first_hole is null or (c.card_changed_at is not null and c.card_changed_at >= first_hole) then
    raise exception 'La tarjeta cambió después de que el torneo la jugó: la verifica el Admin de Polo' using errcode = '22023';
  end if;
  if not public.course_card_sound(c.id) then
    raise exception 'Corrige la tarjeta antes de verificarla: tiene un tee sin hoyos completos o con errores' using errcode = '22023';
  end if;
  perform set_config('cardi.reason', why, true);
  perform set_config('cardi.course_card', 'on', true);
  update public.courses set verified_at = now(), verified_by = auth.uid(), verified_via = 'comite' where id = c.id;
  perform set_config('cardi.course_card', '', true);
  perform set_config('cardi.reason', '', true);
  return jsonb_build_object('verifiedAt', (select verified_at from public.courses where id = c.id));
end;
$$;
revoke execute on function public.verify_course(uuid, uuid, text) from public, anon;
grant execute on function public.verify_course(uuid, uuid, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. The seed's import
-- ---------------------------------------------------------------------------
/**
 * scripts/seed-courses.mjs: one provider's complete card into the catalog, or nothing. p: {name, location, source
 * ('golfcourseapi' | 'opengolfapi'), external_id, attribution, website, latitude, longitude, tees: [{name, color,
 * gender, rating, slope, holes: [{number, par, stroke_index, yards}]}]}. Answers {status: 'created', id, tees} or
 * {status: 'exists', id, name} (a course that matches it by name or provider id, untouched).
 */
create or replace function public.catalog_import_course(p jsonb)
returns jsonb
language plpgsql volatile security definer
set search_path = public
as $$
declare
  nm text := btrim(coalesce(p ->> 'name', ''));
  src text := p ->> 'source';
  ext text := btrim(coalesce(p ->> 'external_id', ''));
  key text;
  hit public.courses;
  t jsonb;
  h jsonb;
  cid uuid;
  tid uuid;
  i int := 0;
begin
  if jsonb_typeof(p) is distinct from 'object' or jsonb_typeof(p -> 'tees') is distinct from 'array' or jsonb_array_length(p -> 'tees') = 0 then
    raise exception 'El campo llega sin tees: no se importa' using errcode = '22023';
  end if;
  if nm = '' or char_length(nm) > 120 then raise exception 'El campo necesita nombre' using errcode = '22023'; end if;
  if src is null or src not in ('golfcourseapi', 'opengolfapi') then raise exception 'Solo se importa una tarjeta de GolfCourseAPI u OpenGolfAPI' using errcode = '22023'; end if;
  if ext = '' then raise exception 'Falta el identificador del campo en su base' using errcode = '22023'; end if;
  for t in select x from jsonb_array_elements(p -> 'tees') x loop
    if jsonb_typeof(t) is distinct from 'object' or jsonb_typeof(t -> 'holes') is distinct from 'array'
       or btrim(coalesce(t ->> 'name', '')) = ''
       or jsonb_typeof(t -> 'rating') is distinct from 'number' or (t ->> 'rating')::numeric not between 50 and 90
       or jsonb_typeof(t -> 'slope') is distinct from 'number' or (t ->> 'slope')::numeric not between 55 and 155
       or (t ->> 'slope')::numeric <> round((t ->> 'slope')::numeric) then
      raise exception 'El tee «%» necesita nombre, rating y slope', t ->> 'name' using errcode = '22023';
    end if;
    if jsonb_array_length(t -> 'holes') <> 18
       or exists (select 1 from jsonb_array_elements(t -> 'holes') x
                  where jsonb_typeof(x -> 'number') is distinct from 'number' or jsonb_typeof(x -> 'par') is distinct from 'number'
                     or jsonb_typeof(x -> 'stroke_index') is distinct from 'number'
                     or (x ->> 'par')::numeric not in (3, 4, 5, 6))
       or (select array_agg((x ->> 'number')::numeric order by (x ->> 'number')::numeric) from jsonb_array_elements(t -> 'holes') x)
          is distinct from (select array_agg(n::numeric order by n) from generate_series(1, 18) n)
       or (select array_agg((x ->> 'stroke_index')::numeric order by (x ->> 'stroke_index')::numeric) from jsonb_array_elements(t -> 'holes') x)
          is distinct from (select array_agg(n::numeric order by n) from generate_series(1, 18) n) then
      raise exception 'El tee «%» necesita par e índice de golpe en los 18 hoyos', t ->> 'name' using errcode = '22023';
    end if;
  end loop;

  -- One import at a time: two runs never both find the course missing.
  perform pg_advisory_xact_lock(hashtext('catalog_import_course'));
  key := public.course_dupe_key(nm);
  select * into hit from public.courses c
   where (c.source = src and c.external_id = ext) or public.course_keys_match(public.course_dupe_key(c.name), key)
   order by (c.source = src and c.external_id = ext) desc, c.created_at
   limit 1;
  if hit.id is not null then
    return jsonb_build_object('status', 'exists', 'id', hit.id, 'name', hit.name);
  end if;

  insert into public.courses (name, location, source, external_id, imported_at, attribution, website, latitude, longitude, created_by)
  values (nm, nullif(btrim(coalesce(p ->> 'location', '')), ''), src, ext, now(), p ->> 'attribution', p ->> 'website',
          (p ->> 'latitude')::numeric, (p ->> 'longitude')::numeric, null)
  returning id into cid;
  for t in select x from jsonb_array_elements(p -> 'tees') x loop
    insert into public.tees (course_id, name, color, gender, rating, slope, par_total, sort_order)
    values (cid, btrim(t ->> 'name'), t ->> 'color', t ->> 'gender', (t ->> 'rating')::numeric, (t ->> 'slope')::int,
            (select sum((x ->> 'par')::int) from jsonb_array_elements(t -> 'holes') x), i)
    returning id into tid;
    for h in select x from jsonb_array_elements(t -> 'holes') x loop
      insert into public.holes (tee_id, number, par, stroke_index, yards)
      values (tid, (h ->> 'number')::int, (h ->> 'par')::int, (h ->> 'stroke_index')::int,
              case when jsonb_typeof(h -> 'yards') = 'number' then round((h ->> 'yards')::numeric)::int end);
    end loop;
    i := i + 1;
  end loop;
  return jsonb_build_object('status', 'created', 'id', cid, 'tees', i);
end;
$$;
revoke execute on function public.catalog_import_course(jsonb) from public, anon, authenticated;
grant execute on function public.catalog_import_course(jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- 6. The funnel: how each course arrived (0067's body plus `courses`)
-- ---------------------------------------------------------------------------
create or replace function public.platform_funnel(p_days int default 90)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  n int := least(greatest(coalesce(p_days, 90), 7), 365);
begin
  if not public.is_platform_admin() then raise exception 'Solo el admin de Polo' using errcode = '42501'; end if;
  return (
    with t as (
      select tt.id, tt.created_by, tt.status, tt.created_at
      from public.tournaments tt
      where not tt.quick
        and tt.counts_for_stats
        and tt.created_at > now() - make_interval(days => n)
        and not exists (select 1 from public.platform_admins a where a.auth_user_id = tt.created_by)
    ),
    facts as (
      select t.id, t.created_by, t.status,
        (select count(*) from public.players p where p.tournament_id = t.id) as players,
        exists (select 1 from public.rounds r where r.tournament_id = t.id and r.status in ('live', 'finished')) as played,
        exists (select 1 from public.scores s where s.tournament_id = t.id) as scored,
        exists (select 1 from public.card_signatures c where c.tournament_id = t.id) as signed,
        (select count(distinct l.actor_auth_user_id) from public.audit_log l
          where l.tournament_id = t.id and l.table_name = 'scores' and l.actor_auth_user_id is not null) as phones
      from t
    ),
    reached as (
      select f.created_by, v.ord, v.key
      from facts f
      cross join (values (1, 'created'), (2, 'field'), (3, 'played'), (4, 'scored'), (5, 'signed'), (6, 'finished')) v(ord, key)
      where case v.key
        when 'created' then true
        when 'field' then f.players >= 2
        when 'played' then f.played
        when 'scored' then f.scored
        when 'signed' then f.signed
        else f.status = 'finished'
      end
    ),
    -- The organizer's first tournament: the earliest his account created that is no Ronda rápida.
    firsts as (
      select t.id,
        not exists (
          select 1 from public.tournaments o
          where o.created_by = t.created_by and not o.quick and o.id <> t.id
            and (o.created_at, o.id) < (t.created_at, t.id)
        ) as first
      from t
    ),
    -- Each course a tournament's days play, once per tournament.
    played_on as (
      select distinct t.id as tid, f.first, c.id as cid,
        case when c.source in ('golfcourseapi', 'opengolfapi') then 'search' when c.source = 'scorecard_photo' then 'photo' else 'manual' end as how,
        c.created_at < t.created_at as found
      from t
      join firsts f on f.id = t.id
      join public.rounds r on r.tournament_id = t.id
      join public.courses c on c.id = r.course_id
    ),
    split as (
      select scope.name as scope,
        jsonb_build_object(
          'tournaments', (select count(*) from firsts f where scope.name = 'all' or f.first),
          'withCourse', (select count(distinct p.tid) from played_on p where scope.name = 'all' or p.first),
          'found', jsonb_build_object(
            'search', (select count(*) from played_on p where (scope.name = 'all' or p.first) and p.found and p.how = 'search'),
            'photo', (select count(*) from played_on p where (scope.name = 'all' or p.first) and p.found and p.how = 'photo'),
            'manual', (select count(*) from played_on p where (scope.name = 'all' or p.first) and p.found and p.how = 'manual')),
          'added', jsonb_build_object(
            'search', (select count(*) from played_on p where (scope.name = 'all' or p.first) and not p.found and p.how = 'search'),
            'photo', (select count(*) from played_on p where (scope.name = 'all' or p.first) and not p.found and p.how = 'photo'),
            'manual', (select count(*) from played_on p where (scope.name = 'all' or p.first) and not p.found and p.how = 'manual'))
        ) as figures
      from (values ('all'), ('first')) scope(name)
    )
    select jsonb_build_object(
      'days', n,
      'northStar', (select count(*) from facts f where f.status = 'finished' and f.players >= 8 and f.phones >= 3),
      'finished', (select count(*) from facts f where f.status = 'finished'),
      'organizers', (select count(distinct f.created_by) from facts f),
      'steps', (
        select coalesce(jsonb_agg(jsonb_build_object('key', k.key, 'tournaments', k.tournaments, 'organizers', k.organizers) order by k.ord), '[]'::jsonb)
        from (
          select v.ord, v.key,
            (select count(*) from reached r where r.key = v.key) as tournaments,
            (select count(distinct r.created_by) from reached r where r.key = v.key) as organizers
          from (values (1, 'created'), (2, 'field'), (3, 'played'), (4, 'scored'), (5, 'signed'), (6, 'finished')) v(ord, key)
        ) k
      ),
      'courses', (select jsonb_object_agg(s.scope, s.figures) from split s)
    )
  );
end;
$$;
revoke execute on function public.platform_funnel(int) from public, anon;
grant execute on function public.platform_funnel(int) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 7. The Admin de Polo's Campos: verification and corrections (0023's bodies plus them)
-- ---------------------------------------------------------------------------
/** Every course, with its use and its problems. Filters: all, unused, dupes, broken, verified, unverified, corrected. */
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
          or (p_filter = 'broken' and x.broken)
          or (p_filter = 'verified' and x.verified_at is not null)
          or (p_filter = 'unverified' and x.verified_at is null)
          or (p_filter = 'corrected' and x.card_corrected_at is not null))
        and (q is null or lower(x.name) like '%' || q || '%' or lower(coalesce(x.location, '')) like '%' || q || '%')
    ),
    page as (
      select h.*, row_number() over (
        order by case when p_filter = 'corrected' then h.card_corrected_at end desc nulls last, h.dupe_key, h.n_rounds desc, h.created_at, h.id
      ) as ord
      from hits h
      order by ord
      limit least(greatest(coalesce(p_limit, 50), 1), 200) offset greatest(coalesce(p_offset, 0), 0)
    )
    select jsonb_build_object(
      'total', (select count(*) from hits),
      'rows', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', h.id, 'name', h.name, 'location', h.location, 'source', h.source, 'createdAt', h.created_at,
          'creatorEmail', h.creator_email, 'tees', h.n_tees, 'rounds', h.n_rounds, 'tournaments', h.n_tournaments,
          'dupeKey', h.dupe_key, 'dupes', h.n_dupes, 'broken', h.broken,
          'verifiedAt', h.verified_at, 'verifiedVia', h.verified_via, 'correctedAt', h.card_corrected_at
        ) order by h.ord)
        from page h
      ), '[]'::jsonb)
    )
  );
end;
$$;
revoke execute on function public.platform_courses(text, text, int, int) from public, anon;
grant execute on function public.platform_courses(text, text, int, int) to authenticated, service_role;

/** One course: tees with their cards and problems, where it is played, its likely duplicates, its verification and corrections. */
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
    'website', c.website, 'createdAt', c.created_at, 'importedAt', c.imported_at,
    'creatorEmail', (select u.email from auth.users u where u.id = c.created_by),
    'verifiedAt', c.verified_at, 'verifiedVia', c.verified_via,
    'verifierEmail', (select u.email from auth.users u where u.id = c.verified_by),
    'cardChangedAt', c.card_changed_at, 'correctedAt', c.card_corrected_at,
    'correctorEmail', (select u.email from auth.users u where u.id = c.card_corrected_by),
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
