-- TRUST-11 (0071): a crew's owner takes a member out, approves who enters, and gives the code an end. Rolled back
-- at the end; prints one «ok» line per check.
\set ON_ERROR_STOP 1
\set QUIET 1
\pset tuples_only on
\pset format unaligned
\set owner    '00000071-0000-4000-8000-000000000001'
\set member   '00000071-0000-4000-8000-000000000002'
\set stranger '00000071-0000-4000-8000-000000000003'
\set crew     '00000071-0000-4000-8000-0000000000c1'
begin;

insert into auth.users (id, email, email_confirmed_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data, is_anonymous)
select u.id::uuid, u.mail, now(), now(), '{"provider":"email","providers":["email"]}', '{}', false
from (values (:'owner', 'duena@polo.test'), (:'member', 'miembro@polo.test'), (:'stranger', 'extrano@polo.test')) u(id, mail);
insert into public.profiles (id, handle, display_name, full_name) values
  (:'owner', 'duena', 'Dueña', 'Dueña Completa'), (:'member', 'miembro', 'Miembro', 'Miembro Completo'), (:'stranger', 'extrano', 'Extraño', 'Extraño Completo');
insert into public.crews (id, slug, name, join_code, created_by) values (:'crew', 'los-jueves', 'Los jueves', 'JUEV3S', :'owner');
insert into public.crew_members (crew_id, profile_id, role) values (:'crew', :'owner', 'owner'), (:'crew', :'member', 'member');

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

-- 1. A stranger with the code gets in at once while approval is off (as before), and sees the owner's full profile.
select harness.check((pg_temp.as_user(:'stranger', 'select public.join_crew_request(''juev3s'')::text'))::jsonb ->> 'status' = 'joined', 'without approval the code lets him in');
select harness.check((pg_temp.as_user(:'stranger', 'select public.profile_card(''duena'')::text'))::jsonb ->> 'related' = 'true', 'and he shares the crew, so he sees the full profiles');

-- 2. The owner takes him out: he no longer shares the crew, and a member cannot do it, nor the owner to herself.
select harness.check(pg_temp.as_user(:'member', format('select public.crew_remove_member(%L, %L)::text', :'crew', 'extrano')) like '42501%', 'a member cannot take anyone out');
select harness.check(pg_temp.as_user(:'owner', format('select public.crew_remove_member(%L, %L)::text', :'crew', 'duena')) like '22023 Para salir tú%', 'the owner cannot take herself out');
select pg_temp.as_user(:'owner', format('select public.crew_remove_member(%L, %L)::text', :'crew', 'extrano')) as removed \gset
select harness.check(:'removed' !~ '^[0-9A-Z]{5} ' and not exists (select 1 from public.crew_members where crew_id = :'crew' and profile_id = :'stranger'), 'the owner takes him out');
select harness.check(coalesce((pg_temp.as_user(:'stranger', 'select public.profile_card(''duena'')::text'))::jsonb ->> 'related', 'false') = 'false'
                     and pg_temp.as_user(:'stranger', 'select public.crew_page(''los-jueves'')::text') = 'null', 'and he sees neither the full profiles nor the crew');
select harness.check(pg_temp.as_user(:'owner', format('select public.crew_remove_member(%L, %L)::text', :'crew', 'extrano')) like '22023 No es de este crew%', 'twice is refused');

-- 3. «Aprobar solicitudes»: the code now leaves a request; the owner hears of it once; nothing is shared yet.
select harness.check(pg_temp.as_user(:'member', format('select public.set_crew_approval(%L, true)::text', :'crew')) like '42501%', 'only the owner turns approval on');
select pg_temp.as_user(:'owner', format('select public.set_crew_approval(%L, true)', :'crew')) \g /dev/null
select harness.check((pg_temp.as_user(:'stranger', 'select public.crew_preview(''JUEV3S'')::text'))::jsonb ->> 'approval' = 'true', 'the preview says it asks for approval');
select harness.check((pg_temp.as_user(:'stranger', 'select public.join_crew_request(''JUEV3S'')::text'))::jsonb ->> 'status' = 'requested', 'the code leaves a request');
select pg_temp.as_user(:'stranger', 'select public.join_crew_request(''JUEV3S'')') \g /dev/null
select harness.check((select count(*) from public.notifications where profile_id = :'owner' and kind = 'crew_request') = 1, 'the owner hears of it once');
select harness.check(not exists (select 1 from public.crew_members where crew_id = :'crew' and profile_id = :'stranger')
                     and coalesce((pg_temp.as_user(:'stranger', 'select public.profile_card(''duena'')::text'))::jsonb ->> 'related', 'false') = 'false', 'and he is not in, nor sees anyone');
select harness.check(pg_temp.as_user(:'stranger', 'select public.join_crew(''JUEV3S'')') = 'null', 'an older bundle''s join gets no slug');
select harness.check((pg_temp.as_user(:'owner', 'select public.crew_page(''los-jueves'')::text'))::jsonb #>> '{requests,0,handle}' = 'extrano'
                     and (pg_temp.as_user(:'member', 'select public.crew_page(''los-jueves'')::text'))::jsonb -> 'requests' = '[]'::jsonb,
  'the owner sees who waits; a member does not');

-- 4. Declined: nothing, and he can ask again; accepted: he is in and hears it.
select pg_temp.as_user(:'owner', format('select public.crew_respond(%L, %L, false)', :'crew', 'extrano')) \g /dev/null
select harness.check(not exists (select 1 from public.crew_requests) and not exists (select 1 from public.crew_members where profile_id = :'stranger'), 'a no takes the request away and lets nobody in');
select pg_temp.as_user(:'stranger', 'select public.join_crew_request(''JUEV3S'')') \g /dev/null
select pg_temp.as_user(:'owner', format('select public.crew_respond(%L, %L, true)', :'crew', 'extrano')) \g /dev/null
select harness.check(exists (select 1 from public.crew_members where crew_id = :'crew' and profile_id = :'stranger')
                     and exists (select 1 from public.notifications where profile_id = :'stranger' and kind = 'crew_accepted'), 'a yes lets him in, and he hears it');
select harness.check(pg_temp.as_user(:'owner', format('select public.crew_respond(%L, %L, true)::text', :'crew', 'extrano')) like '22023%', 'an answered request is gone');

-- 5. A code with an end: good until then, no code after; the one-argument call still works (no end).
select pg_temp.as_user(:'owner', format('select public.rotate_crew_code(%L, 7)', :'crew')) as code7 \gset
select harness.check((select code_expires_at between now() + interval '6 days' and now() + interval '8 days' from public.crews where id = :'crew'), 'a new code good for seven days');
select harness.check(pg_temp.as_user(:'owner', format('select public.rotate_crew_code(%L, 91)', :'crew')) like '22023%', 'more than 90 days is refused');
update public.crews set code_expires_at = now() - interval '1 minute' where id = :'crew';
select harness.check(pg_temp.as_user(:'member', format('select public.crew_preview(%L)::text', :'code7')) = 'null'
                     and (pg_temp.as_user(:'member', format('select public.join_crew_request(%L)::text', :'code7')))::jsonb ->> 'status' = 'invalid',
  'an expired code is no code');
select harness.check((pg_temp.as_user(:'owner', 'select public.crew_page(''los-jueves'')::text'))::jsonb #>> '{crew,codeExpired}' = 'true', 'the page tells the owner it expired');
select pg_temp.as_user(:'owner', format('select public.rotate_crew_code(%L)', :'crew')) \g /dev/null
select harness.check((select code_expires_at is null from public.crews where id = :'crew'), 'a code with no end, as before');

rollback;
