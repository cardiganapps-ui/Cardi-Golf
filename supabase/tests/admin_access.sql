-- TRUST-17, TRUST-22 (0068): what the Admin de Polo opens is logged with his reason, its Comité sees it in Historial,
-- the person sees it in Editar perfil, and the crew panel no longer hands him the join code. Rolled back at the end;
-- prints one «ok» line per check.
\set ON_ERROR_STOP 1
\set QUIET 1
\pset tuples_only on
\pset format unaligned
select id as admin from harness.seed where key = 'platform_admin' \gset
select id as org_a from harness.seed where key = 'org_a' \gset
select id as org_b from harness.seed where key = 'org_b' \gset
select id as t_a from harness.seed where key = 'tournament_a' \gset
select id as t_b from harness.seed where key = 'tournament_b' \gset
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

-- A crew of org_a's, with a code.
insert into public.profiles (id, handle, display_name) values (:'org_a', 'orga', 'Organizadora A'), (:'org_b', 'orgb', 'Organizador B');
insert into public.crews (id, slug, name, join_code, created_by) values ('00000068-0000-4000-8000-0000000000c1', 'los-jueves', 'Los jueves', 'JUEV3S', :'org_a');
insert into public.crew_members (crew_id, profile_id, role) values ('00000068-0000-4000-8000-0000000000c1', :'org_a', 'owner');

-- 1. Opening a tournament he does not play without a reason is refused (PV001), and logs nothing.
select harness.check(pg_temp.as_user(:'admin', format('select public.platform_tournament(%L)::text', :'t_a')) like 'PV001 Escribe por qué lo abres%',
  'the admin is asked why before he opens a tournament');
select harness.check(not exists (select 1 from public.platform_audit_log where action = 'view'), 'a refused view logs nothing');
-- A reason too short is refused too.
select harness.check(pg_temp.as_user(:'admin', format('select public.platform_tournament(%L, %L)::text', :'t_a', ' a ')) like '22023 El motivo lleva de 3 a 200%',
  'a reason under three characters is refused');

-- 2. With a reason it opens and logs one view line, with the tournament and the reason.
select harness.check(pg_temp.as_user(:'admin', format('select public.platform_tournament(%L, %L) ->> ''name''', :'t_a', '  Soporte: no ve su marcador ')) = 'Seed Torneo A',
  'with a reason the tournament opens');
select harness.check((select count(*) = 1 and min(reason) = 'Soporte: no ve su marcador' and min(tournament_id::text) = :'t_a' and min(target_kind) = 'tournament'
                      from public.platform_audit_log where action = 'view'), 'one view line, with the tournament and the trimmed reason');

-- 3. A reload in the next two hours needs no reason and logs nothing new; the same reason again in 30 minutes neither.
select harness.check(pg_temp.as_user(:'admin', format('select public.platform_tournament(%L) ->> ''name''', :'t_a')) = 'Seed Torneo A',
  'a reload within two hours needs no reason');
select pg_temp.as_user(:'admin', format('select public.platform_tournament(%L, %L) ->> ''name''', :'t_a', 'Soporte: no ve su marcador')) \g /dev/null
select harness.check((select count(*) from public.platform_audit_log where action = 'view') = 1, 'neither a reload nor the same reason again adds a line');
-- Two hours later he is asked again.
update public.platform_audit_log set at = at - interval '3 hours' where action = 'view';
select harness.check(pg_temp.as_user(:'admin', format('select public.platform_tournament(%L)::text', :'t_a')) like 'PV001%', 'after two hours he is asked again');

-- 4. Anyone else: refused as before.
select harness.check(pg_temp.as_user(:'org_b', format('select public.platform_tournament(%L, %L)::text', :'t_a', 'curiosidad')) like '42501%', 'nobody else opens it');

