-- Cardi-Golf · 0046 · Base handicaps fixed before the Calcutta (UX-28).
--
-- The brief fixes the base handicaps before the Calcutta (§5.2) and the
-- runbook's checklist says «bloqueado», but nothing fixed them: the player
-- sheet changed a handicap at any moment, with no reason, and nobody but the
-- audit log saw it. After twelve lots were bought on the strength of each
-- player's handicap, one edit (or a typo) moved every playing handicap of both
-- days.
--
-- From here:
-- - tournaments.handicaps_locked_at: when the Comité fixed them
--   (lock_handicaps, «Fijar hándicaps»). The tournament leaving Configuración
--   (the auction opening, or play starting) fixes them by itself. A tournament
--   that is not in Configuración counts as fixed whatever the column says, so
--   one already under way when this migration ran is fixed too, with no
--   backfill. Only lock_handicaps and unlock_handicaps write the column
--   (and a restore, which brings back the backup's).
-- - While fixed, a change to a player's handicap (its source, base, index or
--   the three scores of an estimate) needs a reason: update_player is the
--   Comité's way to give one. The trigger players_handicap_lock refuses the
--   change without it on every path (an older bundle's direct write
--   included), and keeps the record on the player: players.handicap_note,
--   the handicap as it was when they were fixed («from») and each change after
--   it with its moment and reason. Nobody writes the note but that trigger.
--   The reason also lands in the audit log (audit_row reads it from the
--   statement), so Historial lists it. Everyone reads the note: En vivo and
--   the player's sheet say what changed, and why.
-- - unlock_handicaps: the Comité, with a reason, and only in Configuración
--   (before anything was bought on them): the lock goes and the notes with it.
-- - restore_tournament writes both columns back as the backup has them.

alter table public.tournaments add column if not exists handicaps_locked_at timestamptz;
comment on column public.tournaments.handicaps_locked_at is
  'When the Comité fixed the base handicaps (UX-28, 0046); a tournament out of setup counts as fixed. Written by lock_handicaps, unlock_handicaps, the status change out of setup, and restore_tournament.';
alter table public.players add column if not exists handicap_note jsonb;
comment on column public.players.handicap_note is
  'Changes to this player''s handicap after they were fixed (UX-28, 0046): {from: the handicap when fixed, changes: [{at, reason, to}]}. Written only by players_handicap_lock.';

-- A reason as resolve_rejected_write (0028) and src/lib/reason.ts read it: trimmed at both ends of every whitespace.
create or replace function public.trim_reason(p text)
returns text
language sql immutable
set search_path = public
as $$
  select regexp_replace(coalesce(p, ''), '^[\t\n\v\f\r \u0085  ᠎ -​    ⁠　﻿]+|[\t\n\v\f\r \u0085  ᠎ -​    ⁠　﻿]+$', '', 'g')
$$;
revoke execute on function public.trim_reason(text) from public, anon;
grant execute on function public.trim_reason(text) to authenticated, service_role;

-- A player's handicap as the engine starts from it (src/engine/core/compute.ts, baseHandicap): an estimate's three
-- scores, an index (the base when none was typed), else the base. What the other fields hold is not compared: a base
-- left over from before the player had an index changes nothing the engine reads.
create or replace function public.handicap_used(p_source text, p_base numeric, p_index numeric, p_estimate jsonb)
returns jsonb
language sql immutable
set search_path = public
as $$
  select case
    when p_source = 'estimate' and p_estimate is not null then jsonb_build_object('estimate', p_estimate)
    when p_source = 'index' then jsonb_build_object('index', coalesce(p_index, p_base))
    else jsonb_build_object('manual', p_base)
  end
$$;
revoke execute on function public.handicap_used(text, numeric, numeric, jsonb) from public, anon;
grant execute on function public.handicap_used(text, numeric, numeric, jsonb) to authenticated, service_role;

-- The tournament's lock column moves only through lock_handicaps / unlock_handicaps (or a restore), and the
-- tournament leaving setup fixes the handicaps by itself.
create or replace function public.tournaments_handicap_lock()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  restoring boolean := coalesce(current_setting('cardi.restore', true), '') = '1';
begin
  if restoring then
    return new;
  end if;
  if new.handicaps_locked_at is distinct from old.handicaps_locked_at and coalesce(current_setting('cardi.handicap_lock', true), '') <> '1' then
    raise exception 'Los hándicaps se fijan y se liberan desde Jugadores' using errcode = '42501';
  end if;
  if old.status = 'setup' and new.status is distinct from 'setup' and new.handicaps_locked_at is null then
    new.handicaps_locked_at := now();
  end if;
  return new;
end;
$$;
revoke execute on function public.tournaments_handicap_lock() from public, anon, authenticated;
drop trigger if exists tournaments_handicap_lock on public.tournaments;
create trigger tournaments_handicap_lock before update on public.tournaments
  for each row execute function public.tournaments_handicap_lock();

