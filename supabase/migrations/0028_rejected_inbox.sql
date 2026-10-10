-- Polo · 0028 · the Comité's inbox of holes the server did not take (REL-08)
--
-- save_hole (0026) keeps every refusal and every conflict in rejected_writes,
-- with what the phone sent, and the Comité reads its tournament's. Nothing
-- could act on a row: an open one stayed open forever, and the Comité had to
-- retype the hole in Tarjetas by hand.
--
--   1. rejected_inbox(tid): the rows that are the Comité's to decide. A
--      conflict is not: the phone that met it asks the player («Dejar el
--      suyo» or «Guardar el mío», in every state of its Tarjeta, a closed day
--      included), or sends its value again over an untouched default; a
--      conflict row stays open as the record of what happened and is never
--      listed. An entry the phone marked `auto` (the par and 2 putts the
--      Tarjeta fills in for a player nobody touched) is listed only when
--      nothing else covers that hole: no score for that player and hole, and
--      no typed refusal of it open beside it. Over a real score it is nobody's
--      capture. Everything else is a refusal of a value a person typed (round
--      not live, card signed, not in the group, invalid).
--   2. resolve_rejected_write(id, action, reason, expect): the Comité applies
--      one of those rows (the fields the phone set, over the hole as it is
--      now, as admin_save_score writes a correction: its lock, its rules, the
--      reason on the score and in the audit log) or dismisses it, always with
--      a reason. To apply, the Comité says what it saw on the card
--      (`expect`), and the check and the write are one statement, so a
--      preview never writes over a newer score, even one a writer that takes
--      no lock inserted meanwhile. A dismissal may say it too («ya
--      coinciden»), and is then refused the same way. Only an open row: a
--      second call is refused and writes nothing.
--   3. A resolution is audited, its reason as the audit's reason (audit_row
--      would put the refusal code there, the table's own `reason`).
--   4. Published to Realtime. The app does not listen to it yet: a channel
--      naming a table production has not published fails whole (REL-01), so
--      the bundle that listens ships after this migration is applied.
--
-- Deploy order: this migration reaches production before the bundle that
-- uses it. With the bundle and no 0028, rejected_inbox is missing and the
-- bundle says the list is not available and does not hold «Cerrar torneo» on
-- it; with 0028 and an older bundle nothing changes.
--
-- Expand only: the columns it writes (resolved_by, resolved_at,
-- resolution_note) came with the table in 0026, so old bundles see nothing
-- new, and no row is changed by the migration itself (production held no
-- rejected_writes row when this was written, 2026-10-09).
-- rejected_writes is not part of a tournament's backup (it is the server's
-- record of what it refused, not a fact of the tournament; the nightly backup
-- copies it with the rest of the database), so restore_tournament is
-- unchanged.

-- ---------------------------------------------------------------------------
-- 1. The rows the Comité decides
-- ---------------------------------------------------------------------------
/** A refusal (not a conflict) of a value a person typed (not `auto`). */
create or replace function public.rejected_write_for_comite(p_reason text, p_payload jsonb)
returns boolean
language sql immutable
set search_path = public
as $$
  select p_reason is distinct from 'conflict' and (p_payload -> 'auto') is distinct from 'true'::jsonb
$$;
revoke execute on function public.rejected_write_for_comite(text, jsonb) from public, anon;
grant execute on function public.rejected_write_for_comite(text, jsonb) to authenticated;

/**
 * An open row is the Comité's to decide: a refusal of a value a person
 * typed; or a refusal of an untouched default (`auto`) when nothing else
 * covers that hole: no score for that player and hole, and no typed refusal
 * of it open beside it. An untouched default refused on an empty hole is the
 * only value anyone sent for it (a phone saved the hole after the day
 * closed), so it is the Comité's too; over a real score it never is. A
 * conflict never: the phone that met it asks the player.
 */
create or replace function public.rejected_write_listed(w public.rejected_writes)
returns boolean
language sql stable
set search_path = public
as $$
  select w.status = 'open' and w.reason is distinct from 'conflict'
    and (public.rejected_write_for_comite(w.reason, w.payload)
      or (not exists (select 1 from public.scores s where s.round_id = w.round_id and s.player_id = w.player_id and s.hole = w.hole)
        and not exists (select 1 from public.rejected_writes o
          where o.id <> w.id and o.status = 'open' and o.round_id = w.round_id and o.player_id = w.player_id and o.hole = w.hole
            and public.rejected_write_for_comite(o.reason, o.payload))))
