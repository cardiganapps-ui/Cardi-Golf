-- UX-28 (0046): the base handicaps fixed before the Calcutta. On the
-- two-tenant seed: org_a runs tournament A (Ana, Beto), org_b runs B (Carla,
-- Dani), dev_a is Ana's phone. Rolled back at the end; prints one «ok» line
-- per check.
\set ON_ERROR_STOP 1
\set QUIET 1
\pset tuples_only on
\pset format unaligned
select id as org_a from harness.seed where key = 'org_a' \gset
select id as org_b from harness.seed where key = 'org_b' \gset
select id as dev_a from harness.seed where key = 'dev_a' \gset
select id as t_a from harness.seed where key = 'tournament_a' \gset
select id as t_b from harness.seed where key = 'tournament_b' \gset
select id as ana from harness.seed where key = 'player_a1' \gset
select id as beto from harness.seed where key = 'player_a2' \gset
select id as carla from harness.seed where key = 'player_b1' \gset
begin;

-- A statement as a user of the app: its answer, or the SQLSTATE and the message.
create function pg_temp.as_user(uid uuid, q text) returns text language plpgsql as $$
declare
  r text;
begin
  perform set_config('request.jwt.claims', harness.claims(uid), true);
  set local role authenticated;
  execute q into r;
  reset role;
  return coalesce(r, 'null');
exception when others then
  reset role;
  return sqlstate || ' ' || sqlerrm;
end $$;
create function pg_temp.base(p uuid) returns text language sql as $$
  select handicap_source || ':' || base_hcp || ':' || coalesce(handicap_index::text, '-') from public.players where id = p
$$;
create function pg_temp.note(p uuid) returns jsonb language sql as $$
  select handicap_note from public.players where id = p
$$;
create function pg_temp.locked_at(t uuid) returns timestamptz language sql as $$
  select handicaps_locked_at from public.tournaments where id = t
$$;
-- A direct write of a player, as an older bundle's player sheet sends it.
create function pg_temp.set_base(uid uuid, p uuid, base numeric) returns text language sql as $$
  select pg_temp.as_user(uid, format('update public.players set base_hcp = %s where id = %L returning base_hcp::text', base, p))
$$;
create function pg_temp.save(uid uuid, p uuid, r jsonb, why text) returns text language sql as $$
  select pg_temp.as_user(uid, format('select public.update_player(%L, %L::jsonb, %L)::text', p, r, why))
$$;

-- Ana plays off a base of 14; Beto off an index of 12.3 with a base left from before he had one.
update public.players set handicap_source = 'manual', base_hcp = 14 where id = :'ana';
update public.players set handicap_source = 'index', handicap_index = 12.3, base_hcp = 18 where id = :'beto';

-- 1. Not fixed yet: the Comité changes a handicap freely, and nothing is recorded
select harness.check(pg_temp.set_base(:'org_a', :'ana', 15) = '15.0' and pg_temp.note(:'ana') is null, 'before the lock a change needs nothing: ' || pg_temp.base(:'ana'));
update public.players set base_hcp = 14 where id = :'ana';

-- 2. «Fijar hándicaps»: the Comité only
select pg_temp.as_user(:'dev_a', format('select public.lock_handicaps(%L)::text', :'t_a')) as out \gset
select harness.check(:'out' like '42501 Solo el Comité fija los hándicaps%' and pg_temp.locked_at(:'t_a') is null, 'a player''s phone does not fix them: ' || :'out');
select pg_temp.as_user(:'org_b', format('select public.lock_handicaps(%L)::text', :'t_a')) as out \gset
select harness.check(:'out' like '42501%' and pg_temp.locked_at(:'t_a') is null, 'another tournament''s Comité does not: ' || :'out');
select pg_temp.as_user(:'org_a', format('select public.lock_handicaps(%L)::text', :'t_a')) as first \gset
select harness.check(pg_temp.locked_at(:'t_a') = :'first'::timestamptz, 'the Comité fixes them: ' || :'first');
-- (The file is one transaction, so now() never moves: the first moment is put in the past by hand.)
select set_config('cardi.handicap_lock', '1', true) \g /dev/null
update public.tournaments set handicaps_locked_at = now() - interval '1 day' where id = :'t_a';
select set_config('cardi.handicap_lock', '', true) \g /dev/null
select pg_temp.as_user(:'org_a', format('select public.lock_handicaps(%L)::text', :'t_a')) as again \gset
select harness.check(:'again'::timestamptz = now() - interval '1 day' and pg_temp.locked_at(:'t_a') = now() - interval '1 day', 'fixing them again keeps the first moment: ' || :'again');

