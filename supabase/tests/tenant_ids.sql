-- 0030 (DB-12, SEC-05): the tenant id on every child table, my_tournament_ids()
-- and the set-based reads. On the two-tenant seed plus harness/tenant_fixture.sql
-- (tournament A: org_a, Ana on dev_a, Beto the admin player, Eva in another
-- group; B: org_b, Dani on a confirmed account, Protegido; the platform
-- admin). What every identity may read and write, before and after 0030, is
-- tenant_write_matrix.sql; this file checks what 0030 itself adds. Rolled
-- back at the end; prints one «ok» line per check.
\set ON_ERROR_STOP 1
\set QUIET 1
\pset tuples_only on
\pset format unaligned
select id as org_a from harness.seed where key = 'org_a' \gset
select id as org_b from harness.seed where key = 'org_b' \gset
select id as dev_a from harness.seed where key = 'dev_a' \gset
select id as dev_x from harness.seed where key = 'dev_x' \gset
select id as padmin from harness.seed where key = 'platform_admin' \gset
select id as t_a from harness.seed where key = 'tournament_a' \gset
select id as t_b from harness.seed where key = 'tournament_b' \gset
select id as ana from harness.seed where key = 'player_a1' \gset
select id as beto from harness.seed where key = 'player_a2' \gset
select id as carla from harness.seed where key = 'player_b1' \gset
select id as dani from harness.seed where key = 'player_b2' \gset
select id as r_a from harness.seed where key = 'round_a1' \gset
select id as r_b from harness.seed where key = 'round_b1' \gset
select id as g_a from harness.seed where key = 'group_a1' \gset
select id as g_b from harness.seed where key = 'group_b1' \gset
begin;
\ir harness/tenant_fixture.sql

-- patch: what a copy of one of the table's rows changes so its own key is new (for section 5).
create temp table child (tbl text, col text, parent text, patch jsonb);
insert into child values
  ('groups', 'round_id', 'rounds', jsonb_build_object('id', gen_random_uuid(), 'number', 17)),
  ('group_members', 'group_id', 'groups', jsonb_build_object('player_id', 'a0000000-0000-4000-8000-000000000006')),
  ('round_tees', 'round_id', 'rounds', jsonb_build_object('player_id', 'a0000000-0000-4000-8000-000000000006')),
  ('scores', 'round_id', 'rounds', jsonb_build_object('id', gen_random_uuid(), 'hole', 2, 'player_id', 'a0000000-0000-4000-8000-000000000006')),
  ('snake_tiebreaks', 'round_id', 'rounds', jsonb_build_object('hole', 17)),
  ('card_signatures', 'round_id', 'rounds', jsonb_build_object('pair_id', 'a2000000-0000-4000-8000-000000000001')),
  ('handicap_overrides', 'round_id', 'rounds', jsonb_build_object('player_id', 'a0000000-0000-4000-8000-000000000006')),
  ('hole_awards', 'round_id', 'rounds', jsonb_build_object('hole', 17)),
  ('photos', 'round_id', 'rounds', jsonb_build_object('id', gen_random_uuid())),
  ('calcutta_bids', 'lot_id', 'calcutta_lots', jsonb_build_object('id', gen_random_uuid())),
  ('calcutta_buybacks', 'lot_id', 'calcutta_lots', jsonb_build_object('lot_id', 'a5000000-0000-4000-8000-000000000002'));
insert into public.card_signatures (round_id, pair_id, signed_by) values
  (:'r_a', 'a2000000-0000-4000-8000-000000000002', :'ana'), (:'r_b', 'b2000000-0000-4000-8000-000000000002', :'carla');

-- A call whose refusal is the answer: the row count, or the SQLSTATE.
create function pg_temp.try(q text) returns text language plpgsql as $fn$
declare
  n bigint;
begin
  execute q;
  get diagnostics n = row_count;
  return n::text;
exception when others then
  return sqlstate;
