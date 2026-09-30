begin;
-- DB-12 alternative (applied inside the measurement transaction, then rolled back):
-- the read policy is set-based and the FOR ALL write policy is split so it is no longer OR'd into SELECT.
drop policy scores_read on public.scores;
drop policy scores_write on public.scores;
create policy scores_read on public.scores for select
  using (round_id = any (array(select r.id from public.rounds r where public.is_tournament_member(r.tournament_id))));
create policy scores_insert on public.scores for insert
  with check (public.is_tournament_organizer(public.round_tournament_id(round_id)) or (public.shares_group(round_id, player_id) and public.round_is_live(round_id) and not public.card_is_signed(round_id, player_id)));
create policy scores_update on public.scores for update
  using (public.is_tournament_organizer(public.round_tournament_id(round_id)) or (public.shares_group(round_id, player_id) and public.round_is_live(round_id) and not public.card_is_signed(round_id, player_id)))
  with check (public.is_tournament_organizer(public.round_tournament_id(round_id)) or (public.shares_group(round_id, player_id) and public.round_is_live(round_id) and not public.card_is_signed(round_id, player_id)));
create policy scores_delete on public.scores for delete
  using (public.is_tournament_organizer(public.round_tournament_id(round_id)) or (public.shares_group(round_id, player_id) and public.round_is_live(round_id) and not public.card_is_signed(round_id, player_id)));
select set_config('request.jwt.claims', harness.claims('c435d164-8d3f-4ed0-bf34-d6c9141d5209'), true) \g /dev/null
set local role authenticated;
select count(*) from (select * from public.tournaments where id = '10f4d33d-3513-4487-ad23-3eeebc50c66f') x \g /dev/null
select count(*) from (select * from public.players where tournament_id = '10f4d33d-3513-4487-ad23-3eeebc50c66f' order by id limit 1000) x \g /dev/null
select count(*) from (select * from public.rounds where tournament_id = '10f4d33d-3513-4487-ad23-3eeebc50c66f' order by id limit 1000) x \g /dev/null
select count(*) from (select * from public.pairs where tournament_id = '10f4d33d-3513-4487-ad23-3eeebc50c66f' order by id limit 1000) x \g /dev/null
select count(*) from (select * from public.teams where tournament_id = '10f4d33d-3513-4487-ad23-3eeebc50c66f' order by id limit 1000) x \g /dev/null
select count(*) from (select * from public.calcutta_lots where tournament_id = '10f4d33d-3513-4487-ad23-3eeebc50c66f' order by id limit 1000) x \g /dev/null
select count(*) from (select * from public.payments where tournament_id = '10f4d33d-3513-4487-ad23-3eeebc50c66f' order by id limit 1000) x \g /dev/null
select count(*) from (select * from public.game_entries where tournament_id in ('10f4d33d-3513-4487-ad23-3eeebc50c66f') order by game_id, player_id limit 1000) x \g /dev/null
select count(*) from (select * from public.game_results where tournament_id in ('10f4d33d-3513-4487-ad23-3eeebc50c66f') order by game_id, player_id limit 1000) x \g /dev/null
select count(*) from (select * from public.groups where round_id = any(array['d2dfbf9d-c58d-4aa5-bd15-96689400b409','58eff631-d778-414a-83b7-3ff2f7877f10']::uuid[]) order by id limit 1000) x \g /dev/null
select count(*) from (select * from public.round_tees where round_id = any(array['d2dfbf9d-c58d-4aa5-bd15-96689400b409','58eff631-d778-414a-83b7-3ff2f7877f10']::uuid[]) order by round_id, player_id limit 1000) x \g /dev/null
select count(*) from (select * from public.scores where round_id = any(array['d2dfbf9d-c58d-4aa5-bd15-96689400b409','58eff631-d778-414a-83b7-3ff2f7877f10']::uuid[]) order by id limit 1000) x \g /dev/null
select count(*) from (select * from public.snake_tiebreaks where round_id = any(array['d2dfbf9d-c58d-4aa5-bd15-96689400b409','58eff631-d778-414a-83b7-3ff2f7877f10']::uuid[]) order by round_id, group_id, hole limit 1000) x \g /dev/null
select count(*) from (select * from public.card_signatures where round_id = any(array['d2dfbf9d-c58d-4aa5-bd15-96689400b409','58eff631-d778-414a-83b7-3ff2f7877f10']::uuid[]) order by round_id, pair_id limit 1000) x \g /dev/null
select count(*) from (select * from public.handicap_overrides where round_id = any(array['d2dfbf9d-c58d-4aa5-bd15-96689400b409','58eff631-d778-414a-83b7-3ff2f7877f10']::uuid[]) order by round_id, player_id limit 1000) x \g /dev/null
select count(*) from (select * from public.courses where id = any(array['6056e704-c31b-4ce1-a056-1a308cbb8828']::uuid[]) order by id limit 1000) x \g /dev/null
select count(*) from (select * from public.tees where course_id = any(array['6056e704-c31b-4ce1-a056-1a308cbb8828']::uuid[]) order by id limit 1000) x \g /dev/null
select count(*) from (select * from public.hole_awards where round_id = any(array['d2dfbf9d-c58d-4aa5-bd15-96689400b409','58eff631-d778-414a-83b7-3ff2f7877f10']::uuid[]) order by round_id, game_id, hole, player_id limit 1000) x \g /dev/null
select count(*) from (select * from public.group_members where group_id = any(array['f9ba65a8-937b-4ad7-be8d-d35f4cc6bec5','87dd2092-fb6d-4924-bc17-c23c4e75be9a','90975460-5705-4d16-8ad6-064963d1a88d','686aaf57-90b1-4de6-92d9-32b654be7f50','5ca849cb-4bd8-4235-b416-f4b3adfc79a5','0683029f-3705-4f76-b135-c0f6715f05c4']::uuid[]) order by group_id, player_id limit 1000) x \g /dev/null
select count(*) from (select * from public.holes where tee_id = any(array['a5adf3c8-3ec4-4381-b076-1212c9b7ca01']::uuid[]) order by tee_id, number limit 1000) x \g /dev/null
rollback;
