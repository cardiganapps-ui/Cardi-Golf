-- ARCH-06 (0074): a tournament's time zone and currency are its settings; the columns are their mirror,
-- written by a trigger on every insert and update. Rolled back at the end; prints one «ok» line per check.
\set ON_ERROR_STOP 1
\set QUIET 1
\pset tuples_only on
\pset format unaligned
select id as t_a from harness.seed where key = 'tournament_a' \gset
select id as org_a from harness.seed where key = 'org_a' \gset
begin;
select settings::text as base from public.tournaments where id = :'t_a' \gset

-- 1. A new tournament: create_tournament writes the settings only, and the columns follow them.
select set_config('request.jwt.claims', harness.claims(:'org_a'), true) \g /dev/null
set local role authenticated;
select row_to_json(t)::text as made from public.create_tournament('Espejo', jsonb_set(jsonb_set(:'base'::jsonb, '{timezone}', '"America/Tijuana"'), '{currency}', '"USD"')) t \gset
reset role;
select (:'made'::json ->> 'id') as t_new \gset
select harness.check((select timezone = 'America/Tijuana' and currency = 'USD' from public.tournaments where id = :'t_new'),
  'a new tournament''s columns are its settings'' zone and currency, not the defaults');
select harness.check((:'made'::json ->> 'timezone') = 'America/Tijuana', 'create_tournament answers the row as stored, the mirror included');

-- 2. The Comité changes the zone in the settings (update_settings): the column follows.
select settings -> 'timezone' as seen_zone from public.tournaments where id = :'t_new' \gset
select set_config('request.jwt.claims', harness.claims(:'org_a'), true) \g /dev/null
set local role authenticated;
select public.update_settings(:'t_new', jsonb_build_object('settings', jsonb_build_object('timezone', :'seen_zone'::jsonb)), jsonb_build_object('settings', jsonb_build_object('timezone', 'America/Mexico_City'))) ->> 'ok' as saved \gset
reset role;
select harness.check(:'saved' = 'true' and (select timezone from public.tournaments where id = :'t_new') = 'America/Mexico_City', 'a change of the settings'' zone moves the column with it');

-- 3. A write of the column alone changes nothing: the settings are the source.
update public.tournaments set timezone = 'Europe/Madrid', currency = 'EUR' where id = :'t_new';
select harness.check((select timezone = 'America/Mexico_City' and currency = 'USD' from public.tournaments where id = :'t_new'), 'writing a column alone leaves it as the settings say');

-- 4. Settings with no usable value keep what the column had, on an update; nothing is lost.
update public.tournaments set settings = settings - 'timezone' || '{"currency": "pesos"}' where id = :'t_new';
select harness.check((select timezone = 'America/Mexico_City' and currency = 'USD' from public.tournaments where id = :'t_new'), 'settings without a zone or with a currency that is no code keep the columns as they were');
insert into public.tournaments (slug, name, join_code, settings) values ('espejo-sin', 'Sin zona', 'ZZ7422', '{}') returning timezone || ' ' || currency as defaults \gset
select harness.check(:'defaults' = 'America/Mazatlan MXN', 'a row inserted with no zone in its settings keeps the columns'' defaults');

-- 5. Every stored tournament mirrors its settings once 0074 ran (the backfill).
select harness.check(not exists (
  select 1 from public.tournaments
  where jsonb_typeof(settings -> 'timezone') = 'string' and settings ->> 'timezone' <> '' and settings ->> 'timezone' is distinct from timezone
     or (settings ->> 'currency') ~ '^[A-Z]{3}$' and settings ->> 'currency' is distinct from currency), 'every tournament''s columns are its settings''');

-- 6. The trigger function is nobody's to call.
select harness.check(not has_function_privilege('authenticated', 'public.tournaments_settings_mirror()', 'EXECUTE') and not has_function_privilege('anon', 'public.tournaments_settings_mirror()', 'EXECUTE'),
  'tournaments_settings_mirror is a trigger only');
rollback;
