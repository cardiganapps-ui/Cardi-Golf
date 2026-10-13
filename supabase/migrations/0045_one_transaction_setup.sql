-- Cardi-Golf · 0045 · The Calcutta's lots and a course's card, each in one transaction (ARCH-13).
--
-- Three more writes that were several requests, each able to stop halfway:
-- - «Sacar del sombrero» (createLots): the unsold lots deleted, the sold ones
--   read, the new ones inserted. A failed insert left the auction with no
--   lots to open.
-- - «Deshacer la venta» (reopenLot): the buyback deleted, then the lot put
--   back to open. A failed second request left a sold lot with no buyback.
-- - A course's card (saveCourse): the course, then each tee and its holes,
--   then the tees taken out, 3 + 2 per tee + 2 requests. A failure halfway
--   left some tees saved and others not, on a course every tournament that
--   plays it shares. Taking out a tee another tournament's round plays was
--   one such failure: the phone's check ran under the caller's policies,
--   which see only the caller's tournaments, so it let the delete go and
--   0010's tees_guard refused it, after the rest of the card was written.
--   And a tee taken out that a player of any tournament had as default set
--   that default to null without a word.
--
-- All three are security invoker after their own checks, so every write
-- still meets the policies a direct write meets (0030), under a lock on
-- the tournament's lots, the lot's row or the course's row. save_course
-- writes only tees of that course. What no caller's policies can see, every
-- use of a tee in other tournaments, the triggers on tees see: 0010's
-- tees_guard refuses deleting a tee a round plays, and tees_guard_default
-- (below) one a player has as default, on every path (save_course, an
-- older bundle's direct delete, a course's cascade). Direct writes stay for
-- the bundles in the field until the contract.

-- «Sacar del sombrero»: the unsold lots replaced by one per player, in the order drawn; sold lots stay.
create or replace function public.create_lots(p_tournament_id uuid, p_player_ids uuid[])
returns jsonb
language plpgsql volatile security invoker
set search_path = public
as $$
declare
  last int;
  made jsonb;
begin
  if p_tournament_id is null or not public.is_tournament_organizer(p_tournament_id) then
    raise exception 'Solo el Comité arma la subasta' using errcode = '42501';
  end if;
  if p_player_ids is null or exists (select 1 from unnest(p_player_ids) x where public.player_tournament_id(x) is distinct from p_tournament_id) then
    raise exception 'Ese jugador no es de este torneo' using errcode = '22023';
  end if;
  if cardinality(p_player_ids) <> (select count(distinct x) from unnest(p_player_ids) x) then
    raise exception 'Cada jugador sale del sombrero una sola vez' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('calcutta_lots:' || p_tournament_id::text, 0));

  delete from public.calcutta_lots where tournament_id = p_tournament_id and status <> 'sold';
  select coalesce(max(lot_number), 0) into last from public.calcutta_lots where tournament_id = p_tournament_id;
  with i as (
    insert into public.calcutta_lots (tournament_id, player_id, lot_number, status)
    select p_tournament_id, x, last + row_number() over (order by n), 'pending'
      from unnest(p_player_ids) with ordinality u(x, n)
     where not exists (select 1 from public.calcutta_lots l where l.tournament_id = p_tournament_id and l.player_id = x)
     order by n
    returning *
  )
  select coalesce(jsonb_agg(to_jsonb(i) order by i.lot_number), '[]'::jsonb) into made from i;
  return made;
end;
$$;
comment on function public.create_lots(uuid, uuid[]) is
  'The Calcutta''s draw: unsold lots replaced by one per player in the order given, sold lots kept, in one transaction (ARCH-13).';
revoke execute on function public.create_lots(uuid, uuid[]) from public, anon;
grant execute on function public.create_lots(uuid, uuid[]) to authenticated;

-- «Deshacer la venta»: the lot open again with no owner, price or buyback; its bids stay.
create or replace function public.reopen_lot(p_lot_id uuid)
returns jsonb
language plpgsql volatile security invoker
set search_path = public
as $$
declare
  tid uuid := public.lot_tournament_id(p_lot_id);
  lot public.calcutta_lots;
begin
  if tid is null or not public.is_tournament_organizer(tid) then
    raise exception 'Solo el Comité deshace una venta' using errcode = '42501';
  end if;
  select * into lot from public.calcutta_lots where id = p_lot_id for update;
  delete from public.calcutta_buybacks where lot_id = p_lot_id;
  update public.calcutta_lots set status = 'open', owner_id = null, price = null, sold_at = null
   where id = p_lot_id
  returning * into lot;
  return to_jsonb(lot);
end;
$$;
comment on function public.reopen_lot(uuid) is
  'Undo a Calcutta sale in one transaction: no buyback, the lot open again with its bids (ARCH-13).';
revoke execute on function public.reopen_lot(uuid) from public, anon;
grant execute on function public.reopen_lot(uuid) to authenticated;

-- A course's card: the course, every tee in the order given with its holes, and the tees taken out; or nothing.
create or replace function public.save_course(p jsonb)
returns uuid
language plpgsql volatile security invoker
set search_path = public
as $$
declare
  cid uuid;
  t jsonb;
  h jsonb;
  tid uuid;
  i int := 0;
  kept uuid[] := '{}';
  gone uuid[];
  src text := coalesce(p ->> 'source', 'manual');
