-- The seed's import tells two clubs of the same name apart by where they are (STRAT-14, after PR 228).
--
-- catalog_import_course (0075) answered `exists` for any catalog course whose name matched by course_keys_match
-- (0023), which also takes a key that extends the other by any letters once the shorter has 5. On production's run
-- «Club de Golf Hacienda San Gaspar» (key `haciendasangaspar`, in Morelos) was skipped as «Club de Golf La Hacienda»
-- (key `hacienda`, in Atizapán de Zaragoza): two clubs in two cities, and the skip was for good. The loose match stays
-- right for the Admin de Polo's «posibles duplicados» (platform_courses), where a person decides; course_keys_match and
-- platform_courses are untouched.
--
-- Now a name match counts only when the places don't contradict: when both the import's place and the catalog row's
-- `location` are known, one holds the other, both folded (lower case, accents off: what scripts/seed-courses.mjs's
-- `fold` does). The import's place is `p.city` (the seed list's city, which the script sends since this migration)
-- or, without one, `p.location`. A match by provider id (source and external_id) is `exists` whatever the places
-- say, as before; so is a name match where either place is unknown. Nothing else changes: the same checks, the same
-- lock, the same rows written (`location` is still `p.location`).

/**
 * scripts/seed-courses.mjs: one provider's complete card into the catalog, or nothing. p: {name, location, city?,
 * source ('golfcourseapi' | 'opengolfapi'), external_id, attribution, website, latitude, longitude, tees: [{name,
 * color, gender, rating, slope, holes: [{number, par, stroke_index, yards}]}]}. Answers {status: 'created', id, tees}
 * or {status: 'exists', id, name} (a course from the same provider id, or one whose name matches it in a place that
 * doesn't contradict it, untouched).
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
  -- Lower case with the accents off, as the script's fold: translate first, since lower() follows the server's locale.
  acc constant text := 'áéíóúàèìòùäëïöüâêîôûñçÁÉÍÓÚÀÈÌÒÙÄËÏÖÜÂÊÎÔÛÑÇ';
  bare constant text := 'aeiouaeiouaeiouaeiouncaeiouaeiouaeiouaeiounc';
  place text := lower(translate(coalesce(nullif(btrim(coalesce(p ->> 'city', '')), ''), nullif(btrim(coalesce(p ->> 'location', '')), '')), acc, bare));
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
  select c.* into hit
    from public.courses c
    cross join lateral (select lower(translate(nullif(btrim(coalesce(c.location, '')), ''), acc, bare)) as here) l
   where (c.source = src and c.external_id = ext)
      or (public.course_keys_match(public.course_dupe_key(c.name), key)
          and (place is null or l.here is null or strpos(l.here, place) > 0 or strpos(place, l.here) > 0))
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
