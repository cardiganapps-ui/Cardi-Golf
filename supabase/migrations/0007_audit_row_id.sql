-- Cardi-Golf · 0007 · audit_row: never a NULL row_id.
-- Tables without an `id` column (group_members, round_tees, buybacks…) get a
-- composite key; anything else falls back to a hash of the row.
create or replace function public.audit_row()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  rid text;
  tid uuid;
  rec jsonb;
begin
  rec := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  rid := coalesce(
    rec ->> 'id',
    nullif(concat_ws(':', rec ->> 'round_id', rec ->> 'group_id', rec ->> 'lot_id', rec ->> 'pair_id', rec ->> 'player_id', rec ->> 'hole', rec ->> 'auth_user_id'), ''),
    md5(rec::text)
  );
  tid := case
    when rec ? 'tournament_id' then (rec ->> 'tournament_id')::uuid
    when rec ? 'round_id' then public.round_tournament_id((rec ->> 'round_id')::uuid)
    when rec ? 'group_id' then public.group_tournament_id((rec ->> 'group_id')::uuid)
    when rec ? 'lot_id' then public.lot_tournament_id((rec ->> 'lot_id')::uuid)
    else null
  end;
  insert into public.audit_log (tournament_id, table_name, row_id, actor_auth_user_id, actor_player_id, action, before, after, reason)
  values (
    tid, tg_table_name, rid, auth.uid(), public.current_player_id(), tg_op,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end,
    case when tg_op in ('INSERT', 'UPDATE') then rec ->> 'reason' end
  );
  return coalesce(new, old);
end;
$$;
