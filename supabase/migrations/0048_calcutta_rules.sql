-- 0048: the Calcutta's money rules on the server (MONEY-19).
--
-- The auction console keeps a custom bid on the step and sells at the bid
-- standing, but the database took any positive bid from any bidder and any
-- hammer price: an older build, a second Comité phone with a stale board or
-- a direct write could put an amount in the pot the rules never allow
-- (§5.9: «las pujas suben de $250 en $250», 3 players per owner). Now every
-- write the Comité's session sends meets the same rules as the console:
--
--   calcutta_bids, insert: the lot is open; the bidder is a player of the
--     lot's tournament; the amount goes up from the bid standing (the top
--     bid, else the opening bid the player makes himself) by a whole number
--     of increments; a bidder already at his limit of players can't bid
--     (self-owned lots counted as the settings say; his own lot is never
--     barred when they don't count).
--   calcutta_bids, update: a bid is never changed (undo it and bid again).
--   calcutta_lots, into 'sold': from 'open' only, at the bid standing to
--     the one who made it (the player himself when nobody bid), within the
--     owner's limit; a lot is never inserted sold; a sold lot's price and
--     owner never change (its owner may only go: a player deleted sets it
--     to null). «Reabrir lote» (reopen_lot, 0045) is the way to redo one.
--
-- Both take the lot's row lock, so two phones can't both take the same
-- step: the second is refused with the next bid named. The service role,
-- scripts and the superuser are trusted and left to the policies as before
-- (the rules apply where `is_tournament_organizer` holds, which is every
-- client write the policies let through). The numbers are the tournament's
-- own settings (`settings.auction`), each falling back to the platform's
-- default when missing (250, 250, 3, self-owned counts).
--
-- restore_tournament is 0046's, its lots and bids written under
-- `cardi.restore`, so a backup's auction comes back as it was.

-- ---------------------------------------------------------------------------
-- The tournament's auction numbers, as the engine reads them
-- ---------------------------------------------------------------------------
create or replace function public.auction_rules(p_tournament_id uuid, out opening int, out step int, out max_owned int, out self_counts boolean)
language sql stable security definer
set search_path = ''
as $$
  select
    case when jsonb_typeof(a -> 'openingBid') = 'number' and (a ->> 'openingBid')::numeric >= 1 then round((a ->> 'openingBid')::numeric)::int else 250 end,
    case when jsonb_typeof(a -> 'increment') = 'number' and (a ->> 'increment')::numeric >= 1 then round((a ->> 'increment')::numeric)::int else 250 end,
    case when jsonb_typeof(a -> 'maxPlayersPerOwner') = 'number' and (a ->> 'maxPlayersPerOwner')::numeric >= 1 then round((a ->> 'maxPlayersPerOwner')::numeric)::int else 3 end,
    case when jsonb_typeof(a -> 'selfOwnedCountsTowardMax') = 'boolean' then (a ->> 'selfOwnedCountsTowardMax')::boolean else true end
  from (select coalesce(t.settings -> 'auction', '{}'::jsonb) as a from public.tournaments t where t.id = p_tournament_id) s
$$;
revoke execute on function public.auction_rules(uuid) from public, anon, authenticated;

-- Players an owner holds: his sold lots, his own counted only when the settings say so.
create or replace function public.lots_owned(p_tournament_id uuid, p_owner uuid, p_self_counts boolean)
returns int
language sql stable security definer
set search_path = ''
as $$
  select count(*)::int from public.calcutta_lots l
  where l.tournament_id = p_tournament_id and l.status = 'sold' and l.owner_id = p_owner and (p_self_counts or l.owner_id <> l.player_id)
$$;
revoke execute on function public.lots_owned(uuid, uuid, boolean) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Bids
-- ---------------------------------------------------------------------------
create or replace function public.calcutta_bids_rules()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  lot public.calcutta_lots;
  r record;
  standing int;
  steps int;
  held int;
  money text := 'FM999,999,999,990';
begin
  if coalesce(current_setting('cardi.restore', true), '') = '1' then
    return new;
  end if;
  if tg_op = 'UPDATE' then
    if (new.lot_id, new.bidder_id, new.amount) is distinct from (old.lot_id, old.bidder_id, old.amount) and public.is_tournament_organizer(old.tournament_id) then
      raise exception 'Una puja no se cambia: deshazla y vuelve a pujar' using errcode = '22023';
    end if;
    return new;
  end if;
  select * into lot from public.calcutta_lots where id = new.lot_id;
  -- Not the Comité's session (the service role, a script): the policies decide, as before.
  if not found or not public.is_tournament_organizer(lot.tournament_id) then
    return new;
  end if;
  -- One bid at a time on a lot: a second phone waits, then meets the bid that won.
  select * into lot from public.calcutta_lots where id = new.lot_id for update;
  if lot.status <> 'open' then
    raise exception 'Ese lote no está en subasta: se puja por el lote abierto' using errcode = '22023';
  end if;
  if not exists (select 1 from public.players p where p.id = new.bidder_id and p.tournament_id = lot.tournament_id) then
    raise exception 'Solo pujan los jugadores del torneo' using errcode = '22023';
  end if;
  r := public.auction_rules(lot.tournament_id);
  standing := coalesce((select max(b.amount) from public.calcutta_bids b where b.lot_id = lot.id), r.opening);
  if new.amount is null or new.amount <= standing or (new.amount - standing) % r.step <> 0 then
    steps := case when new.amount is null then 0 else floor((new.amount - standing)::numeric / r.step)::int end;
    if steps < 1 then
      raise exception 'Las pujas suben de % en %: la siguiente es %', '$' || to_char(r.step, money), '$' || to_char(r.step, money), '$' || to_char(standing + r.step, money) using errcode = '22023';
    end if;
    raise exception 'Las pujas suben de % en %: % o %', '$' || to_char(r.step, money), '$' || to_char(r.step, money), '$' || to_char(standing + steps * r.step, money), '$' || to_char(standing + (steps + 1) * r.step, money) using errcode = '22023';
  end if;
  -- His own lot is never barred when self-owned lots don't count (§18.3).
  if not (new.bidder_id = lot.player_id and not r.self_counts) then
    held := public.lots_owned(lot.tournament_id, new.bidder_id, r.self_counts);
    if held >= r.max_owned then
      raise exception '% ya tiene %: es el máximo', (select p.display_name from public.players p where p.id = new.bidder_id), case when r.max_owned = 1 then 'un jugador' else r.max_owned || ' jugadores' end using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function public.calcutta_bids_rules() from public, anon, authenticated;
drop trigger if exists calcutta_bids_rules on public.calcutta_bids;
create trigger calcutta_bids_rules before insert or update on public.calcutta_bids
  for each row execute function public.calcutta_bids_rules();

-- ---------------------------------------------------------------------------
-- The hammer
-- ---------------------------------------------------------------------------
create or replace function public.calcutta_lots_hammer()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  r record;
  top_amount int;
  top_bidder uuid;
  held int;
  money text := 'FM999,999,999,990';
begin
  if coalesce(current_setting('cardi.restore', true), '') = '1' then
    return new;
  end if;
  if new.status is distinct from 'sold' then
    return new;
  end if;
  if not public.is_tournament_organizer(new.tournament_id) then
    return new;
  end if;
  -- A sale stands as the hammer made it: its owner may only go (a player deleted sets it to null), never change.
  if tg_op = 'UPDATE' and old.status = 'sold' then
    if new.price is distinct from old.price or (new.owner_id is distinct from old.owner_id and new.owner_id is not null) then
      raise exception 'Una venta no se cambia: deshazla con «Reabrir lote» y vuelve a venderlo' using errcode = '22023';
    end if;
    return new;
  end if;
  if tg_op = 'INSERT' or old.status is distinct from 'open' then
    raise exception 'Solo se vende el lote abierto: ábrelo y que pujen' using errcode = '22023';
  end if;
  r := public.auction_rules(new.tournament_id);
  -- The bid standing, as the engine reads it: the highest, the first made on a tie.
  select b.amount, b.bidder_id into top_amount, top_bidder from public.calcutta_bids b where b.lot_id = new.id order by b.amount desc, b.created_at, b.id limit 1;
  if not found then
    top_amount := r.opening;
    top_bidder := new.player_id;
  end if;
  if new.price is distinct from top_amount or new.owner_id is distinct from top_bidder then
    raise exception 'El lote se vende a la puja más alta: % de %', '$' || to_char(top_amount, money), (select p.display_name from public.players p where p.id = top_bidder) using errcode = '22023';
  end if;
  if not (new.owner_id = new.player_id and not r.self_counts) then
    held := public.lots_owned(new.tournament_id, new.owner_id, r.self_counts);
    if held >= r.max_owned then
      raise exception '% ya tiene %: es el máximo', (select p.display_name from public.players p where p.id = new.owner_id), case when r.max_owned = 1 then 'un jugador' else r.max_owned || ' jugadores' end using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function public.calcutta_lots_hammer() from public, anon, authenticated;
drop trigger if exists calcutta_lots_hammer on public.calcutta_lots;
create trigger calcutta_lots_hammer before insert or update on public.calcutta_lots
  for each row execute function public.calcutta_lots_hammer();

-- ---------------------------------------------------------------------------
-- restore_tournament: 0046's, the auction written under cardi.restore
-- ---------------------------------------------------------------------------
create or replace function public.restore_tournament(p_tournament_id uuid, p_backup jsonb)
returns jsonb
language plpgsql volatile security definer
set search_path = public
as $$
declare
  tb jsonb;
  n_players int;
  n_rounds int;
  n_scores int;
  was text;
begin
  if not public.is_tournament_organizer(p_tournament_id) then
    raise exception 'Solo el Comité puede restaurar un respaldo' using errcode = '42501';
  end if;
  if (p_backup ->> 'version')::int is distinct from 1 then
    raise exception 'Versión de respaldo no soportada' using errcode = '22023';
  end if;
  if (p_backup ->> 'tournamentId')::uuid is distinct from p_tournament_id then
    raise exception 'wrong-tournament' using errcode = '22023';
  end if;
  tb := coalesce(p_backup -> 'tables', '{}'::jsonb);

  create temp table r_tournaments on commit drop as select * from jsonb_populate_recordset(null::public.tournaments, coalesce(tb -> 'tournaments', '[]'::jsonb));
  create temp table r_players on commit drop as select * from jsonb_populate_recordset(null::public.players, coalesce(tb -> 'players', '[]'::jsonb));
  create temp table r_rounds on commit drop as select * from jsonb_populate_recordset(null::public.rounds, coalesce(tb -> 'rounds', '[]'::jsonb));
  create temp table r_pairs on commit drop as select * from jsonb_populate_recordset(null::public.pairs, coalesce(tb -> 'pairs', '[]'::jsonb));
  create temp table r_teams on commit drop as select * from jsonb_populate_recordset(null::public.teams, coalesce(tb -> 'teams', '[]'::jsonb));
  create temp table r_team_members on commit drop as select * from jsonb_populate_recordset(null::public.team_members, coalesce(tb -> 'team_members', '[]'::jsonb));
  create temp table r_groups on commit drop as select * from jsonb_populate_recordset(null::public.groups, coalesce(tb -> 'groups', '[]'::jsonb));
  create temp table r_group_members on commit drop as select * from jsonb_populate_recordset(null::public.group_members, coalesce(tb -> 'group_members', '[]'::jsonb));
  create temp table r_round_tees on commit drop as select * from jsonb_populate_recordset(null::public.round_tees, coalesce(tb -> 'round_tees', '[]'::jsonb));
  create temp table r_scores on commit drop as select * from jsonb_populate_recordset(null::public.scores, coalesce(tb -> 'scores', '[]'::jsonb));
  create temp table r_snake_tiebreaks on commit drop as select * from jsonb_populate_recordset(null::public.snake_tiebreaks, coalesce(tb -> 'snake_tiebreaks', '[]'::jsonb));
  create temp table r_card_signatures on commit drop as select * from jsonb_populate_recordset(null::public.card_signatures, coalesce(tb -> 'card_signatures', '[]'::jsonb));
  create temp table r_handicap_overrides on commit drop as select * from jsonb_populate_recordset(null::public.handicap_overrides, coalesce(tb -> 'handicap_overrides', '[]'::jsonb));
  create temp table r_calcutta_lots on commit drop as select * from jsonb_populate_recordset(null::public.calcutta_lots, coalesce(tb -> 'calcutta_lots', '[]'::jsonb));
  create temp table r_calcutta_bids on commit drop as select * from jsonb_populate_recordset(null::public.calcutta_bids, coalesce(tb -> 'calcutta_bids', '[]'::jsonb));
  create temp table r_calcutta_buybacks on commit drop as select * from jsonb_populate_recordset(null::public.calcutta_buybacks, coalesce(tb -> 'calcutta_buybacks', '[]'::jsonb));
  create temp table r_payments on commit drop as select * from jsonb_populate_recordset(null::public.payments, coalesce(tb -> 'payments', '[]'::jsonb));
  create temp table r_money_adjustments on commit drop as select * from jsonb_populate_recordset(null::public.money_adjustments, coalesce(tb -> 'money_adjustments', '[]'::jsonb));
  create temp table r_game_entries on commit drop as select * from jsonb_populate_recordset(null::public.game_entries, coalesce(tb -> 'game_entries', '[]'::jsonb));
  create temp table r_hole_awards on commit drop as select * from jsonb_populate_recordset(null::public.hole_awards, coalesce(tb -> 'hole_awards', '[]'::jsonb));
  create temp table r_game_results on commit drop as select * from jsonb_populate_recordset(null::public.game_results, coalesce(tb -> 'game_results', '[]'::jsonb));

  -- Tenant: every row of the backup belongs to this tournament.
  if exists (select 1 from r_tournaments where id is distinct from p_tournament_id)
     or exists (select 1 from r_players where tournament_id is distinct from p_tournament_id)
     or exists (select 1 from r_rounds where tournament_id is distinct from p_tournament_id)
     or exists (select 1 from r_pairs where tournament_id is distinct from p_tournament_id)
     or exists (select 1 from r_teams where tournament_id is distinct from p_tournament_id)
     or exists (select 1 from r_team_members where tournament_id is distinct from p_tournament_id)
     or exists (select 1 from r_calcutta_lots where tournament_id is distinct from p_tournament_id)
     or exists (select 1 from r_payments where tournament_id is distinct from p_tournament_id)
     or exists (select 1 from r_money_adjustments where tournament_id is distinct from p_tournament_id)
     or exists (select 1 from r_game_entries where tournament_id is distinct from p_tournament_id)
     or exists (select 1 from r_game_results where tournament_id is distinct from p_tournament_id)
     -- The child tables carry the tenant too since 0030; a backup from before has none (null), and gets this one.
     or exists (select 1 from r_groups where tournament_id <> p_tournament_id)
     or exists (select 1 from r_group_members where tournament_id <> p_tournament_id)
     or exists (select 1 from r_round_tees where tournament_id <> p_tournament_id)
     or exists (select 1 from r_scores where tournament_id <> p_tournament_id)
     or exists (select 1 from r_snake_tiebreaks where tournament_id <> p_tournament_id)
     or exists (select 1 from r_card_signatures where tournament_id <> p_tournament_id)
     or exists (select 1 from r_handicap_overrides where tournament_id <> p_tournament_id)
     or exists (select 1 from r_hole_awards where tournament_id <> p_tournament_id)
     or exists (select 1 from r_calcutta_bids where tournament_id <> p_tournament_id)
     or exists (select 1 from r_calcutta_buybacks where tournament_id <> p_tournament_id) then
    raise exception 'El respaldo tiene filas de otro torneo' using errcode = '22023';
  end if;
  -- Ids (NEW-12): a row the backup names is never a row another tournament
  -- already has, directly or through its round or lot. Since 0010 players and
  -- rounds were upserted by id, so a backup listing another tournament's ids
  -- rewrote them there (its names, its handicaps, its round's status), and its
  -- scores and groups landed in that round. Checked before anything is written.
  if exists (select 1 from r_players x join public.players y on y.id = x.id where y.tournament_id <> p_tournament_id)
     or exists (select 1 from r_rounds x join public.rounds y on y.id = x.id where y.tournament_id <> p_tournament_id)
     or exists (select 1 from r_pairs x join public.pairs y on y.id = x.id where y.tournament_id <> p_tournament_id)
     or exists (select 1 from r_teams x join public.teams y on y.id = x.id where y.tournament_id <> p_tournament_id)
     or exists (select 1 from r_calcutta_lots x join public.calcutta_lots y on y.id = x.id where y.tournament_id <> p_tournament_id)
     or exists (select 1 from r_payments x join public.payments y on y.id = x.id where y.tournament_id <> p_tournament_id)
     or exists (select 1 from r_money_adjustments x join public.money_adjustments y on y.id = x.id where y.tournament_id <> p_tournament_id)
     or exists (select 1 from r_groups x join public.groups y on y.id = x.id join public.rounds r on r.id = y.round_id where r.tournament_id <> p_tournament_id)
     or exists (select 1 from r_scores x join public.scores y on y.id = x.id join public.rounds r on r.id = y.round_id where r.tournament_id <> p_tournament_id)
     or exists (select 1 from r_calcutta_bids x join public.calcutta_bids y on y.id = x.id join public.calcutta_lots l on l.id = y.lot_id where l.tournament_id <> p_tournament_id) then
    raise exception 'El respaldo trae filas que son de otro torneo; no se restauró nada' using errcode = '22023';
  end if;
  if exists (select 1 from r_players where id is null) or exists (select 1 from r_rounds where id is null)
     or exists (select 1 from r_pairs where id is null) or exists (select 1 from r_groups where id is null)
     or exists (select 1 from r_teams where id is null)
     or exists (select 1 from r_calcutta_lots where id is null) then
    raise exception 'El respaldo está incompleto (filas sin id)' using errcode = '22023';
  end if;
  -- One call is one decision (paid, flagged and voided whole): a row with no
  -- call would come back as a call of its own, splitting a refund. The export
  -- always carries it, so a backup without it was edited: refused.
  if exists (select 1 from r_money_adjustments where call_id is null) then
    raise exception 'El respaldo trae decisiones del Comité incompletas; no se restauró nada' using errcode = '22023';
  end if;
  -- References: everything points at rows the backup also carries (and, by the
  -- check above, those are this tournament's or new).
  if exists (select 1 from r_groups g where not exists (select 1 from r_rounds r where r.id = g.round_id))
     or exists (select 1 from r_group_members m where not exists (select 1 from r_groups g where g.id = m.group_id) or not exists (select 1 from r_players p where p.id = m.player_id))
     or exists (select 1 from r_round_tees x where not exists (select 1 from r_rounds r where r.id = x.round_id) or not exists (select 1 from r_players p where p.id = x.player_id))
     or exists (select 1 from r_scores s where not exists (select 1 from r_rounds r where r.id = s.round_id) or not exists (select 1 from r_players p where p.id = s.player_id))
     or exists (select 1 from r_snake_tiebreaks x where not exists (select 1 from r_rounds r where r.id = x.round_id) or not exists (select 1 from r_groups g where g.id = x.group_id) or not exists (select 1 from r_players p where p.id = x.last_holed_player_id))
     or exists (select 1 from r_card_signatures x where not exists (select 1 from r_rounds r where r.id = x.round_id) or not exists (select 1 from r_pairs p where p.id = x.pair_id))
     or exists (select 1 from r_handicap_overrides x where not exists (select 1 from r_rounds r where r.id = x.round_id) or not exists (select 1 from r_players p where p.id = x.player_id))
     or exists (select 1 from r_pairs x where not exists (select 1 from r_players p where p.id = x.player1_id) or not exists (select 1 from r_players p where p.id = x.player2_id))
     or exists (select 1 from r_team_members x where not exists (select 1 from r_teams tm where tm.id = x.team_id) or not exists (select 1 from r_players p where p.id = x.player_id))
     or exists (select 1 from r_calcutta_lots x where not exists (select 1 from r_players p where p.id = x.player_id) or (x.owner_id is not null and not exists (select 1 from r_players p where p.id = x.owner_id)))
     or exists (select 1 from r_calcutta_bids x where not exists (select 1 from r_calcutta_lots l where l.id = x.lot_id) or not exists (select 1 from r_players p where p.id = x.bidder_id))
     or exists (select 1 from r_calcutta_buybacks x where not exists (select 1 from r_calcutta_lots l where l.id = x.lot_id))
     or exists (select 1 from r_payments x where (x.from_player_id is not null and not exists (select 1 from r_players p where p.id = x.from_player_id)) or (x.to_player_id is not null and not exists (select 1 from r_players p where p.id = x.to_player_id)))
     or exists (select 1 from r_money_adjustments x where x.to_player_id is not null and not exists (select 1 from r_players p where p.id = x.to_player_id))
     or exists (select 1 from r_game_entries x where not exists (select 1 from r_players p where p.id = x.player_id))
     or exists (select 1 from r_game_results x where not exists (select 1 from r_players p where p.id = x.player_id))
     or exists (select 1 from r_hole_awards x where not exists (select 1 from r_rounds r where r.id = x.round_id) or not exists (select 1 from r_players p where p.id = x.player_id) or (x.group_id is not null and not exists (select 1 from r_groups g where g.id = x.group_id))) then
    raise exception 'El respaldo está incompleto: hay filas que apuntan a datos que no trae' using errcode = '22023';
  end if;

  -- Defaults for columns older backups did not have; courses are not restored, so drop dangling tee refs.
  update r_scores set id = gen_random_uuid() where id is null;
  -- (the API session runs with safeupdate: every UPDATE/DELETE needs a WHERE)
  update r_scores set disputed = false, previous = null, reason = null, picked_up = coalesce(picked_up, false), updated_at = coalesce(updated_at, now()) where true;
  update r_players set default_tee_id = null where default_tee_id is not null and not exists (select 1 from public.tees t where t.id = r_players.default_tee_id);
  update r_rounds set course_id = null where course_id is not null and not exists (select 1 from public.courses c where c.id = r_rounds.course_id);
  delete from r_round_tees where not exists (select 1 from public.tees t where t.id = r_round_tees.tee_id);
  update r_scores set entered_by = null where entered_by is not null and not exists (select 1 from r_players p where p.id = r_scores.entered_by);
  update r_snake_tiebreaks set decided_by = null where decided_by is not null and not exists (select 1 from r_players p where p.id = r_snake_tiebreaks.decided_by);
  update r_card_signatures set signed_by = null where signed_by is not null and not exists (select 1 from r_players p where p.id = r_card_signatures.signed_by);
  update r_handicap_overrides set "by" = null where "by" is not null and not exists (select 1 from r_players p where p.id = r_handicap_overrides."by");
  update r_hole_awards set decided_by = null where decided_by is not null and not exists (select 1 from r_players p where p.id = r_hole_awards.decided_by);

  -- Wipe dependents (players and rounds are upserted so PINs and device links survive).
  update public.tournaments set current_round_id = null, banker_player_id = null where id = p_tournament_id;
  delete from public.payments where tournament_id = p_tournament_id;
  delete from public.money_adjustments where tournament_id = p_tournament_id;
  delete from public.calcutta_lots where tournament_id = p_tournament_id;
  delete from public.card_signatures where round_id in (select id from public.rounds where tournament_id = p_tournament_id);
  delete from public.handicap_overrides where round_id in (select id from public.rounds where tournament_id = p_tournament_id);
  delete from public.snake_tiebreaks where round_id in (select id from public.rounds where tournament_id = p_tournament_id);
  delete from public.scores where round_id in (select id from public.rounds where tournament_id = p_tournament_id);
  delete from public.round_tees where round_id in (select id from public.rounds where tournament_id = p_tournament_id);
  delete from public.game_entries where tournament_id = p_tournament_id;
  delete from public.game_results where tournament_id = p_tournament_id;
  delete from public.hole_awards where round_id in (select id from public.rounds where tournament_id = p_tournament_id);
  delete from public.groups where round_id in (select id from public.rounds where tournament_id = p_tournament_id);
  delete from public.pairs where tournament_id = p_tournament_id;
  delete from public.teams where tournament_id = p_tournament_id;

  -- The players as the backup has them, their handicaps and the record of a change after they were fixed
  -- included, whatever the lock says now (0046's players_handicap_lock lets this write through).
  was := coalesce(current_setting('cardi.restore', true), '');
  perform set_config('cardi.restore', '1', true);
  insert into public.players (id, tournament_id, full_name, display_name, tier, base_hcp, handicap_source, handicap_index, estimate_inputs, default_tee_id, is_honoree, is_admin, avatar_url, form_guide, sort_order, created_at, handicap_note)
  select id, p_tournament_id, full_name, display_name, tier, coalesce(base_hcp, 18), coalesce(handicap_source, 'manual'), handicap_index, estimate_inputs, default_tee_id, coalesce(is_honoree, false), coalesce(is_admin, false), avatar_url, form_guide, coalesce(sort_order, 0), coalesce(created_at, now()), handicap_note
  from r_players
  on conflict (id) do update set
    full_name = excluded.full_name, display_name = excluded.display_name, tier = excluded.tier, base_hcp = excluded.base_hcp,
    handicap_source = excluded.handicap_source, handicap_index = excluded.handicap_index, estimate_inputs = excluded.estimate_inputs,
    default_tee_id = excluded.default_tee_id, is_honoree = excluded.is_honoree, is_admin = excluded.is_admin, avatar_url = excluded.avatar_url,
    form_guide = excluded.form_guide, sort_order = excluded.sort_order, handicap_note = excluded.handicap_note;
  perform set_config('cardi.restore', was, true);
  delete from public.players where tournament_id = p_tournament_id and not exists (select 1 from r_players r where r.id = players.id);

  update public.rounds set number = number + 1000 where tournament_id = p_tournament_id;
  insert into public.rounds (id, tournament_id, number, date, course_id, holes, status)
  select id, p_tournament_id, number, date, course_id, coalesce(holes, 18), coalesce(status, 'scheduled') from r_rounds
  on conflict (id) do update set number = excluded.number, date = excluded.date, course_id = excluded.course_id, holes = excluded.holes, status = excluded.status;
  delete from public.rounds where tournament_id = p_tournament_id and not exists (select 1 from r_rounds r where r.id = rounds.id);

  insert into public.groups (id, tournament_id, round_id, number, tee_time, start_hole) select id, p_tournament_id, round_id, number, tee_time, coalesce(start_hole, 1) from r_groups;
  insert into public.group_members (group_id, player_id, tournament_id) select group_id, player_id, p_tournament_id from r_group_members on conflict do nothing;
  insert into public.round_tees (round_id, player_id, tee_id, tournament_id) select round_id, player_id, tee_id, p_tournament_id from r_round_tees on conflict do nothing;
  insert into public.pairs (id, tournament_id, name, player1_id, player2_id, kind, picked_by_honoree, drawn_at)
  select id, p_tournament_id, name, player1_id, player2_id, kind, coalesce(picked_by_honoree, false), drawn_at from r_pairs;
  insert into public.teams (id, tournament_id, name, number, drawn_at)
  select id, p_tournament_id, name, coalesce(number, 1), drawn_at from r_teams;
  insert into public.team_members (team_id, player_id, tournament_id)
  select team_id, player_id, p_tournament_id from r_team_members on conflict do nothing;
  insert into public.scores (id, tournament_id, round_id, player_id, hole, strokes, putts, picked_up, entered_by, client_ts, updated_at, disputed, previous, reason)
  select id, p_tournament_id, round_id, player_id, hole, strokes, putts, picked_up, entered_by, client_ts, updated_at, false, null, null from r_scores;
  insert into public.snake_tiebreaks (tournament_id, round_id, group_id, hole, last_holed_player_id, decided_by, created_at)
  select p_tournament_id, round_id, group_id, hole, last_holed_player_id, decided_by, coalesce(created_at, now()) from r_snake_tiebreaks on conflict do nothing;
  insert into public.card_signatures (tournament_id, round_id, pair_id, signed_by, signed_at)
  select p_tournament_id, round_id, pair_id, signed_by, coalesce(signed_at, now()) from r_card_signatures on conflict do nothing;
  insert into public.handicap_overrides (tournament_id, round_id, player_id, playing_hcp, reason, "by", at)
  select p_tournament_id, round_id, player_id, playing_hcp, reason, "by", coalesce(at, now()) from r_handicap_overrides on conflict do nothing;
  -- The auction as the backup has it, sold lots and every bid: the Calcutta's rules (0048) let these through.
  was := coalesce(current_setting('cardi.restore', true), '');
  perform set_config('cardi.restore', '1', true);
  insert into public.calcutta_lots (id, tournament_id, player_id, lot_number, status, price, owner_id, sold_at)
  select id, p_tournament_id, player_id, lot_number, coalesce(status, 'pending'), price, owner_id, sold_at from r_calcutta_lots;
  insert into public.calcutta_bids (id, tournament_id, lot_id, bidder_id, amount, created_at)
  select coalesce(id, gen_random_uuid()), p_tournament_id, lot_id, bidder_id, amount, coalesce(created_at, now()) from r_calcutta_bids;
  perform set_config('cardi.restore', was, true);
  insert into public.calcutta_buybacks (lot_id, tournament_id, pct, amount, paid) select lot_id, p_tournament_id, pct, amount, coalesce(paid, false) from r_calcutta_buybacks on conflict do nothing;
  insert into public.payments (id, tournament_id, from_player_id, to_player_id, amount, kind, paid, note, created_at)
  select coalesce(id, gen_random_uuid()), p_tournament_id, from_player_id, to_player_id, amount, kind, coalesce(paid, false), note, coalesce(created_at, now()) from r_payments;
  insert into public.money_adjustments (id, tournament_id, source_key, kind, to_player_id, amount, reason, call_id, created_by, created_at, voided_at, voided_by, void_reason)
  select coalesce(id, gen_random_uuid()), p_tournament_id, source_key, kind, to_player_id, amount, reason, call_id, created_by, coalesce(created_at, now()), voided_at, voided_by, void_reason from r_money_adjustments;
  insert into public.game_entries (tournament_id, game_id, player_id, created_at)
  select p_tournament_id, game_id, player_id, coalesce(created_at, now()) from r_game_entries on conflict do nothing;
  insert into public.game_results (tournament_id, game_id, player_id, share, created_at)
  select p_tournament_id, game_id, player_id, coalesce(share, 1), coalesce(created_at, now()) from r_game_results on conflict do nothing;
  insert into public.hole_awards (tournament_id, round_id, group_id, hole, game_id, player_id, decided_by, created_at)
  select p_tournament_id, round_id, group_id, hole, game_id, player_id, decided_by, coalesce(created_at, now()) from r_hole_awards on conflict do nothing;

  -- The backup's status as it was, Terminado included: the close gate (0029) lets this one write through.
  was := coalesce(current_setting('cardi.restore', true), '');
  perform set_config('cardi.restore', '1', true);
  update public.tournaments t
  set name = coalesce(r.name, t.name), tagline = r.tagline, logo_url = r.logo_url, accent_color = r.accent_color,
      status = coalesce(r.status, t.status), settings = coalesce(r.settings, t.settings),
      handicaps_locked_at = r.handicaps_locked_at,
      timezone = coalesce(r.timezone, t.timezone), currency = coalesce(r.currency, t.currency),
      current_round_id = case when exists (select 1 from r_rounds x where x.id = r.current_round_id) then r.current_round_id end,
      banker_player_id = case when exists (select 1 from r_players x where x.id = r.banker_player_id) then r.banker_player_id end
  from r_tournaments r
  where t.id = p_tournament_id;
  perform set_config('cardi.restore', was, true);

  select count(*) into n_players from r_players;
  select count(*) into n_rounds from r_rounds;
  select count(*) into n_scores from r_scores;
  return jsonb_build_object('players', n_players, 'rounds', n_rounds, 'scores', n_scores);
end;
$$;
revoke execute on function public.restore_tournament(uuid, jsonb) from public, anon;
grant execute on function public.restore_tournament(uuid, jsonb) to authenticated, service_role;
