-- Who may call what, and what a policy costs (0065, DB-16). Fails on the first later migration that:
--   - lets a browser with no session (anon) call a function in public beyond the four it calls (a new definer
--     function keeps the default grants unless its migration revokes them: revoke from public, anon);
--   - leaves a trigger function callable by a session, or one of the internal helpers 0065 took back;
--   - writes a policy in public TO PUBLIC (or to anon), or one that calls auth.uid() for every row;
--   - adds a function in public with no search_path.
-- And checks that what the app needs still answers: a session calls its RPCs and reads its rows, anon its four.
\set ON_ERROR_STOP 1
\set QUIET 1
\pset tuples_only on
\pset format unaligned
select id as org_a from harness.seed where key = 'org_a' \gset
select id as t_a from harness.seed where key = 'tournament_a' \gset

create temp view fns as
select p.oid, p.oid::regprocedure::text as sig, p.proname, p.prosecdef, p.prorettype = 'trigger'::regtype as is_trigger
from pg_proc p
where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
  and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e');

-- 1. anon: exactly the four calls a page with no session makes.
select harness.check(
  (select array_agg(proname order by proname) from fns where has_function_privilege('anon', oid, 'EXECUTE'))
    = array['app_flags', 'lookup_tournament', 'push_prune', 'spectator_board']::name[],
  'anon calls only app_flags, lookup_tournament, push_prune and spectator_board; also: ' ||
    coalesce((select string_agg(sig, ', ') from fns where has_function_privilege('anon', oid, 'EXECUTE')
      and proname not in ('app_flags', 'lookup_tournament', 'push_prune', 'spectator_board')), 'none'));
select harness.check(not exists (select 1 from fns f, aclexplode(coalesce((select proacl from pg_proc where oid = f.oid), acldefault('f', 10))) a
    where a.grantee = 0 and a.privilege_type = 'EXECUTE'),
  'no function in public is anyone''s through PUBLIC; found: ' || coalesce((select string_agg(f.sig, ', ') from fns f
    where exists (select 1 from aclexplode(coalesce((select proacl from pg_proc where oid = f.oid), acldefault('f', 10))) a where a.grantee = 0 and a.privilege_type = 'EXECUTE')), 'none'));

-- 2. Triggers and internal helpers: nobody's to call.
select harness.check(not exists (select 1 from fns where is_trigger and (has_function_privilege('authenticated', oid, 'EXECUTE') or has_function_privilege('anon', oid, 'EXECUTE'))),
  'no trigger function is callable by a session; callable: ' || coalesce((select string_agg(sig, ', ') from fns where is_trigger and has_function_privilege('authenticated', oid, 'EXECUTE')), 'none'));
select harness.check(not exists (select 1 from fns where proname in ('current_player_id', 'current_tournament_id', 'is_admin_player', 'is_tournament_organizer_own',
    'is_tournament_participant', 'profile_visible_to_me', 'audit_event') and has_function_privilege('authenticated', oid, 'EXECUTE')),
  'the internal helpers are not the API');

-- 3. Policies: for sessions, and auth.uid() once per statement.
select harness.check(not exists (select 1 from pg_policies where schemaname = 'public' and (roles && array['public', 'anon']::name[])),
  'every policy in public is for sessions; to public or anon: ' || coalesce((select string_agg(tablename || '.' || policyname, ', ') from pg_policies
    where schemaname = 'public' and roles && array['public', 'anon']::name[]), 'none'));
select harness.check(not exists (
    select 1 from pg_policies where schemaname in ('public', 'storage')
      and regexp_replace(coalesce(qual, '') || ' ' || coalesce(with_check, ''), '\(\s*select\s+auth\.(uid|jwt|role)\(\)(\s+as\s+\w+)?\s*\)', '', 'gi') ~* 'auth\.(uid|jwt|role)\(\)'),
  'no policy calls auth.uid() row by row; such: ' || coalesce((select string_agg(tablename || '.' || policyname, ', ') from pg_policies
    where schemaname in ('public', 'storage') and regexp_replace(coalesce(qual, '') || ' ' || coalesce(with_check, ''), '\(\s*select\s+auth\.(uid|jwt|role)\(\)(\s+as\s+\w+)?\s*\)', '', 'gi') ~* 'auth\.(uid|jwt|role)\(\)'), 'none'));

-- 4. Every function names its search_path.
select harness.check(not exists (select 1 from fns f join pg_proc p on p.oid = f.oid
    where not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')),
  'every function in public sets its search_path; not: ' || coalesce((select string_agg(f.sig, ', ') from fns f join pg_proc p on p.oid = f.oid
    where not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')), 'none'));

-- 5. What still answers. Each answer is taken as the role and checked as the harness.
create function pg_temp.refused(sql text) returns text language plpgsql as $$
begin
  execute sql;
  return 'answered';
exception when insufficient_privilege then
  return 'refused';
end $$;
create temp table got (k text primary key, v text);
grant insert on got to anon, authenticated;
-- anon: the switches and a lookup; a stranger's helper call is refused, not answered.
begin;
select set_config('request.jwt.claims', '{"role":"anon"}', true) \g /dev/null
set local role anon;
insert into got values
  ('anon flags', (public.app_flags() is not null)::text),
  ('anon lookup', (public.lookup_tournament('nada-que-ver') is null)::text),
  ('anon rows', ((select count(*) from public.tournaments) + (select count(*) from public.courses) + (select count(*) from public.tournament_organizers))::text),
  ('anon member', pg_temp.refused(format('select public.is_tournament_member(%L)', :'t_a'))),
  ('anon tenant', pg_temp.refused(format('select public.round_tournament_id(%L)', :'t_a')));
commit;
-- A session: the RPCs and rows the app reads, and the owner's view of his own Comité.
begin;
select set_config('request.jwt.claims', harness.claims(:'org_a'), true) \g /dev/null
set local role authenticated;
insert into got values
  ('member', (public.my_membership(:'t_a') ->> 'isOrganizer')),
  ('comite', (select count(*) from public.tournament_organizers where tournament_id = :'t_a')::text),
  ('players', (select count(*) from public.players where tournament_id = :'t_a')::text),
  ('helper', pg_temp.refused('select public.is_tournament_participant(gen_random_uuid())'));
commit;
select harness.check((select v from got where k = 'anon flags') = 'true', 'anon reads the app''s switches');
select harness.check((select v from got where k = 'anon lookup') = 'true', 'anon looks up a tournament (none by that code)');
select harness.check((select v from got where k = 'anon rows') = '0', 'anon reads no rows, and no policy refuses it with an error');
select harness.check((select v from got where k = 'anon member') = 'refused', 'anon cannot ask whether a tournament is someone''s');
select harness.check((select v from got where k = 'anon tenant') = 'refused', 'nor which tournament an id belongs to');
select harness.check((select v from got where k = 'member') = 'true', 'a session calls my_membership');
select harness.check((select v from got where k = 'comite')::int >= 1, 'an owner reads his tournament''s Comité');
select harness.check((select v from got where k = 'players') = '2', 'and its players');
select harness.check((select v from got where k = 'helper') = 'refused', 'an internal helper is no RPC');
