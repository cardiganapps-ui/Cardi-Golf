/**
 * IndexedDB outbox (§8): writes apply locally first, queue in Dexie, then
 * push to Supabase with retry/backoff. Survives reloads and airplane mode.
 * The store overlays pending items on every fetched snapshot so an
 * optimistic score never flickers away while it is in flight.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import Dexie, { type EntityTable } from 'dexie'
import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import { t } from '../i18n/es-MX'
import { UserError } from '../lib/humanError'
import { withTimeout } from '../lib/timeout'
import { serverAnswering } from '../lib/fetchWithTimeout'
import type { Score, Snapshot } from '../engine/types'
import { SESSION_TIMEOUT_MS, useAuth } from './auth'
import { liveClock, liveSeq, registerOverlay, useTournament } from './tournamentStore'
import type { LiveChange } from './realtimeApply'
import type { Row } from './mappers'

/**
 * `seq` identifies this version of the write: a newer write to the same key
 * replaces the item with a higher seq, and a push only settles the exact
 * version it sent (ARCH-01). Items saved by older builds get one on load.
 */
interface ItemBase {
  key: string
  tournamentId: string
  attempts: number
  createdAt: number
  seq: number
  /**
   * The auth user that queued the write. If the device's identity changed
   * since (a session lapsed in a dead zone and a new one started), the server
   * would refuse the push, so the write waits until the player is back on this
   * device (`adoptQueuedWrites`) instead of being rejected (REL-16). None: the
   * write was saved before the session was confirmed (the phone opened from
   * its saved boards), and it waits the same way.
   */
  actingUid?: string | null
  lastError?: string
  /**
   * The tournament's name and slug when the write was queued. The refusal to
   * sign out or change account names the tournament from it once the boards
   * saved on the phone are gone (Entrar and «no existe» clear them), and a
   * link that leads nowhere finds its writes by the slug.
   */
  tournamentName?: string
  slug?: string
}
export type OutboxItem =
  | (ItemBase & { kind: 'score'; payload: ScorePayload })
  | (ItemBase & { kind: 'tiebreak'; payload: TiebreakPayload })
  | (ItemBase & { kind: 'signature'; payload: SignaturePayload })
  | (ItemBase & { kind: 'award'; payload: AwardPayload })
/** What callers hand to `enqueue`: the outbox stamps the version. */
type NewItem = OutboxItem extends infer I ? (I extends OutboxItem ? Omit<I, 'seq'> & { seq?: number } : never) : never

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
    // v3: every item carries its version (`seq`); older items get one from their creation time.
    this.version(3)
      .stores({ items: 'key, tournamentId, createdAt', rejected: 'key, tournamentId, at' })
      .upgrade((tx) =>
        tx
          .table('items')
          .toCollection()
          .modify((it: { seq?: number; createdAt?: number }) => {
            it.seq ??= (it.createdAt ?? 0) * 1000
          }),
      )
  }
}

/** Monotonic across reloads: newer writes always get a higher seq than anything stored. */
let lastSeq = 0
function nextSeq(): number {
  lastSeq = Math.max(Date.now() * 1000, lastSeq + 1)
  return lastSeq
}
/** The queued version of this key, if it is still exactly the one we pushed. */
function isCurrent(item: OutboxItem): boolean {
  return queue.some((x) => x.key === item.key && x.seq === item.seq)
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
  /** Of those, how many wait for the player to enter again (the session changed: REL-16). */
  held: number
  /** `held`, counted in holes. */
  heldHoles: number
  syncing: boolean
  /** Last push error, mapped to Spanish by `describeSyncError`. Null once a push succeeds. */
  lastError: string | null
  /** Writes the server refused for good, for the open tournament. */
  rejected: RejectedItem[]
  /** True while the Tarjeta has an unsaved hole: defers the "new version" reload prompt. */
  editing: boolean
  /** Writes a newer build queued on this phone; this build leaves them for it. */
  foreign: number
  /** The server requires a newer build: nothing is pushed until the app updates. */
  blocked: boolean
  /** `pending`, counted in holes (a foursome's hole is four rows): what the player understands (REL-17). */
  pendingHoles: number
  /** The browser promised not to evict this site's storage; null until asked (REL-18). */
  persistent: boolean | null
  /** The queue has been read from the phone, and the boards recomputed with it (NEW-11). */
  queueRead: boolean
}
export const useOutbox = create<OutboxState>(() => ({ pending: 0, held: 0, heldHoles: 0, syncing: false, lastError: null, rejected: [], editing: false, foreign: 0, blocked: false, pendingHoles: 0, persistent: null, queueRead: false }))