end
$fn$;
grant execute on function pg_temp.try(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 1. The column: on every child table, NOT NULL, held to the parent's tournament
-- ---------------------------------------------------------------------------
create function pg_temp.shape() returns table (tbl text, not_null boolean, fkey text, has_index boolean, has_trigger boolean, rows bigint, wrong bigint)
language plpgsql as $fn$
declare
  c record;
  n bigint;
  bad bigint;
begin
  for c in select * from pg_temp.child order by tbl loop
    execute format('select count(*), count(*) filter (where x.tournament_id is distinct from p.tournament_id) from public.%I x left join public.%I p on p.id = x.%I',
      c.tbl, c.parent, c.col) into n, bad;
    return query select c.tbl,
      (select a.attnotnull from pg_attribute a where a.attrelid = format('public.%I', c.tbl)::regclass and a.attname = 'tournament_id'),
      (select pg_get_constraintdef(k.oid) from pg_constraint k where k.conrelid = format('public.%I', c.tbl)::regclass and k.conname = c.tbl || '_tenant_fkey'),
      exists (select 1 from pg_index i where i.indrelid = format('public.%I', c.tbl)::regclass
              and (select array_agg(a.attname::text order by k.ord) from unnest(i.indkey) with ordinality k(attnum, ord) join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.attnum) = array['tournament_id', c.col]),
      exists (select 1 from pg_trigger t where t.tgrelid = format('public.%I', c.tbl)::regclass and t.tgname = c.tbl || '_tenant' and t.tgenabled = 'O'),
      n, bad;
  end loop;
end
$fn$;
create temp table shape as select * from pg_temp.shape();
select harness.check((select count(*) from shape) = 11 and (select bool_and(not_null) from shape), 'tournament_id is NOT NULL on all 11 child tables');
select harness.check((select bool_and(fkey = format('FOREIGN KEY (tournament_id, %s) REFERENCES %s(tournament_id, id) ON UPDATE CASCADE ON DELETE CASCADE', c.col, c.parent)) from shape s join child c using (tbl)),
  'each is held to its parent by a composite key (tournament_id, parent) → parent (tournament_id, id), cascading like the parent key');
select harness.check((select bool_and(has_index and has_trigger) from shape), 'each has its (tournament_id, parent) index and its BEFORE trigger');
select harness.check((select sum(wrong) from shape) = 0 and (select sum(rows) from shape) >= 30,
  'no child row names another tournament than its parent''s (' || (select sum(rows) from shape) || ' rows)');
select harness.check(not exists (
    select 1 from pg_trigger t join pg_temp.child c on t.tgrelid = format('public.%I', c.tbl)::regclass
    where not t.tgisinternal and t.tgenabled <> 'O'),
  'every user trigger on those tables is on again after the backfill');

-- ---------------------------------------------------------------------------
-- 2. my_tournament_ids() is is_tournament_member, as a set
-- ---------------------------------------------------------------------------
-- One more identity: a co-organizer (role admin) of A whose phone holds a PIN claim in B.
insert into auth.users (id, email, email_confirmed_at, is_anonymous, raw_app_meta_data, raw_user_meta_data) values
  ('c0000000-0000-4000-8000-0000000000c1', 'co@polo.test', now(), false, '{"provider":"email","providers":["email"]}', '{}');
insert into public.tournament_organizers (tournament_id, auth_user_id, role) values (:'t_a', 'c0000000-0000-4000-8000-0000000000c1', 'admin');
insert into public.device_sessions (auth_user_id, player_id, tournament_id) values ('c0000000-0000-4000-8000-0000000000c1', 'b0000000-0000-4000-8000-000000000005', :'t_b');
insert into pg_temp.who values (11, 'acc_co', 'authenticated', harness.claims('c0000000-0000-4000-8000-0000000000c1'));
-- A third tournament nobody here is in, so «all of them» means something.
insert into public.tournaments (name, slug, join_code, settings) values ('Tercero', 'tercero-harness', 'ZZZ999', (select settings from public.tournaments where id = :'t_a'));

create function pg_temp.ids_match() returns table (who text, mine uuid[], member uuid[]) language plpgsql as $fn$
#variable_conflict use_variable
declare
  w record;
  mine uuid[];
begin
  for w in select * from pg_temp.who where role = 'authenticated' order by ord loop
    perform set_config('request.jwt.claims', w.claims, true);
    execute 'set local role authenticated';
    mine := (select coalesce(array_agg(x order by x), '{}') from unnest(public.my_tournament_ids()) x);
    reset role;
    -- As postgres: every tournament is weighed, not only the ones the new read policy shows.
    return query select w.name, mine,
      (select coalesce(array_agg(t.id order by t.id), '{}') from public.tournaments t where public.is_tournament_member(t.id));
  end loop;
end
$fn$;
create temp table ids as select * from pg_temp.ids_match();
select format('ids differ: %s mine=%s member=%s', who, mine, member) from ids where mine is distinct from member;
select harness.check((select count(*) from ids) = 10 and not exists (select 1 from ids where mine is distinct from member),
  'my_tournament_ids() lists exactly the tournaments is_tournament_member answers true for, for all 10 signed-in identities');
select harness.check((select cardinality(mine) from ids where who = 'acc_co') = 2 and (select cardinality(mine) from ids where who = 'padmin') = 3
    and (select mine from ids where who = 'acc_pending') = '{}' and (select mine from ids where who = 'dev_x') = '{}',
  'an organizer with a claim elsewhere is in both, the platform admin in all three, a pending link and an unclaimed phone in none');
set local role anon;
select pg_temp.try('select public.my_tournament_ids()') as anon_call \gset
reset role;
select harness.check(:'anon_call' = '42501', 'anon may not call it (the read policies are for signed-in roles; anon read nothing before either): ' || :'anon_call');

-- ---------------------------------------------------------------------------
-- 3. One helper call per statement, whatever the row count
-- ---------------------------------------------------------------------------
update public.rounds set status = 'live' where id in (:'r_a', :'r_b');
insert into public.scores (round_id, player_id, hole, strokes, putts, picked_up)
  select :'r_a', p.id, h, 4, 2, false from public.players p, generate_series(3, 18) h where p.tournament_id = :'t_a';
set local track_functions = 'all';
select set_config('request.jwt.claims', harness.claims(:'dev_a'), true) \g /dev/null
set local role authenticated;
select count(*) as rows_read from public.scores where round_id = :'r_a' \gset
reset role;
select coalesce(sum(calls), 0) as calls from pg_stat_xact_user_functions where schemaname = 'public' \gset
select harness.check(:rows_read >= 90 and :calls <= 3, 'a player reads ' || :rows_read || ' scores with ' || :calls || ' helper calls (was about 15 a row)');

-- ---------------------------------------------------------------------------
-- 4. A tenant that disagrees with the parent never goes in
-- ---------------------------------------------------------------------------
create temp table wrong_tenant as
  select c.tbl,
    pg_temp.try(format('update public.%I set tournament_id = %L where tournament_id = %L', c.tbl, :'t_b', :'t_a')) as upd,
    pg_temp.try(format('insert into public.%1$I select (jsonb_populate_record(null::public.%1$I, to_jsonb(x) || %2$L::jsonb || jsonb_build_object(''tournament_id'', %3$L))).* from public.%1$I x where x.tournament_id = %4$L limit 1',
      c.tbl, c.patch, :'t_b', :'t_a')) as ins
  from child c;
select format('%s: update %s, insert %s', tbl, upd, ins) from wrong_tenant where upd <> '23503' or ins <> '23503';
select harness.check(not exists (select 1 from wrong_tenant where upd <> '23503' or ins <> '23503'),
  'on every child table, as postgres (no policy in the way), a row naming another tournament than its parent''s is refused by the key (23503), on insert and on update');
select set_config('request.jwt.claims', harness.claims(:'org_a'), true) \g /dev/null
set local role authenticated;
select pg_temp.try(format('insert into public.groups (tournament_id, round_id, number, tee_time, start_hole) values (%L, %L, 8, ''11:30'', 1)', :'t_b', :'r_a')) as org_forged,
       pg_temp.try(format('insert into public.groups (tournament_id, round_id, number, tee_time, start_hole) values (%L, %L, 8, ''11:30'', 1)', :'t_a', :'r_a')) as org_named \gset
reset role;
select harness.check(:'org_forged' = '23503' and :'org_named' = '1', 'the Comité naming another tournament on its own group is refused; naming its own is taken: ' || :'org_forged' || ' / ' || :'org_named');

-- ---------------------------------------------------------------------------
-- 5. The trigger fills the tenant when a writer leaves it out
-- ---------------------------------------------------------------------------
-- As the phone does: a player of the group writes a score, and upserts it again.
select set_config('request.jwt.claims', harness.claims(:'dev_a'), true) \g /dev/null
set local role authenticated;
insert into public.scores (round_id, player_id, hole, strokes, putts, picked_up, client_ts)
  values (:'r_a', :'beto', 2, 3, 1, false, now()) returning tournament_id as phone_tid \gset
insert into public.scores (round_id, player_id, hole, strokes, putts, picked_up, client_ts)
  values (:'r_a', :'beto', 2, 5, 2, false, now())
  on conflict (round_id, player_id, hole) do update set round_id = excluded.round_id, player_id = excluded.player_id, hole = excluded.hole,
    strokes = excluded.strokes, putts = excluded.putts, picked_up = excluded.picked_up, client_ts = excluded.client_ts
  returning tournament_id as upsert_tid, strokes as upsert_strokes \gset
select pg_temp.try(format('insert into public.scores (tournament_id, round_id, player_id, hole, strokes, putts, picked_up) values (%L, %L, %L, 2, 4, 2, false)', :'t_a', :'r_a', :'beto')) as phone_names_tid \gset
reset role;
select harness.check(:'phone_tid' = :'t_a', 'a phone''s score, sent without the tenant as every bundle sends it, lands with its round''s tournament');
select harness.check(:'upsert_tid' = :'t_a' and :'upsert_strokes' = '5', 'an upsert''s update path (no BEFORE INSERT trigger) keeps it');
select harness.check(:'phone_names_tid' = '42501', 'a phone cannot write scores.tournament_id itself (no column grant, like reason and disputed): ' || :'phone_names_tid');
-- Every child table, without the tenant, as the Comité writes them.
select set_config('request.jwt.claims', harness.claims(:'org_a'), true) \g /dev/null
set local role authenticated;
create temp table filled (tbl text, tid uuid);
grant insert on pg_temp.filled to authenticated;
with x as (insert into public.groups (round_id, number, tee_time, start_hole) values (:'r_a', 7, '11:00', 1) returning tournament_id, id)
  insert into pg_temp.filled select 'groups', tournament_id from x;
with x as (insert into public.group_members (group_id, player_id) values ('a1000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000006') returning tournament_id)
  insert into pg_temp.filled select 'group_members', tournament_id from x;
with x as (insert into public.round_tees (round_id, player_id, tee_id) values (:'r_a', 'a0000000-0000-4000-8000-000000000003', 'a4000000-0000-4000-8000-000000000001') returning tournament_id)
  insert into pg_temp.filled select 'round_tees', tournament_id from x;
with x as (insert into public.snake_tiebreaks (round_id, group_id, hole, last_holed_player_id, decided_by) values (:'r_a', :'g_a', 5, :'beto', :'ana') returning tournament_id)
  insert into pg_temp.filled select 'snake_tiebreaks', tournament_id from x;
with x as (insert into public.handicap_overrides (round_id, player_id, playing_hcp, reason, "by") values (:'r_a', 'a0000000-0000-4000-8000-000000000003', 8, 'motivo', :'ana') returning tournament_id)
  insert into pg_temp.filled select 'handicap_overrides', tournament_id from x;
with x as (insert into public.hole_awards (round_id, group_id, hole, game_id, player_id, decided_by) values (:'r_a', null, 4, 'closest', :'beto', :'ana') returning tournament_id)
  insert into pg_temp.filled select 'hole_awards', tournament_id from x;
with x as (insert into public.photos (round_id, player_id, hole, url) values (:'r_a', :'beto', 4, 'https://x.test/4.jpg') returning tournament_id)
  insert into pg_temp.filled select 'photos', tournament_id from x;
with x as (insert into public.calcutta_bids (lot_id, bidder_id, amount) values ('a5000000-0000-4000-8000-000000000002', :'ana', 250) returning tournament_id)
  insert into pg_temp.filled select 'calcutta_bids', tournament_id from x;
with x as (insert into public.calcutta_buybacks (lot_id, pct, amount) values ('a5000000-0000-4000-8000-000000000002', 10, 25) returning tournament_id)
  insert into pg_temp.filled select 'calcutta_buybacks', tournament_id from x;
reset role;
select set_config('request.jwt.claims', harness.claims('c0000000-0000-4000-8000-0000000000b1'), true) \g /dev/null
set local role authenticated;
-- Beto (admin player) signs the other pair's card: the signature path.
delete from public.card_signatures where round_id = :'r_a' and pair_id = 'a2000000-0000-4000-8000-000000000002';
reset role;
select set_config('request.jwt.claims', harness.claims(:'dev_a'), true) \g /dev/null
set local role authenticated;
with x as (insert into public.card_signatures (round_id, pair_id, signed_by) values (:'r_a', 'a2000000-0000-4000-8000-000000000002', :'ana') returning tournament_id)
  insert into pg_temp.filled select 'card_signatures', tournament_id from x;
reset role;
insert into pg_temp.filled select 'scores', :'phone_tid'::uuid;
select harness.check((select count(distinct tbl) from filled) = 11 and (select bool_and(tid = :'t_a') from filled),
  'all 11 child tables fill the tenant from the parent on insert (the Comité''s writes, a phone''s signature and score)');

-- ---------------------------------------------------------------------------
-- 6. Moves keep it true: a row moved to another parent, a round moved to another tournament
-- ---------------------------------------------------------------------------
savepoint moves;
update public.scores set round_id = :'r_b', player_id = :'carla', hole = 16 where round_id = :'r_a' and player_id = :'ana' and hole = 3;
select harness.check((select tournament_id from public.scores where round_id = :'r_b' and hole = 16) = :'t_b', 'a score moved to another tournament''s round takes that tournament with it');
insert into public.rounds (id, tournament_id, number, holes) values ('a7000000-0000-4000-8000-000000000001', :'t_a', 9, 18);
insert into public.groups (id, round_id, number) values ('a7100000-0000-4000-8000-000000000001', 'a7000000-0000-4000-8000-000000000001', 1);
insert into public.group_members (group_id, player_id) values ('a7100000-0000-4000-8000-000000000001', :'ana');
insert into public.scores (round_id, player_id, hole, strokes, putts, picked_up) values ('a7000000-0000-4000-8000-000000000001', :'ana', 1, 4, 2, false);
update public.rounds set tournament_id = :'t_b' where id = 'a7000000-0000-4000-8000-000000000001';
select harness.check((select tournament_id from public.groups where id = 'a7100000-0000-4000-8000-000000000001') = :'t_b'
    and (select tournament_id from public.group_members where group_id = 'a7100000-0000-4000-8000-000000000001') = :'t_b'
    and (select tournament_id from public.scores where round_id = 'a7000000-0000-4000-8000-000000000001') = :'t_b',
  'a round moved to another tournament carries its groups, their members and its scores (the keys cascade), as the old schema let it');
rollback to savepoint moves;

-- ---------------------------------------------------------------------------
-- 7. restore_tournament: a backup's tenant ids must be this tournament's; a backup from before 0030 still restores
-- ---------------------------------------------------------------------------
create function pg_temp.backup(t uuid, strip boolean) returns jsonb language sql stable as $fn$
  with rs as (select id from public.rounds where tournament_id = t),
       gs as (select id from public.groups where round_id in (select id from rs)),
       ls as (select id from public.calcutta_lots where tournament_id = t),
       tm as (select id from public.teams where tournament_id = t),
       kid as (select x - case when strip then 'tournament_id' else '' end as r, tbl from (
         select to_jsonb(x) as x, 'groups' as tbl from public.groups x where round_id in (select id from rs)
         union all select to_jsonb(x), 'group_members' from public.group_members x where group_id in (select id from gs)
         union all select to_jsonb(x), 'round_tees' from public.round_tees x where round_id in (select id from rs)
         union all select to_jsonb(x), 'scores' from public.scores x where round_id in (select id from rs)
         union all select to_jsonb(x), 'snake_tiebreaks' from public.snake_tiebreaks x where round_id in (select id from rs)
         union all select to_jsonb(x), 'card_signatures' from public.card_signatures x where round_id in (select id from rs)
         union all select to_jsonb(x), 'handicap_overrides' from public.handicap_overrides x where round_id in (select id from rs)
         union all select to_jsonb(x), 'hole_awards' from public.hole_awards x where round_id in (select id from rs)
         union all select to_jsonb(x), 'calcutta_bids' from public.calcutta_bids x where lot_id in (select id from ls)
         union all select to_jsonb(x), 'calcutta_buybacks' from public.calcutta_buybacks x where lot_id in (select id from ls)) k)
  select jsonb_build_object('version', 1, 'exportedAt', now(), 'tournamentId', t, 'slug', 'harness', 'tables',
    jsonb_build_object(
      'tournaments', (select jsonb_agg(to_jsonb(x)) from public.tournaments x where x.id = t),
      'players', coalesce((select jsonb_agg(to_jsonb(x)) from public.players x where tournament_id = t), '[]'),
      'rounds', coalesce((select jsonb_agg(to_jsonb(x)) from public.rounds x where tournament_id = t), '[]'),
      'pairs', coalesce((select jsonb_agg(to_jsonb(x)) from public.pairs x where tournament_id = t), '[]'),
      'teams', coalesce((select jsonb_agg(to_jsonb(x)) from public.teams x where tournament_id = t), '[]'),
      'team_members', coalesce((select jsonb_agg(to_jsonb(x)) from public.team_members x where team_id in (select id from tm)), '[]'),
      'calcutta_lots', coalesce((select jsonb_agg(to_jsonb(x)) from public.calcutta_lots x where tournament_id = t), '[]'),
      'payments', coalesce((select jsonb_agg(to_jsonb(x)) from public.payments x where tournament_id = t), '[]'),
      'money_adjustments', coalesce((select jsonb_agg(to_jsonb(x)) from public.money_adjustments x where tournament_id = t), '[]'),
      'game_entries', coalesce((select jsonb_agg(to_jsonb(x)) from public.game_entries x where tournament_id = t), '[]'),
      'game_results', coalesce((select jsonb_agg(to_jsonb(x)) from public.game_results x where tournament_id = t), '[]'))
    || coalesce((select jsonb_object_agg(tbl, rows) from (select tbl, jsonb_agg(r) as rows from kid group by tbl) g), '{}'))
$fn$;
create function pg_temp.restore(t uuid, b jsonb) returns text language plpgsql as $fn$
begin
  perform public.restore_tournament(t, b);
  return 'restored';
exception when others then
  return sqlstate || ' ' || sqlerrm;
end
$fn$;
grant execute on function pg_temp.restore(uuid, jsonb) to authenticated;
create temp table bk as select pg_temp.backup(:'t_a', false) as full_b, pg_temp.backup(:'t_a', true) as old_b;
create temp table kids_before as
  select tbl, count(*) as n from (
    select 'groups' tbl from public.groups where tournament_id = :'t_a' union all select 'group_members' from public.group_members where tournament_id = :'t_a'
    union all select 'scores' from public.scores where tournament_id = :'t_a' union all select 'calcutta_bids' from public.calcutta_bids where tournament_id = :'t_a') z group by tbl;
create temp table forged as
  select k as tbl, jsonb_set(b.full_b, array['tables', k, '0', 'tournament_id'], to_jsonb(:'t_b'::text)) as b
  from bk b, unnest(array['groups', 'group_members', 'round_tees', 'scores', 'snake_tiebreaks', 'card_signatures', 'handicap_overrides', 'hole_awards', 'calcutta_bids', 'calcutta_buybacks']) k
  where jsonb_array_length(b.full_b -> 'tables' -> k) > 0;
grant select on pg_temp.forged, pg_temp.bk to authenticated;
select set_config('request.jwt.claims', harness.claims(:'org_a'), true) \g /dev/null
set local role authenticated;
create temp table forged_out as select tbl, pg_temp.restore(:'t_a', b) as out from pg_temp.forged;
select pg_temp.restore(:'t_a', (select old_b from pg_temp.bk)) as old_out \gset
reset role;
select format('%s: %s', tbl, out) from forged_out where out <> '22023 El respaldo tiene filas de otro torneo';
select harness.check((select count(*) from forged_out) = 10 and not exists (select 1 from forged_out where out <> '22023 El respaldo tiene filas de otro torneo'),
  'a backup whose child row names tournament B is refused whole (22023), on each of the 10 child tables a backup carries');
select harness.check(:'old_out' = 'restored', 'a backup from before 0030 (no tenant on the child rows) restores: ' || :'old_out');
select harness.check(not exists (
    select 1 from kids_before k where k.n <> case k.tbl
      when 'groups' then (select count(*) from public.groups where tournament_id = :'t_a')
      when 'group_members' then (select count(*) from public.group_members where tournament_id = :'t_a')
      when 'scores' then (select count(*) from public.scores where tournament_id = :'t_a')
      when 'calcutta_bids' then (select count(*) from public.calcutta_bids where tournament_id = :'t_a') end)
    and (select sum(wrong) from pg_temp.shape()) = 0,
  'and every child row comes back with tournament A as its tenant, none astray');

rollback;
