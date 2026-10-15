-- SEC-10 (0059): one account can't ask everyone, and can't propose a rivalry over and over. Rolled back at the
-- end; prints one «ok» line per check.
\set ON_ERROR_STOP 1
\set QUIET 1
\pset tuples_only on
\pset format unaligned
\set me '00000059-0000-4000-8000-000000000001'
\set pal '00000059-0000-4000-8000-000000000002'
begin;

insert into auth.users (id, email, email_confirmed_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data, is_anonymous)
select ('00000059-0000-4000-8000-0000000' || lpad(i::text, 5, '0'))::uuid, 'lim' || i || '@polo.test', now(), now(), '{"provider":"email","providers":["email"]}', '{}', false
from generate_series(1, 40) i;
insert into public.profiles (id, handle, display_name, discoverable)
select ('00000059-0000-4000-8000-0000000' || lpad(i::text, 5, '0'))::uuid, 'lim' || i, 'Límite ' || i, true from generate_series(1, 40) i;

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

-- 1. Thirty requests go out in a day (lim3..lim32); the thirty-first is refused, in Spanish, and writes nothing.
select count(*) from (select pg_temp.as_user(:'me', format('select public.friend_request(%L)', 'lim' || i)) r from generate_series(3, 32) i) x where r = 'pending' \gset sent_
select harness.check(:'sent_count'::int = 30, 'thirty friend requests go out in a day');
select pg_temp.as_user(:'me', 'select public.friend_request(''lim33'')') as over \gset
select harness.check(:'over' like '22023 Ya mandaste muchas solicitudes%'
  and not exists (select 1 from public.friendships where a = :'me' and b = '00000059-0000-4000-8000-000000000033'), 'the thirty-first is refused and nobody is asked');

-- 2. Answering one sent to me is not a new request: it still goes through.
insert into public.friendships (a, b, status) values (:'pal', :'me', 'pending');
select harness.check(pg_temp.as_user(:'me', 'select public.friend_request(''lim2'')') = 'accepted', 'accepting a request sent to me is never limited');

-- 3. A day later the count starts over.
update public.friendships set created_at = now() - interval '25 hours' where a = :'me';
select harness.check(pg_temp.as_user(:'me', 'select public.friend_request(''lim33'')') = 'pending', 'a day later a new request goes out');

-- 4. Three rivalry proposals a day to the same friend; the fourth is refused.
select pg_temp.as_user(:'me', 'select public.rivalry_propose(''lim2'', 0)') \g /dev/null
update public.rivalries set status = 'ended' where a = :'me';
select pg_temp.as_user(:'me', 'select public.rivalry_propose(''lim2'', 0)') \g /dev/null
update public.rivalries set status = 'ended' where a = :'me';
select harness.check(pg_temp.as_user(:'me', 'select public.rivalry_propose(''lim2'', 0)') ~ '^[0-9a-f-]{36}$', 'a third proposal to the same friend goes out');
update public.rivalries set status = 'ended' where a = :'me';
select harness.check(pg_temp.as_user(:'me', 'select public.rivalry_propose(''lim2'', 0)') like '22023 Ya le propusiste%', 'the fourth that day is refused');

rollback;