/** In-memory mirror of the queue for the snapshot overlay (kept in sync with Dexie). */
let queue: OutboxItem[] = []
let rejectedAll: RejectedItem[] = []
/** The flush in progress, if any. */
let running: Promise<void> | null = null
let timer: ReturnType<typeof setTimeout> | null = null

function activeTournamentId(): string | null {
  return useTournament.getState().tournamentId
}
/** Publish the counters for the tournament that is open on this device. */
function publish(extra: Partial<OutboxState> = {}) {
  const tid = activeTournamentId()
  const mine = queue.filter((x) => x.tournamentId === tid)
  const held = mine.filter(isHeld)
  useOutbox.setState({
    pending: mine.length,
    pendingHoles: holesIn(mine),
    held: held.length,
    heldHoles: holesIn(held),
    foreign: queue.filter(isForeign).length,
    rejected: rejectedAll.filter((x) => x.tournamentId === tid),
    ...extra,
  })
}

/** What this build knows how to send. A newer build may queue other kinds. */
const KNOWN_KINDS: ReadonlySet<string> = new Set(['score', 'tiebreak', 'award', 'signature'])
/**
 * Queued by a newer build (the app was rolled back, or this tab is older):
 * left untouched, never pushed or rejected here, for that build to send.
 */
function isForeign(item: OutboxItem): boolean {
  return !KNOWN_KINDS.has(item.kind)
}
/** This build may push it now. */
function canPush(item: OutboxItem): boolean {
  return !isHeld(item) && !isForeign(item)
}

/**
 * The server asked for a newer build (`app_flags.minBuild`): nothing is
 * pushed until the app updates. Writes stay queued, on the phone, and the
 * updated app sends them.
 */
let blocked = false
export function setOutboxBlocked(value: boolean) {
  if (blocked === value) return
  blocked = value
  useOutbox.setState({ blocked })
  if (!blocked) void flush()
}

function currentUid(): string | null {
  return useAuth.getState().user?.id ?? null
}
/**
 * Queued under a different identity than the device has now, or before any
 * was confirmed: the server could refuse it, so it waits for the tournament's
 * gate to confirm the player (`adoptQueuedWrites`). A phone that opens from
 * its saved boards with no signal saves holes before its session is known; if
 * that session turned out dead and a new one started, those holes used to go
 * out under it, be refused and land in the rejected list.
 */
function isHeld(item: OutboxItem): boolean {
  return !item.actingUid || item.actingUid !== currentUid()
}

/**
 * The device is a confirmed member of `tournamentId` again (the player entered
 * their PIN, or a profile link resolved). Its writes queued under the previous
 * identity now belong to this one: re-stamp and push them. The server still
 * checks every one against the player's group and the round (REL-16).
 */
export async function adoptQueuedWrites(tournamentId: string) {
  const uid = currentUid()
  if (!uid) return
  const held = queue.filter((x) => x.tournamentId === tournamentId && isHeld(x))
  if (held.length) {
    const adopted = new Map(held.map((x) => [`${x.key}#${x.seq}`, { ...x, actingUid: uid }]))
    queue = queue.map((x) => adopted.get(`${x.key}#${x.seq}`) ?? x)
    const d = getDb()
    if (d) {
      await d.transaction('rw', d.items, async () => {
        for (const it of adopted.values()) {
          const cur = await d.items.get(it.key)
          if (cur && (cur.seq ?? cur.createdAt * 1000) === it.seq) await d.items.put(it)
        }
      })
    }
  }
  publish()
  void flush()
}
/**
 * What this device still has to push for a tournament, counted in holes (a
 * foursome's hole is four score rows). `heldHoles` wait for the player to
 * enter again.
 */
