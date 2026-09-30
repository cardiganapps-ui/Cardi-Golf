\set QUIET 1
select id as r_a2 from harness.seed where key = 'round_a1' \gset
select id as p_a1 from harness.seed where key = 'player_a1' \gset
select id as dev_a from harness.seed where key = 'dev_a' \gset
begin;
select set_config('request.jwt.claims', harness.claims(:'dev_a'), true) \g /dev/null
set local role authenticated;
\unset QUIET
\timing on
explain (analyze, costs off, summary on)
insert into public.scores (round_id, player_id, hole, strokes, putts, picked_up, entered_by, client_ts)
values (:'r_a2', :'p_a1', 3, 6, 2, false, :'p_a1', now())
on conflict (round_id, player_id, hole) do update set round_id = excluded.round_id, player_id = excluded.player_id, hole = excluded.hole,
  strokes = excluded.strokes, putts = excluded.putts, picked_up = excluded.picked_up, entered_by = excluded.entered_by, client_ts = excluded.client_ts;
insert into public.scores (round_id, player_id, hole, strokes, putts, picked_up, entered_by, client_ts)
values (:'r_a2', :'p_a1', 4, 6, 2, false, :'p_a1', now())
on conflict (round_id, player_id, hole) do update set strokes = excluded.strokes, putts = excluded.putts, picked_up = excluded.picked_up, entered_by = excluded.entered_by, client_ts = excluded.client_ts;
insert into public.scores (round_id, player_id, hole, strokes, putts, picked_up, entered_by, client_ts)
values (:'r_a2', :'p_a1', 5, 6, 2, false, :'p_a1', now())
on conflict (round_id, player_id, hole) do update set strokes = excluded.strokes, putts = excluded.putts, picked_up = excluded.picked_up, entered_by = excluded.entered_by, client_ts = excluded.client_ts;
\timing off
rollback;
