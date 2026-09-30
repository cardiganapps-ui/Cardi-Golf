-- V11: Ensayo-sized score table in my own harness db (v11_verify): tournament A gets 12 players, 2 rounds, 432 scores.
\set ON_ERROR_STOP 1
\set QUIET 1
select id as t_a from harness.seed where key = 'tournament_a' \gset
select id as r_a1 from harness.seed where key = 'round_a1' \gset
insert into public.players (tournament_id, full_name, display_name, sort_order)
select :'t_a', 'Jugador ' || g, 'J' || g, 10 + g from generate_series(4, 12) g;
insert into public.rounds (tournament_id, number, holes, status) values (:'t_a', 2, 18, 'live') returning id as r_a2 \gset
insert into harness.seed (key, id, note) values ('v11_round_a2', :'r_a2', 'V11: tournament A round 2 (live)');
-- 432 score rows (12 players x 18 holes x 2 rounds), inserted as the Comité would (reason set, no dispute).
select set_config('cardi.comite', '1', false) \g /dev/null
insert into public.scores (round_id, player_id, hole, strokes, putts, picked_up, entered_by, client_ts)
select r.id, p.id, h, 4 + (h % 3), 2, false, p.id, now()
from public.rounds r cross join public.players p cross join generate_series(1, 18) h
where r.tournament_id = :'t_a' and p.tournament_id = :'t_a'
on conflict (round_id, player_id, hole) do nothing;
select set_config('cardi.comite', '', false) \g /dev/null
\unset QUIET
select count(*) as scores_in_tournament_a from public.scores s join public.rounds r on r.id = s.round_id where r.tournament_id = :'t_a';
analyze;
