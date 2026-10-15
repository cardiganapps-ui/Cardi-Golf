-- 0059: social actions have a limit (SEC-10).
--
-- A friend request notifies its recipient once (the notice's key is the sender), but nothing bounded how many
-- people one account could ask: any discoverable profile, any tournament mate. And a rivalry ended and proposed
-- again was a new notice each time. Now one account sends at most 30 new friend requests a day and has at most
-- 100 waiting at once, and proposes at most 3 rivalries a day to the same friend. Past it, the answer says to wait
-- (22023, in Spanish). Blocking (friend_block) stays the recipient's way out of anyone. Both bodies are 0016's.

create or replace function public.friend_request(p_handle text)
returns text language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  other uuid;
  f public.friendships;
begin
  if not public.is_account_user(me) then
    raise exception 'Primero guarda tu perfil' using errcode = '42501';
  end if;
  other := public.profile_id_by_handle(p_handle);
  if other is null or other = me then
    return 'not_found';
  end if;
  select * into f from public.friendships where (a = me and b = other) or (a = other and b = me);
  if f.a is not null then
    if f.status = 'blocked' then
      return 'not_found';
    end if;
    if f.status = 'pending' and f.b = me then
      update public.friendships set status = 'accepted', responded_at = now() where a = f.a and b = f.b;
      perform public.notify(other, 'friend_accepted', 'friend_accepted:' || me, me, '{}');
      return 'accepted';
    end if;
    return f.status;
  end if;
  -- SEC-10: thirty new requests a day from one account, and a hundred waiting at once. The same person is
  -- never told twice (the notice's key), so this is what bounds asking many.
  if (select count(*) from public.friendships where a = me and created_at > now() - interval '1 day') >= 30
     or (select count(*) from public.friendships where a = me and status = 'pending') >= 100 then
    raise exception 'Ya mandaste muchas solicitudes de amistad. Espera a que te contesten o intenta mañana.' using errcode = '22023';
  end if;
  -- Strangers only reach discoverable profiles; tournament mates reach anyone.
  if not (public.profile_visible_to_me(other) or exists (select 1 from public.profiles where id = other and discoverable)) then
    return 'not_found';
  end if;
  insert into public.friendships (a, b, status) values (me, other, 'pending');
  perform public.notify(other, 'friend_request', 'friend_request:' || me, me, '{}');
  return 'pending';
end;
$$;

create or replace function public.rivalry_propose(p_handle text, p_strokes int, p_cap int default 18)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  other uuid := public.profile_id_by_handle(p_handle);
  rid uuid;
begin
  if other is null or not public.are_friends(me, other) then
    raise exception 'Las rivalidades son entre amigos' using errcode = '42501';
  end if;
  -- SEC-10: a rivalry ended and proposed again is a new notice each time; three a day to the same friend.
  if (select count(*) from public.rivalries where a = me and b = other and created_at > now() - interval '1 day') >= 3 then
    raise exception 'Ya le propusiste varias rivalidades hoy. Intenta mañana.' using errcode = '22023';
  end if;
  if abs(coalesce(p_strokes, 0)) > coalesce(p_cap, 18) then
    raise exception 'Los golpes no pueden pasar del tope' using errcode = '22023';
  end if;
  insert into public.rivalries (a, b, status, start_strokes, cap, strokes)
  values (me, other, 'pending', coalesce(p_strokes, 0), coalesce(p_cap, 18), coalesce(p_strokes, 0))
  returning id into rid;
  perform public.notify(other, 'rivalry_proposed', 'rivalry_proposed:' || rid, me, jsonb_build_object('rivalryId', rid));
  return rid;
exception when unique_violation then
  raise exception 'Ya tienen una rivalidad abierta' using errcode = '23505';
end;
$$;
