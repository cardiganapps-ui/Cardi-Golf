-- «Cerrar torneo» on the server (0029, MONEY-05): Terminado and
-- publish_tournament_results wait while a planned day is missing or open, or
-- a hole the server kept waits in «Pendientes de revisar». Leaving Terminado
-- stays free, a restore writes a Terminado backup back as it was, and a Ronda
-- rápida closes in the order its screen does it. Each step runs as the user
-- who does it in the app, on the two-tenant seed: org_a runs tournament A
-- (one day planned, round 1 scheduled, Ana and Beto in group 1), the device
-- dev_a holds Ana. Rolled back at the end; prints one «ok» line per check.
\set ON_ERROR_STOP 1
\set QUIET 1
\pset tuples_only on
\pset format unaligned
select id as org_a from harness.seed where key = 'org_a' \gset
select id as org_b from harness.seed where key = 'org_b' \gset
select id as dev_a from harness.seed where key = 'dev_a' \gset
select id as padmin from harness.seed where key = 'platform_admin' \gset
select id as t_a from harness.seed where key = 'tournament_a' \gset
select id as t_b from harness.seed where key = 'tournament_b' \gset
select id as ana from harness.seed where key = 'player_a1' \gset
select id as beto from harness.seed where key = 'player_a2' \gset
select id as r1 from harness.seed where key = 'round_a1' \gset
begin;

-- A status change as the caller: how many rows it changed («0» when the rules hide the row), or the SQLSTATE and the message.
create function pg_temp.try_status(t uuid, s text) returns text language plpgsql as $$
declare
  n int;
begin
  update public.tournaments set status = s where id = t;
  get diagnostics n = row_count;
  return n::text;
exception when others then
  return sqlstate || ' ' || sqlerrm;
end $$;
create function pg_temp.try_publish(t uuid) returns text language plpgsql as $$
declare
  out jsonb;
begin
  out := public.publish_tournament_results(t, jsonb_build_array(
    jsonb_build_object('playerId', (select p.id from public.players p where p.tournament_id = t order by p.sort_order limit 1), 'rank', 1, 'rankLabel', '1', 'points', 36, 'perRound', jsonb_build_array(36), 'awards', '[]'::jsonb, 'net', 0)), 'MXN');
  return 'ok ' || out::text;
exception when others then
  return sqlstate || ' ' || sqlerrm;
end $$;
create function pg_temp.try_call(fn text, t uuid) returns text language plpgsql as $$
begin
  execute format('select public.%I($1)', fn) using t;
  return 'taken';
exception when others then
  return sqlstate || ' ' || sqlerrm;
end $$;
grant execute on function pg_temp.try_status(uuid, text), pg_temp.try_publish(uuid), pg_temp.try_call(text, uuid) to authenticated;
create function pg_temp.status(t uuid) returns text language sql as $$ select status from public.tournaments where id = t $$;
-- A hole the server kept: a typed value refused (listed), unless the case says otherwise.
create function pg_temp.kept(h int, reason text default 'round_not_live', auto boolean default false) returns uuid language sql as $$
  insert into public.rejected_writes (tournament_id, round_id, hole, player_id, writer_player_id, auth_user_id, payload, reason, status)
  select s.t, s.r, h, s.p, s.p, s.u,
    jsonb_build_object('player_id', s.p, 'fields', jsonb_build_object('strokes', 5, 'putts', 2), 'base', '{}'::jsonb) || case when auto then '{"auto": true}'::jsonb else '{}'::jsonb end,
    reason, 'open'
  from (select (select id from harness.seed where key = 'tournament_a') t, (select id from harness.seed where key = 'round_a1') r,
               (select id from harness.seed where key = 'player_a1') p, (select id from harness.seed where key = 'dev_a') u) s
  returning id
$$;

\set open1 'Todavía no se puede marcar Terminado. El día 1 sigue abierto: termínalo o cancélalo en Comité, sección Rondas.'

