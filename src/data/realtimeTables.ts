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
 * A table only the newest migration publishes waits for the next change:
 * this bundle can reach phones before that migration reaches production, and
 * then the channel would name a table production has not published and fail
 * whole (REL-01). `money_adjustments` (0027) waits for that reason; until it
 * comes back, a phone reads the Comité's decisions on its next fetch (the
 * Comité's own phone fetches after each one, every phone at least every five
 * minutes, `HEAL_MS`), and its row changes are already applied by id
 * (`realtimeApply.ts`) for when it does.
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
