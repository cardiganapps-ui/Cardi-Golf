-- TRUST-09, TRUST-13, TRUST-16 (0070): a person downloads his data and deletes his account himself, says his age,
-- and asks the Comité to fix what it saved about him. Rolled back at the end; prints one «ok» line per check.
\set ON_ERROR_STOP 1
\set QUIET 1
\pset tuples_only on
\pset format unaligned
select id as admin from harness.seed where key = 'platform_admin' \gset
select id as org_a from harness.seed where key = 'org_a' \gset
select id as org_b from harness.seed where key = 'org_b' \gset
select id as dev_a from harness.seed where key = 'dev_a' \gset
select id as dev_x from harness.seed where key = 'dev_x' \gset
select id as t_a from harness.seed where key = 'tournament_a' \gset
select id as t_b from harness.seed where key = 'tournament_b' \gset
select id as p_a1 from harness.seed where key = 'player_a1' \gset
select id as p_a2 from harness.seed where key = 'player_a2' \gset
begin;

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

-- Ana is org_b's confirmed player in tournament A (so a deletion renames her), and org_b has a friend and a crew.
insert into public.profiles (id, handle, display_name, full_name) values (:'org_b', 'orgb', 'Beto B', 'Roberto Bernal'), (:'org_a', 'orga', 'Organizadora A', 'Ana Organiza');
update public.players set profile_id = :'org_b', profile_status = 'confirmed', full_name = 'Roberto Bernal', display_name = 'Beto B' where id = :'p_a2';
insert into public.friendships (a, b, status) values (:'org_b', :'org_a', 'accepted');
insert into public.crews (id, slug, name, join_code, created_by) values ('00000070-0000-4000-8000-0000000000c1', 'b-crew', 'Crew de B', 'BCREW1', :'org_b');
insert into public.crew_members (crew_id, profile_id, role) values ('00000070-0000-4000-8000-0000000000c1', :'org_b', 'owner'), ('00000070-0000-4000-8000-0000000000c1', :'org_a', 'member');
insert into public.notifications (profile_id, kind, key) values (:'org_b', 'friend_accepted', 'k1');

