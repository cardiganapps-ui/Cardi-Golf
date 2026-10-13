-- 0051: a Comité correction of a hole is one call (REL-22).
--
-- The Tarjeta corrects a signed card or a closed day through
-- admin_save_score, one player at a time. A failure on the second player
-- (no signal, a value refused) came after the first was saved, so the hole
-- landed half corrected. admin_save_hole writes every player of the hole or
-- none: it runs admin_save_score for each row inside one transaction, so its
-- checks, its lock on the hole, its row and its audit stay exactly those of
-- admin_save_score, and any refusal takes the whole correction back.
--
-- Security invoker: each row meets admin_save_score's own Comité check.
-- Release order: this reaches production before the bundle that calls it.

set local lock_timeout = '10s';

create or replace function public.admin_save_hole(p_round_id uuid, p_hole integer, p_rows jsonb, p_reason text default null)
returns void
language plpgsql security invoker
set search_path = public
as $$
declare
  r jsonb;
  pid uuid;
  seen uuid[] := '{}';
begin
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) not between 1 and 8 then
    raise exception 'Una corrección lleva de uno a ocho jugadores' using errcode = '22023';
  end if;
  for r in select value from jsonb_array_elements(p_rows) loop
    -- Each check its own step: SQL promises no order inside one expression, and a cast must never meet a string.
    pid := public.try_uuid(case when jsonb_typeof(r) = 'object' then r ->> 'player_id' end);
    if pid is null then
      raise exception 'No pudimos leer esa corrección' using errcode = '22023';
    end if;
    if jsonb_typeof(r -> 'picked_up') is distinct from 'boolean'
      or coalesce(jsonb_typeof(r -> 'strokes'), 'null') not in ('null', 'number')
      or coalesce(jsonb_typeof(r -> 'putts'), 'null') not in ('null', 'number') then
      raise exception 'No pudimos leer esa corrección' using errcode = '22023';
    end if;
    -- A count is a whole number an integer holds (admin_save_score then says 1 to 15); CASE keeps the cast to
    -- numbers, and its parentheses keep IF from ending the condition at CASE's own THEN.
    if (case when jsonb_typeof(r -> 'strokes') = 'number' then (r ->> 'strokes')::numeric % 1 <> 0 or (r ->> 'strokes')::numeric not between 0 and 99 else false end)
      or (case when jsonb_typeof(r -> 'putts') = 'number' then (r ->> 'putts')::numeric % 1 <> 0 or (r ->> 'putts')::numeric not between 0 and 99 else false end) then
      raise exception 'No pudimos leer esa corrección' using errcode = '22023';
    end if;
    if pid = any (seen) then
      raise exception 'Un jugador viene dos veces en la corrección' using errcode = '22023';
    end if;
    seen := seen || pid;
  end loop;
  -- The rows, in the order given: the first refusal takes back every row written before it.
  for r in select value from jsonb_array_elements(p_rows) loop
    perform public.admin_save_score(p_round_id, (r ->> 'player_id')::uuid, p_hole, (r ->> 'strokes')::integer, (r ->> 'putts')::integer, (r ->> 'picked_up')::boolean, p_reason);
  end loop;
end;
$$;
revoke execute on function public.admin_save_hole(uuid, integer, jsonb, text) from public, anon;
grant execute on function public.admin_save_hole(uuid, integer, jsonb, text) to authenticated, service_role;
