/**
 * MOT-06, MOT-18: the board as this phone last showed it, per tournament. For each row with a result, its place,
 * its figure and its day's figure, with the day that figure belongs to. En vivo counts from it for as long as it
 * stays on screen: how many places each row moved, and which figures changed. A player who looks at the board
 * between shots, after entering a hole on the Tarjeta, sees who moved and what arrived since the last look. The
 * board used to mark only a re-sort it was on screen for, and for half a second.
 *
 * It is part of the copy of the boards a phone keeps (the privacy notice's «una copia de lo último que cargó»)
 * and goes with it: changing player, signing out, a tournament that no longer exists (`snapshotCache`'s
 * `clearCached`, `clearAllCached`). A link to watch keeps nothing of the tournament (STRAT-05), so there it lives
 * in memory for the visit only.
 */
export interface SeenRow {
  /** Its place on the board, as a number: «T3» is 3. */
  place: number
  figure: string
  today: string
}
export interface SeenBoard {
  /** The day the rows' `today` is of. */
  round: string | null
  rows: Readonly<Record<string, SeenRow>>
}

const PREFIX = 'cardi-golf:board-seen:'
/** A link to watch's looks, for the visit. */
const visit = new Map<string, SeenBoard>()

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

/** A stored look, if it still reads as one: anything else is no look. */
export function readBoard(raw: unknown): SeenBoard | null {
  if (!raw || typeof raw !== 'object') return null
  const { round, rows } = raw as { round?: unknown; rows?: unknown }
  if ((round !== null && typeof round !== 'string') || !rows || typeof rows !== 'object' || Array.isArray(rows))
    return null
  const out: Record<string, SeenRow> = {}
  for (const [id, r] of Object.entries(rows as Record<string, unknown>)) {
    const row = r as { place?: unknown; figure?: unknown; today?: unknown } | null
    if (
      !row ||
      typeof row.place !== 'number' ||
      !Number.isInteger(row.place) ||
      row.place < 1 ||
      typeof row.figure !== 'string' ||
      typeof row.today !== 'string'
    )
      return null
    out[id] = { place: row.place, figure: row.figure, today: row.today }
  }
  return { round, rows: out }
}

/** What this phone last showed of the tournament's board; `keep` is false on a link to watch. */
export function lastSeen(tournamentId: string, keep: boolean): SeenBoard | null {
  if (!keep) return visit.get(tournamentId) ?? null
  try {
    const raw = storage()?.getItem(PREFIX + tournamentId)
    return raw ? readBoard(JSON.parse(raw)) : null
  } catch {
    return null
  }
}

/** The board on screen now: the next look counts from it. */
export function markSeen(tournamentId: string, board: SeenBoard, keep: boolean): void {
  if (!keep) {
    visit.set(tournamentId, board)
    return
  }
  try {
    storage()?.setItem(PREFIX + tournamentId, JSON.stringify(board))
  } catch {
    // A phone that keeps nothing (private mode, a full disk) counts from what is on screen, as on a first look.
  }
}

/** Forget a tournament's look, or every one (null: sign-out). */
export function forgetSeen(tournamentId: string | null): void {
  if (tournamentId) visit.delete(tournamentId)
  else visit.clear()
  const s = storage()
  if (!s) return
  try {
    if (tournamentId) {
      s.removeItem(PREFIX + tournamentId)
      return
    }
    const keys: string[] = []
    for (let i = 0; i < s.length; i++) {
      const k = s.key(i)
      if (k?.startsWith(PREFIX)) keys.push(k)
    }
    for (const k of keys) s.removeItem(k)
  } catch {
    /* nothing kept, nothing to forget */
  }
}