-- 1. The download: his account, profile, players, friends, crews, notices; never a secret; logged as his own line.
select pg_temp.as_user(:'org_b', 'select public.my_data_export()::text') as dump \gset
select harness.check((:'dump')::jsonb #>> '{account,email}' = 'org-b@polo.test' and (:'dump')::jsonb #>> '{profile,handle}' = 'orgb', 'the download has the account and the profile');
select harness.check(jsonb_array_length((:'dump')::jsonb -> 'players') = 1 and (:'dump')::jsonb #>> '{players,0,tournament}' = 'Seed Torneo A', 'and the player that is him, with its tournament');
select harness.check((:'dump')::jsonb #>> '{friends,0,handle}' = 'orga' and (:'dump')::jsonb #>> '{crews,0,name}' = 'Crew de B'
                     and jsonb_array_length((:'dump')::jsonb -> 'notifications') = 1, 'his friends, his crews, his notices');
select harness.check(position('pin_hash' in :'dump') = 0 and position('token_hash' in :'dump') = 0 and position('p256dh' in :'dump') = 0, 'no secret in it');
select harness.check(exists (select 1 from public.platform_audit_log where action = 'self_export' and target_id = :'org_b' and actor_auth_user_id = :'org_b'), 'the download is logged');
select harness.check(pg_temp.as_user(:'org_b', 'select public.my_admin_accesses()::text') = '[]', 'and his own line is no «Acceso del administrador»');
-- A phone with a PIN gets its player too.
select harness.check((pg_temp.as_user(:'dev_a', 'select public.my_data_export()::text'))::jsonb #>> '{players,0,id}' = :'p_a1', 'a PIN phone''s download has the player it holds');
-- Nobody without a session.
select harness.check(has_function_privilege('anon', 'public.my_data_export()', 'execute') = false, 'anon cannot ask');

-- 2. Deleting: refused for a wrong email, an anonymous user and a platform admin.
select harness.check(pg_temp.as_user(:'org_b', 'select public.delete_my_account(''otro@polo.test'')::text') like '22023 El correo no coincide%', 'a wrong email is refused');
select harness.check(pg_temp.as_user(:'dev_x', 'select public.delete_my_account(''x'')::text') like '42501%', 'an anonymous user cannot');
select harness.check(pg_temp.as_user(:'admin', 'select public.delete_my_account(''admin@polo.test'')::text') like '42501 Eres admin de Polo%', 'nor a platform admin');
select harness.check((pg_temp.as_user(:'org_b', 'select public.my_delete_preview()::text'))::jsonb ->> 'anonymizedPlayers' = '1'
                     and (pg_temp.as_user(:'org_b', 'select public.my_delete_preview()::text'))::jsonb #>> '{crewsHanded,0}' = 'Crew de B',
  'the preview says his player becomes «Jugador borrado» and his crew is handed on');

-- 3. Deleting, the right email: the account goes, his player is renamed, his crew passes on, the log keeps a fingerprint.
select harness.check(pg_temp.as_user(:'org_b', 'select public.delete_my_account(''  ORG-B@polo.test '')::text') like '{%', 'the right email (any case, any spaces) deletes');
select harness.check(not exists (select 1 from auth.users where id = :'org_b') and not exists (select 1 from public.profiles where id = :'org_b'), 'the account and the profile are gone');
select harness.check((select full_name from public.players where id = :'p_a2') = 'Jugador borrado' and exists (select 1 from public.players where id = :'p_a2'),
  'his player is «Jugador borrado», as the admin''s deletion leaves it');
select harness.check((select created_by from public.crews where id = '00000070-0000-4000-8000-0000000000c1') = :'org_a'
                     and (select role from public.crew_members where crew_id = '00000070-0000-4000-8000-0000000000c1' and profile_id = :'org_a') = 'owner', 'his crew passes to its longest member');
select harness.check((select payload ? 'emailHash' and not (payload::text like '%org-b@polo.test%') from public.platform_audit_log where action = 'self_delete' and target_id = :'org_b'),
  'the log keeps a fingerprint of the email, never the email');
select harness.check(not exists (select 1 from public.platform_audit_log where payload::text like '%org-b@polo.test%' or reason like '%org-b@polo.test%'), 'no line of the log holds it');

-- 4. Age: «adult» is a record of its own, under the terms seen; the Comité's word for its tournament.
select pg_temp.as_user(:'org_a', 'select public.confirm_adult(''2026-10-16'', ''account'')') \g /dev/null
select harness.check(exists (select 1 from public.legal_acceptances where auth_user_id = :'org_a' and document = 'adult' and version = '2026-10-16' and context = 'account'), 'confirm_adult records it');
select harness.check(pg_temp.as_user(:'org_a', 'select public.confirm_adult(''9999-01-01'', ''account'')') like '22023%', 'a version from the future is refused');
select pg_temp.as_user(:'org_a', format('select public.confirm_adults(%L, true)::text', :'t_a')) as said \gset
select harness.check(:'said' ~ '^[0-9]{4}-' and (select adults_confirmed_at is not null from public.tournaments where id = :'t_a'), 'the Comité says every player is an adult');
select harness.check(pg_temp.as_user(:'dev_a', format('select public.confirm_adults(%L, true)::text', :'t_a')) like '42501%', 'a player cannot say it');
select pg_temp.as_user(:'org_a', format('select public.confirm_adults(%L, false)::text', :'t_a')) \g /dev/null
select harness.check((select adults_confirmed_at is null from public.tournaments where id = :'t_a'), 'and takes it back');

-- 5. «Pedir corrección»: from his own player only; the Comité lists and resolves; another Comité sees none.
select harness.check(pg_temp.as_user(:'dev_a', format('select public.request_player_correction(%L, %L)::text', :'t_a', '  Mi hándicap es 14, no 18 ')) ~ '^[0-9]+$', 'Ana''s phone asks');
select harness.check(pg_temp.as_user(:'dev_a', format('select public.request_player_correction(%L, %L)::text', :'t_b', 'otro torneo')) like '42501%', 'not in a tournament she is not in');
select harness.check(pg_temp.as_user(:'dev_a', format('select public.request_player_correction(%L, %L)::text', :'t_a', 'no')) like '22023%', 'an empty ask is refused');
select pg_temp.as_user(:'org_a', format('select public.player_corrections(%L)::text', :'t_a')) as list \gset
select harness.check((:'list')::jsonb #>> '{0,text}' = 'Mi hándicap es 14, no 18' and (:'list')::jsonb #>> '{0,playerId}' = :'p_a1', 'the Comité sees it, trimmed, with whose it is');
select harness.check(pg_temp.as_user(:'dev_a', format('select public.player_corrections(%L)::text', :'t_a')) like '42501%', 'a player does not read the list');
select pg_temp.as_user(:'org_a', format('select public.resolve_player_correction(%s)', (:'list')::jsonb #>> '{0,id}')) \g /dev/null
select harness.check((select done_at is not null from public.player_corrections), 'the Comité marks it done');
select harness.check(exists (select 1 from public.audit_log where table_name = 'player_corrections' and tournament_id = :'t_a'), 'and Historial has it');
select harness.check(pg_temp.as_user(:'admin', format('select public.player_corrections(%L)::text', :'t_b')) = '[]', 'another tournament has none');
-- At most five open per player.
select pg_temp.as_user(:'dev_a', format('select public.request_player_correction(%L, %L)', :'t_a', 'pedido ' || i)) from generate_series(1, 5) i \g /dev/null
select harness.check(pg_temp.as_user(:'dev_a', format('select public.request_player_correction(%L, %L)::text', :'t_a', 'el sexto')) like '22023 Ya tienes cinco%', 'a sixth open one is refused');

rollback;