-- 1. A day still open: Terminado is refused, with what to do and where
select set_config('request.jwt.claims', harness.claims(:'org_a'), true) \g /dev/null
set local role authenticated;
select pg_temp.try_status(:'t_a', 'finished') as out \gset
reset role;
select harness.check(:'out' = '22023 ' || :'open1', 'a scheduled day holds Terminado (22023, in Spanish): ' || :'out');
select harness.check(pg_temp.status(:'t_a') = 'setup', 'and the tournament keeps its status');
update public.rounds set status = 'live' where id = :'r1';
select set_config('request.jwt.claims', harness.claims(:'org_a'), true) \g /dev/null
set local role authenticated;
select pg_temp.try_status(:'t_a', 'finished') as out \gset
reset role;
select harness.check(:'out' = '22023 ' || :'open1', 'so does a live one');

-- 2. A planned day nobody created
update public.rounds set status = 'finished' where id = :'r1';
update public.tournaments set settings = jsonb_set(settings, '{rounds}', '2') where id = :'t_a';
select set_config('request.jwt.claims', harness.claims(:'org_a'), true) \g /dev/null
set local role authenticated;
select pg_temp.try_status(:'t_a', 'finished') as out \gset
reset role;
select harness.check(:'out' = '22023 Todavía no se puede marcar Terminado. El día 2 no está creado: créalo y juégalo o cancélalo en Comité, sección Rondas, o baja el número de rondas en Comité, sección Torneo.',
  'a day the settings plan and nobody created holds it: ' || :'out');
-- The check reads the row as the statement leaves it: lowering the days in the same update lets it through.
select set_config('request.jwt.claims', harness.claims(:'org_a'), true) \g /dev/null
set local role authenticated;
update public.tournaments set settings = jsonb_set(settings, '{rounds}', '1'), status = 'finished' where id = :'t_a';
reset role;
select harness.check(pg_temp.status(:'t_a') = 'finished', 'the days lowered and Terminado in one update: the gate reads the new settings');

-- 3. Leaving Terminado is free, and so is editing a Terminado tournament, whatever is open
update public.rounds set status = 'live' where id = :'r1';
select set_config('request.jwt.claims', harness.claims(:'org_a'), true) \g /dev/null
set local role authenticated;
update public.tournaments set name = 'Seed Torneo A (cerrado)' where id = :'t_a';
select pg_temp.try_status(:'t_a', 'finished') as same \gset
select pg_temp.try_status(:'t_a', 'live') as back \gset
select pg_temp.try_status(:'t_a', 'finished') as again \gset
reset role;
select harness.check((select name from public.tournaments where id = :'t_a') = 'Seed Torneo A (cerrado)' and :'same' = '1', 'a Terminado tournament with a day reopened is still edited, and Terminado again is no change');
select harness.check(:'back' = '1' and pg_temp.status(:'t_a') = 'live', 'finished → live goes through with a day open');
select harness.check(:'again' = '22023 ' || :'open1', 'and back into Terminado waits for the day again');

-- 4. Publishing waits too: Terminado before 0029, or a day reopened since
update public.rounds set status = 'finished' where id = :'r1';
select set_config('request.jwt.claims', harness.claims(:'org_a'), true) \g /dev/null
set local role authenticated;
select pg_temp.try_status(:'t_a', 'finished') as out \gset
reset role;
select harness.check(:'out' = '1', 'every day finished and nothing kept: Terminado goes through');
update public.rounds set status = 'live' where id = :'r1';
select set_config('request.jwt.claims', harness.claims(:'org_a'), true) \g /dev/null
set local role authenticated;
select pg_temp.try_publish(:'t_a') as out \gset
reset role;
select harness.check(:'out' = '22023 Todavía no se pueden publicar los resultados. El día 1 sigue abierto: termínalo o cancélalo en Comité, sección Rondas.', 'a day reopened after Terminado holds the publish: ' || :'out');
select harness.check(not exists (select 1 from public.tournament_results where tournament_id = :'t_a'), 'and nothing is published');
update public.rounds set status = 'cancelled' where id = :'r1';
select set_config('request.jwt.claims', harness.claims(:'org_a'), true) \g /dev/null
set local role authenticated;
select pg_temp.try_publish(:'t_a') as out \gset
reset role;
select harness.check(:'out' like 'ok %' and exists (select 1 from public.tournament_results where tournament_id = :'t_a'), 'a cancelled day counts as settled: the results publish: ' || :'out');
select set_config('request.jwt.claims', harness.claims(:'org_a'), true) \g /dev/null
set local role authenticated;
select pg_temp.try_status(:'t_a', 'live') as out \gset
reset role;
select harness.check(:'out' = '1' and not exists (select 1 from public.tournament_results where tournament_id = :'t_a'), 'leaving Terminado still withdraws the results');
update public.rounds set status = 'finished' where id = :'r1';

