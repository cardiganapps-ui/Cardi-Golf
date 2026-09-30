-- Harness extras (not splinter). Run on a SEEDED copy; everything rolled back.
\set ON_ERROR_STOP 1
\set QUIET 1
begin;

-- E1. Privileges and RLS of every public table for the API roles.
create temp table e1 as
select c.relname as table_name,
       c.relrowsecurity as rls,
       c.relforcerowsecurity as force_rls,
       (select count(*) from pg_policy p where p.polrelid = c.oid) as policies,
       (select string_agg(distinct case p.polcmd when 'r' then 'SELECT' when 'a' then 'INSERT' when 'w' then 'UPDATE' when 'd' then 'DELETE' else 'ALL' end, ',')
          from pg_policy p where p.polrelid = c.oid) as policy_cmds,
       concat_ws(',',
         case when has_table_privilege('anon', c.oid, 'SELECT') then 'S' end,
         case when has_table_privilege('anon', c.oid, 'INSERT') then 'I' end,
         case when has_table_privilege('anon', c.oid, 'UPDATE') then 'U' end,
         case when has_table_privilege('anon', c.oid, 'DELETE') then 'D' end,
         case when has_table_privilege('anon', c.oid, 'TRUNCATE') then 'T' end) as anon_privs,
       concat_ws(',',
         case when has_table_privilege('authenticated', c.oid, 'SELECT') then 'S' end,
         case when has_table_privilege('authenticated', c.oid, 'INSERT') then 'I' end,
         case when has_table_privilege('authenticated', c.oid, 'UPDATE') then 'U' end,
         case when has_table_privilege('authenticated', c.oid, 'DELETE') then 'D' end,
         case when has_table_privilege('authenticated', c.oid, 'TRUNCATE') then 'T' end) as auth_privs,
       (select string_agg(a.attname, ',' order by a.attnum) from pg_attribute a
         where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
           and (has_column_privilege('authenticated', c.oid, a.attnum, 'UPDATE') or has_column_privilege('authenticated', c.oid, a.attnum, 'INSERT'))
           and not has_table_privilege('authenticated', c.oid, 'UPDATE')) as auth_column_grants
from pg_class c
where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
order by c.relname;
\copy (select * from e1) to 'e1-table-privileges.csv' with (format csv, header)

-- E2. SECURITY DEFINER functions in public whose body reads auth.users (or
-- auth.sessions), callable by anon/authenticated, and whether the body has the
-- platform-admin guard.
create temp table e2 as
select p.oid::regprocedure::text as function,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anon_exec,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_exec,
       p.prosrc ~ 'is_platform_admin\(\)' as has_platform_guard,
       p.prosrc ~* 'auth\.sessions' as touches_sessions,
       p.prosrc ~* '(update|delete from)\s+auth\.users' as writes_auth_users
from pg_proc p
where p.pronamespace = 'public'::regnamespace and p.prosecdef and p.prosrc ~* 'auth\.(users|sessions)'
order by 1;
\copy (select * from e2) to 'e2-definer-auth-users.csv' with (format csv, header)

-- E3. Who reads how many rows (empirical, seeded db). A few extra rows first,
-- written the way the app writes them, so more tables have something to hide.
select id as org_a from harness.seed where key = 'org_a' \gset
select id as dev_a from harness.seed where key = 'dev_a' \gset
select id as dev_x from harness.seed where key = 'dev_x' \gset
select id as t_a from harness.seed where key = 'tournament_a' \gset
select id as p_a1 from harness.seed where key = 'player_a1' \gset
select id as p_a2 from harness.seed where key = 'player_a2' \gset
select id as r_a1 from harness.seed where key = 'round_a1' \gset
select set_config('request.jwt.claims', harness.claims(:'org_a'), true) \g /dev/null
set local role authenticated;
select public.ensure_my_profile() \g /dev/null
update public.rounds set status = 'live' where id = :'r_a1';
select public.set_payment_paid(:'t_a', 'entry', :'p_a1', null, 500, true) \g /dev/null
insert into public.courses (name) values ('Harness Course') returning id as course \gset
reset role;
select set_config('request.jwt.claims', harness.claims(:'dev_a'), true) \g /dev/null
set local role authenticated;
insert into public.scores (round_id, player_id, hole, strokes, putts, picked_up, entered_by, client_ts)
  values (:'r_a1', :'p_a2', 1, 5, 2, false, :'p_a1', now());
reset role;
-- a stranger account with a profile and nothing else
insert into auth.users (id, email, email_confirmed_at, is_anonymous, raw_user_meta_data)
  values ('11111111-1111-4111-8111-111111111111', 'stranger@polo.test', now(), false, '{"display_name":"Stranger"}');
select set_config('request.jwt.claims', harness.claims('11111111-1111-4111-8111-111111111111'), true) \g /dev/null
set local role authenticated;
select public.ensure_my_profile() \g /dev/null
reset role;
insert into storage.objects (bucket_id, name, owner) values ('tournament-assets', :'t_a' || '/logo.png', :'org_a');

create temp table e3 (table_name text, total bigint, anon bigint, anon_device bigint, stranger_account bigint, claimed_device bigint, organizer_a bigint);
grant all on e3 to anon, authenticated;
do $$
declare
  t record;
  n bigint;
  who text;
  ids text[] := array['', 'eeeeeeee-eeee-4eee-8eee-00000000000e', '11111111-1111-4111-8111-111111111111',
                      'dddddddd-dddd-4ddd-8ddd-00000000000d', 'aaaaaaaa-aaaa-4aaa-8aaa-00000000000a'];
  cols text[] := array['anon', 'anon_device', 'stranger_account', 'claimed_device', 'organizer_a'];
  i int;
begin
  for t in select format('%I.%I', n2.nspname, c.relname) as fq
           from pg_class c join pg_namespace n2 on n2.oid = c.relnamespace
           where (n2.nspname = 'public' or (n2.nspname = 'storage' and c.relname in ('objects', 'buckets'))) and c.relkind = 'r'
           order by 1 loop
    execute format('select count(*) from %s', t.fq) into n;
    insert into e3 (table_name, total) values (t.fq, n);
    for i in 1 .. 5 loop
      perform set_config('request.jwt.claims', case when ids[i] = '' then '' else harness.claims(ids[i]::uuid) end, true);
      execute case when i = 1 then 'set local role anon' else 'set local role authenticated' end;
      begin
        execute format('select count(*) from %s', t.fq) into n;
      exception when insufficient_privilege then
        n := -1;
      end;
      reset role;
      execute format('update e3 set %I = $1 where table_name = $2', cols[i]) using n, t.fq;
    end loop;
  end loop;
end
$$;
\copy (select * from e3 order by table_name) to 'e3-read-matrix.csv' with (format csv, header)

rollback;
