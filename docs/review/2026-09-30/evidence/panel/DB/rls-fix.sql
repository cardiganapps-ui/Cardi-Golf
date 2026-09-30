-- Same read with set-based policies: scores_read decides per ROUND (a hashed subplan), and the
-- write policy no longer applies to SELECT. Rolled back; nothing is kept.
\pset footer off
set track_functions = 'all';
select md5('dev60')::uuid as dev60, md5('r1:t60')::uuid as b1, md5('r2:t60')::uuid as b2 \gset
begin;
drop policy scores_read on public.scores;
drop policy scores_write on public.scores;
create policy scores_read on public.scores for select
  using (round_id in (select r.id from public.rounds r where public.is_tournament_member(r.tournament_id)));
create policy scores_write_ins on public.scores for insert with check (
  public.is_tournament_organizer(public.round_tournament_id(round_id))
  or (public.shares_group(round_id, player_id) and public.round_is_live(round_id) and not public.card_is_signed(round_id, player_id)));
create policy scores_write_upd on public.scores for update using (
  public.is_tournament_organizer(public.round_tournament_id(round_id))
  or (public.shares_group(round_id, player_id) and public.round_is_live(round_id) and not public.card_is_signed(round_id, player_id)))
  with check (
  public.is_tournament_organizer(public.round_tournament_id(round_id))
  or (public.shares_group(round_id, player_id) and public.round_is_live(round_id) and not public.card_is_signed(round_id, player_id)));
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'dev60', 'role', 'authenticated', 'is_anonymous', true)::text, true) \g /dev/null
explain (analyze, costs off, summary on) select * from public.scores where round_id in (:'b1', :'b2') order by round_id, player_id, hole limit 1000;
select count(*) as visible_rows from public.scores where round_id in (:'b1', :'b2');
reset role;
select funcname, calls from pg_stat_xact_user_functions where calls > 0 order by calls desc limit 5;
rollback;
