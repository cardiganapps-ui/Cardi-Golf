-- The seed's import and where a course is (0077, after STRAT-14's first production run): a name that matches a catalog
-- course by course_keys_match is that course only when the places don't contradict; a provider id is always the same
-- course. The same cases as src/lib/seedCourses.test.ts's «tells two clubs of the same name apart by their place».
-- Rolled back at the end; prints one «ok» line per check.
\set ON_ERROR_STOP 1
\set QUIET 1
\pset tuples_only on
\pset format unaligned
begin;

-- A card of 18 holes: par 4 everywhere but holes 3 and 12 (par 3) and 6 and 15 (par 5); stroke index = hole.
create function pg_temp.course(name text, ext text, location text default null, city text default null) returns jsonb language sql as $$
  select jsonb_strip_nulls(jsonb_build_object('name', name, 'location', location, 'city', city, 'source', 'golfcourseapi', 'external_id', ext,
    'tees', jsonb_build_array(jsonb_build_object('name', 'Azul', 'rating', 71.5, 'slope', 130,
      'holes', (select jsonb_agg(jsonb_build_object('number', n, 'par', case when n in (3, 12) then 3 when n in (6, 15) then 5 else 4 end,
                                                     'stroke_index', n) order by n) from generate_series(1, 18) n)))))
$$;
create function pg_temp.import(p jsonb) returns jsonb language plpgsql as $$
declare r jsonb;
begin
  set local role service_role;
  r := public.catalog_import_course(p);
  reset role;
  return r;
end $$;
grant execute on all functions in schema pg_temp to service_role;

-- What production's catalog held: La Hacienda, in Atizapán; Quivira, with the provider's long location.
select pg_temp.import(pg_temp.course('Club de Golf La Hacienda', 'gca-hacienda', 'Atizapán de Zaragoza, Estado de México, Mexico')) as hacienda \gset
select pg_temp.import(pg_temp.course('Quivira Golf Club', 'gca-quivira', 'Cabo San Lucas, BCS, Mexico')) as quivira \gset
select pg_temp.import(pg_temp.course('Campo Sin Lugar', 'gca-sinlugar')) as nowhere \gset
select harness.check((:'hacienda'::jsonb ->> 'status') = 'created' and (:'quivira'::jsonb ->> 'status') = 'created' and (:'nowhere'::jsonb ->> 'status') = 'created',
  'the catalog''s courses are imported');
select harness.check(public.course_keys_match(public.course_dupe_key('Club de Golf Hacienda San Gaspar'), public.course_dupe_key('Club de Golf La Hacienda')),
  'San Gaspar''s name still matches La Hacienda''s for the Admin de Polo''s duplicates');

-- Another club whose key extends La Hacienda's, in another city: a course of its own.
select pg_temp.import(pg_temp.course('Club de Golf Hacienda San Gaspar', 'gca-sangaspar', 'Cuernavaca, Morelos, Mexico', 'Cuernavaca')) as gaspar \gset
select harness.check((:'gaspar'::jsonb ->> 'status') = 'created', 'Hacienda San Gaspar in Cuernavaca is imported, not taken for La Hacienda in Atizapán: ' || :'gaspar');
select harness.check((select location from public.courses where id = (:'gaspar'::jsonb ->> 'id')::uuid) = 'Cuernavaca, Morelos, Mexico',
  'with the provider''s location, as before');
-- The same without the list's city: the provider's location is the place.
select pg_temp.import(pg_temp.course('Hacienda Norte', 'gca-norte', 'Monterrey, NL, Mexico')) as norte \gset
select harness.check((:'norte'::jsonb ->> 'status') = 'created', 'a provider''s location is the place when no city comes: ' || :'norte');

-- The same club in the same city, its place said shorter or longer, with or without accents: the catalog's course.
select pg_temp.import(pg_temp.course('Quivira', 'oga-quivira', null, 'Cabo San Lucas')) as quivira2 \gset
select harness.check((:'quivira2'::jsonb ->> 'status') = 'exists' and (:'quivira2'::jsonb ->> 'id') = (:'quivira'::jsonb ->> 'id'),
  'Quivira in Cabo San Lucas is «Quivira Golf Club» in Cabo San Lucas: ' || :'quivira2');
select pg_temp.import(pg_temp.course('La Hacienda', 'oga-hacienda', 'ATIZAPAN DE ZARAGOZA, MÉXICO, Mexico', 'Atizapan de Zaragoza')) as hacienda2 \gset
select harness.check((:'hacienda2'::jsonb ->> 'status') = 'exists' and (:'hacienda2'::jsonb ->> 'id') = (:'hacienda'::jsonb ->> 'id'),
  'a place is compared in lower case with the accents off: ' || :'hacienda2');

-- A place unknown on either side contradicts nothing.
select pg_temp.import(pg_temp.course('Campo Sin Lugar Golf Club', 'oga-sinlugar')) as nowhere2 \gset
select harness.check((:'nowhere2'::jsonb ->> 'status') = 'exists' and (:'nowhere2'::jsonb ->> 'id') = (:'nowhere'::jsonb ->> 'id'),
  'a match with no location on either side is the catalog''s course: ' || :'nowhere2');
select pg_temp.import(pg_temp.course('Campo Sin Lugar', 'oga-sinlugar2', null, 'Mérida')) as nowhere3 \gset
select pg_temp.import(pg_temp.course('Quivira', 'oga-quivira4')) as quivira4 \gset
select pg_temp.import(pg_temp.course('Quivira', 'oga-quivira5', '   ', '')) as quivira5 \gset
select harness.check((:'nowhere3'::jsonb ->> 'status') = 'exists' and (:'quivira4'::jsonb ->> 'status') = 'exists' and (:'quivira5'::jsonb ->> 'status') = 'exists',
  'so does one known on one side only, and a blank place is none');

-- A provider id is the same course wherever the import says it is.
select pg_temp.import(pg_temp.course('Otro Nombre', 'gca-hacienda', 'Cuernavaca, Morelos', 'Cuernavaca')) as same_id \gset
select harness.check((:'same_id'::jsonb ->> 'status') = 'exists' and (:'same_id'::jsonb ->> 'id') = (:'hacienda'::jsonb ->> 'id'),
  'the same provider id is the catalog''s course whatever the place: ' || :'same_id');

rollback;
