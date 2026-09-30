\set ON_ERROR_STOP 1
\pset footer off
select id as p_a1 from harness.seed where key = 'player_a1' \gset
select id as p_a2 from harness.seed where key = 'player_a2' \gset
select id as p_a3 from harness.seed where key = 'v11_player_a3' \gset
select id as r_a1 from harness.seed where key = 'round_a1' \gset
select id as org_a from harness.seed where key = 'org_a' \gset
create temp table req_log (n serial, scenario text, device text, sent text, client_ts timestamptz);
grant all on req_log to public; grant all on req_log_n_seq to public;

-- S1: AnaPhone1 saves Ana=5 (entered_by Ana)
begin;
select set_config('request.jwt.claims', harness.claims('dddddddd-dddd-4ddd-8ddd-00000000000d'), true) \g /dev/null
set local role authenticated;
insert into public.scores (round_id, player_id, hole, strokes, putts, picked_up, entered_by, client_ts)
values (:'r_a1', :'p_a1', 12, 5, 2, false, :'p_a1', now())
on conflict (round_id, player_id, hole) do update set round_id = excluded.round_id, player_id = excluded.player_id, hole = excluded.hole,
  strokes = excluded.strokes, putts = excluded.putts, picked_up = excluded.picked_up, entered_by = excluded.entered_by, client_ts = excluded.client_ts;
reset role;
insert into req_log (scenario, device, sent, client_ts) values ('S1', 'AnaPhone1', 'Ana=5 by Ana', now());
commit;

-- S1: AnaPhone2 saves Ana=6 (entered_by Ana)
begin;
select set_config('request.jwt.claims', harness.claims('a2a2a2a2-0000-4000-8000-00000000a2a2'), true) \g /dev/null
set local role authenticated;
insert into public.scores (round_id, player_id, hole, strokes, putts, picked_up, entered_by, client_ts)
values (:'r_a1', :'p_a1', 12, 6, 2, false, :'p_a1', now())
on conflict (round_id, player_id, hole) do update set round_id = excluded.round_id, player_id = excluded.player_id, hole = excluded.hole,
  strokes = excluded.strokes, putts = excluded.putts, picked_up = excluded.picked_up, entered_by = excluded.entered_by, client_ts = excluded.client_ts;
reset role;
insert into req_log (scenario, device, sent, client_ts) values ('S1', 'AnaPhone2', 'Ana=6 by Ana', now());
commit;

-- S1: BetoPhone2 saves Ana=7 (entered_by Beto)
begin;
select set_config('request.jwt.claims', harness.claims('b2b2b2b2-0000-4000-8000-00000000b2b2'), true) \g /dev/null
set local role authenticated;
insert into public.scores (round_id, player_id, hole, strokes, putts, picked_up, entered_by, client_ts)
values (:'r_a1', :'p_a1', 12, 7, 2, false, :'p_a2', now())
on conflict (round_id, player_id, hole) do update set round_id = excluded.round_id, player_id = excluded.player_id, hole = excluded.hole,
  strokes = excluded.strokes, putts = excluded.putts, picked_up = excluded.picked_up, entered_by = excluded.entered_by, client_ts = excluded.client_ts;
reset role;
insert into req_log (scenario, device, sent, client_ts) values ('S1', 'BetoPhone2', 'Ana=7 by Beto', now());
commit;

-- S1: BetoPhone1 saves Ana=4 (entered_by Beto)
begin;
select set_config('request.jwt.claims', harness.claims('b1b1b1b1-0000-4000-8000-00000000b1b1'), true) \g /dev/null
set local role authenticated;
insert into public.scores (round_id, player_id, hole, strokes, putts, picked_up, entered_by, client_ts)
values (:'r_a1', :'p_a1', 12, 4, 2, false, :'p_a2', now())
on conflict (round_id, player_id, hole) do update set round_id = excluded.round_id, player_id = excluded.player_id, hole = excluded.hole,
  strokes = excluded.strokes, putts = excluded.putts, picked_up = excluded.picked_up, entered_by = excluded.entered_by, client_ts = excluded.client_ts;
