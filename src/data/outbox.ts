/**
 * IndexedDB outbox (§8): writes apply locally first, queue in Dexie, then
 * push to Supabase with retry/backoff. Survives reloads and airplane mode.
 * The store overlays pending items on every fetched snapshot so an
 * optimistic score never flickers away while it is in flight.
 */
import Dexie, { type EntityTable } from 'dexie'
import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import { t } from '../i18n/es-MX'
import type { Score, Snapshot } from '../engine/types'
import { registerOverlay, useTournament } from './tournamentStore'

export type OutboxItem =
  | { key: string; kind: 'score'; tournamentId: string; payload: ScorePayload; attempts: number; createdAt: number; lastError?: string }
  | { key: string; kind: 'tiebreak'; tournamentId: string; payload: TiebreakPayload; attempts: number; createdAt: number; lastError?: string }
  | { key: string; kind: 'signature'; tournamentId: string; payload: SignaturePayload; attempts: number; createdAt: number; lastError?: string }
  | { key: string; kind: 'award'; tournamentId: string; payload: AwardPayload; attempts: number; createdAt: number; lastError?: string }

export interface ScorePayload {
  round_id: string
  player_id: string
  hole: number
  strokes: number | null
  putts: number | null
  picked_up: boolean
  entered_by: string | null
  client_ts: string
}
export interface TiebreakPayload {
  round_id: string
  group_id: string
  hole: number
  last_holed_player_id: string
  decided_by: string | null
}
/** A group's answer for a hole contest: the winners (empty = nobody), replacing its earlier answer. */
export interface AwardPayload {
  round_id: string
  group_id: string
  hole: number
  game_id: string
  player_ids: string[]
  decided_by: string | null
}
export interface SignaturePayload {
  round_id: string
  pair_id: string
  signed_by: string | null
}

/** A write the server refused for good (RLS, constraint). Kept so the Comité can re-enter or discard it. */
export interface RejectedItem {
  key: string
  kind: OutboxItem['kind']
  tournamentId: string
  payload: OutboxItem['payload']
  message: string
  at: number
}

class OutboxDb extends Dexie {
  items!: EntityTable<OutboxItem, 'key'>
  rejected!: EntityTable<RejectedItem, 'key'>
  constructor() {
    super('cardi-golf-outbox')
    this.version(1).stores({ items: 'key, tournamentId, createdAt' })
    this.version(2).stores({ items: 'key, tournamentId, createdAt', rejected: 'key, tournamentId, at' })
  }
}
let db: OutboxDb | null = null
function getDb(): OutboxDb | null {
  if (typeof indexedDB === 'undefined') return null
  if (!db) db = new OutboxDb()
  return db
}

interface OutboxState {
  /** Items still to push for the tournament that is open on this device. */
  pending: number
  syncing: boolean
  /** Last push error, mapped to Spanish by `describeSyncError`. Null once a push succeeds. */
  lastError: string | null
  /** Writes the server refused for good, for the open tournament. */
  rejected: RejectedItem[]
  /** True while the Tarjeta has an unsaved hole: defers the "new version" reload prompt. */
  editing: boolean
}
export const useOutbox = create<OutboxState>(() => ({ pending: 0, syncing: false, lastError: null, rejected: [], editing: false }))

/** In-memory mirror of the queue for the snapshot overlay (kept in sync with Dexie). */
let queue: OutboxItem[] = []
let rejectedAll: RejectedItem[] = []
let flushing = false
let timer: ReturnType<typeof setTimeout> | null = null

function activeTournamentId(): string | null {
  return useTournament.getState().tournamentId
}
/** Publish the counters for the tournament that is open on this device. */
function publish(extra: Partial<OutboxState> = {}) {
  const tid = activeTournamentId()
  useOutbox.setState({ pending: queue.filter((x) => x.tournamentId === tid).length, rejected: rejectedAll.filter((x) => x.tournamentId === tid), ...extra })
}
/** Call when the open tournament changes so the counters follow it. */
export function refreshOutboxCounters() {
  publish()
}

async function loadQueue() {
  const d = getDb()
  queue = d ? await d.items.orderBy('createdAt').toArray() : []
  rejectedAll = d ? await d.rejected.orderBy('at').toArray() : []
  publish()
}

