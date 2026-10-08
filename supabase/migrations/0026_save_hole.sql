-- Polo · 0026 · a hole saved in one call, against what the phone saw (REL-05)
--
-- Until now a phone wrote each player's score with its own upsert, last write
-- wins: two phones on one card overwrote each other's holes without knowing
-- (REL-05), the row said whoever the client claimed had entered it (SEC-02),
-- an admin player's queued holes rewrote a finished round (REL-09), and a
-- refusal left nothing on the server for the Comité to see (REL-08).
--
-- This is the expand step: old bundles keep writing directly, and still may.
--   1. Every score carries a version, bumped on every change, and the device
--      and mutation that last wrote it.
--   2. A direct write from the app records the session's own player as the
--      one who entered it, whatever the body says (SEC-02).
--   3. Direct writes, the Comité's included, only while the round is live and
--      the card unsigned (REL-09); a correction after that goes through
--      admin_save_score with a reason, as the Comité's screens already do.
--   4. save_hole(p): a group's hole in one statement. Each player's entry
--      names the fields the phone set and the values it saw them hold; a
--      field someone else changed meanwhile is not overwritten: the answer
--      says `conflict`, with the server's row, for the phone to ask. A
--      mutation sent twice answers what it answered the first time. A
--      refusal (round not live, card signed, not in the group, invalid) and
--      a conflict are kept in rejected_writes for the Comité (REL-08).
--   5. Signing a card settles its discrepancies (NEW-01): the trigger that
--      keeps the flags for anyone but the Comité kept them for the signature.
-- The contract step (revoking direct writes) waits for every phone to run a
-- build that saves through save_hole (PLAN §5.1).

-- ---------------------------------------------------------------------------
-- 1. Versions, devices, mutations
-- ---------------------------------------------------------------------------
alter table public.scores
  add column if not exists version bigint not null default 1,
  add column if not exists device_id uuid,
  add column if not exists mutation_id uuid;

create or replace function public.scores_version()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.version := old.version + 1;
  return new;
end;
$$;
drop trigger if exists scores_version on public.scores;
create trigger scores_version before update on public.scores
  for each row execute function public.scores_version();

-- ---------------------------------------------------------------------------
-- 2. The writer is the session's player (SEC-02)
-- ---------------------------------------------------------------------------
-- Only for the app's own writes, as role authenticated: a function that runs
-- as its owner (save_hole, admin_save_score, the restore) says who wrote the
-- row itself. Not security definer, so current_user is the writer's role. It
-- runs before the dispute check (row triggers fire by name), which compares
-- this writer with the one before. The device and mutation are save_hole's:
-- a direct write names neither, so the row never keeps those of a save it
-- replaced. Who the account was is in the audit log (actor_auth_user_id, by
-- audit_row, with the row as written), not on the row: every member reads
-- the scores, over Realtime too, and an account id is not theirs to see.
create or replace function public.scores_writer()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('authenticated', 'anon') then
    new.entered_by := public.my_player_id(public.round_tournament_id(new.round_id));
    new.device_id := null;
    new.mutation_id := null;
  end if;
  return new;
end;
$$;
drop trigger if exists scores_00_writer on public.scores;
create trigger scores_00_writer before insert or update on public.scores
  for each row execute function public.scores_writer();

-- ---------------------------------------------------------------------------
-- 3. Direct writes: live round, unsigned card, for everyone (REL-09)
-- ---------------------------------------------------------------------------
-- An admin player's Tarjeta writes a finished round or a signed card through
-- admin_save_score (ScorecardScreen), as Comité › Tarjetas does.
-- Not security definer: it only puts together the definer helpers the
-- policies already use.
create or replace function public.score_writable(rid uuid, pid uuid)
returns boolean
language sql stable
set search_path = public
as $$
  select public.round_is_live(rid)
    and not public.card_is_signed(rid, pid)
    and (public.shares_group(rid, pid) or public.is_tournament_organizer(public.round_tournament_id(rid)))
$$;
revoke execute on function public.score_writable(uuid, uuid) from public, anon;
grant execute on function public.score_writable(uuid, uuid) to authenticated;

drop policy if exists scores_write on public.scores;
create policy scores_insert on public.scores for insert to authenticated
  with check (public.score_writable(round_id, player_id));
