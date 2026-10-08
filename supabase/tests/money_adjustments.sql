-- money_adjustments and its two functions (0027: MONEY-05). Each step runs as
-- the user who does it in the app (role authenticated, that user's JWT
-- claims), on the two-tenant seed: org_a runs tournament A (Ana, Beto), the
-- device dev_a holds Ana, org_b runs tournament B (Carla, Dani). Rolled back
-- at the end; prints one «ok» line per check.
\set ON_ERROR_STOP 1
\set QUIET 1
\pset tuples_only on
\pset format unaligned
select id as org_a from harness.seed where key = 'org_a' \gset
select id as org_b from harness.seed where key = 'org_b' \gset
select id as dev_a from harness.seed where key = 'dev_a' \gset
select id as dev_x from harness.seed where key = 'dev_x' \gset
select id as t_a from harness.seed where key = 'tournament_a' \gset
select id as t_b from harness.seed where key = 'tournament_b' \gset
select id as ana from harness.seed where key = 'player_a1' \gset
select id as beto from harness.seed where key = 'player_a2' \gset
select id as carla from harness.seed where key = 'player_b1' \gset
begin;

-- A call whose refusal is the answer: «taken», or the SQLSTATE and the message.
create function pg_temp.try_assign(t uuid, k text, e jsonb, r text) returns text language plpgsql as $$
begin
  perform public.assign_unassigned(t, k, e, r);
  return 'taken';
exception when others then
  return sqlstate || ' ' || sqlerrm;
end $$;
create function pg_temp.try_void(i uuid, r text) returns text language plpgsql as $$
begin
  perform public.void_adjustment(i, r);
  return 'taken';
exception when others then
  return sqlstate || ' ' || sqlerrm;
end $$;
create function pg_temp.try_insert(t uuid, p uuid) returns text language plpgsql as $$
begin
  insert into public.money_adjustments (tournament_id, source_key, kind, to_player_id, amount, reason) values (t, 'bestRound', 'award', p, 100, 'directo');
  return 'taken';
exception when others then
  return sqlstate || ' ' || sqlerrm;
end $$;
grant execute on function pg_temp.try_assign(uuid, text, jsonb, text), pg_temp.try_void(uuid, text), pg_temp.try_insert(uuid, uuid) to authenticated;
create function pg_temp.rows_a() returns bigint language sql as $$
  select count(*) from public.money_adjustments where tournament_id = (select id from harness.seed where key = 'tournament_a')
$$;

-- 1. The Comité assigns: an award and a refund in one call, then the house
select set_config('request.jwt.claims', harness.claims(:'org_a'), true) \g /dev/null
set local role authenticated;
select public.assign_unassigned(:'t_a', 'bestRound', jsonb_build_array(
  jsonb_build_object('kind', 'award', 'to_player_id', :'ana', 'amount', 800),
  jsonb_build_object('kind', 'refund', 'to_player_id', :'beto', 'amount', 400)), '  Día 2 cancelado: se reparte  ')::text as first \gset
select public.assign_unassigned(:'t_a', 'calcutta', jsonb_build_array(jsonb_build_object('kind', 'house', 'amount', 612)), 'Para la cena')::text as house \gset
reset role;
select harness.check(:'first'::jsonb ->> 'assigned' = '2' and :'house'::jsonb ->> 'assigned' = '1', 'the Comité assigns: two rows in one call, one to the house in another');
select harness.check((select count(*) from public.money_adjustments where tournament_id = :'t_a' and source_key = 'bestRound' and reason = 'Día 2 cancelado: se reparte' and created_by = :'org_a') = 2,
  'stored with the reason trimmed and the account that wrote it');
select harness.check((select to_player_id is null and amount = 612 from public.money_adjustments where tournament_id = :'t_a' and kind = 'house'), 'the house takes no player');
select harness.check((select count(*) from public.audit_log where table_name = 'money_adjustments' and tournament_id = :'t_a' and action = 'INSERT' and actor_auth_user_id = :'org_a') = 3,
  'every row is in the audit log, with who wrote it');

-- 2. Members read; another tournament and a phone with no player read nothing
select set_config('request.jwt.claims', harness.claims(:'dev_a'), true) \g /dev/null
set local role authenticated;
select count(*) as seen from public.money_adjustments \gset
reset role;
select harness.check(:'seen' = '3', 'a player of the tournament reads its assignments');
select set_config('request.jwt.claims', harness.claims(:'org_b'), true) \g /dev/null
set local role authenticated;
select count(*) as seen from public.money_adjustments \gset
reset role;
select harness.check(:'seen' = '0', 'another tournament''s Comité reads none of them');
select set_config('request.jwt.claims', harness.claims(:'dev_x'), true) \g /dev/null
set local role authenticated;
select count(*) as seen from public.money_adjustments \gset
reset role;
select harness.check(:'seen' = '0', 'a phone with no player reads none of them');