/** Map a raw server/network message to the copy the chip shows. Exported for the screens. */
export function describeSyncError(msg: string): string {
  if (/signed|firmad/i.test(msg)) return t.sync.errSigned
  if (/not live|is_live|en juego/i.test(msg)) return t.sync.errNotLive
  if (isPermanent(msg)) return t.sync.errDenied
  return t.sync.errNetwork
}

async function reject(item: OutboxItem, message: string) {
  const r: RejectedItem = { key: item.key, kind: item.kind, tournamentId: item.tournamentId, payload: item.payload, message, at: Date.now() }
  rejectedAll = [...rejectedAll.filter((x) => x.key !== r.key), r]
  queue = queue.filter((x) => x.key !== item.key)
  const d = getDb()
  if (d) {
    await d.items.delete(item.key)
    await d.rejected.put(r)
  }
}

/** Put a rejected write back in the queue (the Comité, whose write is allowed, or after the round reopened). */
export async function retryRejected(key: string) {
  const r = rejectedAll.find((x) => x.key === key)
  if (!r) return
  rejectedAll = rejectedAll.filter((x) => x.key !== key)
  const d = getDb()
  if (d) await d.rejected.delete(key)
  await enqueue({ key: r.key, kind: r.kind, tournamentId: r.tournamentId, payload: r.payload, attempts: 0, createdAt: Date.now() } as OutboxItem)
}
export async function discardRejected(key: string) {
  rejectedAll = rejectedAll.filter((x) => x.key !== key)
  const d = getDb()
  if (d) await d.rejected.delete(key)
  publish()
}

/** Apply pending writes on top of a freshly fetched snapshot. */
export function overlayPending(s: Snapshot): void {
  for (const it of queue) {
    if (it.tournamentId !== s.tournament.id) continue
    if (it.kind === 'score') {
      const p = it.payload
      const row: Score = {
        roundId: p.round_id,
        playerId: p.player_id,
        hole: p.hole,
        strokes: p.strokes,
        putts: p.putts,
        pickedUp: p.picked_up,
        enteredBy: p.entered_by,
        updatedAt: p.client_ts,
      }
      const i = s.scores.findIndex((x) => x.roundId === row.roundId && x.playerId === row.playerId && x.hole === row.hole)
      if (i >= 0) s.scores[i] = row
      else s.scores.push(row)
    } else if (it.kind === 'tiebreak') {
      const p = it.payload
      s.snakeTiebreaks = s.snakeTiebreaks.filter((x) => !(x.roundId === p.round_id && x.groupId === p.group_id && x.hole === p.hole))
      s.snakeTiebreaks.push({ roundId: p.round_id, groupId: p.group_id, hole: p.hole, lastHoledPlayerId: p.last_holed_player_id })
    } else if (it.kind === 'award') {
      const p = it.payload
      s.holeAwards = (s.holeAwards ?? []).filter((x) => !(x.roundId === p.round_id && x.gameId === p.game_id && x.hole === p.hole && x.groupId === p.group_id))
      for (const playerId of p.player_ids) s.holeAwards.push({ roundId: p.round_id, groupId: p.group_id, hole: p.hole, gameId: p.game_id, playerId })
    } else if (it.kind === 'signature') {
      const p = it.payload
      if (!s.cardSignatures.some((x) => x.roundId === p.round_id && x.pairId === p.pair_id)) {
        s.cardSignatures.push({ roundId: p.round_id, pairId: p.pair_id, signedBy: p.signed_by ?? '', signedAt: new Date().toISOString() })
      }
    }
  }
}

async function enqueue(item: OutboxItem) {
  queue = [...queue.filter((x) => x.key !== item.key), item]
  publish()
  const d = getDb()
  if (d) await d.items.put(item)
  // Optimistic: recompute right away with the overlay.
  useTournament.getState().patch(overlayPending)
  void flush()
}

