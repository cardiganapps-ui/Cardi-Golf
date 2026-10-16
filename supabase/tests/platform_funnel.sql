-- The north star and the organizer's funnel on Resumen (0067: STRAT-12), on
-- the two-tenant seed: org_a runs tournament A, org_b runs B, both with two
-- players and a scheduled day. Rows are added as the superuser (what the app
-- would have written); each call runs as the user who makes it. Rolled back
-- at the end; prints one «ok» line per check.
\set ON_ERROR_STOP 1
\set QUIET 1
\pset tuples_only on
\pset format unaligned
select id as org_a from harness.seed where key = 'org_a' \gset
select id as padmin from harness.seed where key = 'platform_admin' \gset
select id as t_a from harness.seed where key = 'tournament_a' \gset
select id as t_b from harness.seed where key = 'tournament_b' \gset
select id as r_a from harness.seed where key = 'round_a1' \gset
select id as ana from harness.seed where key = 'player_a1' \gset
begin;

create function pg_temp.try_funnel(days int) returns text language plpgsql as $$
begin
  return public.platform_funnel(days)::text;
exception when others then
  return sqlstate;
end $$;
create function pg_temp.step(f jsonb, k text) returns text language sql as $$
  select (s ->> 'tournaments') || '/' || (s ->> 'organizers') from jsonb_array_elements(f -> 'steps') s where s ->> 'key' = k
$$;
grant execute on all functions in schema pg_temp to anon, authenticated;

-- Only the platform admin reads it.
select set_config('request.jwt.claims', harness.claims(:'org_a'), true) \g /dev/null
set local role authenticated;
select pg_temp.try_funnel(90) as as_org \gset
reset role;
select harness.check(:'as_org' = '42501', 'an organizer cannot read the funnel: ' || :'as_org');
set local role anon;
select pg_temp.try_funnel(90) as as_anon \gset
reset role;
select harness.check(:'as_anon' = '42501', 'a browser without a session cannot read it: ' || :'as_anon');

-- The seed: two organizers, each with a field of two and nothing played.
select set_config('request.jwt.claims', harness.claims(:'padmin'), true) \g /dev/null
set local role authenticated;
select pg_temp.try_funnel(90) as f0 \gset
reset role;
select harness.check(pg_temp.step(:'f0'::jsonb, 'created') = '2/2' and pg_temp.step(:'f0'::jsonb, 'field') = '2/2'
  and pg_temp.step(:'f0'::jsonb, 'played') = '0/0' and (:'f0'::jsonb ->> 'northStar') = '0' and (:'f0'::jsonb ->> 'organizers') = '2',
  'the seed reads two tournaments created with a field, none played: ' || :'f0');
select harness.check((:'f0'::jsonb -> 'steps' -> 0 ->> 'key') = 'created' and (:'f0'::jsonb -> 'steps' -> 5 ->> 'key') = 'finished'
  and jsonb_array_length(:'f0'::jsonb -> 'steps') = 6, 'the steps come in order, created to Terminado');

-- Out of the count: a practice tournament, a Ronda rápida and one the platform admin made.
insert into public.tournaments (slug, name, join_code, created_by, counts_for_stats)
  values ('funnel-ensayo', 'Ensayo', 'FUNENS', :'org_a', false);
insert into public.tournaments (slug, name, join_code, created_by, quick)
  values ('funnel-rapida', 'Rápida', 'FUNRAP', :'org_a', true);
insert into public.tournaments (slug, name, join_code, created_by)
  values ('funnel-admin', 'Del admin', 'FUNADM', :'padmin');
-- And one created before the window.
insert into public.tournaments (slug, name, join_code, created_by, created_at)
  values ('funnel-viejo', 'Viejo', 'FUNVIE', :'org_a', now() - interval '120 days');
select set_config('request.jwt.claims', harness.claims(:'padmin'), true) \g /dev/null
set local role authenticated;
select pg_temp.try_funnel(90) as f1 \gset
select pg_temp.try_funnel(365) as f1y \gset
reset role;
select harness.check(pg_temp.step(:'f1'::jsonb, 'created') = '2/2',
  'practice, Ronda rápida and the admin''s own are left out: ' || pg_temp.step(:'f1'::jsonb, 'created'));
select harness.check(pg_temp.step(:'f1y'::jsonb, 'created') = '3/2' and (:'f1y'::jsonb ->> 'days') = '365',
  'a wider window takes the older one: ' || pg_temp.step(:'f1y'::jsonb, 'created'));

-- Tournament A plays: a day in play, a hole, a signature, Terminado, but with two players.
update public.rounds set status = 'live' where id = :'r_a';
insert into public.scores (round_id, player_id, hole, strokes, putts) values (:'r_a', :'ana', 1, 4, 2);
insert into public.card_signatures (round_id, player_id, signed_by) values (:'r_a', :'ana', :'ana');
update public.rounds set status = 'finished' where id = :'r_a';
update public.tournaments set status = 'finished' where id = :'t_a';
select set_config('request.jwt.claims', harness.claims(:'padmin'), true) \g /dev/null
set local role authenticated;
select pg_temp.try_funnel(90) as f2 \gset
reset role;
select harness.check(pg_temp.step(:'f2'::jsonb, 'played') = '1/1' and pg_temp.step(:'f2'::jsonb, 'scored') = '1/1'
  and pg_temp.step(:'f2'::jsonb, 'signed') = '1/1' and pg_temp.step(:'f2'::jsonb, 'finished') = '1/1' and (:'f2'::jsonb ->> 'finished') = '1',
  'tournament A reaches every step: ' || :'f2');
select harness.check((:'f2'::jsonb ->> 'northStar') = '0', 'two players and one phone are not a tournament closed to the peso');

-- Eight players and holes from three sessions make it count.
insert into public.players (tournament_id, full_name, display_name, sort_order)
  select :'t_a', 'Jugador ' || i, 'J' || i, 10 + i from generate_series(1, 6) i;
insert into public.audit_log (tournament_id, table_name, row_id, actor_auth_user_id, action)
  select :'t_a', 'scores', gen_random_uuid()::text, gen_random_uuid(), 'INSERT' from generate_series(1, 3);
select set_config('request.jwt.claims', harness.claims(:'padmin'), true) \g /dev/null
set local role authenticated;
select pg_temp.try_funnel(90) as f3 \gset
reset role;
select harness.check((:'f3'::jsonb ->> 'northStar') = '1', 'eight players and three sessions on a Terminado tournament count: ' || :'f3');

-- The window is clamped: 7 to 365 days.
select set_config('request.jwt.claims', harness.claims(:'padmin'), true) \g /dev/null
set local role authenticated;
select (public.platform_funnel(1) ->> 'days') || ',' || (public.platform_funnel(5000) ->> 'days') || ',' || (public.platform_funnel(null) ->> 'days') as clamp \gset
reset role;
select harness.check(:'clamp' = '7,365,90', 'the window is clamped to 7..365, 90 by default: ' || :'clamp');

rollback;