export function queuedFor(tournamentId: string): { holes: number; heldHoles: number; writes: number } {
  const mine = queue.filter((x) => x.tournamentId === tournamentId)
  // `writes`: everything this build sends, card signatures, snake answers and hole awards too.
  return { holes: holesIn(mine), heldHoles: holesIn(mine.filter(isHeld)), writes: mine.filter((x) => !isForeign(x)).length }
}
/**
 * What still has to go out before this device may change who it is (sign
 * out, another account), for any tournament: the first tournament with
 * writes, and what they wait for. `pin`: some were queued under an identity
 * the device no longer has and go out only once the player enters again;
 * `signal`: they go out once the server answers (opening the tournament with
 * signal also sends the ones saved before the session was confirmed).
 *
 * Writes a newer build queued do not count: this build can never send them,
 * so counting them kept a person signed in for good. They stay on the phone,
 * for that build to send after the PIN.
 */
export function unsentWrites(): { tournamentId: string; waitsFor: 'signal' | 'pin'; name: string | null } | null {
  const mine = queue.filter((x) => !isForeign(x))
  const first = mine[0]
  if (!first) return null
  const uid = currentUid()
  const pin = mine.some((x) => x.tournamentId === first.tournamentId && !!x.actingUid && x.actingUid !== uid)
  return { tournamentId: first.tournamentId, waitsFor: pin ? 'pin' : 'signal', name: queuedName(mine, first.tournamentId) }
}
/** The name a tournament had when the newest of its writes was queued: the boards saved on the phone may be gone. */
function queuedName(list: OutboxItem[], tournamentId: string): string | null {
  return list.filter((x) => x.tournamentId === tournamentId && !!x.tournamentName).at(-1)?.tournamentName ?? null
}

/**
 * What still has to go out before this device enters `entering` with a PIN.
 * A device holds one PIN claim (claim_player replaces it), so entering one
 * tournament makes it nobody in the one before: that one's writes still on
 * the phone then went out and were refused for good. They count until they
 * are sent: the ones written as this phone, and the ones saved before its
 * session was confirmed (they go out once that tournament confirms the
 * player). Not the ones held for a PIN (they wait for the PIN in their own
 * tournament either way), nor the tournament being entered's own: its PIN is
 * what sends them. Writes a newer build queued stay for it.
 */
export function unsentBeforeClaim(entering: string): { tournamentId: string; name: string | null } | null {
  const uid = currentUid()
  const mine = queue.filter((x) => !isForeign(x) && x.tournamentId !== entering && !(x.actingUid && x.actingUid !== uid))
  const first = mine[0]
  return first ? { tournamentId: first.tournamentId, name: queuedName(queue, first.tournamentId) } : null
}

/**
 * The tournament at `slug` no longer exists (its link leads nowhere: it was
 * deleted). Its writes can never go out, and the held ones waited for a PIN
 * that could never come, which kept the phone from signing out or changing
 * account for good. They move to the rejected list saying why, like any write
 * the server refuses for good: by the tournament's id (from the boards the
 * phone kept under that slug) or by the slug saved on the write. Writes a
 * newer build queued stay for it. Returns how many moved.
 */
export async function rejectGoneTournament(slug: string, tournamentId: string | null): Promise<number> {
  const gone = queue.filter((x) => !isForeign(x) && ((!!tournamentId && x.tournamentId === tournamentId) || x.slug === slug))
  for (const it of gone) await reject(it, t.sync.errGone)
  if (gone.length) {
    publish()
    announce()
  }
  return gone.length
}
/** Anything still to push, for any tournament: signing out waits for it. */
export function hasUnsentWrites(): boolean {
  return unsentWrites() !== null
}
/** Distinct holes among queued score writes. */
function holesIn(list: OutboxItem[]): number {
  return new Set(list.filter((x) => x.kind === 'score').map((x) => `${(x.payload as ScorePayload).round_id}:${(x.payload as ScorePayload).hole}`)).size
}