-- 5. «Pendientes de revisar»: a typed hole the server kept holds both; a conflict and a default over a score don't
select pg_temp.kept(4) as w1 \gset
select set_config('request.jwt.claims', harness.claims(:'org_a'), true) \g /dev/null
set local role authenticated;
select pg_temp.try_status(:'t_a', 'finished') as out \gset
reset role;
select harness.check(:'out' = '22023 Todavía no se puede marcar Terminado. Un hoyo que el servidor no tomó sigue sin revisar: aplícalo o descártalo en Comité, sección Tarjetas, «Pendientes de revisar».',
  'a hole kept for the Comité holds Terminado: ' || :'out');
select pg_temp.kept(4) \g /dev/null
select set_config('request.jwt.claims', harness.claims(:'org_a'), true) \g /dev/null
set local role authenticated;
select pg_temp.try_status(:'t_a', 'finished') as out \gset
select jsonb_array_length(public.rejected_inbox(:'t_a')) as listed \gset
reset role;
select harness.check(:'out' = '22023 Todavía no se puede marcar Terminado. 2 hoyos que el servidor no tomó siguen sin revisar: aplícalos o descártalos en Comité, sección Tarjetas, «Pendientes de revisar».' and :'listed' = '2',
  'the count is the inbox''s: ' || :'out');
-- Every listed row can be dismissed, with a reason and nothing else, on a finished day of a tournament that isn't Terminado.
select set_config('request.jwt.claims', harness.claims(:'org_a'), true) \g /dev/null
set local role authenticated;
select count(*) as dismissed from (select public.resolve_rejected_write((x ->> 'id')::uuid, 'dismiss', 'Revisado en papel') from jsonb_array_elements(public.rejected_inbox(:'t_a')) x) d \gset
reset role;
select harness.check(:'dismissed' = '2' and not exists (select 1 from public.rejected_writes where tournament_id = :'t_a' and status = 'open'), 'dismissing clears them');
select pg_temp.kept(5, 'conflict') \g /dev/null
insert into public.scores (round_id, player_id, hole, strokes, putts, picked_up) values (:'r1', :'ana', 6, 4, 2, false);
select pg_temp.kept(6, 'round_not_live', true) \g /dev/null
select set_config('request.jwt.claims', harness.claims(:'org_a'), true) \g /dev/null
set local role authenticated;
select pg_temp.try_status(:'t_a', 'finished') as out \gset
reset role;
select harness.check(:'out' = '1', 'a conflict and an untouched default over a score are not the Comité''s: they hold nothing');
-- A refusal kept after Terminado (a phone saving the closed day) holds the publish until it is resolved.
select pg_temp.kept(7, 'round_not_live', true) as w7 \gset
select set_config('request.jwt.claims', harness.claims(:'org_a'), true) \g /dev/null
set local role authenticated;
select pg_temp.try_publish(:'t_a') as held \gset
select public.resolve_rejected_write(:'w7', 'dismiss', 'Era el par por defecto') \g /dev/null
select pg_temp.try_publish(:'t_a') as freed \gset
reset role;
select harness.check(:'held' like '22023 Todavía no se pueden publicar los resultados. Un hoyo %' and :'freed' like 'ok %', 'a default kept on an empty hole after Terminado holds the publish until dismissed: ' || :'held');

