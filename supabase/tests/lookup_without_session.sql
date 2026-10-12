-- A tournament's faces before any user exists (0040, TRUST-05): a browser
-- with no session gets the same grid anyone with the link sees, and nothing
-- that is the caller's (no «it's me», no proposal waiting, no join code); a
-- phone with its PIN claim still gets its own. On the two-tenant seed: dev_a
-- holds Ana in tournament A. Rolled back at the end.
\set ON_ERROR_STOP 1
\set QUIET 1
\pset tuples_only on
\pset format unaligned
select id as dev_a from harness.seed where key = 'dev_a' \gset
select id as t_a from harness.seed where key = 'tournament_a' \gset
select id as ana from harness.seed where key = 'player_a1' \gset
select slug as slug_a, join_code as code_a from public.tournaments where id = :'t_a' \gset
begin;

create function pg_temp.try_lookup(c text) returns text language plpgsql as $$
begin
  return coalesce(public.lookup_tournament(c)::text, 'null');
exception when others then
  return sqlstate;
end $$;
grant execute on function pg_temp.try_lookup(text) to anon, authenticated;

set local role anon;
select pg_temp.try_lookup(:'code_a') as by_code \gset
select pg_temp.try_lookup(:'slug_a') as by_slug \gset
select pg_temp.try_lookup('NOPE00') as unknown \gset
reset role;
select harness.check((:'by_code'::jsonb ->> 'id')::uuid = :'t_a' and (:'by_slug'::jsonb ->> 'id')::uuid = :'t_a',
  'without a session, the code and the link both find the tournament');
select harness.check(jsonb_array_length(:'by_code'::jsonb -> 'players') = (select count(*) from public.players where tournament_id = :'t_a'),
  'with every face');
select harness.check(:'by_code'::jsonb -> 'joinCode' = 'null'::jsonb
  and not exists (select 1 from jsonb_array_elements(:'by_code'::jsonb -> 'players') p where (p ->> 'isMe')::boolean or (p ->> 'pendingMe')::boolean),
  'and nothing of the caller''s: no join code, no «it''s me», no proposal');
select harness.check(:'unknown' = 'null', 'an unknown code finds nothing: ' || :'unknown');

select set_config('request.jwt.claims', harness.claims(:'dev_a'), true) \g /dev/null
set local role authenticated;
select pg_temp.try_lookup(:'slug_a') as mine \gset
reset role;
select harness.check(exists (select 1 from jsonb_array_elements(:'mine'::jsonb -> 'players') p where (p ->> 'id')::uuid = :'ana' and (p ->> 'isMe')::boolean)
  and :'mine'::jsonb ->> 'joinCode' = :'code_a',
  'a phone with its PIN still sees itself and the code');

select 'lookup without a session: ok';
rollback;
