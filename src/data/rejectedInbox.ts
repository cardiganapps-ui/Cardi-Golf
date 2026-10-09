/**
 * The Comité's inbox of holes the server did not take (REL-08): save_hole
 * (0026) keeps every refusal and every conflict in `rejected_writes`, with
 * what the phone sent; the Comité applies one or dismisses it with a reason
 * (`resolve_rejected_write`, 0028).
 *
 * Read on demand, not over the channel: the Comité's screens fetch the open
 * rows when they open and after each answer. A database without the table
 * (or a column this reads) says so (`unavailable`) instead of failing the
 * screen, as the snapshot does for money_adjustments.
 */
import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import { resolveRejectedWrite } from './api'
import type { Row } from './mappers'
import { fetchAll } from './paged'

export type RejectedReason = 'round_not_live' | 'card_signed' | 'not_in_group' | 'invalid' | 'conflict'

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
  /** A conflict's row on the server when it met it. */
  server: Row | null
  createdAt: string
}

/** A hole's three values. */
export interface HoleValue {
  strokes: number | null
  putts: number | null
  pickedUp: boolean
}

const COLUMNS = 'id,round_id,hole,player_id,writer_player_id,reason,payload,created_at'
/** The table (PGRST205, 42P01) or a column (42703) this reads is not on the database yet. */
const MISSING = new Set(['PGRST205', '42P01', '42703'])

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
    server: payload.server && typeof payload.server === 'object' ? (payload.server as Row) : null,
    createdAt: String(r.created_at ?? ''),
  }
}

/** The tournament's open rows, oldest first; null when the database has no inbox yet. */
export async function listOpenRejected(tournamentId: string): Promise<InboxItem[] | null> {
  try {
    const rows = await fetchAll<Row>((from, to) => supabase().from('rejected_writes').select(COLUMNS).eq('tournament_id', tournamentId).eq('status', 'open').order('created_at').order('id').range(from, to))
    return rows.map(toItem)
  } catch (e) {
    if (MISSING.has((e as { code?: string } | null)?.code ?? '')) return null
    throw e
  }
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

/**
 * Apply or dismiss one row, then read the list again. A row the server took
 * leaves the list at once; one it refused stays (and an answer from another
 * Comité phone first shows as it is, after the read).
 */
export async function resolveInboxItem(tournamentId: string, id: string, action: 'apply' | 'dismiss', reason: string): Promise<void> {
  try {
    await resolveRejectedWrite(id, action, reason)
    const s = useRejectedInbox.getState()
    if (s.tournamentId === tournamentId) useRejectedInbox.setState({ items: s.items.filter((x) => x.id !== id) })
  } finally {
    await loadRejectedInbox(tournamentId)
  }
}