-- 6. Everything at once, in the phone's order
select set_config('request.jwt.claims', harness.claims(:'org_a'), true) \g /dev/null
set local role authenticated;
select pg_temp.try_status(:'t_a', 'live') \g /dev/null
reset role;
update public.tournaments set settings = jsonb_set(settings, '{rounds}', '4') where id = :'t_a';
insert into public.rounds (tournament_id, number, holes, status) values (:'t_a', 2, 18, 'live'), (:'t_a', 4, 18, 'scheduled');
update public.rounds set status = 'live' where id = :'r1';
select pg_temp.kept(8) \g /dev/null
select pg_temp.kept(9) \g /dev/null
select pg_temp.kept(10) \g /dev/null
select set_config('request.jwt.claims', harness.claims(:'org_a'), true) \g /dev/null
set local role authenticated;
select pg_temp.try_status(:'t_a', 'finished') as out \gset
reset role;
select harness.check(:'out' = '22023 Todavía no se puede marcar Terminado. El día 3 no está creado: créalo y juégalo o cancélalo en Comité, sección Rondas, o baja el número de rondas en Comité, sección Torneo. '
  || 'Los días 1, 2 y 4 siguen abiertos: termínalo o cancélalo en Comité, sección Rondas. '
  || '3 hoyos que el servidor no tomó siguen sin revisar: aplícalos o descártalos en Comité, sección Tarjetas, «Pendientes de revisar».', 'every item, one sentence each: ' || :'out');
select harness.check(public.close_blockers(:'t_a') = '[{"kind": "missingRounds", "days": [3]}, {"kind": "openRounds", "days": [1, 2, 4]}, {"kind": "rejectedWrites", "count": 3}]'::jsonb,
  'close_blockers lists them as the phone''s gate does');
select harness.check(public.close_blockers(:'t_b') = '[{"kind": "openRounds", "days": [1]}]'::jsonb, 'and only the tournament''s own: B has its own day open and nothing kept');

-- 7. Who meets it: everyone who may change the status, and nobody else changes it
select set_config('request.jwt.claims', harness.claims(:'dev_a'), true) \g /dev/null
set local role authenticated;
select pg_temp.try_status(:'t_a', 'finished') as player \gset
select pg_temp.try_call('close_blockers', :'t_a') as blockers_rpc \gset
reset role;
select harness.check(:'player' = '0' and pg_temp.status(:'t_a') = 'live', 'a player still changes nothing (the row is not his to update)');
select harness.check(:'blockers_rpc' like '42501 %', 'close_blockers is no client''s to call: ' || :'blockers_rpc');
select set_config('request.jwt.claims', harness.claims(:'org_b'), true) \g /dev/null
set local role authenticated;
select pg_temp.try_status(:'t_a', 'finished') as other \gset
select pg_temp.try_publish(:'t_a') as other_publish \gset
reset role;
select harness.check(:'other' = '0' and :'other_publish' = '42501 Solo el Comité publica resultados', 'another tournament''s Comité neither: ' || :'other_publish');
update public.players set is_admin = true where id = :'ana';
select set_config('request.jwt.claims', harness.claims(:'dev_a'), true) \g /dev/null
set local role authenticated;
select pg_temp.try_status(:'t_a', 'finished') as admin_player \gset
reset role;
select harness.check(:'admin_player' like '22023 Todavía no se puede marcar Terminado. %', 'an admin player meets the gate like the Comité');
select set_config('request.jwt.claims', harness.claims(:'padmin'), true) \g /dev/null
set local role authenticated;
select pg_temp.try_status(:'t_a', 'finished') as platform \gset
reset role;
select harness.check(:'platform' like '22023 Todavía no se puede marcar Terminado. %', 'so does the platform admin');
select set_config('request.jwt.claims', harness.claims(:'org_a'), true) \g /dev/null
set local role authenticated;
select public.set_tournament_protected(:'t_a', true) \g /dev/null
reset role;
select set_config('request.jwt.claims', harness.claims(:'padmin'), true) \g /dev/null
set local role authenticated;
select pg_temp.try_status(:'t_a', 'finished') as locked \gset
select public.platform_unlock(:'t_a', 'Revisión del cierre') \g /dev/null
select pg_temp.try_status(:'t_a', 'finished') as unlocked \gset
reset role;
select harness.check(:'locked' = '0' and :'unlocked' like '22023 Todavía no se puede marcar Terminado. %', 'Protegido keeps its own rule (locked: nothing), and unlocked the admin meets the gate');
select pg_temp.try_status(:'t_a', 'finished') as superuser \gset
select harness.check(:'superuser' like '22023 Todavía no se puede marcar Terminado. %', 'even a write with no rules (the service role, a script) meets it');
create function pg_temp.try_insert_finished() returns text language plpgsql as $$
begin
  insert into public.tournaments (slug, name, join_code, settings, status)
  select 'cierre-directo', 'Cierre directo', 'CIERRE', settings, 'finished' from public.tournaments where id = (select id from harness.seed where key = 'tournament_b');
  return 'taken';