reset role;
insert into req_log (scenario, device, sent, client_ts) values ('S1', 'BetoPhone1', 'Ana=4 by Beto', now());
commit;

\echo '== S1: four saves 5 (Ana ph1), 6 (Ana ph2), 7 (Beto ph2), 4 (Beto ph1), in that arrival order'
select s.hole, (select display_name from public.players where id = s.player_id) as row_of, s.strokes as stored,
  (select display_name from public.players where id = s.entered_by) as entered_by, s.disputed,
  case when s.previous is null then null else (s.previous->>'strokes') || ' by ' || coalesce((select display_name from public.players where id = (s.previous->>'entered_by')::uuid), '?') end as previous
from public.scores s where s.round_id = :'r_a1' and s.hole = 12 and s.player_id = :'p_a1';
select a.at::time(3) as at, a.action, (select display_name from public.players where id = a.actor_player_id) as actor_player,
  left(a.actor_auth_user_id::text, 8) as actor_device, a.before->>'strokes' as before, a.after->>'strokes' as after,
  (select display_name from public.players where id = (a.after->>'entered_by')::uuid) as after_entered_by, a.after->>'disputed' as after_disputed,
  a.after->'previous'->>'strokes' as after_prev
from public.audit_log a where a.table_name = 'scores' and a.row_id = (select id::text from public.scores where round_id = :'r_a1' and hole = 12 and player_id = :'p_a1') order by a.id;

-- S2: AnaPhone1 saves Ana=5 (entered_by Ana)
begin;
select set_config('request.jwt.claims', harness.claims('dddddddd-dddd-4ddd-8ddd-00000000000d'), true) \g /dev/null
set local role authenticated;
insert into public.scores (round_id, player_id, hole, strokes, putts, picked_up, entered_by, client_ts)
values (:'r_a1', :'p_a1', 13, 5, 2, false, :'p_a1', now())
on conflict (round_id, player_id, hole) do update set round_id = excluded.round_id, player_id = excluded.player_id, hole = excluded.hole,
  strokes = excluded.strokes, putts = excluded.putts, picked_up = excluded.picked_up, entered_by = excluded.entered_by, client_ts = excluded.client_ts;
reset role;
insert into req_log (scenario, device, sent, client_ts) values ('S2', 'AnaPhone1', 'Ana=5 by Ana', now());
commit;

-- S2: BetoPhone1 saves Ana=6 (entered_by Beto)
begin;
select set_config('request.jwt.claims', harness.claims('b1b1b1b1-0000-4000-8000-00000000b1b1'), true) \g /dev/null
set local role authenticated;
insert into public.scores (round_id, player_id, hole, strokes, putts, picked_up, entered_by, client_ts)
values (:'r_a1', :'p_a1', 13, 6, 2, false, :'p_a2', now())
on conflict (round_id, player_id, hole) do update set round_id = excluded.round_id, player_id = excluded.player_id, hole = excluded.hole,
  strokes = excluded.strokes, putts = excluded.putts, picked_up = excluded.picked_up, entered_by = excluded.entered_by, client_ts = excluded.client_ts;
reset role;
insert into req_log (scenario, device, sent, client_ts) values ('S2', 'BetoPhone1', 'Ana=6 by Beto', now());
commit;

-- S2: CaroPhone saves Ana=7 (entered_by Caro)
begin;
select set_config('request.jwt.claims', harness.claims('c1c1c1c1-0000-4000-8000-00000000c1c1'), true) \g /dev/null
set local role authenticated;
insert into public.scores (round_id, player_id, hole, strokes, putts, picked_up, entered_by, client_ts)
values (:'r_a1', :'p_a1', 13, 7, 2, false, :'p_a3', now())
on conflict (round_id, player_id, hole) do update set round_id = excluded.round_id, player_id = excluded.player_id, hole = excluded.hole,
  strokes = excluded.strokes, putts = excluded.putts, picked_up = excluded.picked_up, entered_by = excluded.entered_by, client_ts = excluded.client_ts;
