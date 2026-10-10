/**
 * The tables a tournament's Realtime channel listens to (§8).
 *
 * Every one must be in the `supabase_realtime` publication on production: if
 * a single binding names an unpublished table, the server rejects the
 * channel's whole postgres_changes subscription and no phone hears anything
 * (REL-01). `realtimeTables.test.ts` checks this list against the migrations
 * up to `ON_PRODUCTION`.
 *
 * `teams` and `team_members` (0020) are published by 0025 and come here in a
 * change of their own (REL-01).
 *
 * Most of them reach the boards: the rows of `APPLIED_TABLES`
 * (`realtimeApply.ts`) by key, the rest by a reload. `INBOX_TABLES` are not
 * part of the tournament's snapshot: a change reads the Comité's
 * «Pendientes de revisar» again (`rejectedInbox.ts`), and never touches the
 * boards.
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
  'rejected_writes',
] as const

/** On the channel, but not in the snapshot: their changes go to the Comité's inbox store, never to the boards. */
export const INBOX_TABLES = ['rejected_writes'] as const

/**
 * The newest migration known to be on production, checked there (the
 * `supabase_realtime` publication read with the Management API, or `node
 * scripts/db.mjs check` saying nothing is left to apply). A table published
 * only by a later migration is refused here until this moves: a bundle can
 * reach phones before its migration reaches the database, and a channel
 * naming a table production has not published fails whole (REL-01). Move it
 * only after that check, never to make a test pass.
 *
 * 0028 (2026-10-10): `money_adjustments` (0027) and `rejected_writes` (0028)
 * read back from production's publication.
 */
export const ON_PRODUCTION = '0028'
