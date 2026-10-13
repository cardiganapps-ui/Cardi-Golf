-- Cardi-Golf · 0044 · A hole contest's winners and a custom bet's result, each in one transaction (ARCH-13).
--
-- Each of these was two requests: delete the old rows, then insert the new.
-- When the second failed (the signal dropped, or the server refused it) the
-- first had already gone through:
-- - a group's claim on a contest hole (the outbox's award push): its old
--   winners deleted and the new ones refused (a winner the Comité moved to
--   another group, the round closed meanwhile), so the hole lost its claim
--   for good while the phone filed the change as refused;
-- - the Comité's ruling on a hole: the old ruling gone, the new one not in;
-- - a custom bet's result: the winners deleted and none written, so its
--   money left the settlement without an error.
-- Two phones of a group saving the same hole at once also met halfway, on a
-- duplicate key.
--
-- Three functions, each one statement for the client and one transaction for
-- the database, under a transaction lock on what it rewrites. Security
-- invoker after their own checks: every delete and insert still meets the
-- policies a direct write meets (0030), so nothing anyone may do changes.
-- - save_group_awards: a group's winners on a contest hole (the phone).
-- - set_hole_ruling: the Comité's ruling on a hole (null clears it; an empty
--   list is «nadie», which also takes the groups' claims, as before).
-- - set_game_results: a custom bet's winners and their shares.
-- Direct writes stay for the bundles in the field until the contract.

-- The phone's push: the group's winners on a hole, replaced in one go.
create or replace function public.save_group_awards(p_round_id uuid, p_group_id uuid, p_game_id text, p_hole int, p_player_ids uuid[], p_decided_by uuid)
returns jsonb
language plpgsql volatile security invoker
set search_path = public
as $$
declare
  tid uuid := public.round_tournament_id(p_round_id);
  me uuid;
  organizer boolean;
  gone jsonb;
  made jsonb;
begin
  if tid is null or p_group_id is null then
    raise exception 'Solo alguien del grupo captura este concurso' using errcode = '42501';
  end if;
  me := public.my_player_id(tid);
  organizer := public.is_tournament_organizer(tid);
  -- A phone: one of the group's, while the round is live (the phone's outbox reads «en juego» as a closed day).
  if not organizer then
    if not (exists (select 1 from public.groups g where g.id = p_group_id and g.round_id = p_round_id)
            and exists (select 1 from public.group_members m where m.group_id = p_group_id and m.player_id = me)) then
      raise exception 'Solo alguien del grupo captura este concurso' using errcode = '42501';
    end if;
    if not public.round_is_live(p_round_id) then
      raise exception 'La ronda ya no está en juego; el Comité tiene que capturarlo' using errcode = '42501';
    end if;
  end if;
  -- The Comité may name any group, but of this round.
  if not exists (select 1 from public.groups g where g.id = p_group_id and g.round_id = p_round_id) then
    raise exception 'Ese grupo no es de esta ronda' using errcode = '22023';
  end if;
  -- The hole, game and winners as the table takes them (a null game would also skip the lock below).
  if p_game_id is null or p_game_id !~ '^[a-z0-9-]{1,32}$' or p_hole is null or p_hole not between 1 and 18 or p_player_ids is null then
    raise exception 'Ese concurso no se puede guardar así' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(p_player_ids) x where public.player_tournament_id(x) is distinct from tid) then
    raise exception 'Ese jugador no es de este torneo' using errcode = '22023';
  end if;
  if cardinality(p_player_ids) <> (select count(distinct x) from unnest(p_player_ids) x) then
    raise exception 'Cada ganador va una sola vez' using errcode = '22023';
  end if;
  if not organizer and exists (select 1 from unnest(p_player_ids) x where not exists (select 1 from public.group_members m where m.group_id = p_group_id and m.player_id = x)) then
    raise exception 'Ese jugador no está en este grupo' using errcode = '22023';
  end if;

  -- One writer of a hole's winners at a time: the group's phones and the Comité's ruling.
  perform pg_advisory_xact_lock(hashtextextended('hole_awards:' || p_round_id::text || ':' || p_game_id || ':' || p_hole::text, 0));

  with d as (
    delete from public.hole_awards
     where round_id = p_round_id and game_id = p_game_id and hole = p_hole and group_id = p_group_id
    returning round_id, game_id, hole, player_id, source
  )
  select coalesce(jsonb_agg(to_jsonb(d)), '[]'::jsonb) into gone from d;

  with i as (
    insert into public.hole_awards (round_id, group_id, hole, game_id, player_id, decided_by)
    select p_round_id, p_group_id, p_hole, p_game_id, x, coalesce(me, p_decided_by)
      from unnest(p_player_ids) with ordinality u(x, n)
     order by n
    returning *
  )
  select coalesce(jsonb_agg(to_jsonb(i)), '[]'::jsonb) into made from i;

  return jsonb_build_object('deleted', gone, 'rows', made);
end;
$$;
comment on function public.save_group_awards(uuid, uuid, text, int, uuid[], uuid) is
  'A group''s winners on a contest hole, replaced in one transaction (ARCH-13): {deleted, rows}.';
revoke execute on function public.save_group_awards(uuid, uuid, text, int, uuid[], uuid) from public, anon;
grant execute on function public.save_group_awards(uuid, uuid, text, int, uuid[], uuid) to authenticated;