-- 3. Fixed: a change without a reason is refused on every path, the rest of the row is not
select pg_temp.set_base(:'org_a', :'ana', 12) as out \gset
select harness.check(:'out' = '22023 Los hándicaps ya están fijados: para cambiar uno hace falta un motivo' and pg_temp.base(:'ana') = 'manual:14.0:-', 'a direct change of a fixed handicap is refused: ' || :'out');
select pg_temp.as_user(:'org_a', format('update public.players set handicap_source = ''index'', handicap_index = 9 where id = %L returning id::text', :'ana')) as out \gset
select harness.check(:'out' like '22023%', 'so is a change of its source: ' || :'out');
select pg_temp.as_user(:'org_a', format('update public.players set display_name = ''Anita'', form_guide = ''Viene en racha'' where id = %L returning display_name', :'ana')) as out \gset
select harness.check(:'out' = 'Anita' and pg_temp.note(:'ana') is null, 'a change that leaves the handicap alone needs nothing: ' || :'out');
-- What the engine reads is what counts: Beto's base follows his index, as the sheet sends it, and nothing moved.
select harness.check(pg_temp.set_base(:'org_a', :'beto', 12.3) = '12.3' and pg_temp.note(:'beto') is null, 'a base no rule reads, under an index, changes nothing fixed: ' || pg_temp.base(:'beto'));
select pg_temp.as_user(:'org_a', format('update public.players set handicap_index = 11 where id = %L returning id::text', :'beto')) as out \gset
select harness.check(:'out' like '22023%', 'his index is fixed: ' || :'out');
-- The record is the trigger's alone.
select pg_temp.as_user(:'org_a', format('update public.players set handicap_note = ''{"from":{"base_hcp":30}}'' where id = %L returning coalesce(handicap_note::text, ''null'')', :'beto')) as out \gset
select harness.check(:'out' = 'null', 'nobody writes the record by hand: ' || :'out');
select pg_temp.as_user(:'org_a', format('update public.tournaments set handicaps_locked_at = null where id = %L returning id::text', :'t_a')) as out \gset
select harness.check(:'out' = '42501 Los hándicaps se fijan y se liberan desde Jugadores' and pg_temp.locked_at(:'t_a') = now() - interval '1 day', 'nor clears the lock directly: ' || :'out');

