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
-- 0012 re-applied: an account's own avatar upload (profiles/<uid>/…, allowed since 0013) is refused.
\i /home/user/Cardi-Golf/supabase/migrations/0012_storage_guard.sql
select set_config('request.jwt.claims', harness.claims(:'org_a'), true) \g /dev/null
select set_config('harness.name', 'profiles/' || :'org_a' || '/avatar.png', true) \g /dev/null
set local role authenticated;
do $$ begin
  insert into storage.objects (bucket_id, name, owner) values ('tournament-assets', current_setting('harness.name'), auth.uid());
  perform set_config('harness.out', 'allowed', true);
exception when others then perform set_config('harness.out', sqlstate, true); end $$;
reset role;
select harness.check(current_setting('harness.out') = '42501', 'after re-applying 0012, an account''s own avatar upload is refused (42501)');
-- 0009 re-applied: a device overwriting a Comité-corrected hole is no longer flagged, and keeps the Comité's reason.
\i /home/user/Cardi-Golf/supabase/migrations/0009_score_reason.sql
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
select format('hole 5 after the overwrite: strokes %s, disputed %s, reason %s', strokes, disputed, coalesce(reason, 'null')) from public.scores where round_id = :'r_a1' and player_id = :'p_a2' and hole = 5;
select harness.check((select not disputed and reason = 'Se equivocó el anotador' from public.scores where round_id = :'r_a1' and player_id = :'p_a2' and hole = 5),
  'after re-applying 0009, overwriting a Comité correction is not flagged and still carries the Comité''s reason (0010 body: flagged, reason cleared)');
rollback;