-- A player's handicap while they are fixed: changed only with a reason, and each change kept on the player.
create or replace function public.players_handicap_lock()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  locked boolean;
  why text;
  was jsonb := jsonb_build_object('handicap_source', old.handicap_source, 'base_hcp', old.base_hcp, 'handicap_index', old.handicap_index, 'estimate_inputs', old.estimate_inputs);
  now_is jsonb := jsonb_build_object('handicap_source', new.handicap_source, 'base_hcp', new.base_hcp, 'handicap_index', new.handicap_index, 'estimate_inputs', new.estimate_inputs);
begin
  if coalesce(current_setting('cardi.restore', true), '') = '1' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.handicap_note := null;
    return new;
  end if;
  -- unlock_handicaps clears the notes; nobody else writes them.
  if coalesce(current_setting('cardi.handicap_lock', true), '') = '1' then
    return new;
  end if;
  new.handicap_note := old.handicap_note;
  if public.handicap_used(old.handicap_source, old.base_hcp, old.handicap_index, old.estimate_inputs)
     = public.handicap_used(new.handicap_source, new.base_hcp, new.handicap_index, new.estimate_inputs) then
    return new;
  end if;
  select t.handicaps_locked_at is not null or t.status <> 'setup' into locked from public.tournaments t where t.id = old.tournament_id;
  if not coalesce(locked, false) then
    return new;
  end if;
  why := nullif(current_setting('cardi.reason', true), '');
  if why is null then
    raise exception 'Los hándicaps ya están fijados: para cambiar uno hace falta un motivo' using errcode = '22023';
  end if;
  -- «from» is the handicap when they were fixed: the first change's starting point, kept by every later one.
  -- The 20 latest changes stay here; every one is in the audit log.
  new.handicap_note := jsonb_build_object(
    'from', coalesce(old.handicap_note -> 'from', was),
    'changes', (
      select coalesce(jsonb_agg(c order by n), '[]'::jsonb)
        from (
          select c, n from jsonb_array_elements(coalesce(old.handicap_note -> 'changes', '[]'::jsonb) || jsonb_build_array(jsonb_build_object('at', now(), 'reason', why, 'to', now_is))) with ordinality x(c, n)
          order by n desc limit 20
        ) kept
    )
  );
  return new;
end;
$$;
revoke execute on function public.players_handicap_lock() from public, anon, authenticated;
drop trigger if exists players_handicap_lock on public.players;
create trigger players_handicap_lock before insert or update on public.players
  for each row execute function public.players_handicap_lock();

-- «Fijar hándicaps»: from now on a change needs a reason, and everyone sees it.
create or replace function public.lock_handicaps(p_tournament_id uuid)
returns timestamptz
language plpgsql volatile security invoker
set search_path = public
as $$
declare
  at timestamptz;
begin
  if p_tournament_id is null or not public.is_tournament_organizer(p_tournament_id) then
    raise exception 'Solo el Comité fija los hándicaps' using errcode = '42501';
  end if;
  perform set_config('cardi.handicap_lock', '1', true);
  update public.tournaments set handicaps_locked_at = coalesce(handicaps_locked_at, now())
   where id = p_tournament_id
  returning handicaps_locked_at into at;
  perform set_config('cardi.handicap_lock', '', true);
  if at is null then
    raise exception 'Solo el Comité fija los hándicaps' using errcode = '42501';
  end if;
  return at;
end;
$$;
comment on function public.lock_handicaps(uuid) is
  'Fix the base handicaps (UX-28): after this a change needs a reason (update_player) and is shown to everyone.';
revoke execute on function public.lock_handicaps(uuid) from public, anon;
grant execute on function public.lock_handicaps(uuid) to authenticated;

-- «Liberar»: only before the tournament leaves setup, with a reason; the changes recorded go with the lock.
create or replace function public.unlock_handicaps(p_tournament_id uuid, p_reason text)
returns void
language plpgsql volatile security invoker
set search_path = public
as $$
declare
  why text := public.trim_reason(p_reason);
  st text;
begin
  if p_tournament_id is null or not public.is_tournament_organizer(p_tournament_id) then
    raise exception 'Solo el Comité libera los hándicaps' using errcode = '42501';
  end if;
  if char_length(why) < 3 then
    raise exception 'Escribe el motivo, al menos 3 letras' using errcode = '22023';
  end if;
  if char_length(why) > 200 then
    raise exception 'El motivo es muy largo: 200 letras como máximo' using errcode = '22023';
  end if;
  select status into st from public.tournaments where id = p_tournament_id for update;
  if st is distinct from 'setup' then
    raise exception 'El torneo ya empezó: los hándicaps se quedan fijados' using errcode = '22023';
  end if;
  perform set_config('cardi.handicap_lock', '1', true);
  perform set_config('cardi.reason', why, true);
  update public.tournaments set handicaps_locked_at = null where id = p_tournament_id and handicaps_locked_at is not null;
  update public.players set handicap_note = null where tournament_id = p_tournament_id and handicap_note is not null;
  perform set_config('cardi.reason', '', true);
  perform set_config('cardi.handicap_lock', '', true);
