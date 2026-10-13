-- MONEY-19 (0048): the Calcutta's money rules on the server. On the
-- two-tenant seed: org_a runs tournament A (Ana, Beto, and four more added
-- here), org_b runs B (Carla); dev_a is Ana's phone. Opening bid $250, steps
-- of $250. Rolled back at the end; prints one «ok» line per check.
\set ON_ERROR_STOP 1
\set QUIET 1
\pset tuples_only on
\pset format unaligned
select id as org_a from harness.seed where key = 'org_a' \gset
select id as dev_a from harness.seed where key = 'dev_a' \gset
select id as padmin from harness.seed where key = 'platform_admin' \gset
select id as t_a from harness.seed where key = 'tournament_a' \gset
select id as t_b from harness.seed where key = 'tournament_b' \gset
select id as ana from harness.seed where key = 'player_a1' \gset
select id as beto from harness.seed where key = 'player_a2' \gset
select id as carla from harness.seed where key = 'player_b1' \gset
\set caro '''c4800000-0000-4000-8000-000000000003'''
\set dino '''c4800000-0000-4000-8000-000000000004'''
\set eva '''c4800000-0000-4000-8000-000000000005'''
\set fer '''c4800000-0000-4000-8000-000000000006'''
\set lot_ana '''c4810000-0000-4000-8000-000000000001'''
\set lot_beto '''c4810000-0000-4000-8000-000000000002'''
\set lot_caro '''c4810000-0000-4000-8000-000000000003'''
\set lot_dino '''c4810000-0000-4000-8000-000000000004'''
\set lot_eva '''c4810000-0000-4000-8000-000000000005'''
\set lot_fer '''c4810000-0000-4000-8000-000000000006'''
begin;

-- A statement as a user of the app: its answer, or the SQLSTATE and the message.
-- The claims go with it, so the setup between checks runs with no session (a script, trusted as before).
create function pg_temp.as_user(uid uuid, q text) returns text language plpgsql as $$
declare
  r text;
begin
  perform set_config('request.jwt.claims', harness.claims(uid), true);
  set local role authenticated;
  execute q into r;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  return coalesce(r, 'null');
exception when others then
  reset role;
  perform set_config('request.jwt.claims', '', true);
  return sqlstate || ' ' || sqlerrm;
end $$;
-- The console's two writes, as api.ts sends them (PostgREST asks for the row back).
create function pg_temp.bid(uid uuid, lot uuid, bidder uuid, amount int) returns text language sql as $$
  select pg_temp.as_user(uid, format('insert into public.calcutta_bids (lot_id, bidder_id, amount) values (%L, %L, %s) returning amount::text', lot, bidder, amount))
$$;
create function pg_temp.sell(uid uuid, lot uuid, owner uuid, price int) returns text language sql as $$
  select pg_temp.as_user(uid, format('update public.calcutta_lots set status = ''sold'', owner_id = %L, price = %s, sold_at = now() where id = %L returning status', owner, price, lot))
$$;
create function pg_temp.lot(l uuid) returns text language sql as $$
  select status || ':' || coalesce(price::text, '-') || ':' || coalesce((select display_name from public.players where id = owner_id), '-') from public.calcutta_lots where id = l
$$;
create function pg_temp.bids(l uuid) returns text language sql as $$
  select coalesce(string_agg(b.amount::text || ' ' || p.display_name, ', ' order by b.amount), '-') from public.calcutta_bids b join public.players p on p.id = b.bidder_id where b.lot_id = l
$$;

-- Four more players in A; Ana's lot open, Beto's waiting, Caro bought by Dino, Dino owns himself.
insert into public.players (id, tournament_id, full_name, display_name, sort_order) values
  (:caro, :'t_a', 'Carolina Ruiz', 'Caro', 3), (:dino, :'t_a', 'Dino Paz', 'Dino', 4),
  (:eva, :'t_a', 'Eva Luna', 'Eva', 5), (:fer, :'t_a', 'Fernando Sol', 'Fer', 6);
