-- 0064: the history keeps what it still missed (DB-13).
--
-- The 2026-09-30 review found the audit trail blind to cascaded deletes, team draws, PIN claims and resets, and
-- published money. Since then 0030 logs a cascade under its tournament, 0025 audits the team draw (teams,
-- team_members), 0050 every PIN claim and its end, and 0053 the link to watch. What was left:
--   1. A PIN set or changed by the Comité (set_player_pin, or any other writer of player_pins) left no line, so
--      a reset followed by a new phone taking the player read in Historial as that phone simply «entering». Now
--      each new PIN is a line on player_pins (INSERT for a player's first, UPDATE for a new one), never the hash:
--      its images carry the player and the word that a PIN was set. A wrong PIN's count and a lock are not PIN
--      changes and stay out (claim_player writes them on every attempt, a stranger's included); the Comité's
--      «Desbloquear» keeps 0056's own line.
--   2. Publishing the results, and their withdrawal when the tournament leaves Terminado, left no line, though they
--      put every player's place and net on their profiles. Now each is one line on tournament_results, by its
--      counts (players placed, nets published), never one per player: INSERT the first time, UPDATE a republish,
--      DELETE a withdrawal.
--   3. photos and course_documents had no audit trigger; they get audit_row like every other table people write.
-- One internal helper writes a line the way audit_row does (the actor, his player in the tournament, the Admin
-- de Polo mark), so the new lines read in Historial like the rest.

create or replace function public.audit_event(p_tid uuid, p_table text, p_row text, p_action text, p_before jsonb, p_after jsonb, p_reason text default null)
returns void
language plpgsql volatile security definer
set search_path = public
as $$
begin
  insert into public.audit_log (tournament_id, table_name, row_id, actor_auth_user_id, actor_player_id, action, before, after, reason, actor_platform)
  values (
    p_tid, p_table, p_row, auth.uid(), case when p_tid is not null then public.my_player_id(p_tid) end, p_action, p_before, p_after, p_reason,
    auth.uid() is not null and public.is_platform_admin() and (p_tid is null or not public.is_tournament_participant(p_tid))
  );
end;
$$;
comment on function public.audit_event(uuid, text, text, text, jsonb, jsonb, text) is
  'Internal: one audit line written the way audit_row writes a row''s (DB-13), for changes whose row must not be imaged (a PIN) or is many rows (published results).';
revoke execute on function public.audit_event(uuid, text, text, text, jsonb, jsonb, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 1. A new PIN, never its hash
-- ---------------------------------------------------------------------------
create or replace function public.player_pins_audit()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  tid uuid;
begin
  if tg_op = 'UPDATE' and new.pin_hash is not distinct from old.pin_hash then
    return null;
  end if;
  select tournament_id into tid from public.players where id = new.player_id;
  perform public.audit_event(tid, 'player_pins', new.player_id::text, tg_op,
    case when tg_op = 'UPDATE' then jsonb_build_object('player_id', new.player_id, 'pin', 'old') end,
    jsonb_build_object('player_id', new.player_id, 'pin', 'new'));
  return null;
end;
$$;
revoke execute on function public.player_pins_audit() from public, anon, authenticated;
create trigger player_pins_audit after insert or update of pin_hash on public.player_pins
  for each row execute function public.player_pins_audit();

-- ---------------------------------------------------------------------------
-- 2. Results published and withdrawn: one line each, by its counts
-- ---------------------------------------------------------------------------
-- 0029's body, with the line: what was published before (if anything) and what is now.
create or replace function public.publish_tournament_results(p_tournament_id uuid, p_rows jsonb, p_currency text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.tournaments;
  n int;
  f int;
  m int;
  b jsonb;
  was jsonb;
begin
  select * into t from public.tournaments where id = p_tournament_id;
  if t.id is null or not public.is_tournament_organizer(t.id) then
    raise exception 'Solo el Comité publica resultados' using errcode = '42501';
  end if;
  if t.status <> 'finished' then
    raise exception 'El torneo todavía no termina' using errcode = '22023';
  end if;
  -- Terminado before 0029, or a day reopened since: the results wait until it is settled.
  b := public.close_blockers(t.id);
  if jsonb_array_length(b) > 0 then
    raise exception '%', public.close_blockers_text(b, true) using errcode = '22023';
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array' then
    raise exception 'Resultados inválidos' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_rows) as x("playerId" uuid)
    where x."playerId" is null or public.player_tournament_id(x."playerId") is distinct from t.id
  ) then
    raise exception 'Un jugador no es de este torneo' using errcode = '22023';
  end if;

  perform public.refresh_round_results(r.id) from public.rounds r where r.tournament_id = t.id and r.status = 'finished';

  select case when count(*) > 0 then jsonb_build_object('players', count(*), 'nets', (select count(*) from public.tournament_money where tournament_id = t.id)) end
  into was from public.tournament_results where tournament_id = t.id;
  delete from public.tournament_results where tournament_id = t.id;
  delete from public.tournament_money where tournament_id = t.id;
  select count(*) filter (where x.rank is not null) into f from jsonb_to_recordset(p_rows) as x(rank int);
  insert into public.tournament_results (tournament_id, player_id, rank, rank_label, field, points, per_round, awards)
  select t.id, x."playerId", x.rank, x."rankLabel", f, x.points, coalesce(x."perRound", '{}'), coalesce(x.awards, '{}')
  from jsonb_to_recordset(p_rows) as x("playerId" uuid, rank int, "rankLabel" text, points int, "perRound" int[], awards text[]);
  get diagnostics n = row_count;
  insert into public.tournament_money (tournament_id, player_id, net, currency)
  select t.id, x."playerId", x.net, coalesce(nullif(p_currency, ''), 'MXN')
  from jsonb_to_recordset(p_rows) as x("playerId" uuid, net int)
  where x.net is not null;
  get diagnostics m = row_count;
  perform public.audit_event(t.id, 'tournament_results', t.id::text, case when was is null then 'INSERT' else 'UPDATE' end,
    was, jsonb_build_object('players', n, 'nets', m));
  return jsonb_build_object('players', n, 'field', f);
end;
$$;

-- 0015's body, with the withdrawal's line (only when something was published).
create or replace function public.tournaments_results_state()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
  m int;
begin
  if old.counts_for_stats is distinct from new.counts_for_stats then
    perform public.recompute_profile_index(p.profile_id)
    from public.players p where p.tournament_id = new.id and p.profile_id is not null and p.profile_status = 'confirmed';
  end if;
  if old.status = 'finished' and new.status <> 'finished' then
    delete from public.tournament_results where tournament_id = new.id;
    get diagnostics n = row_count;
    delete from public.tournament_money where tournament_id = new.id;
    get diagnostics m = row_count;
    if n > 0 or m > 0 then
      perform public.audit_event(new.id, 'tournament_results', new.id::text, 'DELETE', jsonb_build_object('players', n, 'nets', m), null);
    end if;
  end if;
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. The two tables people write that had no trail
-- ---------------------------------------------------------------------------
create trigger photos_audit after insert or update or delete on public.photos
  for each row execute function public.audit_row();
create trigger course_documents_audit after insert or update or delete on public.course_documents
  for each row execute function public.audit_row();