end;
$$;
comment on function public.unlock_handicaps(uuid, text) is
  'Undo «Fijar hándicaps» before the tournament leaves setup (UX-28), with a reason: the lock and its notes go.';
revoke execute on function public.unlock_handicaps(uuid, text) from public, anon;
grant execute on function public.unlock_handicaps(uuid, text) to authenticated;

-- A player's sheet saved with a reason: the whole row in one statement, the reason for its handicap change.
create or replace function public.update_player(p_player_id uuid, p_row jsonb, p_reason text)
returns uuid
language plpgsql volatile security invoker
set search_path = public
as $$
declare
  cur public.players;
  nx public.players;
  why text := public.trim_reason(p_reason);
begin
  select * into cur from public.players where id = p_player_id;
  if not found or not public.is_tournament_organizer(cur.tournament_id) then
    raise exception 'Solo el Comité cambia a un jugador' using errcode = '42501';
  end if;
  if jsonb_typeof(p_row) is distinct from 'object' then
    raise exception 'No pudimos leer ese cambio; abre al jugador otra vez y repítelo' using errcode = '22023';
  end if;
  if char_length(why) < 3 then
    raise exception 'Escribe el motivo, al menos 3 letras' using errcode = '22023';
  end if;
  if char_length(why) > 200 then
    raise exception 'El motivo es muy largo: 200 letras como máximo' using errcode = '22023';
  end if;
  -- Only the sheet's own fields: never the tournament, the account link or the note.
  nx := jsonb_populate_record(cur, p_row - array['id', 'tournament_id', 'created_at', 'handicap_note', 'profile_id', 'profile_status']);
  perform set_config('cardi.reason', why, true);
  update public.players
     set full_name = nx.full_name, display_name = nx.display_name, tier = nx.tier, base_hcp = nx.base_hcp,
         handicap_source = nx.handicap_source, handicap_index = nx.handicap_index, estimate_inputs = nx.estimate_inputs,
         default_tee_id = nx.default_tee_id, is_honoree = nx.is_honoree, is_admin = nx.is_admin, avatar_url = nx.avatar_url,
         form_guide = nx.form_guide, sort_order = nx.sort_order
   where id = p_player_id;
  perform set_config('cardi.reason', '', true);
  return p_player_id;
end;
$$;
comment on function public.update_player(uuid, jsonb, text) is
  'The Comité''s player sheet saved with a reason (UX-28): the row in one statement, the reason recorded for a handicap changed after they were fixed.';
revoke execute on function public.update_player(uuid, jsonb, text) from public, anon;
grant execute on function public.update_player(uuid, jsonb, text) to authenticated;

-- The audit log takes a statement's reason when the row has no reason column of its own.
create or replace function public.audit_row()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  rid text;
  tid uuid;
  rec jsonb;
begin
  rec := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  rid := case
    when tg_table_name = 'holes' then concat(rec ->> 'tee_id', ':', rec ->> 'number')
    else coalesce(
      rec ->> 'id',
      nullif(concat_ws(':', rec ->> 'round_id', rec ->> 'group_id', rec ->> 'lot_id', rec ->> 'pair_id', rec ->> 'player_id', rec ->> 'hole', rec ->> 'auth_user_id'), ''),
      md5(rec::text)
    )
  end;
  tid := case
    when tg_table_name = 'tournaments' then (rec ->> 'id')::uuid
    when rec ? 'tournament_id' then (rec ->> 'tournament_id')::uuid
    when rec ? 'round_id' then public.round_tournament_id((rec ->> 'round_id')::uuid)
    when rec ? 'group_id' then public.group_tournament_id((rec ->> 'group_id')::uuid)
    when rec ? 'lot_id' then public.lot_tournament_id((rec ->> 'lot_id')::uuid)
    else null
  end;
  insert into public.audit_log (tournament_id, table_name, row_id, actor_auth_user_id, actor_player_id, action, before, after, reason, actor_platform)
  values (
    tid, tg_table_name, rid, auth.uid(), case when tid is not null then public.my_player_id(tid) end, tg_op,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end,
    -- The row's own reason, else the one its writer gave for the statement (0046: a handicap changed after it was fixed).
    case when tg_op in ('INSERT', 'UPDATE') then coalesce(rec ->> 'reason', nullif(current_setting('cardi.reason', true), '')) end,
    auth.uid() is not null and public.is_platform_admin() and (tid is null or not public.is_tournament_participant(tid))
  );
  return coalesce(new, old);
end;
$$;

-- restore_tournament as 0030 left it, plus the two columns above: the backup's lock and each player's note.
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
  insert into public.calcutta_lots (id, tournament_id, player_id, lot_number, status, price, owner_id, sold_at)
  select id, p_tournament_id, player_id, lot_number, coalesce(status, 'pending'), price, owner_id, sold_at from r_calcutta_lots;
  insert into public.calcutta_bids (id, tournament_id, lot_id, bidder_id, amount, created_at)
  select coalesce(id, gen_random_uuid()), p_tournament_id, lot_id, bidder_id, amount, coalesce(created_at, now()) from r_calcutta_bids;
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