begin
  if jsonb_typeof(p) is distinct from 'object' or jsonb_typeof(p -> 'tees') is distinct from 'array' then
    raise exception 'No pudimos leer ese campo; ábrelo otra vez y repite el cambio' using errcode = '22023';
  end if;
  if btrim(coalesce(p ->> 'name', '')) = '' then
    raise exception 'El campo necesita nombre' using errcode = '22023';
  end if;
  cid := public.try_uuid(p ->> 'id');
  if p ? 'id' and jsonb_typeof(p -> 'id') <> 'null' and cid is null then
    raise exception 'No pudimos leer ese campo; ábrelo otra vez y repite el cambio' using errcode = '22023';
  end if;

  if cid is not null then
    if not exists (select 1 from public.courses where id = cid) then
      raise exception 'Ese campo ya no existe' using errcode = '22023';
    end if;
    if not public.can_edit_course(cid) then
      raise exception 'Solo quien juega este campo en su torneo lo edita' using errcode = '42501';
    end if;
    -- One save of a course at a time.
    perform 1 from public.courses where id = cid for update;
    update public.courses
       set name = btrim(p ->> 'name'), location = p ->> 'location', source = src, external_id = p ->> 'external_id',
           imported_at = case when src <> 'manual' then now() else null end, attribution = p ->> 'attribution',
           website = p ->> 'website', latitude = (p ->> 'latitude')::numeric, longitude = (p ->> 'longitude')::numeric
     where id = cid;
  else
    if not public.can_manage_courses() then
      raise exception 'Solo un organizador con cuenta da de alta un campo' using errcode = '42501';
    end if;
    insert into public.courses (name, location, source, external_id, imported_at, attribution, website, latitude, longitude, created_by)
    values (btrim(p ->> 'name'), p ->> 'location', src, p ->> 'external_id', case when src <> 'manual' then now() end,
            p ->> 'attribution', p ->> 'website', (p ->> 'latitude')::numeric, (p ->> 'longitude')::numeric, auth.uid())
    returning id into cid;
  end if;

  for t in select x from jsonb_array_elements(p -> 'tees') x loop
    if jsonb_typeof(t) is distinct from 'object' or jsonb_typeof(t -> 'holes') is distinct from 'array' then
      raise exception 'No pudimos leer ese campo; ábrelo otra vez y repite el cambio' using errcode = '22023';
    end if;
    tid := public.try_uuid(t ->> 'id');
    if tid is not null then
      -- A tee of this course, never another's.
      update public.tees
         set name = t ->> 'name', color = t ->> 'color', rating = (t ->> 'rating')::numeric, slope = (t ->> 'slope')::int,
             par_total = (select sum((x ->> 'par')::int) from jsonb_array_elements(t -> 'holes') x), sort_order = i
       where id = tid and course_id = cid;
      if not found then
        raise exception 'Ese tee no es de este campo' using errcode = '22023';
      end if;
    else
      insert into public.tees (course_id, name, color, rating, slope, par_total, sort_order)
      values (cid, t ->> 'name', t ->> 'color', (t ->> 'rating')::numeric, (t ->> 'slope')::int,
              (select sum((x ->> 'par')::int) from jsonb_array_elements(t -> 'holes') x), i)
      returning id into tid;
    end if;
    for h in select x from jsonb_array_elements(t -> 'holes') x loop
      insert into public.holes (tee_id, number, par, stroke_index, yards)
      values (tid, (h ->> 'number')::int, (h ->> 'par')::int, (h ->> 'stroke_index')::int, (h ->> 'yards')::int)
      on conflict (tee_id, number) do update set par = excluded.par, stroke_index = excluded.stroke_index, yards = excluded.yards;
    end loop;
    kept := kept || tid;
    i := i + 1;
  end loop;

  -- The tees taken out. A tee a round plays, or a player has as default, in any tournament, stops here at the
  -- triggers on tees, and the whole card with it.
  delete from public.tees where course_id = cid and not (id = any (kept));
  return cid;
end;
$$;
comment on function public.save_course(jsonb) is
  'A course''s card in one transaction (ARCH-13): the course, its tees in order with their holes, and the tees taken out once nobody in any tournament plays them.';
revoke execute on function public.save_course(jsonb) from public, anon;
grant execute on function public.save_course(jsonb) to authenticated;

-- A tee a player has as default, in any tournament, is not deleted: the delete would set that default to null
-- (players.default_tee_id) where nobody of that tournament sees it happen. 0010's tees_guard does the same for a
-- tee a round plays. Both see past every caller's policies, as a trigger does.
create or replace function public.tees_guard_default()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.players where default_tee_id = old.id) then
    raise exception 'Ese tee es el de un jugador; cámbiale su tee primero' using errcode = '22023';
  end if;
  return old;
end;
$$;
revoke execute on function public.tees_guard_default() from public, anon, authenticated;
drop trigger if exists tees_guard_default on public.tees;
create trigger tees_guard_default before delete on public.tees
  for each row execute function public.tees_guard_default();