exception when others then
  return sqlstate || ' ' || sqlerrm;
end $$;
select pg_temp.try_insert_finished() as inserted \gset
select harness.check(:'inserted' = '22023 Todavía no se puede marcar Terminado. El día 1 no está creado: créalo y juégalo o cancélalo en Comité, sección Rondas, o baja el número de rondas en Comité, sección Torneo.',
  'a tournament inserted Terminado with its day not created is refused too: ' || :'inserted');

-- 8. A restore writes a Terminado backup back as it was, with its days open and holes kept
-- The backup, in src/data/backup.ts's shape, of the tournament as it stands but marked Terminado.
create function pg_temp.backup(t uuid) returns jsonb language sql stable as $$
  with rs as (select id from public.rounds where tournament_id = t),
       gs as (select id from public.groups where round_id in (select id from rs))
  select jsonb_build_object('version', 1, 'exportedAt', now(), 'tournamentId', t, 'slug', 'harness', 'tables', jsonb_build_object(
    'tournaments', (select jsonb_agg(to_jsonb(x) || '{"status": "finished"}'::jsonb) from public.tournaments x where x.id = t),
    'players', coalesce((select jsonb_agg(to_jsonb(x)) from public.players x where tournament_id = t), '[]'),
    'rounds', coalesce((select jsonb_agg(to_jsonb(x)) from public.rounds x where tournament_id = t), '[]'),
    'groups', coalesce((select jsonb_agg(to_jsonb(x)) from public.groups x where round_id in (select id from rs)), '[]'),
    'group_members', coalesce((select jsonb_agg(to_jsonb(x)) from public.group_members x where group_id in (select id from gs)), '[]'),
    'scores', coalesce((select jsonb_agg(to_jsonb(x)) from public.scores x where round_id in (select id from rs)), '[]')))
$$;
select pg_temp.backup(:'t_a')::text as bk \gset
select harness.check(pg_temp.status(:'t_a') = 'live' and jsonb_array_length(public.close_blockers(:'t_a')) = 3, 'before the restore: live, with three items open');
select set_config('request.jwt.claims', harness.claims(:'org_a'), true) \g /dev/null
set local role authenticated;
select public.restore_tournament(:'t_a', :'bk'::jsonb) ->> 'rounds' as restored \gset
reset role;
select harness.check(:'restored' = '3' and pg_temp.status(:'t_a') = 'finished', 'the restore brings the tournament back Terminado, as the backup has it');
select harness.check(jsonb_array_length(public.close_blockers(:'t_a')) = 3, 'with the same items open (a restore is no close; Dinero shows «Falta cerrar un día»)');
select harness.check(coalesce(current_setting('cardi.restore', true), '') = '', 'and the restore''s mark is gone once it is done');
select set_config('request.jwt.claims', harness.claims(:'org_a'), true) \g /dev/null
set local role authenticated;
select pg_temp.try_status(:'t_a', 'live') as back \gset
select pg_temp.try_status(:'t_a', 'finished') as again \gset
select pg_temp.try_publish(:'t_a') as publish_live \gset
reset role;
select harness.check(:'back' = '1' and :'again' like '22023 Todavía no se puede marcar Terminado. %', 'in the same transaction, a plain Terminado after it meets the gate again');
select harness.check(:'publish_live' = '22023 El torneo todavía no termina', 'and publishing a tournament not Terminado is refused as before');

-- 9. A Ronda rápida closes as QuickFinish does it: its live round finished first, then Terminado, then the results
insert into public.courses (id, name) values ('00000000-0000-4000-8000-0000000000c1', 'Campo del cierre');
insert into public.tees (id, course_id, name, rating, slope, par_total) values ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000c1', 'Blancas', 72, 113, 72);
insert into public.holes (tee_id, number, par, stroke_index) select '00000000-0000-4000-8000-0000000000e1', n, 4, n from generate_series(1, 18) n;
select settings::text as quick_settings from public.tournaments where id = :'t_b' \gset
select set_config('request.jwt.claims', harness.claims(:'org_a'), true) \g /dev/null
set local role authenticated;
select public.ensure_my_profile() \g /dev/null
select public.create_quick_round(jsonb_build_object('name', 'Rápida del cierre', 'settings', :'quick_settings'::jsonb, 'courseId', '00000000-0000-4000-8000-0000000000c1',
  'teeId', '00000000-0000-4000-8000-0000000000e1', 'date', current_date, 'players', jsonb_build_array(jsonb_build_object('kind', 'me')))) ->> 'id' as q \gset
