-- 0017: Ronda rápida. One call creates a live one-round tournament for a
-- weekend outing: the creator (an account) is organizer and a confirmed
-- player; friends join as pending links ("¿Eres tú?") and hear about it;
-- guests are plain players the creator scores for. Handicaps come from each
-- profile's index (or what the creator typed); groups of up to four in the
-- order given. It counts for the Polo index like any other tournament.
--
-- Also: tournaments.quick (the app offers "Terminar y publicar" on those),
-- and round_rivalries(tid) for the rivalry line on the Tarjeta.

alter table public.tournaments add column if not exists quick boolean not null default false;

/** The index a profile plays off: the manual one when chosen, else the Polo index. */
create or replace function public.profile_index(pid uuid)
returns numeric language sql stable security definer set search_path = public as $$
  select case when index_source = 'manual' then manual_index else polo_index end from public.profiles where id = pid
$$;
revoke execute on function public.profile_index(uuid) from public, anon, authenticated;

/**
 * p: { name, settings, courseId, teeId, date (yyyy-mm-dd, optional),
 *      players: [{ kind: 'me' | 'friend' | 'guest', handle?, name?, index? }] }
 * Returns { id, slug }.
 */
create or replace function public.create_quick_round(p jsonb)
returns jsonb
language plpgsql volatile security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  mine public.profiles;
  t public.tournaments;
  rid uuid;
  tee uuid := nullif(p ->> 'teeId', '')::uuid;
  course uuid := nullif(p ->> 'courseId', '')::uuid;
  x jsonb;
  i int := 0;
  pid uuid;
  prof uuid;
  idx numeric;
  nm text;
  ids uuid[] := '{}';
  groups jsonb := '[]'::jsonb;
  n int;
  g int;
  seen_me boolean := false;
begin
  if not public.is_account_user(me) then
    raise exception 'Primero guarda tu perfil' using errcode = '42501';
  end if;
  select * into mine from public.profiles where id = me;
  if mine.id is null then
    raise exception 'Primero guarda tu perfil' using errcode = '42501';
  end if;
  if course is null or tee is null or not exists (select 1 from public.tees where id = tee and course_id = course) then
    raise exception 'Elige un campo y un tee' using errcode = '22023';
  end if;
  if (select count(*) from public.holes where tee_id = tee) <> 18 then
    raise exception 'Ese tee no tiene sus 18 hoyos capturados' using errcode = '22023';
  end if;
  n := jsonb_array_length(coalesce(p -> 'players', '[]'::jsonb));
  if n < 1 or n > 16 then
    raise exception 'Una ronda rápida es de 1 a 16 jugadores' using errcode = '22023';
  end if;

  t := public.create_tournament(coalesce(nullif(btrim(p ->> 'name'), ''), 'Ronda rápida'), coalesce(p -> 'settings', '{}'::jsonb));
  insert into public.rounds (tournament_id, number, date, course_id, holes, status)
  values (t.id, 1, nullif(p ->> 'date', '')::date, course, 18, 'live')
  returning id into rid;
  update public.tournaments set status = 'live', quick = true, current_round_id = rid where id = t.id;

  for x in select * from jsonb_array_elements(p -> 'players') loop
    prof := null;
    idx := nullif(x ->> 'index', '')::numeric;
    if x ->> 'kind' = 'me' then
      if seen_me then
        raise exception 'Estás dos veces en la ronda' using errcode = '22023';
      end if;
      seen_me := true;
      prof := me;
    elsif x ->> 'kind' = 'friend' then
      prof := public.profile_id_by_handle(x ->> 'handle');
      if prof is null or not public.are_friends(me, prof) then
        raise exception 'Solo puedes agregar a tus amigos; a los demás, como invitados' using errcode = '42501';
      end if;
      if exists (select 1 from public.players where tournament_id = t.id and profile_id = prof) then
        raise exception 'Un amigo está dos veces en la ronda' using errcode = '22023';
      end if;
    elsif x ->> 'kind' <> 'guest' then
      raise exception 'Jugador inválido' using errcode = '22023';
    end if;

    if prof is not null then
      idx := coalesce(idx, public.profile_index(prof));
      insert into public.players (tournament_id, full_name, display_name, base_hcp, handicap_source, handicap_index, default_tee_id, avatar_url, sort_order, profile_id, profile_status)
      select t.id, coalesce(nullif(btrim(pr.full_name), ''), pr.display_name), pr.display_name,
        coalesce(idx, 0), case when idx is null then 'manual' else 'index' end, idx, tee, pr.avatar_url, i,
        prof, case when prof = me then 'confirmed' else 'pending' end
      from public.profiles pr where pr.id = prof
      returning id into pid;
    else
      nm := btrim(coalesce(x ->> 'name', ''));
      if nm = '' then
        raise exception 'Cada invitado necesita nombre' using errcode = '22023';
      end if;
      insert into public.players (tournament_id, full_name, display_name, base_hcp, handicap_source, handicap_index, default_tee_id, sort_order)
      values (t.id, left(nm, 60), left(split_part(nm, ' ', 1), 30), coalesce(idx, 0), case when idx is null then 'manual' else 'index' end, idx, tee, i)
      returning id into pid;
    end if;
    if prof is not null and prof <> me then
      perform public.notify(prof, 'round_invite', 'round_invite:' || pid, me, jsonb_build_object('tournament', t.name, 'slug', t.slug));
    end if;
    ids := ids || pid;
    i := i + 1;
  end loop;
  if not seen_me then
    raise exception 'Tú juegas la ronda: agrégate' using errcode = '22023';
  end if;

  -- Groups of up to four in the order given, all off the 1st tee.
  g := 0;
  while g * 4 < array_length(ids, 1) loop
    groups := groups || jsonb_build_object('number', g + 1, 'tee_time', null, 'start_hole', 1, 'player_ids', to_jsonb(ids[g * 4 + 1 : least(g * 4 + 4, array_length(ids, 1))]));
    g := g + 1;
  end loop;
  perform public.upsert_groups(rid, groups);

  return jsonb_build_object('id', t.id, 'slug', t.slug);
end;
$$;
revoke execute on function public.create_quick_round(jsonb) from public, anon;
grant execute on function public.create_quick_round(jsonb) to authenticated;

/** My active rivalries with other confirmed players of this tournament, for the Tarjeta. */
create or replace function public.round_rivalries(tid uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'myPlayerId', mp.id, 'theirPlayerId', tp.id,
    'myStrokes', case when r.a = auth.uid() then r.strokes else -r.strokes end
  )), '[]'::jsonb)
  from public.rivalries r
  join public.players mp on mp.tournament_id = tid and mp.profile_id = auth.uid() and mp.profile_status = 'confirmed'
  join public.players tp on tp.tournament_id = tid and tp.profile_status = 'confirmed'
    and tp.profile_id = case when r.a = auth.uid() then r.b else r.a end
  where r.status = 'active' and auth.uid() in (r.a, r.b)
$$;