create policy scores_update on public.scores for update to authenticated
  using (public.score_writable(round_id, player_id))
  with check (public.score_writable(round_id, player_id));
-- Deleting a hole is the Comité's: no phone deletes one (the app never has;
-- the simulator resets with the service key).
create policy scores_delete on public.scores for delete to authenticated
  using (public.is_tournament_organizer(public.round_tournament_id(round_id)));

-- ---------------------------------------------------------------------------
-- 4. save_hole
-- ---------------------------------------------------------------------------
-- What a mutation answered, so a retry gets the same answer and writes
-- nothing again. Only save_hole reads and writes it. The account, round and
-- hole it was for: the same id from another account, or for another hole,
-- is refused, never answered with this one's rows.
create table if not exists public.score_mutations (
  mutation_id uuid primary key,
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  round_id uuid not null,
  hole integer not null,
  auth_user_id uuid not null,
  result jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists score_mutations_tournament_idx on public.score_mutations (tournament_id);
alter table public.score_mutations enable row level security;
-- Nobody reads it through the API, and the policy says so in so many words.
drop policy if exists score_mutations_none on public.score_mutations;
create policy score_mutations_none on public.score_mutations for select to authenticated using (false);
revoke all on public.score_mutations from public, anon, authenticated;

-- What the server did not take, for the Comité (REL-08): a refusal or a
-- conflict, with what the phone sent. Its writer sees his own.
create table if not exists public.rejected_writes (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  round_id uuid not null references public.rounds (id) on delete cascade,
  hole integer not null check (hole between 1 and 18),
  player_id uuid references public.players (id) on delete cascade,
  writer_player_id uuid references public.players (id) on delete set null,
  auth_user_id uuid,
  device_id uuid,
  mutation_id uuid,
  payload jsonb not null,
  reason text not null check (reason in ('round_not_live', 'card_signed', 'not_in_group', 'invalid', 'conflict')),
  status text not null default 'open' check (status in ('open', 'applied', 'dismissed')),
  resolved_by uuid,
  resolved_at timestamptz,
  resolution_note text,
  created_at timestamptz not null default now()
);
create index if not exists rejected_writes_tournament_idx on public.rejected_writes (tournament_id, status);
create index if not exists rejected_writes_round_idx on public.rejected_writes (round_id, hole);
create index if not exists rejected_writes_player_idx on public.rejected_writes (player_id);
create index if not exists rejected_writes_writer_idx on public.rejected_writes (writer_player_id);
alter table public.rejected_writes enable row level security;
drop policy if exists rejected_writes_read on public.rejected_writes;
create policy rejected_writes_read on public.rejected_writes for select to authenticated
  using (public.is_tournament_organizer(tournament_id) or auth_user_id = (select auth.uid()));
revoke all on public.rejected_writes from public, anon, authenticated;
grant select on public.rejected_writes to authenticated;

/**
 * A group's hole, from the phone that saw it (PLAN §5.1). `p`:
 *   { round_id, hole, mutation_id, device_id?,
 *     entries: [{ player_id, fields: {strokes?, putts?, picked_up?}, base?: {…} }] }
 * At most 8 entries and 16 KB: more is no hole of a group (22023).
 * `fields` holds only what the phone set; `base` the row it saw: send the
 * whole row (strokes, putts, picked_up), `{}` or JSON null when it saw none.
 * A pick-up writes the strokes too (none), and a number of strokes the
 * pick-up (false) unless `fields` says otherwise: both are checked against
 * `base` like the fields sent, a key missing from it read as no strokes, no
 * putts, not picked up (so a base naming only the fields sent can ask about
 * a pick-up it did see). An entry with no `base` key at all is written
 * blind, as a direct write is: a client must never drop the key by
 * serializing `base: undefined`. Answers
 *   { status: ok | partial | conflict | rejected | not_member,
 *     rows: [the rows as stored], conflicts: [{player_id, fields, server}],
 *     rejected: [{player_id, reason}], unchanged: [player_id] }
 * and, for a mutation already answered, that answer with replayed: true;
 * the same mutation from another account, or for another hole, is refused
 * (22023).
 */
create or replace function public.save_hole(p jsonb)
returns jsonb
language plpgsql volatile security definer
set search_path = public
as $$
declare
  rid uuid;
  h integer;
  mid uuid;
  dev uuid;
  tid uuid;
  me uuid;
  prior public.score_mutations;
  e jsonb;
  pid uuid;
  dup boolean;
  fields jsonb;
  base jsonb;
  cur jsonb;
  nxt jsonb;
  k text;
  cv jsonb;
  bv jsonb;
  clash text[];
  st numeric;
  pt numeric;
  writes jsonb := '[]';
  rows_out jsonb := '[]';
  conflicts jsonb := '[]';
  rejected jsonb := '[]';
  unchanged jsonb := '[]';
  reason text;
  status text;
  result jsonb;
begin
  -- A group is 2 to 4 players and a hole three numbers each: a call far past
  -- that is no phone's hole, and is not read entry by entry.
  if octet_length(p::text) > 16384 then
    raise exception 'El hoyo que llegó trae demasiados datos; vuelve a guardarlo' using errcode = '22023';
  end if;
  begin
    rid := (p ->> 'round_id')::uuid;
    h := (p ->> 'hole')::integer;
    mid := (p ->> 'mutation_id')::uuid;
    dev := nullif(p ->> 'device_id', '')::uuid;
  exception when others then
    raise exception 'El hoyo que llegó no se entiende; vuelve a guardarlo' using errcode = '22023';
  end;
  if rid is null or h is null or mid is null or jsonb_typeof(p -> 'entries') is distinct from 'array' then
    raise exception 'Al hoyo que llegó le faltan datos; vuelve a guardarlo' using errcode = '22023';
  end if;
  if jsonb_array_length(p -> 'entries') > 8 then
    raise exception 'Un hoyo se guarda con 8 jugadores a lo más' using errcode = '22023';
  end if;
  if h < 1 or h > 18 then
    raise exception 'Ese hoyo no existe: van del 1 al 18' using errcode = '22023';
  end if;
  tid := public.round_tournament_id(rid);
  me := case when tid is null then null else public.my_player_id(tid) end;
  if me is null then
    return jsonb_build_object('status', 'not_member');
  end if;

  -- The same mutation twice (a retry while the first was still out) waits for
  -- the first, then answers what it answered: to the same account, for the
  -- same hole only.
  perform pg_advisory_xact_lock(hashtextextended('save_hole:' || mid::text, 0));
  select m.* into prior from public.score_mutations m where m.mutation_id = mid;
  if found then
    if prior.auth_user_id is distinct from auth.uid() or prior.tournament_id is distinct from tid
       or prior.round_id is distinct from rid or prior.hole is distinct from h then
      raise exception 'Ese guardado ya llegó antes con otros datos; vuelve a guardarlo' using errcode = '22023';
    end if;
    return prior.result || jsonb_build_object('replayed', true);
  end if;
  -- One save of this hole at a time: two phones that both saw it empty would
  -- otherwise both write it, since a row lock can't hold a row not there yet.
  -- admin_save_score and resolve_score_dispute take the same lock.
  perform pg_advisory_xact_lock(hashtextextended('save_hole:' || rid::text || ':' || h::text, 0));
  -- The rows there are, locked at once and in one order, so another writer
  -- of the same rows in that order waits instead of deadlocking.
  perform 1 from public.scores s
  where s.round_id = rid and s.hole = h
    and s.player_id in (select public.try_uuid(x ->> 'player_id') from jsonb_array_elements(p -> 'entries') x)
  order by s.player_id
  for update;

  -- Each entry with its player, and whether an earlier entry named him.
  for e, pid, dup in
    select x.value, x.pid, x.n > 1
    from (
      select t.value, t.ord, public.try_uuid(t.value ->> 'player_id') as pid,
             row_number() over (partition by public.try_uuid(t.value ->> 'player_id') order by t.ord) as n
      from jsonb_array_elements(p -> 'entries') with ordinality as t(value, ord)
    ) x
    order by x.ord
  loop
    fields := coalesce(e -> 'fields', '{}');
    base := e -> 'base';
    if base = 'null'::jsonb then
      base := '{}';
    end if;
    reason := null;
    cur := null;
    clash := '{}';
    if pid is null or dup or public.player_tournament_id(pid) is distinct from tid
       or jsonb_typeof(fields) <> 'object' or (base is not null and jsonb_typeof(base) <> 'object')
       or exists (select 1 from jsonb_object_keys(fields) f where f not in ('strokes', 'putts', 'picked_up')) then
      reason := 'invalid';
    elsif not public.round_is_live(rid) then
      reason := 'round_not_live';
    elsif not public.shares_group(rid, pid) then
      reason := 'not_in_group';
    elsif public.card_is_signed(rid, pid) then
      reason := 'card_signed';
    end if;

    if reason is null then
      -- A number of strokes is a hole played: not picked up, unless the phone says so.
      if jsonb_typeof(fields -> 'strokes') = 'number' and not fields ? 'picked_up' then
        fields := fields || '{"picked_up": false}'::jsonb;
      end if;
      select to_jsonb(s) into cur from public.scores s where s.round_id = rid and s.player_id = pid and s.hole = h for update;
      -- The row it would be: what is there, with the fields the phone set.
      nxt := jsonb_build_object(
        'strokes', coalesce(case when fields ? 'strokes' then fields -> 'strokes' else cur -> 'strokes' end, 'null'::jsonb),
        'putts', coalesce(case when fields ? 'putts' then fields -> 'putts' else cur -> 'putts' end, 'null'::jsonb),
        'picked_up', coalesce(case when fields ? 'picked_up' then fields -> 'picked_up' else cur -> 'picked_up' end, 'false'::jsonb));
      -- Picking up clears the strokes.
      if nxt -> 'picked_up' = 'true'::jsonb then
        nxt := nxt || jsonb_build_object('strokes', null);
      end if;
      -- A score of whole numbers in range, putts no more than strokes.
      st := case when jsonb_typeof(nxt -> 'strokes') = 'number' then (nxt ->> 'strokes')::numeric end;
      pt := case when jsonb_typeof(nxt -> 'putts') = 'number' then (nxt ->> 'putts')::numeric end;
      if jsonb_typeof(nxt -> 'picked_up') <> 'boolean'
         or jsonb_typeof(nxt -> 'strokes') not in ('number', 'null') or jsonb_typeof(nxt -> 'putts') not in ('number', 'null')
         or (st is not null and (st <> trunc(st) or st < 1 or st > 15))
         or (pt is not null and (pt <> trunc(pt) or pt < 0 or pt > 15 or (st is not null and pt > st)))
         or (nxt -> 'picked_up' = 'false'::jsonb and st is null) then
        reason := 'invalid';
      else
        -- As the table holds them (4.0 is 4).
        nxt := jsonb_build_object('strokes', st::integer, 'putts', pt::integer, 'picked_up', nxt -> 'picked_up');
      end if;
    end if;

    if reason is null and base is not null then
      -- A field it writes that someone else changed since the phone saw it, to
      -- another value than this one, is not this phone's to overwrite. A
      -- pick-up writes the strokes too.
      for k in select jsonb_object_keys(fields) union select 'strokes' where nxt -> 'picked_up' = 'true'::jsonb loop
        cv := coalesce(nullif(cur -> k, 'null'::jsonb), case when k = 'picked_up' then 'false' else 'null' end::jsonb);
        bv := coalesce(nullif(base -> k, 'null'::jsonb), case when k = 'picked_up' then 'false' else 'null' end::jsonb);
        if cv is distinct from bv and cv is distinct from (nxt -> k) then
          clash := clash || k;
        end if;
      end loop;
    end if;

    -- Kept for the Comité: once per player per mutation (his first entry; a repeat is only refused).
    if reason is not null then
      rejected := rejected || jsonb_build_array(jsonb_build_object('player_id', pid, 'reason', reason));
      if pid is not null and not dup and public.player_tournament_id(pid) = tid then
        insert into public.rejected_writes (tournament_id, round_id, hole, player_id, writer_player_id, auth_user_id, device_id, mutation_id, payload, reason)
        values (tid, rid, h, pid, me, auth.uid(), dev, mid, e, reason);
      end if;
    elsif cardinality(clash) > 0 then
      conflicts := conflicts || jsonb_build_array(jsonb_build_object('player_id', pid, 'fields', to_jsonb(clash), 'server', cur));
      insert into public.rejected_writes (tournament_id, round_id, hole, player_id, writer_player_id, auth_user_id, device_id, mutation_id, payload, reason)
      values (tid, rid, h, pid, me, auth.uid(), dev, mid, e || jsonb_build_object('server', cur), 'conflict');
    elsif cur is not null and cur -> 'strokes' = nxt -> 'strokes' and cur -> 'putts' = nxt -> 'putts' and cur -> 'picked_up' = nxt -> 'picked_up' then
      unchanged := unchanged || to_jsonb(pid);
      rows_out := rows_out || jsonb_build_array(cur);
    else
      writes := writes || jsonb_build_array(nxt || jsonb_build_object('player_id', pid));
    end if;
  end loop;

  -- One statement for the hole: the results triggers run once (DB-14).
  if jsonb_array_length(writes) > 0 then
    with v as (
      select * from jsonb_to_recordset(writes) as x(player_id uuid, strokes integer, putts integer, picked_up boolean)
    ), saved as (
      insert into public.scores as s (round_id, player_id, hole, strokes, putts, picked_up, entered_by, client_ts, device_id, mutation_id)
      select rid, v.player_id, h, v.strokes, v.putts, v.picked_up, me, now(), dev, mid from v
      on conflict (round_id, player_id, hole) do update
        set strokes = excluded.strokes, putts = excluded.putts, picked_up = excluded.picked_up, entered_by = excluded.entered_by,
            client_ts = excluded.client_ts, device_id = excluded.device_id, mutation_id = excluded.mutation_id
      returning s.*
    )
    select rows_out || coalesce(jsonb_agg(to_jsonb(saved)), '[]') into rows_out from saved;
  end if;

  status := case
    when jsonb_array_length(rejected) = 0 and jsonb_array_length(conflicts) = 0 then 'ok'
    when jsonb_array_length(writes) > 0 or jsonb_array_length(unchanged) > 0 then 'partial'
    when jsonb_array_length(conflicts) > 0 then 'conflict'
    else 'rejected'
  end;
  result := jsonb_build_object('status', status, 'rows', rows_out, 'conflicts', conflicts, 'rejected', rejected, 'unchanged', unchanged);
  insert into public.score_mutations (mutation_id, tournament_id, round_id, hole, auth_user_id, result) values (mid, tid, rid, h, auth.uid(), result);
  return result;
end;
$$;
revoke execute on function public.save_hole(jsonb) from public, anon;
grant execute on function public.save_hole(jsonb) to authenticated;

-- The Comité's two writes of a hole take save_hole's lock on it, so a phone
-- that saw the hole before a correction is asked, not let through: as in
-- 0013, with the lock.
create or replace function public.admin_save_score(p_round_id uuid, p_player_id uuid, p_hole integer, p_strokes integer, p_putts integer, p_picked_up boolean, p_reason text default null)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  tid uuid;
  r text;
begin
  tid := public.round_tournament_id(p_round_id);
  if tid is null or not public.is_tournament_organizer(tid) then
    raise exception 'Solo el Comité puede corregir tarjetas' using errcode = '42501';
  end if;
  if public.player_tournament_id(p_player_id) is distinct from tid then
    raise exception 'Ese jugador no es de este torneo' using errcode = '22023';
  end if;
  r := nullif(btrim(coalesce(p_reason, '')), '');
  if public.card_is_signed(p_round_id, p_player_id) and (r is null or length(r) < 3) then
    raise exception 'La tarjeta está firmada: la corrección necesita razón' using errcode = '22023';
  end if;
  if not p_picked_up and (p_strokes is null or p_strokes < 1 or p_strokes > 15) then
    raise exception 'Los golpes van de 1 a 15' using errcode = '22023';
  end if;
  if p_putts is not null and (p_putts < 0 or p_putts > 15 or (not p_picked_up and p_putts > p_strokes)) then
    raise exception 'Los putts no pueden ser más que los golpes' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('save_hole:' || p_round_id::text || ':' || p_hole::text, 0));
  perform set_config('cardi.comite', '1', true);
  insert into public.scores (round_id, player_id, hole, strokes, putts, picked_up, entered_by, client_ts, reason, disputed, previous)
  values (p_round_id, p_player_id, p_hole, case when p_picked_up then null else p_strokes end, p_putts, p_picked_up, public.my_player_id(tid), now(), coalesce(r, 'Corrección del Comité'), false, null)
  on conflict (round_id, player_id, hole) do update
    set strokes = excluded.strokes, putts = excluded.putts, picked_up = excluded.picked_up, entered_by = excluded.entered_by,
        client_ts = excluded.client_ts, reason = excluded.reason, disputed = false, previous = null;