select pg_temp.try_status(:'q', 'finished') as first_try \gset
update public.rounds set status = 'finished' where tournament_id = :'q' and status = 'live';
select pg_temp.try_status(:'q', 'finished') as closed \gset
select public.publish_tournament_results(:'q', jsonb_build_array(jsonb_build_object('playerId', (select id from public.players where tournament_id = :'q'), 'rank', 1, 'rankLabel', '1', 'points', 36, 'perRound', jsonb_build_array(36), 'awards', '[]'::jsonb, 'net', null)), 'MXN') ->> 'players' as published \gset
reset role;
select harness.check(:'first_try' = '22023 ' || :'open1', 'a Ronda rápida with its round live is not Terminado yet: ' || :'first_try');
select harness.check(:'closed' = '1' and :'published' = '1', 'its round finished first, then Terminado and the results, in QuickFinish''s order');

-- 10. The planned days as the settings may hold them (PR 110's verifier): a whole number written 1.0 or 2.0 is that
-- number, as on the phone, never a cast error; the missing days are the lowest unused numbers, as many as the count
-- falls short; a string, or a number outside 1–10 or not whole, plans nothing (the phone can't load those settings).
create function pg_temp.missing(t uuid) returns text language sql as $$
  select coalesce((select (b -> 'days')::text from jsonb_array_elements(public.close_blockers(t)) b where b ->> 'kind' = 'missingRounds'), 'none')
$$;
-- From here tournament A has day 1 only, finished, whatever the sections above left.
delete from public.rounds where tournament_id = :'t_a' and id <> :'r1';
update public.rounds set status = 'finished', number = 1 where id = :'r1';
update public.tournaments set status = 'live', settings = jsonb_set(settings, '{rounds}', '1.0') where id = :'t_a';
select harness.check(pg_temp.missing(:'t_a') = 'none', '1.0 planned days with day 1 made: nothing missing, no cast error');
update public.tournaments set settings = jsonb_set(settings, '{rounds}', '2.0') where id = :'t_a';
select harness.check(pg_temp.missing(:'t_a') = '[2]', '2.0 planned days with only day 1 made: day 2 missing, as for 2');
select set_config('request.jwt.claims', harness.claims(:'org_a'), true) \g /dev/null
set local role authenticated;
select pg_temp.try_status(:'t_a', 'finished') as two_point_oh \gset
reset role;
select harness.check(:'two_point_oh' like '22023 Todavía no se puede marcar Terminado. El día 2 no está creado:%', 'and Terminado says so in words, not 22P02: ' || :'two_point_oh');
-- 3 planned, days 2 and 5 made: one day short, and it is day 1 (not 1 and 3).
update public.rounds set number = 2 where id = :'r1';
insert into public.rounds (tournament_id, number, date, course_id, status)
  select tournament_id, 5, date, course_id, 'finished' from public.rounds where id = :'r1';
update public.tournaments set settings = jsonb_set(settings, '{rounds}', '3') where id = :'t_a';
select harness.check(pg_temp.missing(:'t_a') = '[1]', '3 planned, days 2 and 5 made: only day 1 is missing: ' || pg_temp.missing(:'t_a'));
update public.tournaments set settings = jsonb_set(settings, '{rounds}', '"3"') where id = :'t_a';
select harness.check(pg_temp.missing(:'t_a') = 'none', 'planned days as a string plan nothing');
update public.tournaments set settings = jsonb_set(settings, '{rounds}', '11') where id = :'t_a';
select harness.check(pg_temp.missing(:'t_a') = 'none', 'planned days above 10 plan nothing');
update public.tournaments set settings = jsonb_set(settings, '{rounds}', '2.5') where id = :'t_a';
select harness.check(pg_temp.missing(:'t_a') = 'none', 'planned days that are not whole plan nothing');

rollback;
