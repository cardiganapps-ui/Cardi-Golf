/**
 * Live changes applied in place (REL-11, PERF-07).
 *
 * Every Realtime event used to reload the whole tournament: 22 requests in
 * three waves on every phone, for every hole any group saved. On 4G that put
 * a saved hole 4.1 s p50 from the other phones (the target is under 2 s), and
 * a foursome saving a hole cost every phone a full download.
 *
 * The tables that change during play carry their whole row in the event
 * (postgres_changes sends `new` for an insert or update, and the primary key
 * in `old` for a delete), so the row is applied to the snapshot by its key,
 * through the same mapper the fetch uses, and lands where a fetch would put
 * it (the table's key order), so a phone that applied it and a phone that
 * fetched it hold the same list. The structural tables (rounds, groups,
 * players, pairs, the tournament row) still reload: their rows need joins the
 * event does not carry.
 *
 * A row of another tournament is left alone: the channel listens to whole
 * tables and the server filters inserts and updates by what this user may
 * read, so an account in two tournaments hears both. A row of a round or lot
 * this phone has not loaded is not placeable yet ('unknown'): it may be
 * another tournament's, or a day just created here, whose own event reloads.
 * A delete names only its key and is not filtered at all (DB-05): it is
 * applied only when the key is one of this tournament's rows.
 */
import type { Snapshot } from '../engine/types'
import {
  mapBid,
  mapBuyback,
  mapCardSignature,
  mapGameEntry,
  mapGameResult,
  mapHandicapOverride,
  mapHoleAward,
  mapLot,
  mapPayment,
  mapRoundTee,
  mapScore,
  mapSnakeTiebreak,
  type Row,
} from './mappers'

export interface LiveChange {
  table: string
  eventType: 'INSERT' | 'UPDATE' | 'DELETE'
  /** The row after an insert or update (empty for a delete). */
  new: Row
  /** For a delete, the primary key (the default replica identity). */
  old: Row
}

/**
 * What became of a change: applied to the snapshot; not this tournament's, or
 * a delete of a row it does not hold (left alone); of a round or lot this
 * phone has not loaded ('unknown': kept for a while, in case it is a day just
 * created here); or not placeable at all (the caller reloads).
 */
export type ApplyResult = 'applied' | 'ignored' | 'unknown' | 'reload'

/** The tables applied in place: the ones that change hole by hole and sale by sale. */
export const APPLIED_TABLES = [
  'scores',
  'snake_tiebreaks',
  'card_signatures',
  'hole_awards',
  'handicap_overrides',
  'round_tees',
  'payments',
  'calcutta_lots',
  'calcutta_bids',
  'calcutta_buybacks',
  'game_entries',
  'game_results',
] as const
export type AppliedTable = (typeof APPLIED_TABLES)[number]

type Scope = 'tournament' | 'round' | 'lot'

/** How one table's rows live in the snapshot. */
interface Spec<T> {
  scope: Scope
  get(s: Snapshot): T[]
  set(s: Snapshot, list: T[]): void
  /** Whether a snapshot row has this database row's key (an insert or update: the table's unique key). */
  same(x: T, row: Row): boolean
  /** Whether a snapshot row is the one a delete names, when that is not `same` (a score's delete names only its id). */
  deletes?(x: T, key: Row): boolean
  /** The order a fetch returns the table in (`SNAPSHOT_KEYS`), on the snapshot's own fields. */
  order(a: T, b: T): number
  map(row: Row): T
}
const spec = <T>(x: Spec<T>) => x as unknown as Spec<unknown>

/** Compare by each field in turn, as the database orders a uuid or plain-text key: ascending, by code point. */
function byFields<T>(...fields: Array<(x: T) => string | number | null | undefined>) {
  return (a: T, b: T) => {
    for (const f of fields) {
      const x = f(a) ?? ''
      const y = f(b) ?? ''
      if (x < y) return -1
      if (x > y) return 1
    }
    return 0
  }
}

