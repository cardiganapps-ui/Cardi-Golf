-- ARCH-13 (0043): the Comité's setup is saved key by key. update_settings
-- compares every key the screen saw with the row, under its lock, and writes
-- only the keys it set; a key someone changed meanwhile refuses the whole
-- save and the answer says which. On the two-tenant seed: org_a runs
-- tournament A, org_b runs B, dev_a holds Ana's PIN. Rolled back at the end;
-- prints one «ok» line per check.
\set ON_ERROR_STOP 1
\set QUIET 1
\pset tuples_only on
\pset format unaligned
select id as org_a from harness.seed where key = 'org_a' \gset
select id as org_b from harness.seed where key = 'org_b' \gset
select id as dev_a from harness.seed where key = 'dev_a' \gset
select id as dev_x from harness.seed where key = 'dev_x' \gset
select id as padmin from harness.seed where key = 'platform_admin' \gset
select id as t_a from harness.seed where key = 'tournament_a' \gset
select id as t_b from harness.seed where key = 'tournament_b' \gset
select id as ana from harness.seed where key = 'player_a1' \gset
begin;

-- update_settings as a user of the app: its answer, or the SQLSTATE and the message.
create function pg_temp.call(uid uuid, tid uuid, seen jsonb, setv jsonb) returns text language plpgsql as $$
declare
  r jsonb;
begin
  perform set_config('request.jwt.claims', harness.claims(uid), true);
  set local role authenticated;
  r := public.update_settings(tid, seen, setv);
  reset role;
  return r::text;
exception when others then
  reset role;
  return sqlstate || ' ' || sqlerrm;
end $$;
-- An answer as a check prints it: without the row it carries.
create function pg_temp.brief(o text) returns text language sql as $$
  select case when left(o, 1) = '{' then (o::jsonb - 'now')::text else o end
$$;
create function pg_temp.setting(tid uuid, k text) returns jsonb language sql as $$
  select settings -> k from public.tournaments where id = tid
$$;
create function pg_temp.audits(tid uuid) returns int language sql as $$
  select count(*)::int from public.audit_log where table_name = 'tournaments' and row_id = tid::text
$$;

select settings as original from public.tournaments where id = :'t_a' \gset
select pg_temp.audits(:'t_a') as audits0 \gset