insert into public.calcutta_lots (id, tournament_id, player_id, lot_number, status, price, owner_id, sold_at) values
  (:lot_ana, :'t_a', :'ana', 1, 'open', null, null, null), (:lot_beto, :'t_a', :'beto', 2, 'pending', null, null, null),
  (:lot_caro, :'t_a', :caro, 3, 'sold', 500, :dino, now()), (:lot_dino, :'t_a', :dino, 4, 'sold', 250, :dino, now()),
  (:lot_eva, :'t_a', :eva, 5, 'pending', null, null, null), (:lot_fer, :'t_a', :fer, 6, 'pending', null, null, null);
-- Two players per owner, so Dino is at the limit.
update public.tournaments set settings = jsonb_set(settings, '{auction,maxPlayersPerOwner}', '2') where id = :'t_a';

-- 1. Up in the increment from the bid standing
select harness.check(pg_temp.bid(:'org_a', :lot_ana, :'beto', 500) = '500', 'the first bid over the opening $250: $500');
select pg_temp.bid(:'org_a', :lot_ana, :caro, 620) as out \gset
select harness.check(:'out' = '22023 Las pujas suben de $250 en $250: la siguiente es $750', 'a fat finger off the step is refused, the next bid named: ' || :'out');
select pg_temp.bid(:'org_a', :lot_ana, :caro, 1370) as out \gset
select harness.check(:'out' = '22023 Las pujas suben de $250 en $250: $1,250 o $1,500', 'further up between two steps, both named: ' || :'out');
select pg_temp.bid(:'org_a', :lot_ana, :caro, 500) as out \gset
select harness.check(:'out' = '22023 Las pujas suben de $250 en $250: la siguiente es $750', 'the bid standing again: ' || :'out');
select harness.check(pg_temp.bid(:'org_a', :lot_ana, :caro, 1250) = '1250' and pg_temp.bids(:lot_ana) = '500 Beto, 1250 Caro', 'three steps at once is a bid: ' || pg_temp.bids(:lot_ana));

-- 2. Only on the open lot, only the tournament's players, within the limit
select pg_temp.bid(:'org_a', :lot_beto, :caro, 500) as out \gset
select harness.check(:'out' = '22023 Ese lote no está en subasta: se puja por el lote abierto', 'a lot still waiting takes no bid: ' || :'out');
select pg_temp.bid(:'org_a', :lot_caro, :eva, 750) as out \gset
select harness.check(:'out' = '22023 Ese lote no está en subasta: se puja por el lote abierto', 'a sold lot takes no bid: ' || :'out');
select pg_temp.bid(:'org_a', :lot_ana, :'carla', 1500) as out \gset
select harness.check(:'out' = '22023 Solo pujan los jugadores del torneo', 'another tournament''s player bids nothing: ' || :'out');
select pg_temp.bid(:'org_a', :lot_ana, :dino, 1500) as out \gset
select harness.check(:'out' = '22023 Dino ya tiene 2 jugadores: es el máximo', 'an owner at his limit bids nothing: ' || :'out');
-- His own lot counts when the settings say self-owned lots count; when they don't, he may bid on himself.
update public.calcutta_lots set status = 'open' where id = :lot_fer;
update public.calcutta_lots set status = 'pending' where id = :lot_ana;
update public.calcutta_lots set owner_id = :fer where id in (:lot_caro, :lot_dino);
select pg_temp.bid(:'org_a', :lot_fer, :fer, 500) as out \gset
select harness.check(:'out' = '22023 Fer ya tiene 2 jugadores: es el máximo', 'at his limit, not even on himself while self-owned lots count: ' || :'out');
update public.tournaments set settings = jsonb_set(settings, '{auction,selfOwnedCountsTowardMax}', 'false') where id = :'t_a';
select harness.check(pg_temp.bid(:'org_a', :lot_fer, :fer, 500) = '500', 'self-owned lots not counted: he may raise himself');
update public.tournaments set settings = jsonb_set(settings, '{auction,selfOwnedCountsTowardMax}', 'true') where id = :'t_a';
update public.calcutta_lots set owner_id = :dino where id in (:lot_caro, :lot_dino);
delete from public.calcutta_bids where lot_id = :lot_fer;
update public.calcutta_lots set status = 'pending' where id = :lot_fer;
update public.calcutta_lots set status = 'open' where id = :lot_ana;