reset role;
insert into req_log (scenario, device, sent, client_ts) values ('S2', 'CaroPhone', 'Ana=7 by Caro', now());
commit;

\echo '== S2: three players: 5 (Ana), 6 (Beto), 7 (Caro)'
select s.hole, (select display_name from public.players where id = s.player_id) as row_of, s.strokes as stored,
  (select display_name from public.players where id = s.entered_by) as entered_by, s.disputed,
  case when s.previous is null then null else (s.previous->>'strokes') || ' by ' || coalesce((select display_name from public.players where id = (s.previous->>'entered_by')::uuid), '?') end as previous
from public.scores s where s.round_id = :'r_a1' and s.hole = 13 and s.player_id = :'p_a1';
select a.at::time(3) as at, a.action, (select display_name from public.players where id = a.actor_player_id) as actor_player,
  left(a.actor_auth_user_id::text, 8) as actor_device, a.before->>'strokes' as before, a.after->>'strokes' as after,
  (select display_name from public.players where id = (a.after->>'entered_by')::uuid) as after_entered_by, a.after->>'disputed' as after_disputed,
  a.after->'previous'->>'strokes' as after_prev
from public.audit_log a where a.table_name = 'scores' and a.row_id = (select id::text from public.scores where round_id = :'r_a1' and hole = 13 and player_id = :'p_a1') order by a.id;

\echo '== S2: Comité "Restaurar anterior" (resolve_score_dispute keep=false)'
begin;
select set_config('request.jwt.claims', harness.claims(:'org_a'), true) \g /dev/null
set local role authenticated;
select public.resolve_score_dispute(:'r_a1', :'p_a1', 13, false);
commit;
select strokes as after_restore, disputed, previous from public.scores where round_id = :'r_a1' and hole = 13 and player_id = :'p_a1';

-- S3: BetoPhone1 saves Beto=5 (entered_by Beto)
begin;
select set_config('request.jwt.claims', harness.claims('b1b1b1b1-0000-4000-8000-00000000b1b1'), true) \g /dev/null
set local role authenticated;
insert into public.scores (round_id, player_id, hole, strokes, putts, picked_up, entered_by, client_ts)
values (:'r_a1', :'p_a2', 14, 5, 2, false, :'p_a2', timestamptz '2027-04-09 10:00:00.250+00')
on conflict (round_id, player_id, hole) do update set round_id = excluded.round_id, player_id = excluded.player_id, hole = excluded.hole,
  strokes = excluded.strokes, putts = excluded.putts, picked_up = excluded.picked_up, entered_by = excluded.entered_by, client_ts = excluded.client_ts;
reset role;
insert into req_log (scenario, device, sent, client_ts) values ('S3', 'BetoPhone1', 'Beto=5 by Beto', timestamptz '2027-04-09 10:00:00.250+00');
commit;

-- S3: AnaPhone1 saves Beto=6 (entered_by Ana)
begin;
select set_config('request.jwt.claims', harness.claims('dddddddd-dddd-4ddd-8ddd-00000000000d'), true) \g /dev/null
set local role authenticated;
insert into public.scores (round_id, player_id, hole, strokes, putts, picked_up, entered_by, client_ts)
values (:'r_a1', :'p_a2', 14, 6, 2, false, :'p_a1', timestamptz '2027-04-09 10:00:00.000+00')
on conflict (round_id, player_id, hole) do update set round_id = excluded.round_id, player_id = excluded.player_id, hole = excluded.hole,
  strokes = excluded.strokes, putts = excluded.putts, picked_up = excluded.picked_up, entered_by = excluded.entered_by, client_ts = excluded.client_ts;