-- 3. Who may not assign
select set_config('request.jwt.claims', harness.claims(:'dev_a'), true) \g /dev/null
set local role authenticated;
select pg_temp.try_assign(:'t_a', 'bestRound', jsonb_build_array(jsonb_build_object('kind', 'award', 'to_player_id', :'ana', 'amount', 100)), 'Me lo doy') as out \gset
reset role;
select harness.check(:'out' = '42501 Solo el Comité puede asignar el dinero por asignar', 'a player cannot assign (42501, in Spanish): ' || :'out');
select set_config('request.jwt.claims', harness.claims(:'org_b'), true) \g /dev/null
set local role authenticated;
select pg_temp.try_assign(:'t_a', 'bestRound', jsonb_build_array(jsonb_build_object('kind', 'award', 'to_player_id', :'ana', 'amount', 100)), 'De otro torneo') as out \gset
reset role;
select harness.check(:'out' like '42501 %', 'another tournament''s Comité cannot assign in this one: ' || :'out');
select set_config('request.jwt.claims', harness.claims(:'org_a'), true) \g /dev/null
set local role authenticated;
select pg_temp.try_insert(:'t_a', :'ana') as out \gset
reset role;
select harness.check(:'out' like '42501 %', 'not even the Comité writes the table directly: ' || :'out');
select harness.check(pg_temp.rows_a() = 3, 'and none of those wrote a row');

-- 4. What the Comité may not assign
select set_config('request.jwt.claims', harness.claims(:'org_a'), true) \g /dev/null
set local role authenticated;
select pg_temp.try_assign(:'t_a', 'bestRound', jsonb_build_array(jsonb_build_object('kind', 'award', 'to_player_id', :'ana', 'amount', 100)), '   ') as blank,
       pg_temp.try_assign(:'t_a', 'bestRound', jsonb_build_array(jsonb_build_object('kind', 'award', 'to_player_id', :'ana', 'amount', 100)), 'ok') as short,
       pg_temp.try_assign(:'t_a', 'bestRound', jsonb_build_array(jsonb_build_object('kind', 'award', 'to_player_id', :'carla', 'amount', 100)), 'A Carla') as other_player,
       pg_temp.try_assign(:'t_a', 'bestRound', jsonb_build_array(jsonb_build_object('kind', 'award', 'to_player_id', 'no-es-uuid', 'amount', 100)), 'A nadie') as not_uuid,
       pg_temp.try_assign(:'t_a', 'bestRound', jsonb_build_array(jsonb_build_object('kind', 'award', 'amount', 100)), 'Sin jugador') as no_player,
       pg_temp.try_assign(:'t_a', 'bestRound', jsonb_build_array(jsonb_build_object('kind', 'house', 'to_player_id', :'ana', 'amount', 100)), 'Casa con jugador') as house_player,
       pg_temp.try_assign(:'t_a', 'bestRound', jsonb_build_array(jsonb_build_object('kind', 'award', 'to_player_id', :'ana', 'amount', 0)), 'Cero') as zero,
       pg_temp.try_assign(:'t_a', 'bestRound', jsonb_build_array(jsonb_build_object('kind', 'award', 'to_player_id', :'ana', 'amount', -50)), 'Negativo') as negative,
       pg_temp.try_assign(:'t_a', 'bestRound', jsonb_build_array(jsonb_build_object('kind', 'award', 'to_player_id', :'ana', 'amount', 10.5)), 'Centavos') as cents,
       pg_temp.try_assign(:'t_a', 'bestRound', jsonb_build_array(jsonb_build_object('kind', 'award', 'to_player_id', :'ana', 'amount', '100')), 'Texto') as text_amount,
       pg_temp.try_assign(:'t_a', 'bestRound', jsonb_build_array(jsonb_build_object('kind', 'bonus', 'to_player_id', :'ana', 'amount', 100)), 'Otro tipo') as bad_kind,
       pg_temp.try_assign(:'t_a', '  ', jsonb_build_array(jsonb_build_object('kind', 'award', 'to_player_id', :'ana', 'amount', 100)), 'Sin pozo') as no_source,
       pg_temp.try_assign(:'t_a', 'bestRound', '[]'::jsonb, 'Vacío') as empty,
       pg_temp.try_assign(:'t_a', 'bestRound', '{"kind":"award"}'::jsonb, 'No lista') as not_list,
       -- One bad line refuses the whole call: the good one before it is not kept.
       pg_temp.try_assign(:'t_a', 'bestRound', jsonb_build_array(
         jsonb_build_object('kind', 'award', 'to_player_id', :'ana', 'amount', 100),
         jsonb_build_object('kind', 'award', 'to_player_id', :'carla', 'amount', 100)), 'Mitad buena') as half \gset