-- The Comité's ruling on a hole: null clears it (the groups' claims count again);
-- an empty list is «nadie» and also takes the groups' claims, as the Comité's sheet did.
create or replace function public.set_hole_ruling(p_round_id uuid, p_game_id text, p_hole int, p_player_ids uuid[], p_decided_by uuid)
returns jsonb
language plpgsql volatile security invoker
set search_path = public
as $$
declare
  tid uuid := public.round_tournament_id(p_round_id);
  gone jsonb;
  rest jsonb := '[]'::jsonb;
  made jsonb := '[]'::jsonb;
begin
  if tid is null or not public.is_tournament_organizer(tid) then
    raise exception 'Solo el Comité decide un concurso' using errcode = '42501';
  end if;
  if p_game_id is null or p_game_id !~ '^[a-z0-9-]{1,32}$' or p_hole is null or p_hole not between 1 and 18 then
    raise exception 'Ese concurso no se puede guardar así' using errcode = '22023';
  end if;
  if p_player_ids is not null and exists (select 1 from unnest(p_player_ids) x where public.player_tournament_id(x) is distinct from tid) then
    raise exception 'Ese jugador no es de este torneo' using errcode = '22023';
  end if;
  if p_player_ids is not null and cardinality(p_player_ids) <> (select count(distinct x) from unnest(p_player_ids) x) then
    raise exception 'Cada ganador va una sola vez' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('hole_awards:' || p_round_id::text || ':' || p_game_id || ':' || p_hole::text, 0));

  with d as (
    delete from public.hole_awards
     where round_id = p_round_id and game_id = p_game_id and hole = p_hole and group_id is null
    returning round_id, game_id, hole, player_id, source
  )
  select coalesce(jsonb_agg(to_jsonb(d)), '[]'::jsonb) into gone from d;

  if p_player_ids is not null and cardinality(p_player_ids) = 0 then
    with d as (
      delete from public.hole_awards
       where round_id = p_round_id and game_id = p_game_id and hole = p_hole
      returning round_id, game_id, hole, player_id, source
    )
    select coalesce(jsonb_agg(to_jsonb(d)), '[]'::jsonb) into rest from d;
  elsif p_player_ids is not null then
    with i as (
      insert into public.hole_awards (round_id, group_id, hole, game_id, player_id, decided_by)
      select p_round_id, null, p_hole, p_game_id, x, p_decided_by
        from unnest(p_player_ids) with ordinality u(x, n)
       order by n
      returning *
    )
    select coalesce(jsonb_agg(to_jsonb(i)), '[]'::jsonb) into made from i;
  end if;

  return jsonb_build_object('deleted', gone || rest, 'rows', made);
end;
$$;
comment on function public.set_hole_ruling(uuid, text, int, uuid[], uuid) is
  'The Comité''s ruling on a contest hole, in one transaction (ARCH-13): null clears it, an empty list is «nadie».';
revoke execute on function public.set_hole_ruling(uuid, text, int, uuid[], uuid) from public, anon;
grant execute on function public.set_hole_ruling(uuid, text, int, uuid[], uuid) to authenticated;

-- A custom bet's result: its winners and their shares, replaced in one go.
create or replace function public.set_game_results(p_tournament_id uuid, p_game_id text, p_winners jsonb)
returns jsonb
language plpgsql volatile security invoker
set search_path = public
as $$
declare
  w jsonb;
  made jsonb;
begin
  if p_tournament_id is null or not public.is_tournament_organizer(p_tournament_id) then
    raise exception 'Solo el Comité registra el resultado de una apuesta' using errcode = '42501';
  end if;
  if p_game_id is null or p_game_id !~ '^[a-z0-9-]{1,32}$' then
    raise exception 'Ese juego no se puede guardar así' using errcode = '22023';
  end if;
  if jsonb_typeof(p_winners) is distinct from 'array' then
    raise exception 'El resultado lleva la lista de ganadores' using errcode = '22023';
  end if;
  for w in select x from jsonb_array_elements(p_winners) x loop
    if jsonb_typeof(w) is distinct from 'object' or public.try_uuid(w ->> 'player_id') is null
       or jsonb_typeof(w -> 'share') is distinct from 'number' or (w ->> 'share')::numeric <= 0 then
      raise exception 'Cada ganador lleva su jugador y una parte mayor que cero' using errcode = '22023';
    end if;
    if public.player_tournament_id(public.try_uuid(w ->> 'player_id')) is distinct from p_tournament_id then
      raise exception 'Ese jugador no es de este torneo' using errcode = '22023';
    end if;
  end loop;
  if jsonb_array_length(p_winners) <> (select count(distinct x ->> 'player_id') from jsonb_array_elements(p_winners) x) then
    raise exception 'Cada ganador va una sola vez' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('game_results:' || p_tournament_id::text || ':' || p_game_id, 0));

  delete from public.game_results where tournament_id = p_tournament_id and game_id = p_game_id;
  with i as (
    insert into public.game_results (tournament_id, game_id, player_id, share)
    select p_tournament_id, p_game_id, (x ->> 'player_id')::uuid, (x ->> 'share')::numeric
      from jsonb_array_elements(p_winners) with ordinality e(x, n)
     order by n
    returning *
  )
  select coalesce(jsonb_agg(to_jsonb(i)), '[]'::jsonb) into made from i;
  return made;
end;
$$;
comment on function public.set_game_results(uuid, text, jsonb) is
  'A custom bet''s winners and shares, replaced in one transaction (ARCH-13).';
revoke execute on function public.set_game_results(uuid, text, jsonb) from public, anon;
grant execute on function public.set_game_results(uuid, text, jsonb) to authenticated;