reset role;
insert into req_log (scenario, device, sent, client_ts) values ('S3', 'AnaPhone1', 'Beto=6 by Ana', timestamptz '2027-04-09 10:00:00.000+00');
commit;

\echo '== S3: Beto tapped 5 at .250 (arrived first); Ana tapped 6 at .000 (arrived last)'
select s.hole, (select display_name from public.players where id = s.player_id) as row_of, s.strokes as stored,
  (select display_name from public.players where id = s.entered_by) as entered_by, s.disputed,
  case when s.previous is null then null else (s.previous->>'strokes') || ' by ' || coalesce((select display_name from public.players where id = (s.previous->>'entered_by')::uuid), '?') end as previous
from public.scores s where s.round_id = :'r_a1' and s.hole = 14 and s.player_id = :'p_a2';
select a.at::time(3) as at, a.action, (select display_name from public.players where id = a.actor_player_id) as actor_player,
  left(a.actor_auth_user_id::text, 8) as actor_device, a.before->>'strokes' as before, a.after->>'strokes' as after,
  (select display_name from public.players where id = (a.after->>'entered_by')::uuid) as after_entered_by, a.after->>'disputed' as after_disputed,
  a.after->'previous'->>'strokes' as after_prev
from public.audit_log a where a.table_name = 'scores' and a.row_id = (select id::text from public.scores where round_id = :'r_a1' and hole = 14 and player_id = :'p_a2') order by a.id;

select to_char(client_ts, 'HH24:MI:SS.MS') as stored_client_ts from public.scores where round_id = :'r_a1' and hole = 14 and player_id = :'p_a2';

-- S4: AnaPhone1 saves Ana=5 (entered_by Ana)
begin;
select set_config('request.jwt.claims', harness.claims('dddddddd-dddd-4ddd-8ddd-00000000000d'), true) \g /dev/null
set local role authenticated;
insert into public.scores (round_id, player_id, hole, strokes, putts, picked_up, entered_by, client_ts)
values (:'r_a1', :'p_a1', 15, 5, 2, false, :'p_a1', now())
on conflict (round_id, player_id, hole) do update set round_id = excluded.round_id, player_id = excluded.player_id, hole = excluded.hole,
  strokes = excluded.strokes, putts = excluded.putts, picked_up = excluded.picked_up, entered_by = excluded.entered_by, client_ts = excluded.client_ts;
reset role;
insert into req_log (scenario, device, sent, client_ts) values ('S4', 'AnaPhone1', 'Ana=5 by Ana', now());
commit;

-- S4: BetoPhone1 saves Ana=8 (entered_by Ana)
begin;
select set_config('request.jwt.claims', harness.claims('b1b1b1b1-0000-4000-8000-00000000b1b1'), true) \g /dev/null
set local role authenticated;
insert into public.scores (round_id, player_id, hole, strokes, putts, picked_up, entered_by, client_ts)
values (:'r_a1', :'p_a1', 15, 8, 2, false, :'p_a1', now())
on conflict (round_id, player_id, hole) do update set round_id = excluded.round_id, player_id = excluded.player_id, hole = excluded.hole,
  strokes = excluded.strokes, putts = excluded.putts, picked_up = excluded.picked_up, entered_by = excluded.entered_by, client_ts = excluded.client_ts;
reset role;
insert into req_log (scenario, device, sent, client_ts) values ('S4', 'BetoPhone1', 'Ana=8 by Ana', now());
commit;

\echo '== S4: Beto's phone writes Ana's 8 with entered_by = Ana (crafted request; the app always sends its own player)'
select s.hole, (select display_name from public.players where id = s.player_id) as row_of, s.strokes as stored,
  (select display_name from public.players where id = s.entered_by) as entered_by, s.disputed,
  case when s.previous is null then null else (s.previous->>'strokes') || ' by ' || coalesce((select display_name from public.players where id = (s.previous->>'entered_by')::uuid), '?') end as previous
