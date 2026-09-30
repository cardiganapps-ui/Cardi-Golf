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
