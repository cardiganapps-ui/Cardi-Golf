/**
 * The tables a tournament's Realtime channel listens to (§8).
 *
 * Every one must be in the `supabase_realtime` publication: if a single
 * binding names an unpublished table, the server rejects the channel's whole
 * postgres_changes subscription and no phone hears anything (REL-01).
 * `realtimeTables.test.ts` checks this list against the migrations.
 *
 * `teams` and `team_members` (0020) are not published yet; they come back
 * here with the migration that publishes them.
 *
 * A table only the newest migration publishes waits for the next change.
 * Releases apply the migration first (0027 reaches production before the
 * bundle that reads it), but the channel is the one read that must never
 * fail: if a bundle ever reached phones first, a channel naming a table
 * production has not published would fail whole (REL-01), and a table
 * missing from the backup fails it loudly instead. `money_adjustments`
 * (0027) waits for that reason; until it
 * comes back, a phone reads the Comité's decisions on its next fetch (the
 * Comité's own phone fetches after each one, every phone at least every five
 * minutes, `HEAL_MS`), and its row changes are already applied by id
 * (`realtimeApply.ts`) for when it does. `rejected_writes` (published by
 * 0028) waits the same way: the Comité's «Pendientes de revisar» reads it
 * when the screen opens and after each answer (`rejectedInbox.ts`), and a
 * bundle after 0028 is on production may listen to it.
 */
export const REALTIME_TABLES = [
  'tournaments',
  'players',
  'pairs',
  'rounds',
  'groups',
  'group_members',
  'round_tees',
  'scores',
  'snake_tiebreaks',
  'card_signatures',
  'handicap_overrides',
  'calcutta_lots',
  'calcutta_bids',
  'calcutta_buybacks',
  'payments',
  'game_entries',
  'hole_awards',
  'game_results',
] as const
