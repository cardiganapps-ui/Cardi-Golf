/**
 * The tables a tournament's Realtime channel listens to (§8).
 *
 * Every one must be in the `supabase_realtime` publication on production: if
 * a single binding names an unpublished table, the server rejects the
 * channel's whole postgres_changes subscription and no phone hears anything
 * (REL-01). `realtimeTables.test.ts` checks this list against the migrations
 * up to `ON_PRODUCTION`.
 *
 * Each binding is filtered by tournament (`liveFilter`), so the server sends
 * a phone its own tournament's changes and no other's (DB-05).
 *
 * Most of them reach the boards: the rows of `APPLIED_TABLES`
 * (`realtimeApply.ts`) by key, the rest (`RELOADED_TABLES`) by a reload, but
 * only for a change that concerns this tournament (`concernsBoards`: a
 * server without the filters, or a bundle from before them, still hears
 * every tournament's deletes). `INBOX_TABLES` are not part of the
 * tournament's snapshot: a change reads the Comité's «Pendientes de revisar»
 * again (`rejectedInbox.ts`), and never touches the boards.
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
  'teams',
  'team_members',
] as const

export type RealtimeTable = (typeof REALTIME_TABLES)[number]

/**
 * The column a table's binding is filtered on (DB-05): the tournament row by its id, every other table by
 * its `tournament_id` (since 0030 each round-, group- and lot-scoped table carries one). Realtime refuses a
 * filter on a column the table lacks, and the whole channel with it (REL-01), and Postgres Changes reads a
 * delete's filter from what the delete logged: a filter that is not the primary key needs the table to log
 * its whole old row (`replica identity full`, 0049), or the phone hears none of its deletes.
 * `realtimeTables.test.ts` holds both to the migrations up to `ON_PRODUCTION`.
 */
export function filterColumn(table: RealtimeTable): 'id' | 'tournament_id' {
  return table === 'tournaments' ? 'id' : 'tournament_id'
}

/** The binding's filter: this tournament's rows only. */
export function liveFilter(table: RealtimeTable, tournamentId: string): string {
  return `${filterColumn(table)}=eq.${tournamentId}`
}

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
 * 0030 (2026-10-10): `db.mjs migrate` ran through 0030, and `teams` and
 * `team_members` (published by 0025) read back from production's publication.
 * 0049 (2026-10-13): `db.mjs migrate` ran through 0049, after a full backup;
 * production's catalog read back: the same 22 published tables, the 21 but
 * `tournaments` with `relreplident` 'f', and each one's filter column there and
 * not null. `rls-test` and `platform-test` passed on it.
 */
export const ON_PRODUCTION = '0049'
