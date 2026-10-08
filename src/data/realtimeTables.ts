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
  'money_adjustments',
  'game_entries',
  'hole_awards',
  'game_results',
] as const