-- 4. update_player: the sheet with a reason, the change kept on the player and in the audit log
select pg_temp.save(:'dev_a', :'ana', '{"base_hcp": 12}', 'Error de captura') as out \gset
select harness.check(:'out' like '42501 Solo el Comité cambia a un jugador%', 'a player''s phone does not: ' || :'out');
select pg_temp.save(:'org_b', :'ana', '{"base_hcp": 12}', 'Error de captura') as out \gset
select harness.check(:'out' like '42501 Solo el Comité cambia a un jugador%', 'another tournament''s Comité does not: ' || :'out');
select pg_temp.save(:'org_a', :'ana', '{"base_hcp": 12}', E' \t ') as out \gset
select harness.check(:'out' = '22023 Escribe el motivo, al menos 3 letras' and pg_temp.base(:'ana') = 'manual:14.0:-', 'a blank reason is no reason: ' || :'out');
select pg_temp.save(:'org_a', :'ana', '[1]', 'Error de captura') as out \gset
select harness.check(:'out' like '22023 No pudimos leer ese cambio%', 'a row that is not one: ' || :'out');
select pg_temp.save(:'org_a', :'ana', jsonb_build_object('base_hcp', 12, 'display_name', 'Ana', 'tournament_id', :'t_b', 'handicap_note', '{"x":1}'::jsonb, 'profile_status', 'confirmed'), ' Error de captura ') as out \gset
select harness.check(:'out' = :'ana' and pg_temp.base(:'ana') = 'manual:12.0:-' and (select display_name from public.players where id = :'ana') = 'Ana', 'the Comité changes it with a reason, the rest of the sheet with it: ' || pg_temp.base(:'ana'));
select harness.check((select tournament_id from public.players where id = :'ana') = :'t_a'::uuid and (select profile_status from public.players where id = :'ana') is null, 'never its tournament or its account link');
select harness.check(pg_temp.note(:'ana') -> 'from' = '{"handicap_source": "manual", "base_hcp": 14.0, "handicap_index": null, "estimate_inputs": null}'::jsonb, 'the record starts from the handicap when they were fixed: ' || (pg_temp.note(:'ana') -> 'from')::text);
select harness.check(jsonb_array_length(pg_temp.note(:'ana') -> 'changes') = 1 and pg_temp.note(:'ana') #>> '{changes,0,reason}' = 'Error de captura' and (pg_temp.note(:'ana') #>> '{changes,0,to,base_hcp}')::numeric = 12, 'and holds the change, trimmed reason and all: ' || (pg_temp.note(:'ana') -> 'changes')::text);
select harness.check((select reason from public.audit_log where table_name = 'players' and row_id = :'ana' order by id desc limit 1) = 'Error de captura', 'Historial lists it with its reason');
select pg_temp.save(:'org_a', :'ana', '{"base_hcp": 13}', 'Llegó su tarjeta') \g /dev/null
select harness.check(jsonb_array_length(pg_temp.note(:'ana') -> 'changes') = 2 and (pg_temp.note(:'ana') #>> '{from,base_hcp}')::numeric = 14 and pg_temp.note(:'ana') #>> '{changes,1,reason}' = 'Llegó su tarjeta', 'a second change keeps where it started: ' || pg_temp.note(:'ana')::text);
select pg_temp.save(:'org_a', :'ana', '{"display_name": "Ana A."}', 'Su apodo') \g /dev/null
select harness.check(jsonb_array_length(pg_temp.note(:'ana') -> 'changes') = 2, 'a reason with no handicap change adds nothing to the record');
-- The record keeps the 20 latest.
do $$
begin
  for i in 1..25 loop
    perform set_config('cardi.reason', 'Vuelta ' || i, true);
    update public.players set base_hcp = 20 + i where id = (select id from harness.seed where key = 'player_a1');
  end loop;
  perform set_config('cardi.reason', '', true);
end $$;
select harness.check(jsonb_array_length(pg_temp.note(:'ana') -> 'changes') = 20 and pg_temp.note(:'ana') #>> '{changes,19,reason}' = 'Vuelta 25' and pg_temp.note(:'ana') #>> '{changes,0,reason}' = 'Vuelta 6' and (pg_temp.note(:'ana') #>> '{from,base_hcp}')::numeric = 14, 'the 20 latest changes, and still where it started');

-- 5. A new player comes with no record, whatever is sent
select pg_temp.as_user(:'org_a', format('insert into public.players (tournament_id, full_name, display_name, handicap_note) values (%L, ''Eva Nueva'', ''Eva'', ''{"from":{}}'') returning coalesce(handicap_note::text, ''null'')', :'t_a')) as out \gset
select harness.check(:'out' = 'null', 'a new player has no record: ' || :'out');

-- 6. «Liberar»: the Comité, with a reason, only before the tournament leaves setup
select pg_temp.as_user(:'dev_a', format('select public.unlock_handicaps(%L, ''Me equivoqué'')::text', :'t_a')) as out \gset
select harness.check(:'out' like '42501 Solo el Comité libera los hándicaps%', 'a player''s phone does not free them: ' || :'out');
select pg_temp.as_user(:'org_a', format('select public.unlock_handicaps(%L, ''no'')::text', :'t_a')) as out \gset
select harness.check(:'out' = '22023 Escribe el motivo, al menos 3 letras' and pg_temp.locked_at(:'t_a') is not null, 'not without a reason: ' || :'out');
select pg_temp.as_user(:'org_a', format('select public.unlock_handicaps(%L, ''Los fijé antes de tiempo'')::text', :'t_a')) as out \gset
select harness.check(pg_temp.locked_at(:'t_a') is null and pg_temp.note(:'ana') is null, 'the Comité frees them, and the record goes: ' || :'out');
select harness.check((select reason from public.audit_log where table_name = 'tournaments' and row_id = :'t_a' order by id desc limit 1) = 'Los fijé antes de tiempo', 'Historial says why');
select harness.check(pg_temp.set_base(:'org_a', :'ana', 10) = '10.0', 'and a change needs nothing again');

-- 7. Leaving setup fixes them by itself; after that nobody frees them
select pg_temp.as_user(:'org_a', format('update public.tournaments set status = ''auction'' where id = %L returning status', :'t_a')) as out \gset
select harness.check(:'out' = 'auction' and pg_temp.locked_at(:'t_a') is not null, 'opening the auction fixes them: ' || coalesce(pg_temp.locked_at(:'t_a')::text, 'null'));
select harness.check(pg_temp.set_base(:'org_a', :'ana', 11) like '22023%', 'and a change needs a reason');
select pg_temp.as_user(:'org_a', format('select public.unlock_handicaps(%L, ''Quiero cambiar uno'')::text', :'t_a')) as out \gset
select harness.check(:'out' = '22023 El torneo ya empezó: los hándicaps se quedan fijados' and pg_temp.locked_at(:'t_a') is not null, 'not freed once the tournament left setup: ' || :'out');
-- A tournament under way when 0046 ran has no moment, and is fixed all the same.
select set_config('cardi.restore', '1', true) \g /dev/null
update public.tournaments set status = 'live' where id = :'t_b';
select set_config('cardi.restore', '', true) \g /dev/null
select harness.check(pg_temp.locked_at(:'t_b') is null and pg_temp.set_base(:'org_b', :'carla', 9) like '22023%', 'a tournament already under way is fixed with no moment');
-- Back to setup the moment stays: it was fixed, and only «Liberar» frees it.
update public.tournaments set status = 'setup' where id = :'t_a';
select harness.check(pg_temp.locked_at(:'t_a') is not null and pg_temp.set_base(:'org_a', :'ana', 11) like '22023%', 'back in setup it stays fixed until freed');

-- 8. A restore writes the backup's handicaps, lock and record, whatever the lock says now
select pg_temp.save(:'org_a', :'ana', '{"base_hcp": 11}', 'Antes del respaldo') \g /dev/null
select set_config('cardi.handicap_lock', '1', true) \g /dev/null
update public.tournaments set handicaps_locked_at = now() - interval '2 days' where id = :'t_a';
select set_config('cardi.handicap_lock', '', true) \g /dev/null
create temp table bk on commit drop as
  select jsonb_build_object('version', 1, 'tournamentId', :'t_a', 'tables', jsonb_build_object(
    'tournaments', (select jsonb_agg(to_jsonb(x)) from public.tournaments x where x.id = :'t_a'),
    'players', (select jsonb_agg(to_jsonb(x)) from public.players x where tournament_id = :'t_a'))) as b;
grant select on bk to authenticated;
create temp table was on commit drop as select pg_temp.locked_at(:'t_a') as at, pg_temp.note(:'ana') as note, pg_temp.base(:'ana') as base;
select pg_temp.save(:'org_a', :'ana', '{"base_hcp": 30}', 'Después del respaldo') \g /dev/null
select pg_temp.as_user(:'org_a', format('select public.unlock_handicaps(%L, ''Para probar el respaldo'')::text', :'t_a')) \g /dev/null
select harness.check(pg_temp.locked_at(:'t_a') is null and pg_temp.note(:'ana') is null, 'freed after the backup');
select pg_temp.as_user(:'org_a', format('update public.tournaments set status = ''live'' where id = %L returning status', :'t_a')) \g /dev/null
select set_config('cardi.reason', 'En juego', true) \g /dev/null
update public.players set base_hcp = 40 where id = :'ana';
select set_config('cardi.reason', '', true) \g /dev/null
select pg_temp.as_user(:'org_a', format('select public.restore_tournament(%L, (select b from bk))::text', :'t_a')) as out \gset
select harness.check(:'out' like '{%', 'the restore goes through over a fixed handicap: ' || :'out');
select harness.check(pg_temp.locked_at(:'t_a') = now() - interval '2 days' and pg_temp.locked_at(:'t_a') = (select at from was) and pg_temp.note(:'ana') = (select note from was) and pg_temp.base(:'ana') = (select base from was), 'and brings back the lock, the record and the handicap: ' || pg_temp.base(:'ana'));

-- 9. The pieces: the reason trimmed as the app trims it, the handicap as the engine reads it
select harness.check(public.trim_reason(E' \t Falta su tarjeta \n') = 'Falta su tarjeta', 'every whitespace trimmed at both ends');
select harness.check(public.handicap_used('index', 18, 12.3, null) = public.handicap_used('index', 12.3, 12.3, null), 'under an index the base is not read');
select harness.check(public.handicap_used('index', 18, null, null) = '{"index": 18}', 'an index with none typed is the base, as the engine reads it');
select harness.check(public.handicap_used('estimate', 18, null, null) = '{"manual": 18}', 'an estimate with no scores is the base, as the engine reads it');
select harness.check(public.handicap_used('estimate', 18, 9, '[{"gross": 80}]') = '{"estimate": [{"gross": 80}]}', 'an estimate is its scores');

-- 10. Who may call what
select harness.check(not has_function_privilege('anon', 'public.lock_handicaps(uuid)', 'execute') and not has_function_privilege('anon', 'public.unlock_handicaps(uuid, text)', 'execute') and not has_function_privilege('anon', 'public.update_player(uuid, jsonb, text)', 'execute'), 'nothing for the publishable key alone');
select harness.check(not has_function_privilege('authenticated', 'public.players_handicap_lock()', 'execute') and not has_function_privilege('authenticated', 'public.tournaments_handicap_lock()', 'execute'), 'the triggers'' functions are nobody''s to call');
select harness.check((select prosecdef from pg_proc where proname = 'update_player') = false and (select prosecdef from pg_proc where proname = 'lock_handicaps') = false and (select prosecdef from pg_proc where proname = 'unlock_handicaps') = false, 'the Comité''s calls run as the caller, under the policies');

rollback;
