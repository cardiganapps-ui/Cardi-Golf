-- SEC-11 (0057): a row of a tournament names only that tournament's players. On the two-tenant seed: org_a runs
-- tournament A (Ana), org_b runs B (Carla). Rolled back at the end; prints one «ok» line per check.
\set ON_ERROR_STOP 1
\set QUIET 1
\pset tuples_only on
\pset format unaligned
select id as org_a from harness.seed where key = 'org_a' \gset
select id as t_a from harness.seed where key = 'tournament_a' \gset
select id as r_a from harness.seed where key = 'round_a1' \gset
select id as ana from harness.seed where key = 'player_a1' \gset
select id as carla from harness.seed where key = 'player_b1' \gset
begin;
select set_config('harness.r_a', :'r_a', true), set_config('harness.carla', :'carla', true) \g /dev/null

create function pg_temp.as_user(uid uuid, q text) returns text language plpgsql as $$
declare
  r text;
begin
  perform set_config('request.jwt.claims', harness.claims(uid), true);
  set local role authenticated;
  execute q into r;
  reset role;
  return coalesce(r, 'null');
exception when others then
  reset role;
  return sqlstate || ' ' || sqlerrm;
end $$;

-- 1. Every key from a tournament's table to players carries the tournament: a table added later can't miss it.
select harness.check(not exists (
  select 1 from pg_constraint c
  where c.contype = 'f' and c.confrelid = 'public.players'::regclass and c.connamespace = 'public'::regnamespace
    and exists (select 1 from pg_attribute a where a.attrelid = c.conrelid and a.attname = 'tournament_id' and not a.attisdropped)
    and not exists (select 1 from pg_attribute a where a.attrelid = c.conrelid and a.attnum = any (c.conkey) and a.attname = 'tournament_id')
), 'every key from a tournament''s table to players includes the tournament');
select harness.check((select count(*) from pg_constraint c where c.contype = 'f' and c.confrelid = 'public.players'::regclass and array_length(c.conkey, 1) = 2) >= 34,
  'the keys are the composite ones (34 at 0057)');

-- 2. Tournament A's Comité can't attach a row of A to tournament B's player.
select harness.check(pg_temp.as_user(:'org_a', format(
  'insert into public.payments (tournament_id, from_player_id, amount, kind) values (%L, %L, 100, ''other'') returning ''inserted''', :'t_a', :'carla')) like '23503%',
  'a payment of tournament A can''t come from tournament B''s player');
select harness.check(pg_temp.as_user(:'org_a', format(
  'update public.scores set entered_by = %L where round_id = %L and player_id = %L returning ''moved''', :'carla', :'r_a', :'ana')) not like 'moved%',
  'a score of tournament A can''t name tournament B''s player as its writer');
select harness.check(pg_temp.as_user(:'org_a', format(
  'insert into public.handicap_overrides (round_id, player_id, playing_hcp, reason) values (%L, %L, 10, ''Prueba de llave'') returning ''inserted''', :'r_a', :'carla')) like '23503%',
  'a handicap override in A''s round can''t be for B''s player');

-- 3. Even the owner, with no policy in the way: the key itself refuses.
do $$
begin
  insert into public.scores (round_id, player_id, hole, strokes, putts, picked_up)
  values (current_setting('harness.r_a')::uuid, current_setting('harness.carla')::uuid, 18, 4, 2, false);
  raise exception 'inserted';
exception when foreign_key_violation then null;
end $$;
select harness.check(true, 'the database refuses a score in A''s round for B''s player, whoever writes it');

-- 4. Deleting a player still clears what names him: cascades, and a lot's owner set to null alone.
select id as beto from harness.seed where key = 'player_a2' \gset
insert into public.scores (round_id, player_id, hole, strokes, putts, picked_up) values (:'r_a', :'ana', 17, 5, 2, false)
  on conflict (round_id, player_id, hole) do nothing;
-- A sold lot written straight in (the auction's rules, 0048, are for the Comité's session; here only the key matters).
set local session_replication_role = replica;
insert into public.calcutta_lots (id, tournament_id, player_id, lot_number, status, price, owner_id, sold_at)
  values ('a5700000-0000-4000-8000-000000000001', :'t_a', :'beto', 57, 'sold', 500, :'ana', now());
set local session_replication_role = origin;
select harness.check((select count(*) from public.scores where player_id = :'ana') > 0, 'Ana has scores to clear and owns Beto''s lot');
delete from public.players where id = :'ana';
select harness.check(not exists (select 1 from public.scores where player_id = :'ana')
    and not exists (select 1 from public.group_members where player_id = :'ana')
    and (select tournament_id = :'t_a' and owner_id is null and player_id = :'beto' from public.calcutta_lots where id = 'a5700000-0000-4000-8000-000000000001'),
  'a deleted player''s scores and seats go, and a lot he owned keeps its tournament with no owner');

rollback;
