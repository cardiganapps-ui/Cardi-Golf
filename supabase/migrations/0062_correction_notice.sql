-- 0062: a player sees what the Comité changed on his card, and hears of it (TRUST-14).
--
-- A Comité correction (admin_save_score, admin_save_hole, «Aplicar» in Pendientes de revisar, a discrepancy
-- resolved) wrote the score with its reason, and only the Comité's history showed it: the player whose card it
-- was got no mark, no reason and no word, and nobody but the Comité could read how a card got to what it holds.
--   1. The phone marks each hole the Comité decided, with its reason: scores.reason (0009), which every member
--      already reads, and which a write that is not the Comité's clears (scores_detect_dispute, 0010), so a reason
--      on a row is always the Comité's decision on the value it holds.
--   2. A correction of a value the card held sends that player a notice through notify_player (0052): his PIN
--      phones by push and, when the player is a confirmed profile's, that account's inbox. It says the day, never
--      the hole, the values or who: a card fixed hole by hole is one piece of news, so a player hears it at most
--      once per day of the tournament every ten minutes. Not for a first capture (the Comité typing a paper card),
--      not for a decision that leaves the value as it was (a discrepancy kept), never for a restore
--      (cardi.restore), and never at the cost of the correction: an error here only warns.
--   3. card_history(tournament, player): every member of the tournament reads how each hole of a player's card
--      got to what it holds, from the audit log: each value, who wrote it (a player's short name, or the Comité
--      with its reason) and when. One transaction is one step, by what it found and what it left, so a restore's
--      delete and insert of the same hole is no step. Never an account, a phone or a mutation; never on a link to
--      watch (no session there, and no grant to anon).

-- ---------------------------------------------------------------------------
-- 1. The notice
-- ---------------------------------------------------------------------------
alter table public.player_notices drop constraint player_notices_kind_check;
alter table public.player_notices add constraint player_notices_kind_check
  check (kind in ('round_live', 'card_to_sign', 'snake_tiebreak', 'results', 'score_corrected'));

create or replace function public.scores_notify_correction()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  r public.rounds;
  t public.tournaments;
begin
  if coalesce(current_setting('cardi.restore', true), '') = '1' then
    return null;
  end if;
  begin
    -- Once per player and day every ten minutes, counted from the notice that went out.
    if exists (
      select 1 from public.player_notices n
      where n.player_id = new.player_id and n.kind = 'score_corrected'
        and n.key like 'score_corrected:' || new.round_id || ':%'
        and n.created_at > now() - interval '10 minutes'
    ) then
      return null;
    end if;
    select * into r from public.rounds where id = new.round_id;
    select * into t from public.tournaments where id = r.tournament_id;
    perform public.notify_player(new.player_id, 'score_corrected', 'score_corrected:' || new.round_id || ':' || new.id || ':' || new.version,
      jsonb_build_object('tournament', t.name, 'slug', t.slug, 'round', r.number));
  exception when others then
    raise warning 'score_corrected notice not sent: %', sqlerrm;
  end;
  return null;
end;
$$;
revoke execute on function public.scores_notify_correction() from public, anon, authenticated;

-- A value the card held, changed by the Comité (the only writer whose reason stays on the row).
create trigger scores_notify_correction after update of strokes, putts, picked_up on public.scores
  for each row when (new.reason is not null and btrim(new.reason) <> ''
    and (old.strokes, old.putts, old.picked_up) is distinct from (new.strokes, new.putts, new.picked_up))
  execute function public.scores_notify_correction();

-- ---------------------------------------------------------------------------
-- 2. A card's history
-- ---------------------------------------------------------------------------
/**
 * [{ roundId, round, hole, at, before, after, by, comite, reason }], by day, hole and time: each step of each
 * hole of the player's card on a day the tournament still has. `before` and `after` are {strokes, putts,
 * pickedUp} or null (no capture). `by` is the short name of the player who wrote it, or null; `comite` says the
 * Comité decided it (its reason, or a hole it deleted), and `reason` is the Comité's. A step that changes neither
 * the value nor the Comité's reason is left out.
 */
create or replace function public.card_history(p_tournament_id uuid, p_player_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
begin
  if p_tournament_id is null or not public.is_tournament_member(p_tournament_id) then
    raise exception 'Solo quien está en el torneo ve sus tarjetas' using errcode = '42501';
  end if;
  if p_player_id is null or public.player_tournament_id(p_player_id) is distinct from p_tournament_id then
    raise exception 'Ese jugador no es de este torneo' using errcode = '22023';
  end if;
  return coalesce((
    with mine as (
      select a.id, a.at, a.before, a.after, a.actor_player_id, coalesce(a.after, a.before) as rec
      from public.audit_log a
      where a.tournament_id = p_tournament_id and a.table_name = 'scores'
        and coalesce(a.after, a.before) ->> 'player_id' = p_player_id::text
    ),
    -- One transaction (its `at`, the moment it began) is one step of a hole: what it found, what it left, who.
    steps as (
      select public.try_uuid(m.rec ->> 'round_id') as round_id, (m.rec ->> 'hole')::int as hole, m.at,
             (array_agg(m.before order by m.id))[1] as was,
             (array_agg(m.after order by m.id desc))[1] as left_,
             (array_agg(m.actor_player_id order by m.id desc))[1] as actor
      from mine m
      group by 1, 2, 3
    )
    select jsonb_agg(jsonb_build_object(
        'roundId', s.round_id,
        'round', r.number,
        'hole', s.hole,
        'at', s.at,
        'before', case when s.was is null then null
                  else jsonb_build_object('strokes', s.was -> 'strokes', 'putts', s.was -> 'putts', 'pickedUp', s.was -> 'picked_up') end,
        'after', case when s.left_ is null then null
                 else jsonb_build_object('strokes', s.left_ -> 'strokes', 'putts', s.left_ -> 'putts', 'pickedUp', s.left_ -> 'picked_up') end,
        'by', p.display_name,
        'comite', s.left_ is null or (s.left_ ->> 'reason') is not null,
        'reason', s.left_ ->> 'reason'
      ) order by r.number, s.hole, s.at)
    from steps s
    join public.rounds r on r.id = s.round_id and r.tournament_id = p_tournament_id
    left join public.players p on p.id = s.actor and p.tournament_id = p_tournament_id
    where (s.was is null) <> (s.left_ is null)
       or (s.was is not null and s.left_ is not null and (
            (s.was -> 'strokes', s.was -> 'putts', s.was -> 'picked_up') is distinct from (s.left_ -> 'strokes', s.left_ -> 'putts', s.left_ -> 'picked_up')
            or ((s.left_ ->> 'reason') is not null and (s.left_ ->> 'reason') is distinct from (s.was ->> 'reason'))))
  ), '[]'::jsonb);
end;
$$;
comment on function public.card_history(uuid, uuid) is
  'TRUST-14: how each hole of a player''s card got to what it holds (each value, who, when, the Comité''s reason), for the tournament''s members.';
revoke execute on function public.card_history(uuid, uuid) from public, anon;
grant execute on function public.card_history(uuid, uuid) to authenticated;
