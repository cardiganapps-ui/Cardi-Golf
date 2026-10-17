/**
 * What 0053's `spectator_board` answers for a snapshot, written out for the
 * tests (never imported by the app): each table with the columns the
 * migration selects, money tables only «Con dinero», and the settings as
 * `spectator_settings` gives them (every peso at zero without it, never a
 * custom bet's description), and without money no side pot's entries, claims
 * or results. The column lists are the ones
 * supabase/tests/spectator_link.sql pins on the real function; the rows come
 * from `snapshotToRows`, which carries every column a table has, so a mapper
 * that read a column the answer lacks would show here.
 */
import type { Snapshot } from '../../engine/types'
import type { Row } from '../mappers'
import { spectatorSettings } from '../spectator'
import { snapshotToRows } from './rows'

/** spectator_board's columns by table, as the migration builds them. */
export const SPECTATOR_COLUMNS: Record<string, string[]> = {
  players: [
    'id',
    'display_name',
    'tier',
    'base_hcp',
    'handicap_source',
    'handicap_index',
    'estimate_inputs',
    'default_tee_id',
    'is_honoree',
    'sort_order',
  ],
  courses: ['id', 'name'],
  tees: ['id', 'course_id', 'name', 'color', 'rating', 'slope', 'sort_order'],
  holes: ['tee_id', 'number', 'par', 'stroke_index', 'yards'],
  rounds: ['id', 'number', 'date', 'course_id', 'holes', 'status'],
  groups: ['id', 'round_id', 'number', 'tee_time', 'start_hole'],
  group_members: ['group_id', 'player_id'],
  round_tees: ['round_id', 'player_id', 'tee_id'],
  pairs: ['id', 'name', 'player1_id', 'player2_id', 'kind', 'picked_by_honoree', 'drawn_at'],
  teams: ['id', 'name', 'number', 'drawn_at'],
  team_members: ['team_id', 'player_id'],
  scores: ['round_id', 'player_id', 'hole', 'strokes', 'putts', 'picked_up', 'updated_at'],
  snake_tiebreaks: ['round_id', 'group_id', 'hole', 'last_holed_player_id'],
  card_signatures: ['round_id', 'pair_id', 'signed_by', 'signed_at'],
  handicap_overrides: ['round_id', 'player_id', 'playing_hcp', 'at'],
  game_entries: ['game_id', 'player_id'],
  hole_awards: ['round_id', 'group_id', 'hole', 'game_id', 'player_id', 'source'],
  game_results: ['game_id', 'player_id', 'share'],
}
/** Only «Con dinero». */
export const SPECTATOR_MONEY_COLUMNS: Record<string, string[]> = {
  calcutta_lots: ['id', 'player_id', 'lot_number', 'status', 'price', 'owner_id', 'sold_at'],
  calcutta_bids: ['id', 'lot_id', 'bidder_id', 'amount', 'created_at'],
  calcutta_buybacks: ['lot_id', 'pct', 'amount', 'paid'],
  payments: ['id', 'from_player_id', 'to_player_id', 'amount', 'kind', 'paid'],
  money_adjustments: ['id', 'source_key', 'kind', 'to_player_id', 'amount', 'call_id', 'created_at', 'voided_at'],
}

const pick = (row: Row, columns: string[]) => Object.fromEntries(columns.map((c) => [c, row[c] ?? null]))

/** The answer for `s`, as the server would give it (version included). */
export function spectatorAnswer(s: Snapshot, money: boolean, version = 'v1'): Row {
  const rows = snapshotToRows(s) as unknown as Record<string, Row[]>
  const t = rows.tournaments![0]!
  const answer: Row = {
    money,
    version,
    tournament: {
      name: t.name,
      tagline: t.tagline,
      logo_url: t.logo_url,
      accent_color: t.accent_color,
      status: t.status,
      current_round_id: t.current_round_id,
      timezone: t.timezone,
      currency: t.currency,
      settings: spectatorSettings(t.settings, money),
      ...(money ? { banker_player_id: t.banker_player_id } : {}),
    },
  }
  // «Sin dinero»: a side pot's entries, claims and results stay out with it (who is in one paid into it).
  const games = (t.settings as { games?: Array<{ id?: string; money?: { source?: string } }> } | null)?.games ?? []
  const hidden = new Set(money ? [] : games.filter((g) => g.money?.source === 'side').map((g) => g.id))
  const kept = (table: string, r: Row) =>
    !['game_entries', 'hole_awards', 'game_results'].includes(table) || !hidden.has(r.game_id as string)
  for (const [table, columns] of Object.entries({ ...SPECTATOR_COLUMNS, ...(money ? SPECTATOR_MONEY_COLUMNS : {}) }))
    answer[table] = (rows[table] ?? []).filter((r) => kept(table, r)).map((r) => pick(r, columns))
  return answer
}