-- 1. The key a screen changed is written; the rest stay as they were
select pg_temp.call(:'org_a', :'t_a', '{"settings":{"entryFee":500}}', '{"settings":{"entryFee":600}}') as out \gset
select harness.check((:'out'::jsonb ->> 'ok')::boolean and (:'out'::jsonb #>> '{now,settings,entryFee}') = '600', 'a key the screen saw as it is gets written: ' || pg_temp.brief(:'out'));
select harness.check((select settings - 'entryFee' from public.tournaments where id = :'t_a') = :'original'::jsonb - 'entryFee', 'every other key stays as it was');
select harness.check(pg_temp.audits(:'t_a') = :audits0 + 1, 'the change is in the history once');

-- 2. Two screens, two keys: both stay (Juegos and Torneo, or two phones)
select pg_temp.call(:'org_a', :'t_a', '{"settings":{"entryFee":600}}', '{"settings":{"entryFee":700}}') as out \gset
select harness.check((:'out'::jsonb ->> 'ok')::boolean, 'a screen saves the entry: ' || pg_temp.brief(:'out'));
select pg_temp.call(:'org_a', :'t_a', jsonb_build_object('settings', jsonb_build_object('labels', :'original'::jsonb -> 'labels')),
  '{"settings":{"labels":{"lastPlace":"La Cuchara","honoree":"El novio","trophy":"el Putter"}}}') as out \gset
select harness.check((:'out'::jsonb ->> 'ok')::boolean, 'a second screen saving another key goes through: ' || pg_temp.brief(:'out'));
select harness.check(pg_temp.setting(:'t_a', 'entryFee') = '700' and pg_temp.setting(:'t_a', 'labels') ->> 'lastPlace' = 'La Cuchara', 'both changes stay: ' || pg_temp.setting(:'t_a', 'entryFee')::text || ' ' || pg_temp.setting(:'t_a', 'labels')::text);

-- 3. A key someone changed since the screen saw it: nothing is written, and the answer says which
select pg_temp.audits(:'t_a') as audits1 \gset
select pg_temp.call(:'org_a', :'t_a', '{"settings":{"entryFee":600,"rounds":1}}', '{"settings":{"entryFee":800,"rounds":2}}') as out \gset
select harness.check(not (:'out'::jsonb ->> 'ok')::boolean and :'out'::jsonb -> 'changed' = '["settings.entryFee"]', 'a stale key refuses the save and is named: ' || pg_temp.brief(:'out'));
select harness.check(:'out'::jsonb #>> '{now,settings,entryFee}' = '700' and :'out'::jsonb #>> '{now,name}' = 'Seed Torneo A', 'the answer carries the row as it is');
select harness.check(pg_temp.setting(:'t_a', 'entryFee') = '700' and pg_temp.setting(:'t_a', 'rounds') = '1', 'nothing is written, not even the key that was current');
select harness.check(pg_temp.audits(:'t_a') = :audits1, 'a refusal leaves no history');

-- 4. A key read and not written still refuses (Torneo's prize check read it)
select pg_temp.call(:'org_a', :'t_a', '{"settings":{"entryFee":700,"prizes":{"stableford":[1]}}}', '{"settings":{"entryFee":900}}') as out \gset
select harness.check(:'out'::jsonb -> 'changed' = '["settings.prizes"]' and pg_temp.setting(:'t_a', 'entryFee') = '700', 'a key only read, changed meanwhile, refuses: ' || pg_temp.brief(:'out'));

-- 5. Content, not spelling: key order and 700 vs 700.0 are the same value
select pg_temp.call(:'org_a', :'t_a', jsonb_build_object('settings', jsonb_build_object('entryFee', 700.0, 'labels', '{"trophy":"el Putter","honoree":"El novio","lastPlace":"La Cuchara"}'::jsonb)),
  '{"settings":{"entryFee":750}}') as out \gset
select harness.check((:'out'::jsonb ->> 'ok')::boolean and pg_temp.setting(:'t_a', 'entryFee') = '750', 'the same value in another spelling is the same: ' || pg_temp.brief(:'out'));

-- 6. A key the row lacks reads as null; a key set to null goes, nested nulls stay
select pg_temp.call(:'org_a', :'t_a', '{"settings":{"expectedPlayers":null}}', '{"settings":{"expectedPlayers":12}}') as out \gset
select harness.check(pg_temp.setting(:'t_a', 'expectedPlayers') = '12', 'a key the row lacked, seen as null, is written: ' || pg_temp.brief(:'out'));
select pg_temp.call(:'org_a', :'t_a', '{"settings":{"expectedPlayers":12}}', '{"settings":{"expectedPlayers":null}}') as out \gset
select harness.check((select not settings ? 'expectedPlayers' from public.tournaments where id = :'t_a'), 'a key set to null is removed: ' || pg_temp.brief(:'out'));
select pg_temp.call(:'org_a', :'t_a', '{"settings":{"games":null}}', '{"settings":{"games":[{"id":"skins","money":{"source":"none"},"note":null}]}}') as out \gset
select harness.check(pg_temp.setting(:'t_a', 'games') = '[{"id":"skins","money":{"source":"none"},"note":null}]', 'a null inside a value stays: ' || pg_temp.setting(:'t_a', 'games')::text);

-- 7. The brand columns, the same way
select pg_temp.call(:'org_a', :'t_a', '{"name":"Seed Torneo A","tagline":null,"accent_color":null}', '{"name":"  Nacho en Cabos  ","tagline":"  ","accent_color":"#0F6E77"}') as out \gset
select harness.check((select name = 'Nacho en Cabos' and tagline is null and accent_color = '#0F6E77' from public.tournaments where id = :'t_a'), 'name trimmed, a blank tagline empty, the accent written: ' || pg_temp.brief(:'out'));
select pg_temp.call(:'org_a', :'t_a', '{"name":"Seed Torneo A","tagline":null}', '{"tagline":"La despedida"}') as out \gset
select harness.check(:'out'::jsonb -> 'changed' = '["name"]' and (select tagline is null from public.tournaments where id = :'t_a'), 'a name changed meanwhile refuses a tagline saved beside it: ' || pg_temp.brief(:'out'));
select pg_temp.call(:'org_a', :'t_a', '{"name":"Nacho en Cabos"}', '{"name":"   "}') as out \gset
select harness.check(:'out' = '22023 El torneo necesita nombre', 'a blank name is refused: ' || pg_temp.brief(:'out'));

-- 8. Nothing is written blind, and the shape is checked before the row
select pg_temp.call(:'org_a', :'t_a', '{"settings":{}}', '{"settings":{"entryFee":1}}') as out \gset
select harness.check(:'out' = '22023 No pudimos leer ese cambio; abre la configuración otra vez y repítelo', 'a key set without being seen is refused: ' || pg_temp.brief(:'out'));
select pg_temp.call(:'org_a', :'t_a', '{}', '{"tagline":"x"}') as out \gset
select harness.check(:'out' like '22023 %', 'a column set without being seen is refused: ' || pg_temp.brief(:'out'));
select pg_temp.call(:'org_a', :'t_a', '{"slug":"otro"}', '{}') as out \gset
select harness.check(:'out' like '22023 %', 'only the settings and the brand columns: ' || pg_temp.brief(:'out'));
select pg_temp.call(:'org_a', :'t_a', '[]', '{}') as out \gset
select harness.check(:'out' like '22023 %', 'what the screen saw is an object: ' || pg_temp.brief(:'out'));
select pg_temp.call(:'org_a', :'t_a', null, '{}') as out \gset
select harness.check(:'out' like '22023 %', 'and is there: ' || pg_temp.brief(:'out'));
select pg_temp.call(:'org_a', :'t_a', '{"settings":[]}', '{}') as out \gset
select harness.check(:'out' like '22023 %', 'its settings an object too: ' || pg_temp.brief(:'out'));
select pg_temp.call(:'org_a', :'t_a', '{"name":3}', '{}') as out \gset
select harness.check(:'out' like '22023 %', 'a name is text: ' || pg_temp.brief(:'out'));

-- 9. Nothing to write: the answer, and no history
select pg_temp.audits(:'t_a') as audits2 \gset
select pg_temp.call(:'org_a', :'t_a', '{"settings":{"entryFee":750}}', '{}') as out \gset
select harness.check((:'out'::jsonb ->> 'ok')::boolean and pg_temp.audits(:'t_a') = :audits2, 'a save that changes nothing writes nothing: ' || pg_temp.brief(:'out'));

-- 10. Only the Comité: another tournament's, a player's phone, a phone with no player, no session
select pg_temp.call(:'org_b', :'t_a', '{"settings":{"entryFee":750}}', '{"settings":{"entryFee":1}}') as out \gset
select harness.check(:'out' = '42501 Solo el Comité puede cambiar la configuración del torneo', 'another tournament''s Comité: ' || pg_temp.brief(:'out'));
select pg_temp.call(:'dev_a', :'t_a', '{"settings":{"entryFee":750}}', '{"settings":{"entryFee":1}}') as out \gset
select harness.check(:'out' like '42501 %', 'a player''s phone: ' || pg_temp.brief(:'out'));
select pg_temp.call(:'dev_x', :'t_a', '{"settings":{"entryFee":750}}', '{"settings":{"entryFee":1}}') as out \gset
select harness.check(:'out' like '42501 %', 'a phone with no player: ' || pg_temp.brief(:'out'));
select pg_temp.call(:'org_a', gen_random_uuid(), '{}', '{}') as out \gset
select harness.check(:'out' like '42501 %', 'a tournament that does not exist: ' || pg_temp.brief(:'out'));
select harness.check(not has_function_privilege('anon', 'public.update_settings(uuid, jsonb, jsonb)', 'execute'), 'no session, no call');
select harness.check(pg_temp.setting(:'t_a', 'entryFee') = '750' and pg_temp.setting(:'t_b', 'entryFee') = '500', 'none of them wrote anything');

-- 11. A player the Comité made admin is the Comité
update public.players set is_admin = true where id = :'ana';
select pg_temp.call(:'dev_a', :'t_a', '{"settings":{"entryFee":750}}', '{"settings":{"entryFee":800}}') as out \gset
select harness.check((:'out'::jsonb ->> 'ok')::boolean and pg_temp.setting(:'t_a', 'entryFee') = '800', 'an admin player saves: ' || pg_temp.brief(:'out'));

-- 12. Protegido: the Polo admin writes only while it is unlocked to him
select set_config('request.jwt.claims', harness.claims(:'org_a'), true) \g /dev/null
set local role authenticated;
select public.set_tournament_protected(:'t_a', true) \g /dev/null
reset role;
select pg_temp.call(:'padmin', :'t_a', '{"settings":{"entryFee":800}}', '{"settings":{"entryFee":900}}') as out \gset
select harness.check(:'out' like '42501 %', 'the Polo admin on a locked Protegido tournament: ' || pg_temp.brief(:'out'));
select set_config('request.jwt.claims', harness.claims(:'padmin'), true) \g /dev/null
set local role authenticated;
select public.platform_unlock(:'t_a', 'Revisar la configuración') \g /dev/null
reset role;
select pg_temp.call(:'padmin', :'t_a', '{"settings":{"entryFee":800}}', '{"settings":{"entryFee":900}}') as out \gset
select harness.check((:'out'::jsonb ->> 'ok')::boolean and pg_temp.setting(:'t_a', 'entryFee') = '900', 'and once unlocked: ' || pg_temp.brief(:'out'));

-- 13. A row whose settings are not an object (an old write): the key goes in an object
update public.tournaments set settings = '[]' where id = :'t_b';
select pg_temp.call(:'org_b', :'t_b', '{"settings":{"entryFee":null}}', '{"settings":{"entryFee":500}}') as out \gset
select harness.check((select settings = '{"entryFee":500}' from public.tournaments where id = :'t_b'), 'settings that were not an object become one: ' || pg_temp.brief(:'out'));

rollback;
