/**
 * The Comité's inbox of holes the server did not take (REL-08): save_hole
 * (0026) keeps every refusal and every conflict in `rejected_writes`, with
 * what the phone sent. The Comité is asked only about a refusal of a value a
 * person typed (`rejected_inbox`, 0028): a conflict is the phone's to settle
 * (it sends its value again over an untouched default, or the player picks
 * «Dejar el suyo» or «Guardar el mío»), and the par and 2 putts the Tarjeta
 * fills in for a player nobody touched (`auto`) are nobody's capture. The
 * Comité applies one, against the hole it saw, or dismisses it, with a
 * reason (`resolve_rejected_write`, 0028).
 *
 * Read on demand, not over the channel: the Comité's screens fetch the open
 * rows when they open and after each answer. A database without the inbox
 * yet says so (`unavailable`) instead of failing the screen, and nothing
 * waits on it.
 */
import { create } from 'zustand'
import { rejectedInboxRows, resolveRejectedWrite, type SeenHole } from './api'
import type { Row } from './mappers'

export type RejectedReason = 'round_not_live' | 'card_signed' | 'not_in_group' | 'invalid'

/** One open row: what a phone sent for one player's hole, and why the server kept it. */
export interface InboxItem {
  id: string
  roundId: string
  hole: number
  playerId: string
  /** The player of the phone that sent it (null: a phone with no player any more). */
  writerPlayerId: string | null
  reason: RejectedReason
  /** The fields the phone set (`payload.fields`), as sent. */
  fields: unknown
  /** The row the phone saw (`payload.base`); undefined when it sent none. */
  base: unknown
  createdAt: string
}

/** A hole's three values. */
export interface HoleValue {
  strokes: number | null
  putts: number | null
  pickedUp: boolean
}

function toItem(r: Row): InboxItem {
  const payload = (r.payload && typeof r.payload === 'object' ? r.payload : {}) as Row
  return {
    id: String(r.id),
    roundId: String(r.round_id),
    hole: Number(r.hole),
    playerId: String(r.player_id),
    writerPlayerId: (r.writer_player_id as string | null) ?? null,
    reason: r.reason as RejectedReason,
    fields: payload.fields,
    base: 'base' in payload ? payload.base : undefined,
    createdAt: String(r.created_at ?? ''),
  }
}

/** The holes the Comité decides, oldest first; null when the database has no inbox yet. */
export async function listOpenRejected(tournamentId: string): Promise<InboxItem[] | null> {
  const rows = await rejectedInboxRows(tournamentId)
  return rows ? rows.map(toItem) : null
}

const KEYS = ['strokes', 'putts', 'picked_up']
const isObject = (v: unknown): v is Row => !!v && typeof v === 'object' && !Array.isArray(v)

/**
 * The hole once the row is applied: its fields over `current`, as 0028
 * writes them (a number of strokes is no pick-up, a pick-up has no strokes),
 * or null when the server would refuse them. Mirrors resolve_rejected_write.
 */
export function appliedValue(fields: unknown, current: HoleValue | null): HoleValue | null {
  if (!isObject(fields) || !Object.keys(fields).length || Object.keys(fields).some((k) => !KEYS.includes(k))) return null
  const numOrNull = (v: unknown) => v === null || typeof v === 'number'
  if (('strokes' in fields && !numOrNull(fields.strokes)) || ('putts' in fields && !numOrNull(fields.putts)) || ('picked_up' in fields && typeof fields.picked_up !== 'boolean')) return null
  let strokes = 'strokes' in fields ? (fields.strokes as number | null) : (current?.strokes ?? null)
  const putts = 'putts' in fields ? (fields.putts as number | null) : (current?.putts ?? null)
  const pickedUp = 'picked_up' in fields ? (fields.picked_up as boolean) : typeof fields.strokes === 'number' ? false : (current?.pickedUp ?? false)
  if (pickedUp) strokes = null
  if (!pickedUp && (strokes === null || !Number.isInteger(strokes) || strokes < 1 || strokes > 15)) return null
  if (putts !== null && (!Number.isInteger(putts) || putts < 0 || putts > 15 || (strokes !== null && putts > strokes))) return null
  return { strokes, putts, pickedUp }
}

