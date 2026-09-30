-- V9 harness probe (own db v9_rel, one transaction, rolled back).
-- REL-05: two group phones upsert the same hole the way writeHole does (all four players, untouched at defaults).
-- REL-08: a non-admin player's queued upsert after the round is finished (the exact error the outbox sees).
-- REL-09: an admin player's queued upsert on a finished round with a signed card.
-- REL-16: the same upsert with no session (anon key) and with a session that claims nobody.
\set ON_ERROR_STOP 1
\pset tuples_only on
\pset format unaligned
select id as dev_a from harness.seed where key = 'dev_a' \gset
select id as dev_x from harness.seed where key = 'dev_x' \gset
select id as t_a from harness.seed where key = 'tournament_a' \gset
select id as p_a1 from harness.seed where key = 'player_a1' \gset
select id as p_a2 from harness.seed where key = 'player_a2' \gset
select id as r_a1 from harness.seed where key = 'round_a1' \gset
begin;
select set_config('h.r', :'r_a1', true), set_config('h.a1', :'p_a1', true), set_config('h.a2', :'p_a2', true) \g /dev/null

-- setup (as postgres = the Comité's console, not under test): a second phone claims Beto; the round goes live; one pair
insert into auth.users (id, is_anonymous) values ('b0b0b0b0-b0b0-4b0b-8b0b-0000000000b0', true);
select set_config('request.jwt.claims', harness.claims('b0b0b0b0-b0b0-4b0b-8b0b-0000000000b0'), true) \g /dev/null
set local role authenticated;
select 'claim Beto on phone B: ' || (public.claim_player(:'p_a2', '1234') ->> 'ok');
reset role;
update public.rounds set status = 'live' where id = :'r_a1';
insert into public.pairs (tournament_id, name, player1_id, player2_id, kind) values (:'t_a', 'Ana y Beto', :'p_a1', :'p_a2', 'AD') returning id as pair_id \gset

-- ===== REL-05: hole 5. Phone A (Ana) keeps Beto: Beto real 7/3, Ana untouched default 4/2 =====
select set_config('request.jwt.claims', harness.claims(:'dev_a'), true) \g /dev/null
set local role authenticated;
insert into public.scores as s (round_id, player_id, hole, strokes, putts, picked_up, entered_by, client_ts)
values (:'r_a1', :'p_a1', 5, 4, 2, false, :'p_a1', now()), (:'r_a1', :'p_a2', 5, 7, 3, false, :'p_a1', now())
on conflict (round_id, player_id, hole) do update set strokes = excluded.strokes, putts = excluded.putts, picked_up = excluded.picked_up, entered_by = excluded.entered_by, client_ts = excluded.client_ts;
reset role;
-- Phone B (Beto) keeps Ana: Ana real 6/2, Beto untouched default 4/2, saved second
select set_config('request.jwt.claims', harness.claims('b0b0b0b0-b0b0-4b0b-8b0b-0000000000b0'), true) \g /dev/null
set local role authenticated;
insert into public.scores as s (round_id, player_id, hole, strokes, putts, picked_up, entered_by, client_ts)
values (:'r_a1', :'p_a1', 5, 6, 2, false, :'p_a2', now()), (:'r_a1', :'p_a2', 5, 4, 2, false, :'p_a2', now())
on conflict (round_id, player_id, hole) do update set strokes = excluded.strokes, putts = excluded.putts, picked_up = excluded.picked_up, entered_by = excluded.entered_by, client_ts = excluded.client_ts;
reset role;
select 'REL-05 after both phones: ' || string_agg(format('%s=%s/%s by=%s disputed=%s previous=%s', case when player_id = :'p_a1' then 'Ana' else 'Beto' end, strokes, putts,
  case when entered_by = :'p_a1' then 'Ana' else 'Beto' end, disputed, previous - 'updated_at' - 'entered_by'), ' | ' order by player_id = :'p_a2')
from public.scores where round_id = :'r_a1' and hole = 5;
-- The card is signed at the end (RUNBOOK step 1 of closing a round). With one pair in this seed group the rival
-- pair cannot exist, so the organizer signs; card_signature_settles runs the same for any signer.
select id as org_a from harness.seed where key = 'org_a' \gset
select set_config('request.jwt.claims', harness.claims(:'org_a'), true) \g /dev/null
set local role authenticated;
insert into public.card_signatures (round_id, pair_id, signed_by) values (:'r_a1', :'pair_id', null);
reset role;
select 'REL-05 after signing:       ' || string_agg(format('%s=%s/%s disputed=%s previous=%s', case when player_id = :'p_a1' then 'Ana' else 'Beto' end, strokes, putts, disputed, coalesce(previous::text, 'null')), ' | ' order by player_id = :'p_a2')
from public.scores where round_id = :'r_a1' and hole = 5;
select 'REL-05 audit for Beto hole 5: ' || string_agg(format('%s %s->%s', action, before ->> 'strokes', after ->> 'strokes'), ', ' order by at, id)
from public.audit_log where table_name = 'scores' and (after ->> 'player_id' = :'p_a2' or before ->> 'player_id' = :'p_a2') and coalesce(after ->> 'hole', before ->> 'hole') = '5';
delete from public.card_signatures where round_id = :'r_a1';

-- Beto writes his own hole 6 and Ana (not admin yet) her hole 8 while live: the rows the queued items will overwrite
select set_config('request.jwt.claims', harness.claims('b0b0b0b0-b0b0-4b0b-8b0b-0000000000b0'), true) \g /dev/null
set local role authenticated;
insert into public.scores (round_id, player_id, hole, strokes, putts, picked_up, entered_by, client_ts) values (:'r_a1', :'p_a2', 6, 5, 2, false, :'p_a2', now());
reset role;
select set_config('request.jwt.claims', harness.claims(:'dev_a'), true) \g /dev/null
set local role authenticated;
insert into public.scores (round_id, player_id, hole, strokes, putts, picked_up, entered_by, client_ts) values (:'r_a1', :'p_a1', 8, 4, 2, false, :'p_a1', now());
reset role;

-- ===== the Comité finishes the round =====
update public.rounds set status = 'finished' where id = :'r_a1';

-- ===== REL-08: Beto (not admin) replays a queued hole 6 (update path) and hole 7 (insert path) =====
select set_config('request.jwt.claims', harness.claims('b0b0b0b0-b0b0-4b0b-8b0b-0000000000b0'), true) \g /dev/null
set local role authenticated;
do $$ begin
  insert into public.scores (round_id, player_id, hole, strokes, putts, picked_up, entered_by, client_ts)
  values (current_setting('h.r')::uuid, current_setting('h.a2')::uuid, 6, 6, 2, false, current_setting('h.a2')::uuid, now())
  on conflict (round_id, player_id, hole) do update set strokes = excluded.strokes, putts = excluded.putts, picked_up = excluded.picked_up, entered_by = excluded.entered_by, client_ts = excluded.client_ts;
  perform set_config('h.out', 'accepted', true);
exception when others then perform set_config('h.out', sqlstate || ' ' || sqlerrm, true);
end $$;
select 'REL-08 non-admin, finished round, existing hole: ' || current_setting('h.out');
do $$ begin
  insert into public.scores (round_id, player_id, hole, strokes, putts, picked_up, entered_by, client_ts)
  values (current_setting('h.r')::uuid, current_setting('h.a2')::uuid, 7, 5, 2, false, current_setting('h.a2')::uuid, now())
  on conflict (round_id, player_id, hole) do update set strokes = excluded.strokes, putts = excluded.putts, picked_up = excluded.picked_up, entered_by = excluded.entered_by, client_ts = excluded.client_ts;
  perform set_config('h.out', 'accepted', true);
exception when others then perform set_config('h.out', sqlstate || ' ' || sqlerrm, true);
end $$;
select 'REL-08 non-admin, finished round, new hole:      ' || current_setting('h.out');
reset role;

-- ===== REL-09: Ana is an admin player (is_admin, like Nico); her card is signed; she replays a queued hole 8 =====
update public.players set is_admin = true where id = :'p_a1';
insert into public.card_signatures (round_id, pair_id, signed_by) values (:'r_a1', :'pair_id', :'p_a2');
select set_config('request.jwt.claims', harness.claims(:'dev_a'), true) \g /dev/null
set local role authenticated;
do $$ begin
  insert into public.scores (round_id, player_id, hole, strokes, putts, picked_up, entered_by, client_ts)
  values (current_setting('h.r')::uuid, current_setting('h.a1')::uuid, 8, 5, 2, false, current_setting('h.a1')::uuid, now())
  on conflict (round_id, player_id, hole) do update set strokes = excluded.strokes, putts = excluded.putts, picked_up = excluded.picked_up, entered_by = excluded.entered_by, client_ts = excluded.client_ts;
  perform set_config('h.out', 'accepted', true);
exception when others then perform set_config('h.out', sqlstate || ' ' || sqlerrm, true);
end $$;
reset role;
select 'REL-09 admin player, finished round + signed card: ' || current_setting('h.out') || ' -> ' ||
  (select format('Ana hole 8 = %s/%s disputed=%s reason=%s previous=%s', strokes, putts, disputed, coalesce(reason, 'null'), coalesce(previous::text, 'null')) from public.scores where round_id = :'r_a1' and player_id = :'p_a1' and hole = 8)
  || format(' (round %s, signed cards %s)', (select status from public.rounds where id = :'r_a1'), (select count(*) from public.card_signatures where round_id = :'r_a1'));
select 'REL-09 audit row: ' || (select format('%s %s->%s reason=%s', action, before ->> 'strokes', after ->> 'strokes', coalesce(reason, 'null')) from public.audit_log where table_name = 'scores' and after ->> 'player_id' = :'p_a1' and after ->> 'hole' = '8' order by at desc, id desc limit 1);
-- the non-admin phone, same moment, same kind of write: refused (control)
select set_config('request.jwt.claims', harness.claims('b0b0b0b0-b0b0-4b0b-8b0b-0000000000b0'), true) \g /dev/null
set local role authenticated;
do $$ begin
  update public.scores set strokes = 9 where round_id = current_setting('h.r')::uuid and player_id = current_setting('h.a2')::uuid and hole = 6;
  perform set_config('h.out', case when found then 'accepted' else 'no row updated (RLS USING filtered it)' end, true);
exception when others then perform set_config('h.out', sqlstate || ' ' || sqlerrm, true);
end $$;
reset role;
select 'REL-09 control, non-admin plain UPDATE on the finished round: ' || current_setting('h.out');

-- ===== REL-16: the same queued upsert with no session (anon key) and with a session that claims nobody =====
update public.rounds set status = 'live' where id = :'r_a1';
delete from public.card_signatures where round_id = :'r_a1';
select set_config('request.jwt.claims', '', true) \g /dev/null
set local role anon;
do $$ begin
  insert into public.scores (round_id, player_id, hole, strokes, putts, picked_up, entered_by, client_ts)
  values (current_setting('h.r')::uuid, current_setting('h.a2')::uuid, 9, 5, 2, false, current_setting('h.a2')::uuid, now())
  on conflict (round_id, player_id, hole) do update set strokes = excluded.strokes, putts = excluded.putts, picked_up = excluded.picked_up, entered_by = excluded.entered_by, client_ts = excluded.client_ts;
  perform set_config('h.out', 'accepted', true);
exception when others then perform set_config('h.out', sqlstate || ' ' || sqlerrm, true);
end $$;
reset role;
select 'REL-16 no session (anon key), live round: ' || current_setting('h.out');
select set_config('request.jwt.claims', harness.claims(:'dev_x'), true) \g /dev/null
set local role authenticated;
do $$ begin
  insert into public.scores (round_id, player_id, hole, strokes, putts, picked_up, entered_by, client_ts)
  values (current_setting('h.r')::uuid, current_setting('h.a2')::uuid, 9, 5, 2, false, current_setting('h.a2')::uuid, now())
  on conflict (round_id, player_id, hole) do update set strokes = excluded.strokes, putts = excluded.putts, picked_up = excluded.picked_up, entered_by = excluded.entered_by, client_ts = excluded.client_ts;
  perform set_config('h.out', 'accepted', true);
exception when others then perform set_config('h.out', sqlstate || ' ' || sqlerrm, true);
end $$;
reset role;
select 'REL-16 new anonymous session with no claim, live round: ' || current_setting('h.out');
select 'anon table privileges on scores: ' || coalesce(string_agg(privilege_type, ',' order by privilege_type), 'none') from information_schema.role_table_grants where table_schema = 'public' and table_name = 'scores' and grantee = 'anon';
rollback;
