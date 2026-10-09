-- Polo · 0028 · the Comité's inbox of holes the server did not take (REL-08)
--
-- save_hole (0026) keeps every refusal and every conflict in rejected_writes,
-- with what the phone sent, and the Comité reads its tournament's. Nothing
-- could act on a row: an open one stayed open forever, and the Comité had to
-- retype the hole in Tarjetas by hand.
--
--   1. resolve_rejected_write(id, action, reason): the Comité applies a row
--      (the fields the phone set, over the hole as it is now, through
--      admin_save_score: its lock, its rules, the reason on the score and in
--      the audit log) or dismisses it, always with a reason. Either way the
--      row says who resolved it, when and why. Only an open row: a second
--      call is refused and writes nothing.
--   2. A resolution is audited, its reason as the audit's reason (audit_row
--      would put the refusal code there, the table's own `reason`).
--   3. Published to Realtime. The app does not listen to it yet: a channel
--      naming a table production has not published fails whole (REL-01), so
--      the bundle that listens ships after this migration is applied.
--
-- Expand only: the columns it writes (resolved_by, resolved_at,
-- resolution_note) came with the table in 0026, so old bundles see nothing
-- new. rejected_writes is not part of a tournament's backup (it is the
-- server's record of what it refused, not a fact of the tournament; the
-- nightly backup copies it with the rest of the database), so
-- restore_tournament is unchanged.

-- ---------------------------------------------------------------------------
-- 1. Apply or dismiss
-- ---------------------------------------------------------------------------
/**
 * `p_action`: 'apply' writes the payload's `fields` (strokes, putts,
 * picked_up: only those the phone set) for the row's own round, player and
 * hole, over the score that stands now, as save_hole would have (a number of
 * strokes is not a pick-up, a pick-up has no strokes). The payload's ids are
 * never read. 'dismiss' writes nothing to the scores. Answers
 *   { id, status: applied | dismissed }
 * Someone outside the Comité learns nothing, not even whether the row
 * exists (42501).
 */
create or replace function public.resolve_rejected_write(p_id uuid, p_action text, p_reason text)
returns jsonb
language plpgsql volatile security definer
set search_path = public
as $$
declare
  w public.rejected_writes;
  why text := btrim(coalesce(p_reason, ''));
  f jsonb;
  cur public.scores;
  st numeric;
  pt numeric;
  picked boolean;
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
    -- save_hole's lock on the hole (admin_save_score takes it again, which is the same lock), then the row as it is now.
    perform pg_advisory_xact_lock(hashtextextended('save_hole:' || w.round_id::text || ':' || w.hole::text, 0));
    select * into cur from public.scores s where s.round_id = w.round_id and s.player_id = w.player_id and s.hole = w.hole for update;
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
    -- The Comité's own correction: its checks (the tournament, a signed card's reason), the reason on the score, the audit.
    perform public.admin_save_score(w.round_id, w.player_id, w.hole, st::integer, pt::integer, picked, why);
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
revoke execute on function public.resolve_rejected_write(uuid, text, text) from public, anon;
grant execute on function public.resolve_rejected_write(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Audit: who resolved what, and why
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
-- 3. Realtime
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'rejected_writes') then
    alter publication supabase_realtime add table public.rejected_writes;
  end if;
end;
$$;
