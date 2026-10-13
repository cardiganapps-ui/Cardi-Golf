-- 0049: each phone hears its own tournament, deletes included (DB-05).
--
-- A tournament's live channel listened to every change of every published
-- table. The server matched each change to every phone listening and
-- checked it against each one's row-level security, so another
-- tournament's insert or update cost one check per phone on the platform
-- before it was refused, and its deletes, which RLS cannot check (the row is
-- gone), reached every phone listening, their keys only.
--
-- The app now filters each binding by tournament (`tournament_id=eq.<id>`;
-- the tournament row by `id`, src/data/realtimeTables.ts): the server sends
-- a phone its own tournament's changes and no other's, and checks RLS only
-- for those. Postgres Changes reads a delete's filter from what the delete
-- logged, which by default is the primary key only, so a filter on
-- tournament_id would drop every delete, this tournament's too. Each
-- published table but `tournaments` (whose filter is its primary key) now
-- logs its whole old row: replica identity full. The old row still never
-- reaches a phone whole: with RLS on, a delete's old record is cut to the
-- primary key before it is sent.
--
-- What it costs: an update or a delete on these tables writes the old row to
-- the WAL too. The rows are small (a hole, a bid, a group's member) and the
-- writes few.
--
-- supabase/tests/realtime_filters.sql holds every published table to it,
-- and src/data/realtimeTables.test.ts holds the bundle to the migrations on
-- production. Release order: this reaches production before the bundle that
-- filters (a filtered binding on a table without it hears none of its
-- deletes). A bundle from before keeps listening unfiltered, as it did.

set local lock_timeout = '10s';

alter table public.players replica identity full;
alter table public.pairs replica identity full;
alter table public.rounds replica identity full;
alter table public.groups replica identity full;
alter table public.group_members replica identity full;
alter table public.round_tees replica identity full;
alter table public.scores replica identity full;
alter table public.snake_tiebreaks replica identity full;
alter table public.card_signatures replica identity full;
alter table public.handicap_overrides replica identity full;
alter table public.calcutta_lots replica identity full;
alter table public.calcutta_bids replica identity full;
alter table public.calcutta_buybacks replica identity full;
alter table public.payments replica identity full;
alter table public.money_adjustments replica identity full;
alter table public.game_entries replica identity full;
alter table public.hole_awards replica identity full;
alter table public.game_results replica identity full;
alter table public.rejected_writes replica identity full;
alter table public.teams replica identity full;
alter table public.team_members replica identity full;
