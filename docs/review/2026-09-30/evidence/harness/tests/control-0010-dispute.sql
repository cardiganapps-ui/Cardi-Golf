-- Repro (seeded db; rolled back): re-applying 0012 or 0009 by hand succeeds silently and regresses newer behavior.
\set ON_ERROR_STOP 1
\set QUIET 1
\pset tuples_only on
\pset format unaligned
select id as org_a from harness.seed where key = 'org_a' \gset
select id as dev_a from harness.seed where key = 'dev_a' \gset
select id as p_a1 from harness.seed where key = 'player_a1' \gset
select id as p_a2 from harness.seed where key = 'player_a2' \gset
select id as r_a1 from harness.seed where key = 'round_a1' \gset
begin;
-- Control for rerun-0009-0012.sql: the current scores_detect_dispute (0010) flags the same overwrite.
select set_config('request.jwt.claims', harness.claims(:'org_a'), true) \g /dev/null
set local role authenticated;
update public.rounds set status = 'live' where id = :'r_a1';
select public.admin_save_score(:'r_a1', :'p_a2', 5, 4, 2, false, 'Se equivocó el anotador') \g /dev/null
reset role;
-- Next PostgREST request: the Comité mark (set_config(..., true)) is transaction-local; clear it as a new request would.
select set_config('cardi.comite', '', true) \g /dev/null
select set_config('request.jwt.claims', harness.claims(:'dev_a'), true) \g /dev/null
set local role authenticated;
insert into public.scores (round_id, player_id, hole, strokes, putts, picked_up, entered_by, client_ts)
values (:'r_a1', :'p_a2', 5, 7, 3, false, :'p_a1', now())
on conflict (round_id, player_id, hole) do update set strokes = excluded.strokes, putts = excluded.putts, entered_by = excluded.entered_by, client_ts = excluded.client_ts;
reset role;
select format('hole 5 after the overwrite (current body): strokes %s, disputed %s, reason %s', strokes, disputed, coalesce(reason, 'null')) from public.scores where round_id = :'r_a1' and player_id = :'p_a2' and hole = 5;
rollback;
