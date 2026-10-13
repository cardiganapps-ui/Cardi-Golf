-- ARCH-13 (0045): the Calcutta's lots and a course's card, each written in
-- one transaction. On the two-tenant seed: org_a runs tournament A (Ana,
-- Beto), org_b runs B (Carla), dev_a is Ana's phone. Rolled back at the end;
-- prints one «ok» line per check.
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
select id as r_a from harness.seed where key = 'round_a1' \gset
select id as r_b from harness.seed where key = 'round_b1' \gset
begin;

-- A call as a user of the app: its answer, or the SQLSTATE and the message.
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
create function pg_temp.lots() returns text language sql as $$
  select coalesce(string_agg(l.lot_number || ':' || p.display_name || ':' || l.status, ' ' order by l.lot_number), '-')
  from public.calcutta_lots l join public.players p on p.id = l.player_id
  where l.tournament_id = (select id from harness.seed where key = 'tournament_a')
$$;
create function pg_temp.draw(uid uuid, players uuid[]) returns text language sql as $$
  select pg_temp.as_user(uid, format('select public.create_lots(%L, %L::uuid[])::text', (select id from harness.seed where key = 'tournament_a'), players))
$$;
-- A card of 18 holes: par 4 on each, the index the hole's number, the first hole's par as given.
create function pg_temp.holes(first_par int) returns jsonb language sql as $$
  select jsonb_agg(jsonb_build_object('number', n, 'par', case when n = 1 then first_par else 4 end, 'stroke_index', n, 'yards', 350) order by n) from generate_series(1, 18) n
$$;
create function pg_temp.save(uid uuid, p jsonb) returns text language sql as $$
  select pg_temp.as_user(uid, format('select public.save_course(%L::jsonb)::text', p))
$$;
create function pg_temp.card(cid uuid) returns text language sql as $$
  select coalesce(string_agg(t.name || ':' || t.sort_order || ':' || t.par_total || ':' || (select count(*) from public.holes h where h.tee_id = t.id) || ':' || (select par from public.holes h where h.tee_id = t.id and h.number = 1), ' ' order by t.sort_order), '-')
  from public.tees t where t.course_id = cid
$$;

-- 1. «Sacar del sombrero»: one lot per player in the order given, the sold ones kept
select pg_temp.draw(:'org_a', array[:'beto', :'ana']::uuid[]) \g /dev/null
select harness.check(pg_temp.lots() = '1:Beto:pending 2:Ana:pending', 'a lot per player in the order drawn: ' || pg_temp.lots());
-- The setup between calls runs with no session, as a script (the Calcutta's rules, 0048, are the Comité's).
select set_config('request.jwt.claims', '', true) \g /dev/null
update public.calcutta_lots set status = 'sold', owner_id = :'beto', price = 500 where tournament_id = :'t_a' and player_id = :'ana';
select pg_temp.draw(:'org_a', array[:'ana', :'beto']::uuid[]) as out \gset
select harness.check(pg_temp.lots() = '2:Ana:sold 3:Beto:pending' and jsonb_array_length(:'out'::jsonb) = 1, 'a new draw keeps the sold lot and numbers after it: ' || pg_temp.lots());
select pg_temp.draw(:'org_a', array[:'beto', :'carla']::uuid[]) as out \gset
select harness.check(:'out' = '22023 Ese jugador no es de este torneo' and pg_temp.lots() = '2:Ana:sold 3:Beto:pending', 'a player of another tournament is refused, and the lots stand: ' || :'out');
select pg_temp.draw(:'org_a', array[:'beto', :'beto']::uuid[]) as out \gset
select harness.check(:'out' = '22023 Cada jugador sale del sombrero una sola vez', 'one player twice: ' || :'out');
select pg_temp.draw(:'dev_a', array[:'beto']::uuid[]) as out \gset
select harness.check(:'out' = '42501 Solo el Comité arma la subasta', 'a player''s phone draws nothing: ' || :'out');
select pg_temp.draw(:'org_b', array[:'beto']::uuid[]) as out \gset
select harness.check(:'out' like '42501 %', 'another tournament''s Comité: ' || :'out');

