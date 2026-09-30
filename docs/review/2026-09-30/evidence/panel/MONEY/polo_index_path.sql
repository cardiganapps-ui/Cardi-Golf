-- MONEY panel: the Polo index's adjusted gross uses the profile's CURRENT index,
-- so the same finished round yields a different differential after the index changes.
-- Run as postgres on your own harness db (money_a), inside one transaction, rolled back.
\set ON_ERROR_STOP 1
begin;
-- A profile (account) linked and confirmed to Ana (player_a1) of Seed Torneo A.
insert into auth.users (id, email, email_confirmed_at, is_anonymous, raw_user_meta_data)
values ('11111111-1111-4111-8111-111111111111', 'money@polo.test', now(), false, '{"display_name":"Money"}');
insert into public.profiles (id, handle, display_name, index_source, manual_index, discoverable)
values ('11111111-1111-4111-8111-111111111111', 'money_probe', 'Money', 'manual', 20.0, false);
update public.players set profile_id = '11111111-1111-4111-8111-111111111111', profile_status = 'confirmed'
where id = (select id from harness.seed where key = 'player_a1');

-- A par-72 course rated 72.0 / 113, SI 1..18 on holes 1..18, all par 4.
insert into public.courses (id, name, source) values ('22222222-2222-4222-8222-222222222222', 'Probe', 'manual');
insert into public.tees (id, course_id, name, rating, slope, par_total, sort_order) values ('33333333-3333-4333-8333-333333333333', '22222222-2222-4222-8222-222222222222', 'Azules', 72.0, 113, 72, 0);
insert into public.holes (tee_id, number, par, stroke_index)
select '33333333-3333-4333-8333-333333333333', n, 4, n from generate_series(1, 18) n;
update public.rounds set course_id = '22222222-2222-4222-8222-222222222222', date = '2026-09-01'
where id = (select id from harness.seed where key = 'round_a1');

-- Ana's card: an 8 on every hole (quadruple bogey): the AGS is entirely the net-double-bogey cap.
insert into public.scores (round_id, player_id, hole, strokes, putts, picked_up)
select (select id from harness.seed where key = 'round_a1'), (select id from harness.seed where key = 'player_a1'), n, 8, 2, false
from generate_series(1, 18) n;

-- Finish the round: trigger refresh_round_results → differential with manual index 20.0.
update public.rounds set status = 'finished' where id = (select id from harness.seed where key = 'round_a1');
select 'index 20.0 at play time' as step, course_hcp, gross, ags, differential
from public.round_results where player_id = (select id from harness.seed where key = 'player_a1');

-- Months later Ana lowers her manual index to 5.0; nothing about the round changed.
update public.profiles set manual_index = 5.0 where id = '11111111-1111-4111-8111-111111111111';
select 'after index change, not refreshed' as step, course_hcp, gross, ags, differential
from public.round_results where player_id = (select id from harness.seed where key = 'player_a1');

-- Any refresh of that finished round (a score correction, "Publicar resultados", a reopen/finish) recomputes it with 5.0.
select public.refresh_round_results((select id from harness.seed where key = 'round_a1'));
select 'after refresh (same scores)' as step, course_hcp, gross, ags, differential
from public.round_results where player_id = (select id from harness.seed where key = 'player_a1');
rollback;