$$;
revoke execute on function public.rejected_write_listed(public.rejected_writes) from public, anon;
grant execute on function public.rejected_write_listed(public.rejected_writes) to authenticated;

/**
 * The tournament's open rows the Comité decides (`rejected_write_listed`),
 * oldest first. Each
 *   { id, round_id, hole, player_id, writer_player_id, reason, payload, created_at }
 * Anyone outside the Comité: 42501. Security invoker: the table's own policy
 * (the Comité reads its tournament's) still holds.
 */
create or replace function public.rejected_inbox(p_tournament_id uuid)
returns jsonb
language plpgsql stable
set search_path = public
as $$
begin
  if p_tournament_id is null or not public.is_tournament_organizer(p_tournament_id) then
    raise exception 'Solo el Comité ve los pendientes de revisar' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', w.id, 'round_id', w.round_id, 'hole', w.hole, 'player_id', w.player_id, 'writer_player_id', w.writer_player_id,
      'reason', w.reason, 'payload', w.payload, 'created_at', w.created_at) order by w.created_at, w.id)
    from public.rejected_writes w
    where w.tournament_id = p_tournament_id and w.status = 'open' and public.rejected_write_listed(w)
  ), '[]'::jsonb);
end;
$$;
revoke execute on function public.rejected_inbox(uuid) from public, anon;
grant execute on function public.rejected_inbox(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Apply or dismiss
-- ---------------------------------------------------------------------------
/**
 * `p_action`: 'apply' writes the payload's `fields` (strokes, putts,
 * picked_up: only those the phone set) for the row's own round, player and
 * hole, over the score that stands now, as save_hole would have (a number of
 * strokes is not a pick-up, a pick-up has no strokes). The payload's ids are
 * never read. `p_expect` is the hole as the Comité saw it ({strokes, putts,
 * picked_up}, `{}` for an empty hole; a key left out reads as no strokes, no
 * putts, not picked up): required to apply, and a hole that differs is
 * refused (22023), nothing written. Only a row rejected_inbox lists (never a
 * conflict, nor an untouched default over a score), and not into a
 * cancelled day. The check and the write are one statement: a writer that
 * takes no hole lock (an old build's direct insert) and lands meanwhile is
 * met by the write itself, which then changes nothing and is refused.
 * 'dismiss' writes nothing to the scores; with `p_expect` (the Comité's
 * «ya coinciden»), a hole that differs from it is refused the same way.
 * The reason is trimmed at both ends of whitespace and the no-break and
 * zero-width spaces, and counted in characters. Answers
 *   { id, status: applied | dismissed }
 * Someone outside the Comité learns nothing, not even whether the row
 * exists (42501).
 */
create or replace function public.resolve_rejected_write(p_id uuid, p_action text, p_reason text, p_expect jsonb default null)
returns jsonb
language plpgsql volatile security definer
set search_path = public
as $$
declare
  w public.rejected_writes;
  -- Spelled out, not `\s`: the same set whatever the server's locale, and the same as src/lib/reason.ts.
  why text := regexp_replace(coalesce(p_reason, ''),
    '^[\t\n\v\f\r \u0085  ᠎ -​    ⁠　﻿]+|[\t\n\v\f\r \u0085  ᠎ -​    ⁠　﻿]+$', '', 'g');
  f jsonb;
  cur public.scores;
  seen jsonb;
  now_on jsonb;
  st numeric;
  pt numeric;
  picked boolean;
  tid uuid;
  r text;
  n integer;
  done text;
begin
  -- Locked: two Comité phones resolving the same row at once, the second waits and is refused.
  select * into w from public.rejected_writes where id = p_id for update;
  if not found or not public.is_tournament_organizer(w.tournament_id) then
    raise exception 'Solo el Comité puede resolver una captura rechazada' using errcode = '42501';
  end if;
  if p_action is null or p_action not in ('apply', 'dismiss') then
    raise exception 'Una captura rechazada se aplica o se descarta' using errcode = '22023';
  end if;
  if w.status <> 'open' then
    raise exception 'Esa captura ya estaba resuelta' using errcode = '22023';
  end if;
  if char_length(why) < 3 then
    raise exception 'Escribe el motivo, al menos 3 letras' using errcode = '22023';
  end if;
  if char_length(why) > 200 then
    raise exception 'El motivo es muy largo: 200 letras como máximo' using errcode = '22023';
  end if;

  if p_action = 'apply' then
    -- A conflict is the phone's to settle: never written over the card from here.
    if w.reason = 'conflict' then
      raise exception 'Ese choque lo resolvió el teléfono que lo mandó; descártalo' using errcode = '22023';
    end if;
    if (select r0.status from public.rounds r0 where r0.id = w.round_id) = 'cancelled' then
      raise exception 'Ese día está cancelado: no se le aplica nada; descártala o reabre el día' using errcode = '22023';
    end if;
    f := w.payload -> 'fields';
    if jsonb_typeof(f) is distinct from 'object'
       or exists (select 1 from jsonb_object_keys(f) k where k not in ('strokes', 'putts', 'picked_up'))
       or not (f ?| array['strokes', 'putts', 'picked_up']) then
      raise exception 'Esa captura no trae golpes ni putts que aplicar; descártala' using errcode = '22023';
    end if;
    if (f ? 'strokes' and jsonb_typeof(f -> 'strokes') not in ('number', 'null'))
       or (f ? 'putts' and jsonb_typeof(f -> 'putts') not in ('number', 'null'))
       or (f ? 'picked_up' and jsonb_typeof(f -> 'picked_up') <> 'boolean') then
      raise exception 'Los valores de esa captura no se entienden; descártala' using errcode = '22023';
    end if;
  end if;

  if p_action = 'apply' or p_expect is not null then
    if jsonb_typeof(p_expect) is distinct from 'object' then
      raise exception 'Falta lo que viste en la tarjeta; vuelve a abrir la lista' using errcode = '22023';
    end if;
    -- save_hole's lock on the hole (admin_save_score and resolve_score_dispute take it too), then the row as it is
    -- now: a phone's save of this hole waits for this, or this for it, and a writer that takes no lock (an old
    -- build's direct update) is waited for on the row.
    perform pg_advisory_xact_lock(hashtextextended('save_hole:' || w.round_id::text || ':' || w.hole::text, 0));
    select * into cur from public.scores s where s.round_id = w.round_id and s.player_id = w.player_id and s.hole = w.hole for update;
    -- An untouched default over a score that stands, or beside a typed capture of the same hole: not the Comité's.
    if p_action = 'apply' and not public.rejected_write_listed(w) then
      raise exception 'Nadie capturó ese valor: era el que la Tarjeta pone sola; descártalo' using errcode = '22023';
    end if;
    -- What the Comité saw, and what stands, read the same way (a key left out, or no row: no strokes, no putts, not picked up).
    seen := jsonb_build_object(
      'strokes', coalesce(nullif(p_expect -> 'strokes', 'null'::jsonb), 'null'::jsonb),
      'putts', coalesce(nullif(p_expect -> 'putts', 'null'::jsonb), 'null'::jsonb),
      'picked_up', coalesce(nullif(p_expect -> 'picked_up', 'null'::jsonb), 'false'::jsonb));
    now_on := jsonb_build_object(
      'strokes', coalesce(to_jsonb(cur.strokes), 'null'::jsonb),
      'putts', coalesce(to_jsonb(cur.putts), 'null'::jsonb),
      'picked_up', coalesce(to_jsonb(cur.picked_up), 'false'::jsonb));
    if seen is distinct from now_on then
      raise exception 'El hoyo cambió mientras lo revisabas; vuelve a mirarlo' using errcode = '22023';
    end if;
  end if;

  if p_action = 'apply' then
    st := case when f ? 'strokes' then (case when jsonb_typeof(f -> 'strokes') = 'number' then (f ->> 'strokes')::numeric end) else cur.strokes end;
    pt := case when f ? 'putts' then (case when jsonb_typeof(f -> 'putts') = 'number' then (f ->> 'putts')::numeric end) else cur.putts end;
    picked := case
      when f ? 'picked_up' then (f ->> 'picked_up')::boolean
      when jsonb_typeof(f -> 'strokes') = 'number' then false
      else coalesce(cur.picked_up, false)
    end;
    if picked then
      st := null;
    end if;
    if not picked and (st is null or st <> trunc(st) or st < 1 or st > 15) then
      raise exception 'Con esa captura el hoyo no queda con golpes de 1 a 15; descártala o corrige el hoyo en Tarjetas' using errcode = '22023';
    end if;
    if pt is not null and (pt <> trunc(pt) or pt < 0 or pt > 15 or (st is not null and pt > st)) then
      raise exception 'Con esa captura los putts quedan fuera de rango; descártala o corrige el hoyo en Tarjetas' using errcode = '22023';
    end if;
    -- The Comité's own correction, as admin_save_score (0026) makes it: its checks (the tournament, a signed card's
    -- reason), the Comité's switch, its row (the Comité's player as the writer, the reason on the score, no
    -- discrepancy), its audit and results triggers. In one statement with the check: a row that landed since the
    -- read above without the hole's lock (a direct insert, which the read could not lock) is met by the upsert,
    -- which then changes nothing unless it still is what the Comité saw.
    tid := public.round_tournament_id(w.round_id);
    if tid is distinct from w.tournament_id or public.player_tournament_id(w.player_id) is distinct from tid then
      raise exception 'Ese jugador no es de este torneo' using errcode = '22023';
    end if;
    r := nullif(btrim(why), '');
    if public.card_is_signed(w.round_id, w.player_id) and (r is null or length(r) < 3) then
      raise exception 'La tarjeta está firmada: la corrección necesita razón' using errcode = '22023';
    end if;
    perform set_config('cardi.comite', '1', true);
    insert into public.scores as s (round_id, player_id, hole, strokes, putts, picked_up, entered_by, client_ts, reason, disputed, previous)
    values (w.round_id, w.player_id, w.hole, case when picked then null else st::integer end, pt::integer, picked, public.my_player_id(tid), now(), coalesce(r, 'Corrección del Comité'), false, null)
    on conflict (round_id, player_id, hole) do update
      set strokes = excluded.strokes, putts = excluded.putts, picked_up = excluded.picked_up, entered_by = excluded.entered_by,
          client_ts = excluded.client_ts, reason = excluded.reason, disputed = false, previous = null
      where jsonb_build_object(
        'strokes', coalesce(to_jsonb(s.strokes), 'null'::jsonb),
        'putts', coalesce(to_jsonb(s.putts), 'null'::jsonb),
        'picked_up', coalesce(to_jsonb(s.picked_up), 'false'::jsonb)) is not distinct from seen;
    get diagnostics n = row_count;
    if n = 0 then
      raise exception 'El hoyo cambió mientras lo revisabas; vuelve a mirarlo' using errcode = '22023';
    end if;
    done := 'applied';
  else
    done := 'dismissed';
  end if;

  update public.rejected_writes
  set status = done, resolved_by = auth.uid(), resolved_at = now(), resolution_note = why
  where id = w.id;
  return jsonb_build_object('id', w.id, 'status', done);