const SPECS: Record<AppliedTable, Spec<unknown>> = {
  scores: spec({
    scope: 'round',
    get: (s) => s.scores,
    set: (s, l) => (s.scores = l),
    // A row is unique by round, player and hole; a delete names only its id.
    same: (x, r) => x.roundId === r.round_id && x.playerId === r.player_id && x.hole === r.hole,
    deletes: (x, k) => x.id != null && x.id === k.id,
    order: byFields((x) => x.id),
    map: mapScore,
  }),
  snake_tiebreaks: spec({
    scope: 'round',
    get: (s) => s.snakeTiebreaks,
    set: (s, l) => (s.snakeTiebreaks = l),
    same: (x, r) => x.roundId === r.round_id && x.groupId === r.group_id && x.hole === r.hole,
    order: byFields((x) => x.roundId, (x) => x.groupId, (x) => x.hole),
    map: mapSnakeTiebreak,
  }),
  card_signatures: spec({
    scope: 'round',
    get: (s) => s.cardSignatures,
    set: (s, l) => (s.cardSignatures = l),
    same: (x, r) => x.roundId === r.round_id && x.pairId === r.pair_id,
    order: byFields((x) => x.roundId, (x) => x.pairId),
    map: mapCardSignature,
  }),
  hole_awards: spec({
    scope: 'round',
    get: (s) => s.holeAwards ?? [],
    set: (s, l) => (s.holeAwards = l),
    same: (x, r) => x.roundId === r.round_id && x.gameId === r.game_id && x.hole === r.hole && x.playerId === r.player_id,
    order: byFields((x) => x.roundId, (x) => x.gameId, (x) => x.hole, (x) => x.playerId),
    map: mapHoleAward,
  }),
  handicap_overrides: spec({
    scope: 'round',
    get: (s) => s.handicapOverrides,
    set: (s, l) => (s.handicapOverrides = l),
    same: (x, r) => x.roundId === r.round_id && x.playerId === r.player_id,
    order: byFields((x) => x.roundId, (x) => x.playerId),
    map: mapHandicapOverride,
  }),
  round_tees: spec({
    scope: 'round',
    get: (s) => s.roundTees,
    set: (s, l) => (s.roundTees = l),
    same: (x, r) => x.roundId === r.round_id && x.playerId === r.player_id,
    order: byFields((x) => x.roundId, (x) => x.playerId),
    map: mapRoundTee,
  }),
  payments: spec({ scope: 'tournament', get: (s) => s.payments, set: (s, l) => (s.payments = l), same: (x, r) => x.id === r.id, order: byFields((x) => x.id), map: mapPayment }),
  calcutta_lots: spec({ scope: 'tournament', get: (s) => s.calcuttaLots, set: (s, l) => (s.calcuttaLots = l), same: (x, r) => x.id === r.id, order: byFields((x) => x.id), map: mapLot }),
  calcutta_bids: spec({ scope: 'lot', get: (s) => s.calcuttaBids, set: (s, l) => (s.calcuttaBids = l), same: (x, r) => x.id === r.id, order: byFields((x) => x.id), map: mapBid }),
  calcutta_buybacks: spec({ scope: 'lot', get: (s) => s.calcuttaBuybacks, set: (s, l) => (s.calcuttaBuybacks = l), same: (x, r) => x.lotId === r.lot_id, order: byFields((x) => x.lotId), map: mapBuyback }),
  game_entries: spec({
    scope: 'tournament',
    get: (s) => s.gameEntries ?? [],
    set: (s, l) => (s.gameEntries = l),
    same: (x, r) => x.gameId === r.game_id && x.playerId === r.player_id,
    order: byFields((x) => x.gameId, (x) => x.playerId),
    map: mapGameEntry,
  }),
  game_results: spec({
    scope: 'tournament',
    get: (s) => s.gameResults ?? [],
    set: (s, l) => (s.gameResults = l),
    same: (x, r) => x.gameId === r.game_id && x.playerId === r.player_id,
    order: byFields((x) => x.gameId, (x) => x.playerId),
    map: mapGameResult,
  }),
}

/**
 * Put every applied table of a fetched snapshot in the order this module
 * inserts in, so a phone that fetched and a phone that applied the same rows
 * hold the same lists (an engine that breaks a tie by list order then agrees).
 */
export function inLiveOrder(s: Snapshot): Snapshot {
  for (const sp of Object.values(SPECS)) sp.set(s, [...sp.get(s)].sort(sp.order))
  return s
}

/** Whether an inserted or updated row is this tournament's: yes, another's (`null`), or of a round or lot not loaded here (`undefined`). */
function owner(s: Snapshot, tournamentId: string, scope: Scope, row: Row): true | null | undefined {
  if (scope === 'tournament') return row.tournament_id === tournamentId ? true : null
  if (scope === 'round') return s.rounds.some((r) => r.id === row.round_id) ? true : undefined
  return s.calcuttaLots.some((l) => l.id === row.lot_id) ? true : undefined
}

/** Whether a change is about a row this predicate picks: for the outbox, which asks whether the server answered for a write it sent. */
export function changeTouches(c: LiveChange, table: string, match: (row: Row) => boolean): boolean {
  if (c.table !== table) return false
  return match((c.eventType === 'DELETE' ? c.old : c.new) ?? {})
}

/**
 * Apply one change to `s`. The table's array is replaced, never mutated, so a
 * snapshot the screen is showing does not move under it.
 */
export function applyChange(s: Snapshot, tournamentId: string, c: LiveChange): ApplyResult {
  const sp = SPECS[c.table as AppliedTable]
  if (!sp) return 'reload'
  const list = sp.get(s)

  if (c.eventType === 'DELETE') {
    const key = c.old
    if (!key || !Object.keys(key).length) return 'reload'
    const hit = sp.deletes ?? sp.same
    // Deletes are not filtered by the server (DB-05): remove only a row this snapshot holds.
    if (!list.some((x) => hit(x, key))) return 'ignored'
    sp.set(s, list.filter((x) => !hit(x, key)))
    return 'applied'
  }

  const row = c.new
  if (!row || !Object.keys(row).length) return 'reload'
  const where = owner(s, tournamentId, sp.scope, row)
  if (where === null) return 'ignored'
  if (where === undefined) return 'unknown'
  const mapped = sp.map(row)
  const at = list.findIndex((x) => sp.same(x, row))
  if (at >= 0 && sp.order(list[at], mapped) === 0) {
    // An update keeps its place.
    sp.set(s, [...list.slice(0, at), mapped, ...list.slice(at + 1)])
    return 'applied'
  }
  // A new row goes where a fetch would put it, and so does one whose place
  // changed (a score this phone sent, now with the id the server gave it).
  const rest = at >= 0 ? [...list.slice(0, at), ...list.slice(at + 1)] : list
  let i = rest.length
  while (i > 0 && sp.order(rest[i - 1], mapped) > 0) i--
  sp.set(s, [...rest.slice(0, i), mapped, ...rest.slice(i)])
  return 'applied'
}