-- 5. A person and a crew: the same, and the crew panel has no join code.
select harness.check(pg_temp.as_user(:'admin', format('select public.platform_person(%L)::text', :'org_b')) like 'PV001%', 'opening an account needs a reason');
select harness.check(pg_temp.as_user(:'admin', format('select public.platform_person(%L, %L) ->> ''email''', :'org_b', 'Pidió borrar su cuenta')) = 'org-b@polo.test', 'with one it opens');
select harness.check(pg_temp.as_user(:'admin', format('select public.platform_person(%L) ->> ''email''', :'admin')) = 'admin@polo.test', 'his own account needs none');
select harness.check(pg_temp.as_user(:'admin', format('select public.platform_crew(%L)::text', '00000068-0000-4000-8000-0000000000c1')) like 'PV001%', 'opening a crew needs a reason');
select pg_temp.as_user(:'admin', format('select public.platform_crew(%L, %L)::text', '00000068-0000-4000-8000-0000000000c1', 'Reportaron a un intruso')) as crew \gset
select harness.check((:'crew')::jsonb ->> 'name' = 'Los jueves' and not ((:'crew')::jsonb ? 'joinCode') and position('JUEV3S' in :'crew') = 0,
  'the crew panel opens without the join code anywhere in it');

-- 6. The Comité sees the operator's lines in Historial, at their moment, after the history row before them.
select pg_temp.as_user(:'admin', format('select public.platform_unlock(%L, %L)', :'t_a', 'Corregir un hoyo que pidieron')) \g /dev/null
select pg_temp.as_user(:'org_a', format('select public.tournament_audit(%L)::text', :'t_a')) as hist \gset
select harness.check(exists (select 1 from jsonb_array_elements((:'hist')::jsonb) e
                             where e ->> 'table' = 'platform_audit_log' and e ->> 'action' = 'view' and e ->> 'reason' = 'Soporte: no ve su marcador'
                               and (e ->> 'id')::bigint < 0 and (e -> 'platform')::boolean and e -> 'actor' = 'null'::jsonb),
  'the Comité sees «el Admin de Polo abrió este torneo» with its reason, never who');
select harness.check(exists (select 1 from jsonb_array_elements((:'hist')::jsonb) e
                             where e ->> 'action' = 'unlock' and e ->> 'reason' = 'Corregir un hoyo que pidieron' and e -> 'after' ? 'until'),
  'and the unlock, with its reason and its end');
-- Tournament B's Comité sees none of A's.
select harness.check(not exists (select 1 from jsonb_array_elements((pg_temp.as_user(:'org_b', format('select public.tournament_audit(%L)::text', :'t_b')))::jsonb) e
                                 where e ->> 'table' = 'platform_audit_log'), 'another tournament''s Comité sees none of them');

-- 7. Paging: each operator line lands on exactly one page, between its history rows.
insert into public.audit_log (tournament_id, table_name, row_id, action, at)
select :'t_a', 'players', 'p' || i, 'UPDATE', now() + make_interval(mins => i) from generate_series(1, 9) i;
insert into public.platform_audit_log (actor_auth_user_id, action, target_kind, target_id, tournament_id, reason, at)
select :'admin', 'view', 'tournament', :'t_a', :'t_a', 'Línea ' || i, now() + make_interval(mins => i) - interval '30 seconds' from generate_series(1, 9) i;
-- And a slow transaction's row: an earlier moment under a later id (its transaction began before p9's and committed after).
insert into public.audit_log (tournament_id, table_name, row_id, action, at) values (:'t_a', 'players', 'lento', 'UPDATE', now() + interval '9 minutes' - interval '200 milliseconds');
create temp table pages (n int, pos int, e jsonb);
do $$
declare
  before bigint := null;
  pg jsonb;
  k int := 0;
begin
  loop
    k := k + 1;
    pg := (pg_temp.as_user((select id from harness.seed where key = 'org_a'),
             format('select public.tournament_audit(%L, %s, 3)::text', (select id from harness.seed where key = 'tournament_a'), coalesce(before::text, 'null'))))::jsonb;
    insert into pages select k, x.o::int, x.e from jsonb_array_elements(pg) with ordinality x(e, o);
    exit when (select count(*) from jsonb_array_elements(pg) e where (e ->> 'id')::bigint > 0) < 3 or k > 50;
    before := (select (e ->> 'id')::bigint from jsonb_array_elements(pg) with ordinality x(e, n) where (e ->> 'id')::bigint > 0 order by n desc limit 1);
  end loop;
end $$;
select harness.check((select count(*) from pages where e ->> 'reason' like 'Línea %') = 9
                     and (select count(distinct e ->> 'id') from pages where e ->> 'reason' like 'Línea %') = 9,
  'paged three rows at a time, each of the nine operator lines comes once');