-- 2. «Deshacer la venta»: open again, no owner, price or buyback; the bids stay
select id as lot_ana from public.calcutta_lots where tournament_id = :'t_a' and player_id = :'ana' \gset
select set_config('request.jwt.claims', '', true) \g /dev/null
insert into public.calcutta_bids (lot_id, bidder_id, amount) values (:'lot_ana', :'beto', 500);
insert into public.calcutta_buybacks (lot_id, pct, amount) values (:'lot_ana', 50, 250);
select pg_temp.as_user(:'dev_a', format('select public.reopen_lot(%L)::text', :'lot_ana')) as out \gset
select harness.check(:'out' = '42501 Solo el Comité deshace una venta' and pg_temp.lots() = '2:Ana:sold 3:Beto:pending', 'a player''s phone undoes no sale: ' || :'out');
select pg_temp.as_user(:'org_a', format('select public.reopen_lot(%L)::text', :'lot_ana')) as out \gset
select harness.check(pg_temp.lots() = '2:Ana:open 3:Beto:pending'
  and (select owner_id is null and price is null and sold_at is null from public.calcutta_lots where id = :'lot_ana')
  and not exists (select 1 from public.calcutta_buybacks where lot_id = :'lot_ana')
  and exists (select 1 from public.calcutta_bids where lot_id = :'lot_ana'), 'the sale undone, its buyback gone, its bids kept: ' || pg_temp.lots());

-- 3. A course's card: all of it or none of it
select pg_temp.save(:'org_a', jsonb_build_object('name', '  Solmar  ', 'tees', jsonb_build_array(
  jsonb_build_object('name', 'Azules', 'color', 'blue', 'rating', 72.1, 'slope', 131, 'holes', pg_temp.holes(4))))) as cid \gset
select harness.check(pg_temp.card(:'cid') = 'Azules:0:72:18:4' and (select name = 'Solmar' and created_by = :'org_a'::uuid from public.courses where id = :'cid'), 'a new course: trimmed, its tee and 18 holes, the par total summed: ' || pg_temp.card(:'cid'));
select id as azules from public.tees where course_id = :'cid' \gset
select pg_temp.save(:'org_a', jsonb_build_object('id', :'cid', 'name', 'Solmar', 'tees', jsonb_build_array(
  jsonb_build_object('id', :'azules', 'name', 'Azul', 'holes', pg_temp.holes(5)),
  jsonb_build_object('name', 'Blancas', 'holes', pg_temp.holes(4))))) \g /dev/null
select harness.check(pg_temp.card(:'cid') = 'Azul:0:73:18:5 Blancas:1:72:18:4', 'a tee changed and a tee added, in their order: ' || pg_temp.card(:'cid'));
select id as blancas from public.tees where course_id = :'cid' and name = 'Blancas' \gset
-- The old bug: a later tee that fails used to leave the earlier ones saved.
select pg_temp.save(:'org_a', jsonb_build_object('id', :'cid', 'name', 'Solmar', 'tees', jsonb_build_array(
  jsonb_build_object('id', :'azules', 'name', 'Azul oscuro', 'holes', pg_temp.holes(3)),
  jsonb_build_object('id', :'blancas', 'name', 'Blancas', 'holes', pg_temp.holes(9))))) as out \gset
select harness.check(:'out' like '23514 %' and pg_temp.card(:'cid') = 'Azul:0:73:18:5 Blancas:1:72:18:4', 'a hole that can''t be saved refuses the whole card, the first tee included: ' || :'out');
select pg_temp.save(:'org_a', jsonb_build_object('name', 'Otro', 'tees', '[]'::jsonb)) as other \gset
select pg_temp.save(:'org_a', jsonb_build_object('id', :'other', 'name', 'Otro', 'tees', jsonb_build_array(jsonb_build_object('id', :'azules', 'name', 'Robado', 'holes', pg_temp.holes(4))))) as out \gset
select harness.check(:'out' = '22023 Ese tee no es de este campo' and pg_temp.card(:'cid') = 'Azul:0:73:18:5 Blancas:1:72:18:4', 'a tee of another course is never written: ' || :'out');
select pg_temp.save(:'org_a', jsonb_build_object('id', :'cid', 'name', '   ', 'tees', '[]'::jsonb)) as out \gset
select harness.check(:'out' = '22023 El campo necesita nombre', 'a blank name: ' || :'out');
select pg_temp.save(:'org_a', '{"name": "Sin tees"}') as out \gset
select harness.check(:'out' like '22023 %', 'a card without its list of tees: ' || :'out');