export function enqueueScore(tournamentId: string, payload: ScorePayload) {
  return enqueue({ key: `score:${payload.round_id}:${payload.player_id}:${payload.hole}`, kind: 'score', tournamentId, payload, attempts: 0, createdAt: Date.now() })
}
export function enqueueTiebreak(tournamentId: string, payload: TiebreakPayload) {
  return enqueue({ key: `tiebreak:${payload.round_id}:${payload.group_id}:${payload.hole}`, kind: 'tiebreak', tournamentId, payload, attempts: 0, createdAt: Date.now() })
}
export function enqueueAward(tournamentId: string, payload: AwardPayload) {
  return enqueue({ key: `award:${payload.round_id}:${payload.group_id}:${payload.game_id}:${payload.hole}`, kind: 'award', tournamentId, payload, attempts: 0, createdAt: Date.now() })
}
export function enqueueSignature(tournamentId: string, payload: SignaturePayload) {
  return enqueue({ key: `signature:${payload.round_id}:${payload.pair_id}`, kind: 'signature', tournamentId, payload, attempts: 0, createdAt: Date.now() })
}

/** Replaceable for tests. */
let pushImpl: (item: OutboxItem) => Promise<void> = push
export const _outboxTest = {
  setPush(fn: (item: OutboxItem) => Promise<void>) {
    pushImpl = fn
  },
  reset() {
    queue = []
    rejectedAll = []
    flushing = false
    if (timer) clearTimeout(timer)
    timer = null
    publish({ lastError: null, syncing: false })
  },
  queue: () => queue,
  enqueue,
}

async function push(item: OutboxItem): Promise<void> {
  const sb = supabase()
  if (item.kind === 'score') {
    const { error } = await sb.from('scores').upsert(item.payload, { onConflict: 'round_id,player_id,hole' })
    if (error) throw new Error(error.message)
  } else if (item.kind === 'tiebreak') {
    const { error } = await sb.from('snake_tiebreaks').upsert(item.payload, { onConflict: 'round_id,group_id,hole' })
    if (error) throw new Error(error.message)
  } else if (item.kind === 'award') {
    const p = item.payload
    const del = await sb.from('hole_awards').delete().eq('round_id', p.round_id).eq('game_id', p.game_id).eq('hole', p.hole).eq('group_id', p.group_id)
    if (del.error) throw new Error(del.error.message)
    if (p.player_ids.length) {
      const { error } = await sb.from('hole_awards').insert(p.player_ids.map((player_id) => ({ round_id: p.round_id, group_id: p.group_id, hole: p.hole, game_id: p.game_id, player_id, decided_by: p.decided_by })))
      if (error) throw new Error(error.message)
    }
  } else {
    const { error } = await sb.from('card_signatures').upsert(item.payload, { onConflict: 'round_id,pair_id', ignoreDuplicates: true })
    if (error) throw new Error(error.message)
  }
}

/** Errors the server will keep rejecting (RLS, constraint): drop the item instead of retrying forever. */
function isPermanent(msg: string): boolean {
  return /row-level security|violates|permission denied|invalid input/i.test(msg)
}

/**
 * Push everything queued, in order. A permanent rejection moves the item to
 * `rejected` (never dropped silently); a network error keeps it queued with
 * backoff, forever (§2: nothing is lost). Items enqueued while a flush runs
 * are pushed right after it, not five seconds later.
 */
export async function flush(): Promise<void> {
  if (flushing) return
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return
  flushing = true
  useOutbox.setState({ syncing: true })
  const d = getDb()
  let failed = false
  try {
    for (const item of [...queue]) {
      try {
        await pushImpl(item)
        queue = queue.filter((x) => x.key !== item.key)
        if (d) await d.items.delete(item.key)
        publish({ lastError: null })
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        if (isPermanent(msg)) {
          await reject(item, describeSyncError(msg))
          publish({ lastError: describeSyncError(msg) })
          // The optimistic value was wrong: fall back to the server's truth.
          void useTournament.getState().reload()
        } else {
          failed = true
          const next = { ...item, attempts: item.attempts + 1, lastError: msg }
          queue = queue.map((x) => (x.key === item.key ? next : x))
          if (d) await d.items.put(next)
          publish({ lastError: describeSyncError(msg) })
          schedule(Math.min(30000, 1000 * 2 ** Math.min(next.attempts, 5)))
          break
        }
      }
    }
  } finally {
    flushing = false
    useOutbox.setState({ syncing: false })
    if (queue.length && !failed && !timer) void flush()
  }
}

function schedule(ms: number) {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    timer = null
    void flush()
  }, ms)
}

let started = false
/** Call once at app start: restores the queue and flushes on reconnect. */
export async function startOutbox() {
  if (started) return
  started = true
  registerOverlay(overlayPending)
  await loadQueue()
  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => void flush())
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && void flush())
  }
  void flush()
}