end;
$$;

create or replace function public.resolve_score_dispute(p_round_id uuid, p_player_id uuid, p_hole integer, p_keep boolean default true)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  tid uuid;
  s public.scores;
begin
  tid := public.round_tournament_id(p_round_id);
  if tid is null or not public.is_tournament_organizer(tid) then
    raise exception 'Solo el Comité puede resolver discrepancias' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('save_hole:' || p_round_id::text || ':' || p_hole::text, 0));
  select * into s from public.scores where round_id = p_round_id and player_id = p_player_id and hole = p_hole for update;
  if s.id is null then
    raise exception 'Ese hoyo no tiene captura' using errcode = '22023';
  end if;
  perform set_config('cardi.comite', '1', true);
  if p_keep or s.previous is null then
    update public.scores set disputed = false, previous = null, reason = 'Discrepancia: se conserva el valor actual' where id = s.id;
  else
    update public.scores
    set strokes = (s.previous ->> 'strokes')::int, putts = (s.previous ->> 'putts')::int, picked_up = coalesce((s.previous ->> 'picked_up')::boolean, false),
        entered_by = public.my_player_id(tid), client_ts = now(), disputed = false, previous = null,
        reason = 'Discrepancia: se restaura el valor anterior'
    where id = s.id;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Signing a card settles its discrepancies (NEW-01)