select harness.check((select count(*) = count(distinct e ->> 'id') from pages where (e ->> 'id')::bigint > 0), 'and no history row comes twice');
select harness.check(not exists (
    select 1 from (select (e ->> 'at')::timestamptz as at, lag((e ->> 'at')::timestamptz) over (order by n, pos) as prev
                   from pages where e ->> 'rowId' is distinct from 'lento') x
    where x.at > x.prev),
  'read page after page, every line but the slow row is in time order: each operator line sits between its history rows');
select harness.check(not exists (
    select 1 from pages p where (select count(*) from pages q where q.n = p.n and (q.e ->> 'id')::bigint > 0) = 3
      and p.pos = (select max(q.pos) from pages q where q.n = p.n) and (p.e ->> 'id')::bigint < 0),
  'a full page ends on a history row, so an older bundle pages by it as before');

-- 8. A filter by player, day, hole or correction leaves them out; «Solo Admin de Polo» keeps them.
select harness.check(not exists (select 1 from jsonb_array_elements((pg_temp.as_user(:'org_a', format('select public.tournament_audit(%L, null, 50, %L)::text', :'t_a', '{"hole": 3}')))::jsonb) e
                                 where e ->> 'table' = 'platform_audit_log'), 'a filter by hole leaves them out');
select harness.check(exists (select 1 from jsonb_array_elements((pg_temp.as_user(:'org_a', format('select public.tournament_audit(%L, null, 50, %L)::text', :'t_a', '{"platform": true}')))::jsonb) e
                             where e ->> 'table' = 'platform_audit_log'), '«Solo Admin de Polo» keeps them');

-- 9. Opening a tournament's pages by its link (the gate) logs a view too, at most once every two hours, said as such.
select harness.check(pg_temp.as_user(:'admin', format('select public.my_membership(%L) ->> ''via''', :'t_b')) = 'platform', 'the gate lets him in as the platform');
select pg_temp.as_user(:'admin', format('select public.my_membership(%L) ->> ''via''', :'t_b')) \g /dev/null
select harness.check((select count(*) from public.platform_audit_log where action = 'view' and tournament_id = :'t_b' and payload ->> 'via' = 'link' and reason is null) = 1,
  'his visit by the link is one view line, with no reason typed');
select harness.check(exists (select 1 from jsonb_array_elements((pg_temp.as_user(:'org_b', format('select public.tournament_audit(%L)::text', :'t_b')))::jsonb) e
                             where e ->> 'action' = 'view' and e #>> '{after,via}' = 'link'), 'its Comité sees he came by the link');
select harness.check(pg_temp.as_user(:'admin', format('select public.platform_tournament(%L)::text', :'t_b')) like 'PV001%',
  'a visit by the link stands in for no reason: the panel still asks why');
select harness.check(pg_temp.as_user((select id from harness.seed where key = 'dev_a'), format('select public.my_membership(%L) ->> ''via''', :'t_a')) = 'device'
                     and pg_temp.as_user(:'org_a', format('select public.my_membership(%L) ->> ''role''', :'t_a')) = 'owner',
  'everyone else''s gate answers as before');

-- 10. A person sees what the operator opened or did about his account and his crews; nobody else's.
select pg_temp.as_user(:'org_a', 'select public.my_admin_accesses()::text') as mine_a \gset
select pg_temp.as_user(:'org_b', 'select public.my_admin_accesses()::text') as mine_b \gset
select harness.check(exists (select 1 from jsonb_array_elements((:'mine_b')::jsonb) e where e ->> 'action' = 'view' and e ->> 'kind' = 'person' and e ->> 'reason' = 'Pidió borrar su cuenta')
                     and position(:'admin' in :'mine_b') = 0, 'org_b sees that his account was opened and why, never by whom');
select harness.check(exists (select 1 from jsonb_array_elements((:'mine_a')::jsonb) e where e ->> 'kind' = 'crew' and e ->> 'crew' = 'Los jueves')
                     and not exists (select 1 from jsonb_array_elements((:'mine_a')::jsonb) e where e ->> 'kind' = 'person'),
  'org_a sees the view of her crew, and not org_b''s account');
select harness.check(pg_temp.as_user(:'org_b', 'select public.my_admin_accesses()::text') not like '%Los jueves%', 'a crew he is not in is not his');

rollback;
