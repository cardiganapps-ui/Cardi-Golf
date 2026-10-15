-- 0057: every player a tournament's row names is a player of that tournament (SEC-11).
--
-- A row that names a player (a score, its writer, a bid, a lot's owner, a payment, a pair, a group member...) was
-- keyed to players by id alone, so a writer allowed on its own tournament's rows (the Comité, a definer function)
-- could name a player of another tournament and the database took it. Only card_signatures (0054) and team_members (0020)
-- tied their player to the row's tournament. Each of those keys now carries the row's tournament as well (the player column and
-- tournament_id, against players (id, tournament_id), or the other way round where an index already leads with the
-- tournament), under the same name and with the same action when the player is deleted (cascade, or that column alone set
-- to null), so a row can only name its own tournament's players. One key between each pair of tables, as before,
-- so no request embed changes. A row whose tournament is still null (none on production) is not checked until it
-- has one; the tenant triggers (0030) fill it on every insert. Production had no row naming another tournament's
-- player when this was written (checked column by column). tournaments.banker_player_id is bound the same way, to
-- the tournament's own id.

alter table public.calcutta_bids drop constraint calcutta_bids_bidder_id_fkey,
  add constraint calcutta_bids_bidder_id_fkey foreign key (bidder_id, tournament_id) references public.players (id, tournament_id) on delete cascade;
alter table public.calcutta_lots drop constraint calcutta_lots_owner_id_fkey,
  add constraint calcutta_lots_owner_id_fkey foreign key (owner_id, tournament_id) references public.players (id, tournament_id) on delete set null (owner_id);
alter table public.calcutta_lots drop constraint calcutta_lots_player_id_fkey,
  add constraint calcutta_lots_player_id_fkey foreign key (tournament_id, player_id) references public.players (tournament_id, id) on delete cascade;
alter table public.card_signatures drop constraint card_signatures_signed_by_fkey,
  add constraint card_signatures_signed_by_fkey foreign key (signed_by, tournament_id) references public.players (id, tournament_id) on delete set null (signed_by);
alter table public.device_sessions drop constraint device_sessions_player_id_fkey,
  add constraint device_sessions_player_id_fkey foreign key (player_id, tournament_id) references public.players (id, tournament_id) on delete cascade;
alter table public.game_entries drop constraint game_entries_player_id_fkey,
  add constraint game_entries_player_id_fkey foreign key (player_id, tournament_id) references public.players (id, tournament_id) on delete cascade;
alter table public.game_results drop constraint game_results_player_id_fkey,
  add constraint game_results_player_id_fkey foreign key (player_id, tournament_id) references public.players (id, tournament_id) on delete cascade;
alter table public.group_members drop constraint group_members_player_id_fkey,
  add constraint group_members_player_id_fkey foreign key (player_id, tournament_id) references public.players (id, tournament_id) on delete cascade;
alter table public.handicap_overrides drop constraint handicap_overrides_by_fkey,
  add constraint handicap_overrides_by_fkey foreign key (by, tournament_id) references public.players (id, tournament_id) on delete set null (by);
alter table public.handicap_overrides drop constraint handicap_overrides_player_id_fkey,
  add constraint handicap_overrides_player_id_fkey foreign key (player_id, tournament_id) references public.players (id, tournament_id) on delete cascade;
alter table public.hole_awards drop constraint hole_awards_decided_by_fkey,
  add constraint hole_awards_decided_by_fkey foreign key (decided_by, tournament_id) references public.players (id, tournament_id) on delete set null (decided_by);
alter table public.hole_awards drop constraint hole_awards_player_id_fkey,
  add constraint hole_awards_player_id_fkey foreign key (player_id, tournament_id) references public.players (id, tournament_id) on delete cascade;
alter table public.money_adjustments drop constraint money_adjustments_to_player_id_fkey,
  add constraint money_adjustments_to_player_id_fkey foreign key (to_player_id, tournament_id) references public.players (id, tournament_id) on delete cascade;
alter table public.pairs drop constraint pairs_player1_id_fkey,
  add constraint pairs_player1_id_fkey foreign key (player1_id, tournament_id) references public.players (id, tournament_id) on delete cascade;
alter table public.pairs drop constraint pairs_player2_id_fkey,
  add constraint pairs_player2_id_fkey foreign key (player2_id, tournament_id) references public.players (id, tournament_id) on delete cascade;
alter table public.payments drop constraint payments_from_player_id_fkey,
  add constraint payments_from_player_id_fkey foreign key (from_player_id, tournament_id) references public.players (id, tournament_id) on delete cascade;
alter table public.payments drop constraint payments_to_player_id_fkey,
  add constraint payments_to_player_id_fkey foreign key (to_player_id, tournament_id) references public.players (id, tournament_id) on delete cascade;
alter table public.photos drop constraint photos_player_id_fkey,
  add constraint photos_player_id_fkey foreign key (player_id, tournament_id) references public.players (id, tournament_id) on delete set null (player_id);
alter table public.pin_claims drop constraint pin_claims_player_id_fkey,
  add constraint pin_claims_player_id_fkey foreign key (tournament_id, player_id) references public.players (tournament_id, id) on delete cascade;
alter table public.pin_push_subscriptions drop constraint pin_push_subscriptions_player_id_fkey,
  add constraint pin_push_subscriptions_player_id_fkey foreign key (player_id, tournament_id) references public.players (id, tournament_id) on delete cascade;
alter table public.player_notices drop constraint player_notices_player_id_fkey,
  add constraint player_notices_player_id_fkey foreign key (player_id, tournament_id) references public.players (id, tournament_id) on delete cascade;
alter table public.rejected_writes drop constraint rejected_writes_player_id_fkey,
  add constraint rejected_writes_player_id_fkey foreign key (player_id, tournament_id) references public.players (id, tournament_id) on delete cascade;
alter table public.rejected_writes drop constraint rejected_writes_writer_player_id_fkey,
  add constraint rejected_writes_writer_player_id_fkey foreign key (writer_player_id, tournament_id) references public.players (id, tournament_id) on delete set null (writer_player_id);
alter table public.round_results drop constraint round_results_player_id_fkey,
  add constraint round_results_player_id_fkey foreign key (player_id, tournament_id) references public.players (id, tournament_id) on delete cascade;
alter table public.round_tees drop constraint round_tees_player_id_fkey,
  add constraint round_tees_player_id_fkey foreign key (player_id, tournament_id) references public.players (id, tournament_id) on delete cascade;
alter table public.scores drop constraint scores_entered_by_fkey,
  add constraint scores_entered_by_fkey foreign key (entered_by, tournament_id) references public.players (id, tournament_id) on delete set null (entered_by);
alter table public.scores drop constraint scores_player_id_fkey,
  add constraint scores_player_id_fkey foreign key (player_id, tournament_id) references public.players (id, tournament_id) on delete cascade;
alter table public.snake_tiebreaks drop constraint snake_tiebreaks_decided_by_fkey,
  add constraint snake_tiebreaks_decided_by_fkey foreign key (decided_by, tournament_id) references public.players (id, tournament_id) on delete set null (decided_by);
alter table public.snake_tiebreaks drop constraint snake_tiebreaks_last_holed_player_id_fkey,
  add constraint snake_tiebreaks_last_holed_player_id_fkey foreign key (last_holed_player_id, tournament_id) references public.players (id, tournament_id) on delete cascade;
alter table public.tournament_money drop constraint tournament_money_player_id_fkey,
  add constraint tournament_money_player_id_fkey foreign key (tournament_id, player_id) references public.players (tournament_id, id) on delete cascade;
alter table public.tournament_results drop constraint tournament_results_player_id_fkey,
  add constraint tournament_results_player_id_fkey foreign key (tournament_id, player_id) references public.players (tournament_id, id) on delete cascade;
alter table public.tournaments drop constraint tournaments_banker_fk,
  add constraint tournaments_banker_fk foreign key (banker_player_id, id) references public.players (id, tournament_id) on delete set null (banker_player_id);
alter table public.device_status drop constraint device_status_player_id_fkey,
  add constraint device_status_player_id_fkey foreign key (player_id, tournament_id) references public.players (id, tournament_id) on delete set null (player_id);

-- Each key a player column had an index for keeps one: where a column had an index of its own, it now leads one on
-- (column, tournament_id), the same lookups by player and the key's, so deleting a player finds what names him
-- without a scan.
drop index public.device_sessions_player_idx;
create index device_sessions_player_idx on public.device_sessions (player_id, tournament_id);
drop index public.group_members_player_idx;
create index group_members_player_idx on public.group_members (player_id, tournament_id);
drop index public.money_adjustments_player_idx;
create index money_adjustments_player_idx on public.money_adjustments (to_player_id, tournament_id);
drop index public.pin_push_subscriptions_player_idx;
create index pin_push_subscriptions_player_idx on public.pin_push_subscriptions (player_id, tournament_id);
create index player_notices_player_id_tenant_idx on public.player_notices (player_id, tournament_id);
drop index public.rejected_writes_player_idx;
create index rejected_writes_player_idx on public.rejected_writes (player_id, tournament_id);
drop index public.rejected_writes_writer_idx;
create index rejected_writes_writer_idx on public.rejected_writes (writer_player_id, tournament_id);
drop index public.round_results_player_idx;
create index round_results_player_idx on public.round_results (player_id, tournament_id);
drop index public.device_status_player;
create index device_status_player on public.device_status (player_id, tournament_id) where player_id is not null;