-- 4. Who may: the course's own editors; an anonymous phone creates none
select pg_temp.save(:'org_b', jsonb_build_object('id', :'cid', 'name', 'Mío', 'tees', '[]'::jsonb)) as out \gset
select harness.check(:'out' = '42501 Solo quien juega este campo en su torneo lo edita' and pg_temp.card(:'cid') = 'Azul:0:73:18:5 Blancas:1:72:18:4', 'a Comité whose tournament doesn''t play it: ' || :'out');
select pg_temp.save(:'dev_a', jsonb_build_object('name', 'Del teléfono', 'tees', '[]'::jsonb)) as out \gset
select harness.check(:'out' = '42501 Solo un organizador con cuenta da de alta un campo', 'an anonymous phone: ' || :'out');

-- 5. Taking out a tee another tournament plays: refused, and that tournament keeps its day
update public.rounds set course_id = :'cid' where id in (:'r_a', :'r_b');
insert into public.round_tees (round_id, player_id, tee_id) values (:'r_b', :'carla', :'blancas');
select pg_temp.as_user(:'org_a', format('select count(*)::text from public.round_tees where tee_id = %L', :'blancas')) as seen \gset
select harness.check(:'seen' = '0', 'A''s Comité can''t see B''s tees of the day: a check under its own policies lets the delete go');
select pg_temp.save(:'org_a', jsonb_build_object('id', :'cid', 'name', 'Solmar', 'tees', jsonb_build_array(jsonb_build_object('id', :'azules', 'name', 'Azul', 'holes', pg_temp.holes(5))))) as out \gset
select harness.check(:'out' = '22023 Ese tee lo juega alguien en una ronda; cámbialo primero' and pg_temp.card(:'cid') = 'Azul:0:73:18:5 Blancas:1:72:18:4', 'a tee another tournament''s round plays is not taken out, and the card is as it was (the rest used to be saved before 0010''s guard refused): ' || :'out');
select harness.check(exists (select 1 from public.round_tees where round_id = :'r_b' and player_id = :'carla' and tee_id = :'blancas'), 'and B''s day keeps its tee');
-- An older bundle's direct delete, which the tees policy lets A's Comité make: 0010's guard refuses it.
select pg_temp.as_user(:'org_a', format('delete from public.tees where id = %L returning id::text', :'blancas')) as out \gset
select harness.check(:'out' = '22023 Ese tee lo juega alguien en una ronda; cámbialo primero' and exists (select 1 from public.round_tees where round_id = :'r_b' and tee_id = :'blancas'), 'a direct delete of a tee a round plays is refused (0010''s tees_guard), and B''s day stands: ' || :'out');
delete from public.round_tees where round_id = :'r_b';
update public.players set default_tee_id = :'blancas' where id = :'carla';
select pg_temp.save(:'org_a', jsonb_build_object('id', :'cid', 'name', 'Solmar', 'tees', jsonb_build_array(jsonb_build_object('id', :'azules', 'name', 'Azul', 'holes', pg_temp.holes(5))))) as out \gset
select harness.check(:'out' = '22023 Ese tee es el de un jugador; cámbiale su tee primero' and (select default_tee_id = :'blancas'::uuid from public.players where id = :'carla'), 'nor one a player of B has as default, which used to go null: ' || :'out');
update public.players set default_tee_id = null where id = :'carla';
select pg_temp.save(:'org_a', jsonb_build_object('id', :'cid', 'name', 'Solmar', 'tees', jsonb_build_array(jsonb_build_object('id', :'azules', 'name', 'Azul', 'holes', pg_temp.holes(5))))) \g /dev/null
select harness.check(pg_temp.card(:'cid') = 'Azul:0:73:18:5', 'a tee nobody plays goes: ' || pg_temp.card(:'cid'));

-- 6. Nobody calls them without a session
select harness.check(not has_function_privilege('anon', 'public.create_lots(uuid, uuid[])', 'execute')
  and not has_function_privilege('anon', 'public.reopen_lot(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.save_course(jsonb)', 'execute'), 'no session, no call');

rollback;
