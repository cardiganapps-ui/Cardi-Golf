/**
 * IndexedDB outbox (§8): writes apply locally first, queue in Dexie, then
 * push to Supabase with retry/backoff. Survives reloads and airplane mode.
 * The store overlays pending items on every fetched snapshot so an
 * optimistic score never flickers away while it is in flight.
 */
import Dexie, { type EntityTable } from 'dexie'
import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import type { Score, Snapshot } from '../engine/types'
import { registerOverlay, useTournament } from './tournamentStore'

export type OutboxItem =
  | { key: string; kind: 'score'; tournamentId: string; payload: ScorePayload; attempts: number; createdAt: number; lastError?: string }
  | { key: string; kind: 'tiebreak'; tournamentId: string; payload: TiebreakPayload; attempts: number; createdAt: number; lastError?: string }
  | { key: string; kind: 'signature'; tournamentId: string; payload: SignaturePayload; attempts: number; createdAt: number; lastError?: string }

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
export interface SignaturePayload {
  round_id: string
  pair_id: string
  signed_by: string | null
}

class OutboxDb extends Dexie {
  items!: EntityTable<OutboxItem, 'key'>
  constructor() {
    super('cardi-golf-outbox')
    this.version(1).stores({ items: 'key, tournamentId, createdAt' })
  }
}
let db: OutboxDb | null = null
function getDb(): OutboxDb | null {
  if (typeof indexedDB === 'undefined') return null
  if (!db) db = new OutboxDb()
  return db
}

interface OutboxState {
  pending: number
  syncing: boolean
  lastError: string | null
}
export const useOutbox = create<OutboxState>(() => ({ pending: 0, syncing: false, lastError: null }))

/** In-memory mirror of the queue for the snapshot overlay (kept in sync with Dexie). */
let queue: OutboxItem[] = []
let flushing = false
let timer: ReturnType<typeof setTimeout> | null = null

async function loadQueue() {
  const d = getDb()
  queue = d ? await d.items.orderBy('createdAt').toArray() : []
  useOutbox.setState({ pending: queue.length })
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
  useOutbox.setState({ pending: queue.length })
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
export function enqueueSignature(tournamentId: string, payload: SignaturePayload) {
  return enqueue({ key: `signature:${payload.round_id}:${payload.pair_id}`, kind: 'signature', tournamentId, payload, attempts: 0, createdAt: Date.now() })
}

async function push(item: OutboxItem): Promise<void> {
  const sb = supabase()
  if (item.kind === 'score') {
    const { error } = await sb.from('scores').upsert(item.payload, { onConflict: 'round_id,player_id,hole' })
    if (error) throw new Error(error.message)
  } else if (item.kind === 'tiebreak') {
    const { error } = await sb.from('snake_tiebreaks').upsert(item.payload, { onConflict: 'round_id,group_id,hole' })
    if (error) throw new Error(error.message)
  } else {
    const { error } = await sb.from('card_signatures').upsert(item.payload, { onConflict: 'round_id,pair_id', ignoreDuplicates: true })
    if (error) throw new Error(error.message)
  }
}

/** Errors the server will keep rejecting (RLS, constraint): drop the item instead of retrying forever. */
function isPermanent(msg: string): boolean {
  return /row-level security|violates|permission denied|invalid input/i.test(msg)
}

export async function flush(): Promise<void> {
  if (flushing) return
  if (typeof navigator !== 'undefined' && !navigator.onLine) return
  flushing = true
  useOutbox.setState({ syncing: true })
  const d = getDb()
  try {
    for (const item of [...queue]) {
      try {
        await push(item)
        queue = queue.filter((x) => x.key !== item.key)
        if (d) await d.items.delete(item.key)
        useOutbox.setState({ pending: queue.length, lastError: null })
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        const next = { ...item, attempts: item.attempts + 1, lastError: msg }
        if (isPermanent(msg) || next.attempts >= 20) {
          queue = queue.filter((x) => x.key !== item.key)
          if (d) await d.items.delete(item.key)
          useOutbox.setState({ pending: queue.length, lastError: msg })
          // The optimistic value was wrong: fall back to the server's truth.
          void useTournament.getState().reload()
        } else {
          queue = queue.map((x) => (x.key === item.key ? next : x))
          if (d) await d.items.put(next)
          useOutbox.setState({ lastError: msg })
          schedule(Math.min(30000, 1000 * 2 ** Math.min(next.attempts, 5)))
          break
        }
      }
    }
  } finally {
    flushing = false
    useOutbox.setState({ syncing: false })
    if (queue.length && !timer) schedule(5000)
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