-- 3. Who may bid at all is the policies' word, as before
select pg_temp.bid(:'dev_a', :lot_ana, :'beto', 1500) as out \gset
select harness.check(:'out' like '42501 %', 'a player''s phone bids nothing: ' || :'out');

-- 4. A bid is never changed
select pg_temp.as_user(:'org_a', format('update public.calcutta_bids set amount = 1370 where lot_id = %L and amount = 1250 returning amount::text', :lot_ana)) as out \gset
select harness.check(:'out' = '22023 Una puja no se cambia: deshazla y vuelve a pujar', 'a bid''s amount stays as bid: ' || :'out');
select harness.check(pg_temp.as_user(:'org_a', format('update public.calcutta_bids set amount = amount where lot_id = %L returning amount::text', :lot_ana)) <> 'null', 'an update that changes nothing goes through');
select harness.check(pg_temp.as_user(:'org_a', format('delete from public.calcutta_bids where lot_id = %L and amount = 1250 returning amount::text', :lot_ana)) = '1250' and pg_temp.bids(:lot_ana) = '500 Beto', '«Deshacer» deletes the last bid');
select harness.check(pg_temp.bid(:'org_a', :lot_ana, :caro, 1250) = '1250', 'and the auctioneer bids again');

-- 5. The hammer: the open lot, at the bid standing, to the one who made it
select pg_temp.sell(:'org_a', :lot_ana, :caro, 1000) as out \gset
select harness.check(:'out' = '22023 El lote se vende a la puja más alta: $1,250 de Caro' and pg_temp.lot(:lot_ana) = 'open:-:-', 'a stale price is refused, the bid standing named: ' || :'out');
select pg_temp.sell(:'org_a', :lot_ana, :'beto', 1250) as out \gset
select harness.check(:'out' = '22023 El lote se vende a la puja más alta: $1,250 de Caro', 'to someone else than the high bidder: ' || :'out');
select harness.check(pg_temp.sell(:'org_a', :lot_ana, :caro, 1250) = 'sold' and pg_temp.lot(:lot_ana) = 'sold:1250:Caro', 'at the bid standing to its bidder it sells: ' || pg_temp.lot(:lot_ana));
select pg_temp.sell(:'org_a', :lot_beto, :'beto', 250) as out \gset
select harness.check(:'out' = '22023 Solo se vende el lote abierto: ábrelo y que pujen' and pg_temp.lot(:lot_beto) = 'pending:-:-', 'a lot still waiting is never sold: ' || :'out');
select pg_temp.as_user(:'org_a', format('insert into public.calcutta_lots (tournament_id, player_id, lot_number, status, price, owner_id) values (%L, %L, 9, ''sold'', 250, %L) returning id::text', :'t_a', :'ana', :'ana')) as out \gset
select harness.check(:'out' = '22023 Solo se vende el lote abierto: ábrelo y que pujen', 'a lot is never created sold: ' || :'out');
-- Nobody bid: the player owns himself at the opening bid.
update public.calcutta_lots set status = 'open' where id = :lot_eva;
select pg_temp.sell(:'org_a', :lot_eva, :eva, 500) as out \gset
select harness.check(:'out' = '22023 El lote se vende a la puja más alta: $250 de Eva', 'with no bid, the opening bid by the player himself: ' || :'out');
select harness.check(pg_temp.sell(:'org_a', :lot_eva, :eva, 250) = 'sold' and pg_temp.lot(:lot_eva) = 'sold:250:Eva', 'and so it sells: ' || pg_temp.lot(:lot_eva));
-- A player at his limit with nobody bidding on him: the Comité finds a bidder first (the console says so too).
update public.calcutta_lots set status = 'open' where id = :lot_fer;
update public.calcutta_lots set owner_id = :fer where id in (:lot_caro, :lot_dino);
select pg_temp.sell(:'org_a', :lot_fer, :fer, 250) as out \gset
select harness.check(:'out' = '22023 Fer ya tiene 2 jugadores: es el máximo', 'selling a player to himself past his limit: ' || :'out');
update public.calcutta_lots set owner_id = :dino where id in (:lot_caro, :lot_dino);
update public.calcutta_lots set status = 'pending' where id = :lot_fer;