/** Call when the open tournament changes so the counters follow it. */
export function refreshOutboxCounters() {
  publish()
}

async function loadQueue() {
  try {
    const d = getDb()
    const stored = d ? await d.items.toArray() : []
    queue = stored.map((x) => ({ ...x, seq: x.seq ?? x.createdAt * 1000 })).sort((a, b) => a.seq - b.seq)
    lastSeq = Math.max(lastSeq, ...queue.map((x) => x.seq))
    rejectedAll = d ? await d.rejected.orderBy('at').toArray() : []
  } finally {
    // Boards already up (the phone's copy, shown before the queue was read) get the queued writes now,
    // before the queue is said read: the Tarjeta waits for it to save, and a card opened before then moves
    // to the first open hole once (NEW-11). Said read even when the read failed, or the card would never save.
    useTournament.getState().refresh()
    publish({ queueRead: true })
  }
}

/** Remove `item` from Dexie only if the stored version is still the one we pushed. */
async function deleteStored(item: OutboxItem) {
  const d = getDb()
  if (!d) return
  await d.transaction('rw', d.items, async () => {
    const cur = await d.items.get(item.key)
    if (cur && (cur.seq ?? cur.createdAt * 1000) === item.seq) await d.items.delete(item.key)
  })
}

/**
 * The push found no session to go out with. Not the network: the Tarjeta
 * said «Sin conexión con el servidor» under an «En vivo» header for as long
 * as the session took to come back (48 s inside auth-js's cooldown).
 */
const NO_SESSION_YET = 'no session to push with yet'
/**
 * No session to push with, and the app's requests are lost too (lie-fi, no
 * route): the network, not the session. Once the token had expired, any
 * failed or stalled session read said «Confirmando tu sesión…», on lie-fi
 * from 8 s and with no route at all from 6 s.
 */
const NO_SESSION_NO_SERVER = 'no session to push with, and no answer from the server'

/** Map a raw server/network message to the copy the chip shows. Exported for the screens. */
export function describeSyncError(msg: string): string {
  if (msg === NO_SESSION_YET) return t.sync.errSession
  if (msg === NO_SESSION_NO_SERVER) return t.sync.errNetwork
  if (/signed|firmad/i.test(msg)) return t.sync.errSigned
  if (/not live|is_live|en juego/i.test(msg)) return t.sync.errNotLive
  if (isPermanent(msg)) return t.sync.errDenied
  return t.sync.errNetwork
}

async function reject(item: OutboxItem, message: string) {
  // A newer write to the same key replaced this one while it was in flight:
  // that write still goes out, so this refusal no longer matters.
  if (!isCurrent(item)) return
  const r: RejectedItem = { key: item.key, kind: item.kind, tournamentId: item.tournamentId, payload: item.payload, message, at: Date.now() }
  rejectedAll = [...rejectedAll.filter((x) => x.key !== r.key), r]
  queue = queue.filter((x) => !(x.key === item.key && x.seq === item.seq))
  await deleteStored(item)
  const d = getDb()
  if (d) await d.rejected.put(r)
}

/** Put a rejected write back in the queue (the Comité, whose write is allowed, or after the round reopened). */
export async function retryRejected(key: string) {
  const r = rejectedAll.find((x) => x.key === key)
  if (!r) return
  rejectedAll = rejectedAll.filter((x) => x.key !== key)
  const d = getDb()
  if (d) await d.rejected.delete(key)
  await enqueue({ key: r.key, kind: r.kind, tournamentId: r.tournamentId, payload: r.payload, attempts: 0, createdAt: Date.now() } as NewItem)
}
export async function discardRejected(key: string) {
  rejectedAll = rejectedAll.filter((x) => x.key !== key)
  const d = getDb()
  if (d) await d.rejected.delete(key)
  publish()
}

