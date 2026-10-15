-- 0063: the Comité finds a hole's story in Historial (TRUST-19).
--
-- Historial was the whole tournament, newest first, fifty at a time, with one switch («Solo cambios del Admin de
-- Polo») that filtered only the pages already read: at the dinner, finding «hoyo 7 de Diego» meant paging back
-- through hundreds of lines. tournament_audit now takes a filter, applied before the page is cut, so paging by id
-- stays exact:
--   player       his rows (a score, his lot, his bids, his pairs, his payments, his game entries) and his own row
--   round        that day's rows and the day itself
--   hole         rows that are of that hole (scores, snake answers, contest claims)
--   corrections  the Comité's decisions on holes: a score whose reason is the Comité's, or a score it deleted
--   platform     what the Admin de Polo did (the switch, now over the whole history)
-- A filter it can't read is no filter (never an error): an older bundle sends none and gets what it always got.
-- The images also leave out three more account ids (created_by, voided_by, and players.profile_id, which is the
-- profile's account), and an organizer's row is no longer named by its account (audit_row keys a row with no id
-- of its own by its columns, an account among them): 0050 promised the history never names an account, and those
-- slipped through.
--
-- The old three-argument function goes: a call with three named arguments reaches this one through the default,
-- and two overloads would make PostgREST refuse every call (PGRST203).

drop function if exists public.tournament_audit(uuid, bigint, int);

create or replace function public.tournament_audit(p_tournament_id uuid, p_before bigint default null, p_limit int default 50, p_filter jsonb default null)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  f jsonb := case when jsonb_typeof(p_filter) = 'object' then p_filter else '{}'::jsonb end;
  f_player text := public.try_uuid(f ->> 'player')::text;
  f_round text := public.try_uuid(f ->> 'round')::text;
  f_hole text := case when jsonb_typeof(f -> 'hole') = 'number' and (f ->> 'hole') ~ '^[0-9]{1,2}$' then f ->> 'hole' end;
  -- A key left out is false, not null: `not null` would drop every row.
  f_corrections boolean := coalesce((f -> 'corrections') = 'true'::jsonb, false);
  f_platform boolean := coalesce((f -> 'platform') = 'true'::jsonb, false);
  -- Never in an image: secrets, and every account id (0050's two, and the three it missed).
  hidden text[] := array['pin_hash', 'token_hash', 'p256dh', 'auth', 'endpoint', 'auth_user_id', 'released_by', 'created_by', 'voided_by', 'profile_id'];
begin
  if not public.is_tournament_organizer(p_tournament_id) then
    raise exception 'Solo el Comité ve el historial' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      -- An organizer's row has no id of its own: audit_row keys it by its account, which is no one's to see.
      'id', a.id, 'at', a.at, 'table', a.table_name, 'action', a.action,
      'rowId', case when a.table_name = 'tournament_organizers' then null else a.row_id end,
      'platform', a.actor_platform,
      'actor', case when a.actor_platform then null else coalesce(pl.display_name, pr.display_name) end,
      'phone', case when not a.actor_platform and ph.total > 1 then jsonb_build_object('n', ph.n, 'of', ph.total, 'kind', ph.platform) end,
      'reason', a.reason,
      'before', a.before - hidden,
      'after', a.after - hidden
    ) order by a.id desc)
    from (
      select l.* from public.audit_log l
      cross join lateral (select coalesce(l.after, l.before) as rec) r
      where l.tournament_id = p_tournament_id and (p_before is null or l.id < p_before)
        and (f_player is null
             or (l.table_name = 'players' and l.row_id = f_player)
             or f_player in (r.rec ->> 'player_id', r.rec ->> 'player1_id', r.rec ->> 'player2_id', r.rec ->> 'from_player_id',
                             r.rec ->> 'to_player_id', r.rec ->> 'owner_id', r.rec ->> 'bidder_id'))
        and (f_round is null or (l.table_name = 'rounds' and l.row_id = f_round) or r.rec ->> 'round_id' = f_round)
        and (f_hole is null or (l.table_name in ('scores', 'snake_tiebreaks', 'hole_awards') and r.rec ->> 'hole' = f_hole))
        and (not f_corrections or (l.table_name = 'scores' and (l.action = 'DELETE' or (l.after ->> 'reason') is not null)))
        and (not f_platform or l.actor_platform)
      order by l.id desc
      limit least(greatest(coalesce(p_limit, 50), 1), 200)
    ) a
    left join public.players pl on pl.id = a.actor_player_id
    left join public.profiles pr on pr.id = a.actor_auth_user_id
    left join public.tournament_phones(p_tournament_id) ph on ph.player_id = a.actor_player_id and ph.auth_user_id = a.actor_auth_user_id
  ), '[]'::jsonb);
end;
$$;
comment on function public.tournament_audit(uuid, bigint, int, jsonb) is
  'The Comité''s history of its tournament, newest first, paged by id; p_filter narrows it by player, round, hole, the Comité''s corrections or the Admin de Polo (TRUST-19).';
revoke execute on function public.tournament_audit(uuid, bigint, int, jsonb) from public, anon;
grant execute on function public.tournament_audit(uuid, bigint, int, jsonb) to authenticated, service_role;