-- 6. A sale stands as the hammer made it; «Reabrir lote» is the way to redo it
select pg_temp.as_user(:'org_a', format('update public.calcutta_lots set price = 1370 where id = %L returning price::text', :lot_ana)) as out \gset
select harness.check(:'out' = '22023 Una venta no se cambia: deshazla con «Reabrir lote» y vuelve a venderlo' and pg_temp.lot(:lot_ana) = 'sold:1250:Caro', 'a sold lot''s price stays: ' || :'out');
select pg_temp.as_user(:'org_a', format('update public.calcutta_lots set owner_id = %L where id = %L returning status', :'beto', :lot_ana)) as out \gset
select harness.check(:'out' = '22023 Una venta no se cambia: deshazla con «Reabrir lote» y vuelve a venderlo', 'and its owner: ' || :'out');
select harness.check(pg_temp.as_user(:'org_a', format('update public.calcutta_lots set sold_at = sold_at where id = %L returning status', :lot_ana)) = 'sold', 'an update that changes neither goes through');
select harness.check(pg_temp.as_user(:'org_a', format('select public.reopen_lot(%L) ->> ''status''', :lot_ana)) = 'open' and pg_temp.bids(:lot_ana) = '500 Beto, 1250 Caro', 'reopened, the bids stay');
select harness.check(pg_temp.bid(:'org_a', :lot_ana, :'beto', 1500) = '1500' and pg_temp.sell(:'org_a', :lot_ana, :'beto', 1500) = 'sold' and pg_temp.lot(:lot_ana) = 'sold:1500:Beto', 'and it sells again to the new high bid: ' || pg_temp.lot(:lot_ana));
-- Deleting the owner (a player gone) sets him to null: not a change of sale.
select harness.check(pg_temp.as_user(:'org_a', format('delete from public.players where id = %L returning id::text', :'beto')) <> 'null' and pg_temp.lot(:lot_ana) = 'sold:1500:-', 'a deleted owner leaves the sale ownerless: ' || pg_temp.lot(:lot_ana));

-- 7. The platform admin in a Protegido tournament still writes nothing there; the service role and scripts are the policies' as before
update public.calcutta_lots set status = 'open' where id = :lot_fer;
select pg_temp.bid(:'padmin', :lot_fer, :caro, 1370) as out \gset
select harness.check(:'out' ~ '^22023 Las pujas suben', 'the platform admin meets the same rules in a tournament he may write: ' || :'out');
select pg_temp.as_user(:'org_a', format('select public.set_tournament_protected(%L, true, null)::text', :'t_a')) \g /dev/null
select pg_temp.bid(:'padmin', :lot_fer, :caro, 500) as out \gset
select harness.check(:'out' like '42501 %', 'Protegido and not unlocked: the policies refuse him, before any rule: ' || :'out');
select pg_temp.as_user(:'org_a', format('select public.set_tournament_protected(%L, false, %L)::text', :'t_a', 'fin de la prueba')) \g /dev/null
insert into public.calcutta_bids (lot_id, bidder_id, amount) values (:lot_fer, :caro, 1370);
select harness.check(pg_temp.bids(:lot_fer) = '1370 Caro', 'a script with no session (the rehearsal) is trusted, as before: ' || pg_temp.bids(:lot_fer));

rollback;
