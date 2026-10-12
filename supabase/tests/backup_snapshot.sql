-- The nightly backup's snapshot (0039, DB-07): only the service role may
-- take it; it reads every table it is given in one statement, with the
-- history's last row, the accounts' essentials (never a password hash or a
-- token) and the file list; a table or column the database lacks fails the
-- whole call by name. On the two-tenant seed; rolled back at the end.
\set ON_ERROR_STOP 1
\set QUIET 1
\pset tuples_only on
\pset format unaligned
select id as org_a from harness.seed where key = 'org_a' \gset
begin;

create function pg_temp.try_snap(p jsonb) returns text language plpgsql as $$
begin
  return public.backup_snapshot(p)::text;
exception when others then
  return sqlstate || ' ' || sqlerrm;
end $$;
grant execute on function pg_temp.try_snap(jsonb) to anon, authenticated, service_role;

-- A password and a token the snapshot must never carry.
update auth.users set encrypted_password = '$2a$10$hashhashhashhashhashha', recovery_token = 'tok-secreto' where id = :'org_a';

set local role anon;
select pg_temp.try_snap('{"tournaments": "id"}') as anon_snap \gset
reset role;
select set_config('request.jwt.claims', harness.claims(:'org_a'), true) \g /dev/null
set local role authenticated;
select pg_temp.try_snap('{"tournaments": "id"}') as user_snap \gset
reset role;
select harness.check(left(:'anon_snap', 5) = '42501' and left(:'user_snap', 5) = '42501',
  'neither a browser nor an account may take it: ' || left(:'anon_snap', 5) || ' ' || left(:'user_snap', 5));

set local role service_role;
select pg_temp.try_snap('{"tournaments": "id", "players": "id", "scores": "id", "tournament_organizers": "tournament_id, auth_user_id"}') as snap \gset
select pg_temp.try_snap('{"tournaments": "id", "no_such_table": "id"}') as no_table \gset
select pg_temp.try_snap('{"tournaments": "nope"}') as no_column \gset
select pg_temp.try_snap('[]') as not_object \gset
reset role;
select harness.check((:'snap'::jsonb -> 'tables' -> 'tournaments') = (select jsonb_agg(to_jsonb(t) order by t.id) from public.tournaments t)
  and jsonb_array_length(:'snap'::jsonb -> 'tables' -> 'players') = (select count(*) from public.players)
  and (:'snap'::jsonb -> 'tables' ? 'tournament_organizers'),
  'every table it is given, as the database holds it');
select harness.check((:'snap'::jsonb ->> 'auditMaxId')::bigint = (select max(id) from public.audit_log), 'with the history''s last row');
select harness.check(jsonb_array_length(:'snap'::jsonb -> 'auth' -> 'users') = (select count(*) from auth.users)
  and jsonb_array_length(:'snap'::jsonb -> 'auth' -> 'identities') = (select count(*) from auth.identities)
  and (:'snap'::jsonb -> 'storage' ? 'objects'),
  'the accounts, their identities and the file list');
select harness.check(position('hashhash' in :'snap') = 0 and position('tok-secreto' in :'snap') = 0
  and not exists (select 1 from jsonb_array_elements(:'snap'::jsonb -> 'auth' -> 'users') u where u ? 'encrypted_password' or u ? 'recovery_token'),
  'never a password hash or a token');
select harness.check(:'no_table' like '22023 no_such_table:%' and :'no_column' like '22023 tournaments: no tiene la columna nope%' and left(:'not_object', 5) = '22023',
  'a missing table or column fails the whole call by name: ' || :'no_table' || ' / ' || :'no_column');

select 'backup snapshot: ok';
rollback;
