\set QUIET 1
\pset footer off
select id as r_a1 from harness.seed where key = 'round_a1' \gset
select id as r_a2 from harness.seed where key = 'v11_round_a2' \gset
select id as dev_a from harness.seed where key = 'dev_a' \gset
select id as org_a from harness.seed where key = 'org_a' \gset
create or replace function pg_temp.exec_ms(q text) returns numeric language plpgsql as $$
declare t0 timestamptz; n int; best numeric := 1e9; i int; ms numeric;
begin
  for i in 1..5 loop
    t0 := clock_timestamp();
    execute 'select count(*) from (' || q || ') x' into n;
    ms := extract(epoch from clock_timestamp() - t0) * 1000;
    if ms < best then best := ms; end if;
  end loop;
  return round(best, 1);
end $$;
\set q 'select * from public.scores where round_id in (''' :r_a1 ''', ''' :r_a2 ''') order by id limit 1000 offset 0'
\echo 'query:' :q
\unset QUIET
-- (a) no RLS (postgres, superuser)
select 'postgres (RLS bypassed)' as who, pg_temp.exec_ms(:'q') as best_of_5_ms, (select count(*) from public.scores where round_id in (:'r_a1', :'r_a2')) as rows_visible;
-- (b) anon
begin; set local role anon;
select 'anon (public key, no session)' as who, pg_temp.exec_ms(:'q') as best_of_5_ms, (select count(*) from public.scores where round_id in (:'r_a1', :'r_a2')) as rows_visible;
rollback;
-- (c) claimed device (a player's phone)
begin; select set_config('request.jwt.claims', harness.claims(:'dev_a'), true) \g /dev/null
set local role authenticated;
select 'device claimed as Ana (player)' as who, pg_temp.exec_ms(:'q') as best_of_5_ms, (select count(*) from public.scores where round_id in (:'r_a1', :'r_a2')) as rows_visible;
rollback;
-- (d) organizer account
begin; select set_config('request.jwt.claims', harness.claims(:'org_a'), true) \g /dev/null
set local role authenticated;
select 'organizer A (account)' as who, pg_temp.exec_ms(:'q') as best_of_5_ms, (select count(*) from public.scores where round_id in (:'r_a1', :'r_a2')) as rows_visible;
rollback;
-- (e) EXPLAIN ANALYZE as the player's device
begin; select set_config('request.jwt.claims', harness.claims(:'dev_a'), true) \g /dev/null
set local role authenticated;
explain (analyze, costs off, timing on, summary on) select * from public.scores where round_id in (:'r_a1', :'r_a2') order by id limit 1000 offset 0;
rollback;
