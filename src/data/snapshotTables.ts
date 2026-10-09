/**
 * Primary key of every table the tournament snapshot pages through.
 *
 * PostgREST caps a response at 1,000 rows, so the snapshot pages each table
 * and must order by a unique key or pages overlap. Ordering by a column that
 * doesn't exist makes PostgREST answer 400 and the whole tournament fails to
 * load: that is what a missing `team_members` entry did once a team draw was
 * saved (ARCH-09). `snapshotTables.test.ts` checks every key against the
 * migrations and every table the store fetches against this list.
 *
 * The first step of the table registry in docs/quality/PLAN.md §5.4.
 */
export const SNAPSHOT_KEYS = {
  tournaments: ['id'],
  players: ['id'],
  rounds: ['id'],
  pairs: ['id'],
  teams: ['id'],
  team_members: ['team_id', 'player_id'],
  calcutta_lots: ['id'],
  calcutta_bids: ['id'],
  calcutta_buybacks: ['lot_id'],
  payments: ['id'],
  money_adjustments: ['id'],
  game_entries: ['tournament_id', 'game_id', 'player_id'],
  game_results: ['tournament_id', 'game_id', 'player_id'],
  groups: ['id'],
  group_members: ['group_id', 'player_id'],
  round_tees: ['round_id', 'player_id'],
  scores: ['id'],
  snake_tiebreaks: ['round_id', 'group_id', 'hole'],
  card_signatures: ['round_id', 'pair_id'],
  handicap_overrides: ['round_id', 'player_id'],
  hole_awards: ['round_id', 'game_id', 'hole', 'player_id'],
  courses: ['id'],
  tees: ['id'],
  holes: ['tee_id', 'number'],
} as const satisfies Record<string, readonly string[]>

export type SnapshotTable = keyof typeof SNAPSHOT_KEYS
