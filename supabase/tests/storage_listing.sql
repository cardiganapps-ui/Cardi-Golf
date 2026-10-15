-- TRUST-07 (0061): the public bucket's files are not listed to strangers. On the two-tenant seed: org_a runs
-- tournament A, dev_a is Ana's phone, org_b runs B. Rolled back at the end; prints one «ok» line per check.
\set ON_ERROR_STOP 1
\set QUIET 1
\pset tuples_only on
\pset format unaligned
select id as org_a from harness.seed where key = 'org_a' \gset
select id as org_b from harness.seed where key = 'org_b' \gset
select id as dev_a from harness.seed where key = 'dev_a' \gset
select id as t_a from harness.seed where key = 'tournament_a' \gset
select id as t_b from harness.seed where key = 'tournament_b' \gset
begin;
insert into storage.buckets (id, name, public) values ('tournament-assets', 'tournament-assets', true) on conflict (id) do nothing;
insert into storage.objects (bucket_id, name) values
  ('tournament-assets', :'t_a' || '/logo-720x240-1.webp'),
  ('tournament-assets', :'t_a' || '/players/ana.jpg'),
  ('tournament-assets', :'t_b' || '/logo-720x240-2.webp'),
  ('tournament-assets', 'profiles/' || :'org_a' || '/avatar.jpg'),
  ('tournament-assets', 'profiles/' || :'org_b' || '/avatar.jpg');

-- 1. No session: nothing.
select set_config('request.jwt.claims', '{"role":"anon"}', true) \g /dev/null
set local role anon;
select count(*) as anon_all from storage.objects \gset
reset role;
select harness.check(:'anon_all' = '0', 'with no session the bucket lists nothing, of any tournament or account');

-- 2. A tournament's members list its folder, not another tournament's.
select set_config('request.jwt.claims', harness.claims(:'dev_a'), true) \g /dev/null
set local role authenticated;
select string_agg((split_part(name, '/', 1) = :'t_a'::text)::text, ',' order by name) as dev_rows, count(*) as dev_count from storage.objects \gset
reset role;
select harness.check(:'dev_count' = '2' and :'dev_rows' = 'true,true', 'Ana''s phone lists tournament A''s two files and nothing of B''s or of any account');

-- 3. An account lists its own profile folder and its tournament's, never another account's.
select set_config('request.jwt.claims', harness.claims(:'org_b'), true) \g /dev/null
set local role authenticated;
select count(*) filter (where name like 'profiles/' || :'org_b' || '/%') as own,
  count(*) filter (where name like 'profiles/' || :'org_a' || '/%') as theirs,
  count(*) filter (where split_part(name, '/', 1) = :'t_a'::text) as other_t,
  count(*) filter (where split_part(name, '/', 1) = :'t_b'::text) as own_t from storage.objects \gset
reset role;
select harness.check(:'own' = '1' and :'theirs' = '0' and :'other_t' = '0' and :'own_t' = '1', 'B''s organizer lists his own photo and B''s logo, nothing of A''s or of A''s organizer');

-- 4. The advisor's lint no longer finds a broad read on the public bucket.
select harness.check(not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and cmd in ('SELECT', 'ALL')
    and replace(qual, ' ', '') ~* '^\(*bucket_id=''tournament-assets''(::text)?\)*$'), 'no policy reads the whole bucket');

rollback;