/** Apply pending writes on top of the server's rows, for the screens (the store keeps its own rows apart). */
export function overlayPending(s: Snapshot): void {
  for (const it of queue) if (it.tournamentId === s.tournament.id) overlayItem(s, it)
}

/** One write as the snapshot reads with it: on the screens' copy while it waits, on the server's rows once it is taken. */
function overlayItem(s: Snapshot, it: OutboxItem): void {
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

/** The phone could not keep the write (quota, storage pressure, private mode): the hole is not saved anywhere. */
export class OutboxStorageError extends UserError {
  constructor() {
    super(t.sync.storeFailed)
    this.name = 'OutboxStorageError'
  }
}

async function enqueue(newItem: NewItem) {
  // A newer version of the same key replaces the queued one, even while that
  // one is in flight: the flush pushes this version after it (ARCH-01).
  // Writes are queued from the tournament open on screen: its name and slug go with them.
  const open = useTournament.getState()
  const tour = open.tournamentId === newItem.tournamentId ? open.data?.snapshot.tournament : undefined
  const item = {
    ...newItem,
    seq: nextSeq(),
    actingUid: newItem.actingUid ?? currentUid(),
    tournamentName: newItem.tournamentName ?? tour?.name,
    slug: newItem.slug ?? tour?.slug,
  } as OutboxItem
  void askPersistence()
  // The phone's storage first, memory second (REL-18): a write that IndexedDB
  // refused must not look saved in this tab and vanish when it closes. Never
  // over a newer version of the same key.
  const d = getDb()
  if (d) {
    try {
      await d.transaction('rw', d.items, async () => {
        const cur = await d.items.get(item.key)
        if (!cur || (cur.seq ?? cur.createdAt * 1000) < item.seq) await d.items.put(item)
      })
    } catch {
      throw new OutboxStorageError()
    }
  }
  const newer = queue.find((x) => x.key === item.key && x.seq > item.seq)
  if (!newer) queue = [...queue.filter((x) => x.key !== item.key), item]
  publish()
  announce()
  // Optimistic: recompute right away with the overlay.
  useTournament.getState().refresh()
  void flush()
}

/**
 * Ask the browser once to keep this site's storage under pressure (REL-18):
 * without it a phone full of photos, or Safari's 7-day rule for sites not on
 * the home screen, can evict the only copy of unsent holes.
 */
let persistAsked = false
async function askPersistence() {
  if (persistAsked) return
  persistAsked = true
  const storage = typeof navigator !== 'undefined' ? navigator.storage : undefined
  if (!storage?.persist) return
  try {
    const granted = (await storage.persisted?.()) || (await storage.persist())
    useOutbox.setState({ persistent: granted })
  } catch {
    useOutbox.setState({ persistent: false })
  }
}

/**
 * Tabs of the app on one phone share the IndexedDB queue (REL-18). A tab that
 * changes it tells the others, which reload it, and only one tab at a time
 * pushes (Web Locks), so two tabs never send the same hole or an older
 * version after a newer one.
 */
const CHANNEL = 'cardi-golf-outbox'
let channel: BroadcastChannel | null = null
function announce() {
  try {
    channel?.postMessage('changed')
  } catch {
    // A closed channel: the other tabs reload on their next start.
  }
}
/**
 * A write the server took, as it stored it: the other tabs show it before
 * their own echo comes. With how long ago the push went out, never when: each
 * tab's `liveClock` counts from its own origin, but they measure time alike.
 */
function announceLanded(tournamentId: string, changes: LiveChange[], sentAt: number) {
  try {
    channel?.postMessage({ landed: { tournamentId, changes, age: liveClock() - sentAt, postedAt: Date.now() } })
  } catch {
    // A closed channel: the other tabs get the echo.
  }
}
function listen() {
  if (typeof BroadcastChannel === 'undefined' || channel) return
  channel = new BroadcastChannel(CHANNEL)
  channel.onmessage = (e: MessageEvent) => {
    const landed = (e.data as { landed?: { tournamentId: string; changes: LiveChange[]; age?: number; postedAt?: number } } | null)?.landed
    // Its echo may be in already: the log is checked from when the push went out, on this tab's clock. A message
    // that doesn't say counts the whole log, and its landing asks one more fetch (older than the log).
    if (landed) {
      const age = landed.age
      // The message may have waited behind this tab's own work: the wall clock, which the tabs share at any one moment,
      // says how long (X3b). Read later, the push would look later than a fetch that landed meanwhile.
      const posted = typeof landed.postedAt === 'number' && Number.isFinite(landed.postedAt) ? landed.postedAt : null
      // Posted «in the future»: the wall clock went back while it waited, so its wait is unknown. Counted as not saying.
      const known = typeof age === 'number' && Number.isFinite(age) && (posted == null || posted <= Date.now())
      const waited = posted == null ? 0 : Math.max(0, Date.now() - posted)
      const sentAt = known ? liveClock() - Math.max(0, age) - waited : 0
      return useTournament.getState().landChanges(landed.tournamentId, landed.changes, 0, sentAt)
    }
    void loadQueue().then(() => void flush())
  }
}
type LockManagerLike = { request(name: string, opts: { ifAvailable: boolean }, cb: (lock: unknown) => Promise<unknown>): Promise<unknown> }
let locks: LockManagerLike | null | undefined
function lockManager(): LockManagerLike | null {
  if (locks === undefined) locks = (typeof navigator !== 'undefined' && (navigator as { locks?: LockManagerLike }).locks) || null
  return locks
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
let pushImpl: (item: OutboxItem) => Promise<LiveChange[] | void> = push
export const _outboxTest = {
  setPush(fn: (item: OutboxItem) => Promise<LiveChange[] | void>) {
    pushImpl = fn
  },
  /** Replace the Web Locks manager (null: none). */
  setLocks(lm: LockManagerLike | null) {
    locks = lm
  },
  db: () => getDb(),
  reset() {
    queue = []
    rejectedAll = []
    running = null
    blocked = false
    persistAsked = false
    useOutbox.setState({ persistent: null })
    useOutbox.setState({ blocked: false, queueRead: false })
    if (timer) clearTimeout(timer)
    timer = null
    publish({ lastError: null, syncing: false })
  },
  queue: () => queue,
  enqueue,
  /** Re-read the queue from IndexedDB, as an app restart does. */
  load: loadQueue,
  stored: async () => (getDb() ? await getDb()!.items.toArray() : []),
  async clearStored() {
    const d = getDb()
    if (d) await Promise.all([d.items.clear(), d.rejected.clear()])
  },
}

/**
 * The player's own token for a push, never the anon key (REL-16). The app can
 * stay open while the token expires in a dead zone: auth-js keeps the user, so
 * the hole is not held, and when the signal returns inside its refresh
 * cooldown (60 s after a failed refresh) getSession() has no session.
 * supabase-js then sent the write with the anon key, and the server's refusal
 * read as final: «4 rechazados» for four good holes. With no session the push
 * fails like a network error instead: the write waits, and goes out once the
 * session is back (the auth store's change below, the backoff, `online`).
 */
async function sessionToken(sb: SupabaseClient): Promise<string> {
  // A getSession that stalls or fails (the refresh hanging, the auth server
  // down) is the session not confirmed yet too, while the app's requests get
  // answers. While they are lost it is the network.
  const { data } = await withTimeout(sb.auth.getSession(), SESSION_TIMEOUT_MS, 'sesión').catch(() => ({ data: { session: null } }))
  const token = data.session?.access_token
  if (!token) throw new Error(serverAnswering() ? NO_SESSION_YET : NO_SESSION_NO_SERVER)
  return token
}

/** Rows the server says it stored, as the live changes they are (`select()` after a write: what the database holds now). */
const stored = (table: string, rows: Row[] | null): LiveChange[] => (rows ?? []).map((row) => ({ table, eventType: 'UPDATE', new: row, old: {} }))

/**
 * Send one write. What comes back is what the server stored (each request
 * asks for its rows back), so the store can put exactly that on the boards
 * once the write is taken (REL-11): not this phone's version of it, which
 * the server's triggers may have changed (a discrepancy flagged, the id and
 * time it gave the row).
 */
async function push(item: OutboxItem): Promise<LiveChange[]> {
  const sb = supabase()
  // Every request of this push carries the token checked here, whatever the session does meanwhile.
  const auth = `Bearer ${await sessionToken(sb)}`
  if (item.kind === 'score') {
    const { data, error } = await sb.from('scores').upsert(item.payload, { onConflict: 'round_id,player_id,hole' }).select().setHeader('Authorization', auth)
    if (error) throw new Error(error.message)
    return stored('scores', data)
  }
  if (item.kind === 'tiebreak') {
    const { data, error } = await sb.from('snake_tiebreaks').upsert(item.payload, { onConflict: 'round_id,group_id,hole' }).select().setHeader('Authorization', auth)
    if (error) throw new Error(error.message)
    return stored('snake_tiebreaks', data)
  }
  if (item.kind === 'award') {
    const p = item.payload
    const del = await sb.from('hole_awards').delete().eq('round_id', p.round_id).eq('game_id', p.game_id).eq('hole', p.hole).eq('group_id', p.group_id).select().setHeader('Authorization', auth)
    if (del.error) throw new Error(del.error.message)
    // The winners it took away, by the key a delete names; then the ones it put in.
    const gone: LiveChange[] = (del.data ?? []).map((r: Row) => ({ table: 'hole_awards', eventType: 'DELETE', new: {}, old: { round_id: r.round_id, game_id: r.game_id, hole: r.hole, player_id: r.player_id } }))
    if (!p.player_ids.length) return gone
    const { data, error } = await sb
      .from('hole_awards')
      .insert(p.player_ids.map((player_id) => ({ round_id: p.round_id, group_id: p.group_id, hole: p.hole, game_id: p.game_id, player_id, decided_by: p.decided_by })))
      .select()
      .setHeader('Authorization', auth)
    if (error) throw new Error(error.message)
    return [...gone, ...stored('hole_awards', data)]
  }
  if (item.kind === 'signature') {
    // A card the other phone signed first comes back empty: its signature is the one that stands.
    const { data, error } = await sb.from('card_signatures').upsert(item.payload, { onConflict: 'round_id,pair_id', ignoreDuplicates: true }).select().setHeader('Authorization', auth)
    if (error) throw new Error(error.message)
    return stored('card_signatures', data)
  }
  // Never reached: the flush skips kinds this build does not know.
  throw new Error(`unknown outbox kind ${(item as { kind: string }).kind}`)
}

/**
 * Errors the server will keep rejecting (RLS, constraint): drop the item instead of retrying forever.
 * Postgres's data exceptions (class 22) are never transient either: a value out of its type's range
 * (22003, 22008, 22009) or too long for it (22001) is refused the same way every time it is sent.
 */
function isPermanent(msg: string): boolean {
  return /row-level security|violates|permission denied|invalid input|out of range|too long/i.test(msg)
}

/**
 * Push everything queued, oldest first. A permanent rejection moves the item
 * to `rejected` (never dropped silently); a network error (a timeout included)
 * keeps it queued with backoff, forever (§2: nothing is lost).
 *
 * The loop always takes the oldest item of the live queue, so a write queued
 * while a flush runs goes out in the same pass. A push only settles the exact
 * version it sent: if the player corrected the hole meanwhile, the newer
 * version stays queued and is pushed after it (ARCH-01).
 */
export function flush(): Promise<void> {
  // One flush at a time; a caller during a flush waits for that one to finish.
  if (running) return running
  if (blocked) return Promise.resolve()
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return Promise.resolve()
  // Mark the flush as running before it starts: a push can enqueue (and so
  // call flush) synchronously, and must join this run, not start another.
  let settle!: () => void
  const run = new Promise<void>((r) => (settle = r))
  running = run
  void flushUnderLock()
    .catch(() => true)
    .then((failed) => {
      if (running === run) running = null
      settle()
      // Something was queued at the very end of the pass: go again. Held writes wait.
      if (!failed && !timer && queue.some(canPush)) void flush()
    })
  return run
}

/**
 * One pass, if this tab gets the outbox lock. Another tab holding it is
 * pushing the same IndexedDB queue; this one tries again shortly, in case
 * that tab closes. Without Web Locks every tab flushes, as before.
 */
async function flushUnderLock(): Promise<boolean> {
  const lm = lockManager()
  if (!lm) return runFlush()
  let ran = false
  let failed = false
  await lm.request(CHANNEL, { ifAvailable: true }, async (lock) => {
    if (!lock) return
    ran = true
    failed = await runFlush()
  })
  if (!ran) {
    schedule(LOCK_RETRY_MS)
    return true
  }
  return failed
}
const LOCK_RETRY_MS = 5000

/** One pass over the queue. Returns true if it stopped on a network error. */
async function runFlush(): Promise<boolean> {
  useOutbox.setState({ syncing: true })
  const d = getDb()
  let failed = false
  try {
    // Each version is tried once per pass; writes held for the player's
    // return are skipped (they would only be refused), and so are writes a
    // newer build queued. A minBuild block stops the pass between pushes.
    const tried = new Set<number>()
    for (;;) {
      if (blocked) break
      const item = queue.find((x) => !tried.has(x.seq) && canPush(x))
      if (!item) break
      tried.add(item.seq)
      // The channel's changes from now on may be this write's echo, and a fetch that lands from now on may have read it.
      const since = liveSeq()
      const sentAt = liveClock()
      try {
        const rows = (await pushImpl(item)) ?? []
        if (isCurrent(item)) {
          queue = queue.filter((x) => !(x.key === item.key && x.seq === item.seq))
          await deleteStored(item)
          announce()
        }
        // Taken: the server's rows hold what it stored, unless its echo is in
        // already (whatever came after the echo is newer, and is in too). A
        // newer version still queued shows over it until it goes.
        // A card the other pair's phone signed first comes back empty: its signature stands, and a fetch shows it before its echo does.
        useTournament.getState().landChanges(item.tournamentId, rows, since, sentAt, { flushing: true, fetch: item.kind === 'signature' && !rows.length })
        if (rows.length) announceLanded(item.tournamentId, rows, sentAt)
        publish({ lastError: null })
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        if (isPermanent(msg)) {
          await reject(item, describeSyncError(msg))
          publish({ lastError: describeSyncError(msg) })
          // The optimistic value was wrong: the server's rows at once, then its truth.
          useTournament.getState().refresh()
          void useTournament.getState().reload()
        } else {
          failed = true
          if (isCurrent(item)) {
            const next = { ...item, attempts: item.attempts + 1, lastError: msg }
            queue = queue.map((x) => (x.key === next.key && x.seq === next.seq ? next : x))
            if (d) {
              await d.transaction('rw', d.items, async () => {
                const cur = await d.items.get(next.key)
                if (cur && (cur.seq ?? cur.createdAt * 1000) === next.seq) await d.items.put(next)
              })
            }
          }
          publish({ lastError: describeSyncError(msg) })
          schedule(Math.min(30000, 1000 * 2 ** Math.min(item.attempts + 1, 5)))
          break
        }
      }
    }
  } finally {
    useOutbox.setState({ syncing: false })
    // The one more fetch the landings asked for, once for the whole flush.
    useTournament.getState().pushesDone()
  }
  return failed
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
  listen()
  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => void flush())
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && void flush())
  }
  void flush()
}

// Which writes wait depends on who the device is now: recount when that changes
// (the held count read 0 after a change of identity until the queue moved). And
// a session that comes back (the refresh worked after a lapse) sends what
// waited for it, without waiting out the backoff (REL-16).
useAuth.subscribe?.((state, prev) => {
  if (state.user?.id !== prev.user?.id) publish()
  if (state.session && state.session !== prev.session && queue.some(canPush)) void flush()
})