end;
$$;
revoke execute on function public.resolve_rejected_write(uuid, text, text, jsonb) from public, anon;
grant execute on function public.resolve_rejected_write(uuid, text, text, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Audit: who resolved what, and why
-- ---------------------------------------------------------------------------
-- As audit_row (0021) writes a row, with the resolution's reason. Only
-- changes are audited: save_hole's inserts are the record themselves.
create or replace function public.rejected_writes_audit()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.audit_log (tournament_id, table_name, row_id, actor_auth_user_id, actor_player_id, action, before, after, reason, actor_platform)
  values (
    new.tournament_id, tg_table_name, new.id::text, auth.uid(), public.my_player_id(new.tournament_id), tg_op,
    to_jsonb(old), to_jsonb(new), new.resolution_note,
    auth.uid() is not null and public.is_platform_admin() and not public.is_tournament_participant(new.tournament_id)
  );
  return new;
end;
$$;
revoke execute on function public.rejected_writes_audit() from public, anon, authenticated;
drop trigger if exists rejected_writes_audit on public.rejected_writes;
create trigger rejected_writes_audit after update on public.rejected_writes
  for each row execute function public.rejected_writes_audit();

-- ---------------------------------------------------------------------------
-- 4. Realtime
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'rejected_writes') then
    alter publication supabase_realtime add table public.rejected_writes;
  end if;
end;
$$;