-- ---------------------------------------------------------------------------
-- scores_detect_dispute keeps the flags for anyone but the Comité (0010), and
-- the signature's own update was no exception: it speaks as the Comité, for
-- that update only.
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
  perform set_config('cardi.comite', was, true);
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. A phone's snake answer and contest winners: live rounds only (REL-08)
-- ---------------------------------------------------------------------------
-- An answer queued offline was still taken after «Terminar ronda», while the
-- same hole's scores were refused. The Comité's own decisions (Comité ›
-- Juegos, Tarjetas) keep writing after the round, as before.
drop policy if exists snake_tiebreaks_write on public.snake_tiebreaks;
create policy snake_tiebreaks_write on public.snake_tiebreaks for all
  using (
    public.is_tournament_organizer(public.round_tournament_id(round_id))
    or (
      public.round_is_live(round_id)
      and exists (
        select 1 from public.group_members m
        where m.group_id = snake_tiebreaks.group_id and m.player_id = public.my_player_id(public.round_tournament_id(snake_tiebreaks.round_id))
      )
    )
  )
  with check (
    public.is_tournament_organizer(public.round_tournament_id(round_id))
    or (
      public.round_is_live(round_id)
      and exists (select 1 from public.groups g where g.id = snake_tiebreaks.group_id and g.round_id = snake_tiebreaks.round_id)
      and exists (
        select 1 from public.group_members m
        where m.group_id = snake_tiebreaks.group_id and m.player_id = public.my_player_id(public.round_tournament_id(snake_tiebreaks.round_id))
      )
      and exists (select 1 from public.group_members m where m.group_id = snake_tiebreaks.group_id and m.player_id = snake_tiebreaks.last_holed_player_id)
      and decided_by = public.my_player_id(public.round_tournament_id(round_id))
    )
  );

drop policy if exists hole_awards_write on public.hole_awards;
create policy hole_awards_write on public.hole_awards for all
  using (
    public.is_tournament_organizer(public.round_tournament_id(round_id))
    or (
      public.round_is_live(round_id)
      and exists (
        select 1 from public.group_members m
        where m.group_id = hole_awards.group_id and m.player_id = public.my_player_id(public.round_tournament_id(hole_awards.round_id))
      )
    )
  )
  with check (
    (public.is_tournament_organizer(public.round_tournament_id(round_id)) and public.player_tournament_id(player_id) = public.round_tournament_id(round_id))
    or (
      public.round_is_live(round_id)
      and exists (select 1 from public.groups g where g.id = hole_awards.group_id and g.round_id = hole_awards.round_id)
      and exists (
        select 1 from public.group_members m
        where m.group_id = hole_awards.group_id and m.player_id = public.my_player_id(public.round_tournament_id(hole_awards.round_id))
      )
      and exists (select 1 from public.group_members m where m.group_id = hole_awards.group_id and m.player_id = hole_awards.player_id)
      and decided_by = public.my_player_id(public.round_tournament_id(round_id))
    )
  );
