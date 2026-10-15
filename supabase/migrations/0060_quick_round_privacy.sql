-- 0060: a Ronda rápida copies only what a friend shows anyone, and «No soy yo» takes his photo back (TRUST-23).
--
-- create_quick_round put each friend in the round with his profile's full name and photo. The round is read by
-- everyone in it (the creator's other friends, the Comité), not only by that friend's friends, so a private full
-- name and a photo from a hidden profile reached people he never shared them with. A friend now comes in with his
-- short name, and with his photo only when his card is public (discoverable); the creator himself keeps his own
-- names and photo. When the friend answers «No soy yo» to a link still pending (unlink_my_profile), the player
-- keeps the name the round gave it but loses his photo, so a link he refused shows nothing of his.
-- create_quick_round is 0017's body with that change; unlink_my_profile is 0013's plus the photo.

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
      -- A friend comes in with what his card shows anyone in the round: his name, and his photo only when his
      -- card is public. His full name is for his friends, and the round's other players are not all his friends.
      select t.id, case when prof = me then coalesce(nullif(btrim(pr.full_name), ''), pr.display_name) else pr.display_name end, pr.display_name,
        coalesce(idx, 0), case when idx is null then 'manual' else 'index' end, idx, tee, case when prof = me or pr.discoverable then pr.avatar_url end, i,
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

create or replace function public.unlink_my_profile(p_player_id uuid)
returns boolean
language plpgsql security definer
set search_path = public
as $$
begin
  update public.players pl
  set profile_id = null,
      avatar_url = case when pl.profile_status = 'pending' and pl.avatar_url is not distinct from pr.avatar_url then null else pl.avatar_url end
  from public.profiles pr
  where pl.id = p_player_id and pl.profile_id = auth.uid() and pr.id = auth.uid();
  return found;
end;
$$;