/** What the phone meant: its fields over the row it saw (over the hole as it is now when it sent none). */
export function sentValue(item: InboxItem, current: HoleValue | null): HoleValue | null {
  if (item.base === undefined) return appliedValue(item.fields, current)
  const b = isObject(item.base) ? item.base : {}
  const seen: HoleValue = { strokes: typeof b.strokes === 'number' ? b.strokes : null, putts: typeof b.putts === 'number' ? b.putts : null, pickedUp: b.picked_up === true }
  return appliedValue(item.fields, seen)
}

export const sameValue = (a: HoleValue | null, b: HoleValue | null) => !!a && !!b && a.strokes === b.strokes && a.putts === b.putts && a.pickedUp === b.pickedUp

/** The hole as the Comité's screen shows it, as `resolve_rejected_write` checks it: its three values, `{}` for none. */
export const seenHole = (current: HoleValue | null): SeenHole => (current ? { strokes: current.strokes, putts: current.putts, picked_up: current.pickedUp } : {})

const refusal = (e: unknown, text: RegExp) => (e as { code?: unknown } | null)?.code === '22023' && text.test(e instanceof Error ? e.message : '')
/** The server's refusal of an apply whose hole changed since the Comité looked (0028): the boards are read again. */
export const isStaleHole = (e: unknown) => refusal(e, /^El hoyo cambió/)
/** Another Comité phone answered it first (0028): for a bulk dismissal, that one is done. */
export const isAlreadyResolved = (e: unknown) => refusal(e, /^Esa captura ya estaba resuelta/)

interface InboxState {
  tournamentId: string | null
  items: InboxItem[]
  status: 'idle' | 'loading' | 'ready' | 'unavailable' | 'error'
  error: unknown
  /** A design fixture's rows: there is no server to read them from. */
  fixture: boolean
}

export const useRejectedInbox = create<InboxState>(() => ({ tournamentId: null, items: [], status: 'idle', error: null, fixture: false }))

let generation = 0

/** Fetch the tournament's open rows into the store. Never throws: a failure is the store's `error`. */
export async function loadRejectedInbox(tournamentId: string): Promise<void> {
  const s = useRejectedInbox.getState()
  if (s.fixture && s.tournamentId === tournamentId) return
  const mine = ++generation
  const same = s.tournamentId === tournamentId
  useRejectedInbox.setState({ tournamentId, status: 'loading', error: null, items: same ? s.items : [], fixture: false })
  try {
    const items = await listOpenRejected(tournamentId)
    if (mine !== generation) return
    useRejectedInbox.setState(items ? { items, status: 'ready' } : { items: [], status: 'unavailable' })
  } catch (e) {
    if (mine !== generation) return
    useRejectedInbox.setState({ status: 'error', error: e })
  }
}

/** The rows the server answered for leave the list at once (the read after says the rest). */
function drop(tournamentId: string, ids: string[]) {
  const s = useRejectedInbox.getState()
  if (s.tournamentId === tournamentId && ids.length) useRejectedInbox.setState({ items: s.items.filter((x) => !ids.includes(x.id)) })
}

/**
 * Apply or dismiss one row, then read the list again. A row the server took
 * leaves the list at once; one it refused stays (and an answer from another
 * Comité phone first shows as it is, after the read). To apply, `seen` is
 * the hole as the screen showed it.
 */
export async function resolveInboxItem(tournamentId: string, id: string, action: 'apply' | 'dismiss', reason: string, seen?: SeenHole): Promise<void> {
  try {
    await resolveRejectedWrite(id, action, reason, seen)
    drop(tournamentId, [id])
  } finally {
    await loadRejectedInbox(tournamentId)
  }
}

/**
 * Dismiss each row with one reason, the list read once at the end. A row
 * another Comité phone resolved meanwhile is done too. Answers how many went
 * and the first refusal of the rest (null: all of them went).
 */
export async function dismissInboxItems(tournamentId: string, ids: string[], reason: string): Promise<{ done: number; failed: unknown }> {
  let failed: unknown = null
  const done: string[] = []
  try {
    for (const id of ids) {
      try {
        await resolveRejectedWrite(id, 'dismiss', reason)
        done.push(id)
      } catch (e) {
        if (isAlreadyResolved(e)) done.push(id)
        else failed ??= e
      }
    }
  } finally {
    drop(tournamentId, done)
    await loadRejectedInbox(tournamentId)
  }
  return { done: done.length, failed }
}