from public.scores s where s.round_id = :'r_a1' and s.hole = 15 and s.player_id = :'p_a1';
select a.at::time(3) as at, a.action, (select display_name from public.players where id = a.actor_player_id) as actor_player,
  left(a.actor_auth_user_id::text, 8) as actor_device, a.before->>'strokes' as before, a.after->>'strokes' as after,
  (select display_name from public.players where id = (a.after->>'entered_by')::uuid) as after_entered_by, a.after->>'disputed' as after_disputed,
  a.after->'previous'->>'strokes' as after_prev
from public.audit_log a where a.table_name = 'scores' and a.row_id = (select id::text from public.scores where round_id = :'r_a1' and hole = 15 and player_id = :'p_a1') order by a.id;

-- S5: AnaPhone1 saves Beto=5 (entered_by Ana)
begin;
select set_config('request.jwt.claims', harness.claims('dddddddd-dddd-4ddd-8ddd-00000000000d'), true) \g /dev/null
set local role authenticated;
insert into public.scores (round_id, player_id, hole, strokes, putts, picked_up, entered_by, client_ts)
values (:'r_a1', :'p_a2', 16, 5, 2, false, :'p_a1', now())
on conflict (round_id, player_id, hole) do update set round_id = excluded.round_id, player_id = excluded.player_id, hole = excluded.hole,
  strokes = excluded.strokes, putts = excluded.putts, picked_up = excluded.picked_up, entered_by = excluded.entered_by, client_ts = excluded.client_ts;
reset role;
insert into req_log (scenario, device, sent, client_ts) values ('S5', 'AnaPhone1', 'Beto=5 by Ana', now());
commit;

-- S5: BetoPhone1 saves Beto=6 (entered_by Beto)
begin;
select set_config('request.jwt.claims', harness.claims('b1b1b1b1-0000-4000-8000-00000000b1b1'), true) \g /dev/null
set local role authenticated;
insert into public.scores (round_id, player_id, hole, strokes, putts, picked_up, entered_by, client_ts)
values (:'r_a1', :'p_a2', 16, 6, 2, false, :'p_a2', now())
on conflict (round_id, player_id, hole) do update set round_id = excluded.round_id, player_id = excluded.player_id, hole = excluded.hole,
  strokes = excluded.strokes, putts = excluded.putts, picked_up = excluded.picked_up, entered_by = excluded.entered_by, client_ts = excluded.client_ts;
reset role;
insert into req_log (scenario, device, sent, client_ts) values ('S5', 'BetoPhone1', 'Beto=6 by Beto', now());
commit;

\echo '== S5: two phones, two players: Ana enters Beto=5, Beto enters Beto=6'
select s.hole, (select display_name from public.players where id = s.player_id) as row_of, s.strokes as stored,
  (select display_name from public.players where id = s.entered_by) as entered_by, s.disputed,
  case when s.previous is null then null else (s.previous->>'strokes') || ' by ' || coalesce((select display_name from public.players where id = (s.previous->>'entered_by')::uuid), '?') end as previous
from public.scores s where s.round_id = :'r_a1' and s.hole = 16 and s.player_id = :'p_a2';
select a.at::time(3) as at, a.action, (select display_name from public.players where id = a.actor_player_id) as actor_player,
  left(a.actor_auth_user_id::text, 8) as actor_device, a.before->>'strokes' as before, a.after->>'strokes' as after,
  (select display_name from public.players where id = (a.after->>'entered_by')::uuid) as after_entered_by, a.after->>'disputed' as after_disputed,
  a.after->'previous'->>'strokes' as after_prev
from public.audit_log a where a.table_name = 'scores' and a.row_id = (select id::text from public.scores where round_id = :'r_a1' and hole = 16 and player_id = :'p_a2') order by a.id;