reset role;
select harness.check(:'blank' = '22023 Escribe el motivo, al menos 3 letras' and :'short' = :'blank', 'a blank or two-letter reason is refused (22023): ' || :'blank');
select harness.check(:'other_player' = '22023 Ese jugador no es de este torneo' and :'not_uuid' = :'other_player' and :'no_player' = :'other_player', 'a player of another tournament, or none, is refused: ' || :'other_player');
select harness.check(:'house_player' = '22023 Lo que va a la casa no lleva jugador', 'the house with a player is refused');
select harness.check(:'zero' = '22023 Cada cantidad es un número entero de pesos, mayor que cero' and :'negative' = :'zero' and :'cents' = :'zero' and :'text_amount' = :'zero',
  'zero, negative, centavos and text amounts are refused: ' || :'zero');
select harness.check(:'bad_kind' like '22023 %' and :'no_source' like '22023 %' and :'empty' like '22023 %' and :'not_list' like '22023 %', 'an unknown kind, no source, no lines and no list are refused');
select harness.check(:'half' = '22023 Ese jugador no es de este torneo' and pg_temp.rows_a() = 3, 'one bad line refuses the call whole');

-- 5. Void: the Comité's, with a reason, the whole assignment at once
select id as one_row from public.money_adjustments where tournament_id = :'t_a' and source_key = 'bestRound' and kind = 'award' \gset
select set_config('request.jwt.claims', harness.claims(:'dev_a'), true) \g /dev/null
set local role authenticated;
select pg_temp.try_void(:'one_row', 'No me gusta') as out \gset
reset role;
select harness.check(:'out' = '42501 Solo el Comité puede anular una asignación', 'a player cannot void: ' || :'out');
select set_config('request.jwt.claims', harness.claims(:'org_b'), true) \g /dev/null
set local role authenticated;
select pg_temp.try_void(:'one_row', 'De otro torneo') as out, pg_temp.try_void(gen_random_uuid(), 'No existe') as missing \gset
reset role;
select harness.check(:'out' = '42501 Solo el Comité puede anular una asignación' and :'missing' = :'out', 'another Comité cannot void, and learns nothing a missing row would not tell');
select set_config('request.jwt.claims', harness.claims(:'org_a'), true) \g /dev/null
set local role authenticated;
select pg_temp.try_void(:'one_row', ' ') as out \gset
select public.void_adjustment(:'one_row', 'Se equivocó de jugador')::text as voided \gset
select pg_temp.try_void(:'one_row', 'Otra vez') as again \gset
reset role;
select harness.check(:'out' = '22023 Escribe el motivo, al menos 3 letras', 'a void needs a reason too');
select harness.check(:'voided'::jsonb ->> 'voided' = '2', 'voiding one row voids its whole assignment (the award and the refund of that call)');
select harness.check((select count(*) from public.money_adjustments where tournament_id = :'t_a' and source_key = 'bestRound' and voided_at is not null and voided_by = :'org_a' and void_reason = 'Se equivocó de jugador') = 2,
  'both rows marked voided, by whom and why');
select harness.check((select voided_at is null from public.money_adjustments where tournament_id = :'t_a' and kind = 'house'), 'the other assignment stays');
select harness.check(:'again' = '22023 Esa asignación ya estaba anulada', 'voiding twice is refused');
select harness.check((select count(*) from public.audit_log where table_name = 'money_adjustments' and tournament_id = :'t_a' and action = 'UPDATE'
  and after ->> 'void_reason' = 'Se equivocó de jugador' and before ->> 'voided_at' is null) = 2, 'the void is in the audit log, before and after');

-- 6. Nothing of A's reached B
select harness.check((select count(*) from public.money_adjustments where tournament_id = :'t_b') = 0, 'tournament B holds no assignment of A''s');

select 'money_adjustments: ok';
rollback;
