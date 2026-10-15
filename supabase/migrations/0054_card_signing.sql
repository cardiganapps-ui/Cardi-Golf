-- 0054: a card signed by a marker, one player at a time (UX-23).
--
-- A signature was a pair's (card_signatures(round_id, pair_id), 0001): the
-- tarjeta cruzada of the first tournament, where each pair signs the other
-- pair's card. A tournament without the pairs game, a Stableford-only event
-- or a Ronda rápida, had no attestation and no lock at all: any phone of the
-- group could change a hole until the Comité closed the day, and a disputed
-- hole never settled from the group. Now a tournament says who signs
-- (`settings.cardSigning`):
--   * 'pairs':  each pair signs the other pair's card, exactly as before (it
--     needs the pairs game: without it nobody signs);
--   * 'marker': each player's card is signed by another player of his group,
--     one signature per player per day;
--   * 'none':   nobody signs.
-- A tournament stored before the key existed reads as it always behaved:
-- 'pairs' with the pairs game on, 'none' without (`card_signing_mode`, the
-- same rule as src/engine/core/cardSigning.ts). So no stored tournament's
-- card, lock or close changes.
--
-- The table: a signature names a pair or a player (`player_id`, a player of
-- the signature's own tournament: a composite key to players, as 0030's
-- tenant keys), exactly one of the two. Its key is (round, `card_id`), the
-- pair's id or the player's, generated so no writer sets it; each kind keeps
-- a unique key of its own, so an older bundle's upsert on (round_id,
-- pair_id) meets a signature as before. Realtime's delete events carry the
-- key, so a phone matches a delete by `card_id`.
--
-- Every rule that reads «the card is signed» (the scores' RLS, save_hole's
-- `card_signed`, admin_save_score's reason, resolve_rejected_write) goes
-- through card_is_signed, which now sees a player's signature too; a
-- signature settles that player's disputed holes, and the group hears that a
-- card waits for a signature (0052) by the tournament's rule. A signature
-- that exists locks its card whatever the rule says now: only the Comité
-- takes one off.
--
-- Who may sign a player's card: another player of his group that day, as
-- himself, while the day is live, in a tournament that signs by marker; the
-- Comité any card, any time (as a pair's). The pairs' branch of the policy is
-- 0013's, word for word.
--
-- Release order: this reaches production before the bundle (the snapshot,
-- the export and the nightly backup page card_signatures by card_id).

set local lock_timeout = '10s';

-- ---------------------------------------------------------------------------
-- 1. The tournament's signing rule, from its stored settings
-- ---------------------------------------------------------------------------
create or replace function public.card_signing_mode(p_settings jsonb)
returns text
language sql immutable
set search_path = public
as $$
  select case
    when p_settings ->> 'cardSigning' in ('marker', 'none') then p_settings ->> 'cardSigning'
    when coalesce(p_settings #>> '{modules,pairs,enabled}', '') = 'true' then 'pairs'
    else 'none'
  end
$$;
comment on function public.card_signing_mode(jsonb) is
  'Who signs a tournament''s cards (UX-23, 0054): marker or none when settings.cardSigning says so; else pairs while the pairs game is on, none without (the rule before the setting existed, and the reading of a value this database does not know).';

-- ---------------------------------------------------------------------------
-- 2. A signature names a pair or a player
-- ---------------------------------------------------------------------------
-- Players get the tenant key the other parents have (0030), for the composite key below.
create unique index if not exists players_tenant_uk on public.players (tournament_id, id);

alter table public.card_signatures drop constraint if exists card_signatures_pkey;
alter table public.card_signatures alter column pair_id drop not null;
alter table public.card_signatures add column if not exists player_id uuid;
alter table public.card_signatures
  add column if not exists card_id uuid generated always as (coalesce(pair_id, player_id)) stored;
alter table public.card_signatures add constraint card_signatures_pkey primary key (round_id, card_id);

alter table public.card_signatures drop constraint if exists card_signatures_one_card;
alter table public.card_signatures add constraint card_signatures_one_card check (num_nonnulls(pair_id, player_id) = 1);
alter table public.card_signatures drop constraint if exists card_signatures_pair_key;
alter table public.card_signatures add constraint card_signatures_pair_key unique (round_id, pair_id);
alter table public.card_signatures drop constraint if exists card_signatures_player_key;
alter table public.card_signatures add constraint card_signatures_player_key unique (round_id, player_id);
alter table public.card_signatures drop constraint if exists card_signatures_player_tenant_fkey;
alter table public.card_signatures add constraint card_signatures_player_tenant_fkey
  foreign key (tournament_id, player_id) references public.players (tournament_id, id) on update cascade on delete cascade;
create index if not exists card_signatures_player_idx on public.card_signatures (tournament_id, player_id);

comment on column public.card_signatures.player_id is
  'The player whose card a marker of his group signed (0054); null on a pair''s signature. Exactly one of pair_id and player_id.';
comment on column public.card_signatures.card_id is
  'Whose card: the pair''s id or the player''s. Generated (0054); with round_id, the key.';

-- ---------------------------------------------------------------------------
-- 3. «The card is signed»: a pair's signature or the player's own
-- ---------------------------------------------------------------------------
create or replace function public.card_is_signed(rid uuid, pid uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.card_signatures s
    where s.round_id = rid
      and (s.player_id = pid
           or exists (select 1 from public.pairs p where p.id = s.pair_id and (p.player1_id = pid or p.player2_id = pid)))
  )
$$;

-- A signature settles the disputed holes of the card it signs (0026's, plus a player's own).
create or replace function public.card_signature_settles()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  was text := coalesce(current_setting('cardi.comite', true), '');
begin
  perform set_config('cardi.comite', '1', true);
  update public.scores s
  set disputed = false, previous = null
  from public.pairs p
  where p.id = new.pair_id and s.round_id = new.round_id and s.player_id in (p.player1_id, p.player2_id) and s.disputed;
  if new.player_id is not null then
    update public.scores s
    set disputed = false, previous = null
    where s.round_id = new.round_id and s.player_id = new.player_id and s.disputed;
  end if;
  perform set_config('cardi.comite', was, true);
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Who signs: the Comité; a pair's card as 0013; a player's by a marker
-- ---------------------------------------------------------------------------
drop policy if exists card_signatures_insert on public.card_signatures;
create policy card_signatures_insert on public.card_signatures for insert
  with check (
    public.is_tournament_organizer(public.round_tournament_id(round_id))
    or (
      public.round_is_live(round_id)
      and signed_by = public.my_player_id(public.round_tournament_id(round_id))
      and exists (
        select 1 from public.pairs p
        where p.id = card_signatures.pair_id
          and p.tournament_id = public.round_tournament_id(card_signatures.round_id)
          and public.shares_group(card_signatures.round_id, p.player1_id)
          and public.shares_group(card_signatures.round_id, p.player2_id)
          and public.my_player_id(p.tournament_id) <> p.player1_id
          and public.my_player_id(p.tournament_id) <> p.player2_id
      )
    )
    or (
      card_signatures.pair_id is null
      and card_signatures.player_id is not null
      and public.round_is_live(round_id)
      and signed_by = public.my_player_id(public.round_tournament_id(round_id))
      and card_signatures.player_id <> public.my_player_id(public.round_tournament_id(round_id))
      and public.shares_group(card_signatures.round_id, card_signatures.player_id)
      and public.card_signing_mode((select t.settings from public.tournaments t where t.id = public.round_tournament_id(card_signatures.round_id))) = 'marker'
    )
  );

-- ---------------------------------------------------------------------------
-- 5. The group hears a card waits, by the tournament's rule (0052's)
-- ---------------------------------------------------------------------------
-- What a group's card asks of its players now, each said once (as src/engine reads the card):
--   * a card ready to sign, by the tournament's rule (card_signing_mode): under 'pairs' the whole group has
--     every hole (what the Tarjeta waits for to show «Firmar») and a pair's card is unsigned, and its signers
--     are the rest of the group; under 'marker' a player's card is complete and unsigned, and the rest of the
--     group hears it, each once a day;
--   * a snake tiebreak the group went on from: the first hole of its play order where two or more took the
--     snake's putts and nobody said who holed out last (src/engine/modules/snake), once a later hole was saved
--     (`p_holes`, the holes the change wrote) or a card signed (`p_holes` null). The phone that saved that
--     hole asked first, and its answer goes before its next hole: only a group that went on without one hears.
-- Only while the day is live (a phone answers or signs only then). Internal.
create or replace function public.group_notices(p_round_id uuid, p_group_id uuid, p_holes int[])
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  r public.rounds;
  g public.groups;
  t public.tournaments;
  members uuid[];
  n int;
  base jsonb;
  pr public.pairs;
  who uuid;
  done uuid;
  mode text;
  raw text;
  threshold int;
  pending int;
  pending_at int;
  latest int;
  h int;
  cands uuid[];
begin
  -- One group at a time: two phones saving its last two holes at once, each sees the other's.
  perform pg_advisory_xact_lock(hashtextextended('group_notices:' || p_group_id::text, 0));
  select * into r from public.rounds where id = p_round_id;
  select * into g from public.groups where id = p_group_id and round_id = p_round_id;
  if r.id is null or g.id is null or r.status <> 'live' then
    return;
  end if;
  select * into t from public.tournaments where id = r.tournament_id;
  select array_agg(m.player_id order by m.player_id) into members from public.group_members m where m.group_id = g.id;
  if members is null then
    return;
  end if;
  n := r.holes;
  base := jsonb_build_object('tournament', t.name, 'slug', t.slug, 'round', r.number, 'group', g.number);
  mode := public.card_signing_mode(t.settings);

  if mode = 'pairs' and not exists (
    select 1 from unnest(members) pid
    where (select count(*) from public.scores s
           where s.round_id = r.id and s.player_id = pid and s.hole between 1 and n and (s.strokes is not null or s.picked_up)) < n
  ) then
    for pr in
      select p.* from public.pairs p
      where p.tournament_id = t.id and p.player1_id = any (members) and p.player2_id = any (members)
        and not exists (select 1 from public.card_signatures cs where cs.round_id = r.id and cs.pair_id = p.id)
      order by p.id
    loop
      foreach who in array members loop
        if who <> pr.player1_id and who <> pr.player2_id then
          perform public.notify_player(who, 'card_to_sign', 'card_to_sign:' || r.id || ':' || pr.id, base);
        end if;
      end loop;
    end loop;
  elsif mode = 'marker' then
    -- A marker's rule (0054): each card complete and unsigned asks the rest of the group, each of them once a day
    -- (his key is the day's, whoever's card it was). Never the player himself, and never a name.
    for done in
      select pid from unnest(members) pid
      where (select count(*) from public.scores s
             where s.round_id = r.id and s.player_id = pid and s.hole between 1 and n and (s.strokes is not null or s.picked_up)) >= n
        and not public.card_is_signed(r.id, pid)
      order by pid
    loop
      foreach who in array members loop
        if who <> done then
          perform public.notify_player(who, 'card_to_sign', 'card_to_sign:' || r.id || ':marker', base || jsonb_build_object('marker', true));
        end if;
      end loop;
    end loop;
  end if;

  if coalesce(t.settings #>> '{modules,snake,enabled}', '') = 'true' then
    raw := t.settings #>> '{modules,snake,puttsThreshold}';
    threshold := case when raw ~ '^[0-9]{1,2}$' then least(10, greatest(2, raw::int)) else 3 end;
    for i in 0 .. n - 1 loop
      h := ((g.start_hole - 1 + i) % n) + 1;
      select array_agg(s.player_id) into cands from public.scores s
      where s.round_id = r.id and s.hole = h and s.player_id = any (members)
        and (s.strokes is not null or s.picked_up) and s.putts is not null and s.putts >= threshold;
      if coalesce(cardinality(cands), 0) >= 2 and not exists (
        select 1 from public.snake_tiebreaks tb
        where tb.round_id = r.id and tb.group_id = g.id and tb.hole = h and tb.last_holed_player_id = any (cands)
      ) then
        pending := h;
        pending_at := i;
        exit;
      end if;
    end loop;
    if pending is not null then
      if p_holes is null then
        latest := n;
      else
        select max((((x - g.start_hole) % n) + n) % n) into latest from unnest(p_holes) x where x between 1 and n;
      end if;
      if latest > pending_at then
        foreach who in array members loop
          perform public.notify_player(who, 'snake_tiebreak', 'snake_tiebreak:' || r.id || ':' || g.id || ':' || pending,
            base || jsonb_build_object('hole', pending, 'game', coalesce(nullif(btrim(t.settings #>> '{modules,snake,label}'), ''), 'La Víbora')));
        end loop;
      end if;
    end if;
  end if;
end;
$$;
revoke execute on function public.group_notices(uuid, uuid, int[]) from public, anon, authenticated;

-- A card signed: its group is done with that day, so a tiebreak still waiting there (the last hole's, which
-- no later hole follows) is said now. A player's card (0054) is found by his group.
create or replace function public.card_signatures_notify()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  gid uuid;
begin
  if coalesce(current_setting('cardi.restore', true), '') = '1' then
    return null;
  end if;
  begin
    if new.player_id is not null then
      -- A player's card (0054): his group that day.
      select g.id into gid
      from public.groups g
      join public.group_members m on m.group_id = g.id and m.player_id = new.player_id
      where g.round_id = new.round_id
      order by g.number
      limit 1;
    else
      select g.id into gid
      from public.pairs p
      join public.groups g on g.round_id = new.round_id
      where p.id = new.pair_id
        and exists (select 1 from public.group_members m where m.group_id = g.id and m.player_id = p.player1_id)
        and exists (select 1 from public.group_members m where m.group_id = g.id and m.player_id = p.player2_id)
      order by g.number
      limit 1;
    end if;
    if gid is not null then
      perform public.group_notices(new.round_id, gid, null);
    end if;
  exception when others then
    raise warning 'group notices: % (%)', sqlerrm, sqlstate;
  end;
  return null;
end;
$$;
revoke execute on function public.card_signatures_notify() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. restore_tournament: 0052's, a player's signature written back too
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
  quiet text;
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
     -- A signature is a pair's or one player's card (0054), and the one it names comes with the backup.
     or exists (select 1 from r_card_signatures x where not exists (select 1 from r_rounds r where r.id = x.round_id)
                  or num_nonnulls(x.pair_id, x.player_id) <> 1
                  or (x.pair_id is not null and not exists (select 1 from r_pairs p where p.id = x.pair_id))
                  or (x.player_id is not null and not exists (select 1 from r_players p where p.id = x.player_id)))
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

  -- What the backup brings back is no news: its days, holes and signatures tell no player anything (0052).
  quiet := coalesce(current_setting('cardi.restore', true), '');
  perform set_config('cardi.restore', '1', true);
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
  insert into public.card_signatures (tournament_id, round_id, pair_id, player_id, signed_by, signed_at)
  select p_tournament_id, round_id, pair_id, player_id, signed_by, coalesce(signed_at, now()) from r_card_signatures on conflict do nothing;
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
  perform set_config('cardi.restore', quiet, true);

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

-- The link to watch (0053) reads only the settings keys the schema knows
-- (`spectator_settings_spec`, the same list as src/data/spectatorSettingsSpec.json).
-- `cardSigning` is new here, and no money: both «Con dinero» and «Sin dinero» keep it.
create or replace function public.spectator_settings_spec()
returns jsonb
language sql immutable
set search_path = public
as $$
  select '{"o":{"modules":{"o":{"individual":{"o":{"enabled":"s","label":"s","format":"s","formatOptions":{"o":{"scoring":"s","matchMode":"s","teamMode":"s","teamScoring":"s"}}}},"bestRound":{"o":{"enabled":"s","label":"s"}},"pairs":{"o":{"enabled":"s","label":"s","pairing":{"a":{"a":"s"}},"honoreePicks":"s"}},"snake":{"o":{"enabled":"s","label":"s","puttsThreshold":"s"}},"fewestPutts":{"o":{"enabled":"s","label":"s"}},"auction":{"o":{"enabled":"s","label":"s"}}}},"tiers":{"a":"s"},"rounds":"s","groupSize":"s","expectedPlayers":"s","labels":{"o":{"lastPlace":"s","honoree":"s","trophy":"s"}},"entryFee":"s","houseCut":"s","handicap":{"o":{"allowance":"s","cap":"s","rounding":"s","perRoundSlope":"s","estimateWeights":{"a":"s"}}},"day2Cut":{"o":{"threshold":"s","pointsPerStroke":"s","maxStrokes":"s","mode":"s"}},"prizes":{"o":{"stableford":{"a":"s"},"stablefordMode":"s","pairs":{"a":"s"},"bestRoundPerDay":"s","snakePerSurvivor":"s","fewestPutts":"s"}},"auction":{"o":{"openingBid":"s","increment":"s","maxPlayersPerOwner":"s","selfOwnedCountsTowardMax":"s","guestsCanBid":"s","buybackMaxPct":"s","payout":{"a":{"d":"slot","by":{"place":{"o":{"slot":"s","place":"s","share":"s"}},"bestOfTier":{"o":{"slot":"s","tier":"s","share":"s"}},"lastPlace":{"o":{"slot":"s","share":"s"}}}}}}},"games":{"a":{"d":"type","by":{"skins":{"o":{"id":"s","label":"s","enabled":"s","rounds":{"u":["s",{"a":"s"}]},"entrants":"s","money":{"o":{"source":"s","buyIn":"s","amount":"s","stake":"s","split":{"a":"s"}}},"type":"s","options":{"o":{"basis":"s","carryOver":"s"}}}},"lowScore":{"o":{"id":"s","label":"s","enabled":"s","rounds":{"u":["s",{"a":"s"}]},"entrants":"s","money":{"o":{"source":"s","buyIn":"s","amount":"s","stake":"s","split":{"a":"s"}}},"type":"s","options":{"o":{"basis":"s","scope":"s"}}}},"eventPot":{"o":{"id":"s","label":"s","enabled":"s","rounds":{"u":["s",{"a":"s"}]},"entrants":"s","money":{"o":{"source":"s","buyIn":"s","amount":"s","stake":"s","split":{"a":"s"}}},"type":"s","options":{"o":{"event":"s","basis":"s"}}}},"match":{"o":{"id":"s","label":"s","enabled":"s","rounds":{"u":["s",{"a":"s"}]},"entrants":"s","money":{"o":{"source":"s","buyIn":"s","amount":"s","stake":"s","split":{"a":"s"}}},"type":"s","options":{"o":{"format":"s","basis":"s","pairScoring":"s","pressAt":"s","maxPresses":"s","matches":{"a":{"o":{"id":"s","a":{"a":"s"},"b":{"a":"s"}}}}}}}},"contest":{"o":{"id":"s","label":"s","enabled":"s","rounds":{"u":["s",{"a":"s"}]},"entrants":"s","money":{"o":{"source":"s","buyIn":"s","amount":"s","stake":"s","split":{"a":"s"}}},"type":"s","options":{"o":{"kind":"s","holes":{"u":["s",{"a":"s"}]}}}}},"custom":{"o":{"id":"s","label":"s","enabled":"s","rounds":{"u":["s",{"a":"s"}]},"entrants":"s","money":{"o":{"source":"s","buyIn":"s","amount":"s","stake":"s","split":{"a":"s"}}},"type":"s","options":{"o":{"description":"s"}}}}}}},"pickupPuttsForFewestPutts":"s","tieFallback":"s","cardSigning":"s","spectatorLink":"s","timezone":"s","currency":"s"}}'::jsonb
$$;
revoke execute on function public.spectator_settings_spec() from public, anon, authenticated;
