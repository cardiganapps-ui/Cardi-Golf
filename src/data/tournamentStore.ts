/**
 * One tournament's live snapshot + computed state. Loads every table for the
 * tournament, recomputes with the engine on every change, and subscribes to
 * Realtime (§8). A change to a table that moves during play (a score, a
 * signature, a payment, a bid) is applied from the event itself
 * (`realtimeApply.ts`, REL-11, PERF-07); any other change reloads the
 * tournament.
 *
 * Two snapshots are kept. `base` is the server's rows only: what was fetched,
 * with the live changes applied on it, and what the phone keeps. `snapshot`
 * is what the screens read: `base` with this phone's unsent writes on top
 * (the outbox overlay), rebuilt on every compute and never written back, so
 * a hole that never reached the server cannot pass for the server's, nor hide
 * what the server said after it (another phone's later value, a discrepancy).
 */
import type { RealtimeChannel } from '@supabase/supabase-js'
import { create } from 'zustand'
import { z } from 'zod'
import { computeTournament, type TournamentState } from '../engine/computeTournament'
import { parseSettings, type TournamentSettings } from '../engine/settings/schema'
import { DEFAULT_SETTINGS } from '../engine/settings/presets'
import type { Snapshot } from '../engine/types'
import { humanError } from '../lib/humanError'
import { supabase } from '../lib/supabase'
import { fetchAll } from './paged'
import { REALTIME_TABLES } from './realtimeTables'
import { APPLIED_TABLES, applyChange, inLiveOrder, sameChange, type LiveChange } from './realtimeApply'
import { onCacheCleared, saveSnapshot } from './snapshotCache'
import { SNAPSHOT_KEYS, type SnapshotTable } from './snapshotTables'
import {
  mapBid,
  mapBuyback,
  mapCardSignature,
  mapCourse,
  mapGroup,
  mapHandicapOverride,
  mapLot,
  mapPair,
  mapTeam,
  mapPayment,
  mapGameEntry,
  mapHoleAward,
  mapGameResult,
  mapMoneyAdjustment,
  mapPlayer,
  mapRound,
  mapRoundTee,
  mapScore,
  mapSnakeTiebreak,
  mapTournament,
  type Row,
} from './mappers'

export interface TournamentData {
  /** What the screens read: the server's rows with this phone's unsent writes on top. */
  snapshot: Snapshot
  /** The server's rows only: what live changes apply to, and what the phone keeps. */
  base: Snapshot
  settings: TournamentSettings
  settingsError: string | null
  state: TournamentState
  /**
   * What the players' rows read as, hashed: the same after a reload that
   * changed none of them (a score, a payment), new when one did, a link made
   * or undone included, which the snapshot's players don't carry. Readers
   * that ask the server about the players (who has a PIN) key on it, so a
   * realtime reload of another table costs them nothing.
   */
  playersKey: string
}

interface StoreState {
  tournamentId: string | null
  loading: boolean
  /** Why the last load failed, as copy for people (humanError). */
  error: string | null
  data: TournamentData | null
  /** Realtime connection status for the sync chip. */
  realtime: 'off' | 'connecting' | 'live' | 'error'
  /**
   * When the server data on screen was fetched: the copy's own time when it
   * came from the phone (0 before the first). A hole saved on the phone since
   * leaves it, so a two-day-old copy never reads «hace un momento» (REL-04).
   * Display only.
   */
  updatedAt: number
  /**
   * Where the boards on screen came from: the copy this phone saved ('cache',
   * shown at once on open) or the server ('server'). The gate keeps trying
   * until it is 'server', and the header says which (REL-02).
   */
  source: 'cache' | 'server' | null
  /** Whether the snapshots shown are kept on the phone for offline use: not on a platform-admin visit, where the tournament is not his. */
  keepOnPhone: boolean
  load(tournamentId: string, opts?: { keepOnPhone?: boolean }): Promise<void>
  reload(): Promise<void>
  /** Show a cached snapshot (no signal on open) and keep the store pointed at that tournament. */
  seed(tournamentId: string, snapshot: Snapshot, savedAt: number): void
  subscribe(): void
  unsubscribe(): void
  /** Optimistic local patch of a write the server took: apply it to the server's rows and recompute. */
  patch(fn: (s: Snapshot) => void): void
  /** Recompute from the server's rows with the outbox as it is now (a write queued, sent or refused). */
  refresh(): void
  /**
   * A write of this phone the server took, as the server stored it (the rows
   * the push got back): applied to the server's rows like a live change,
   * except the ones the channel already brought since `since` (their echo:
   * anything after it is newer), and never over a newer row held. Logged
   * like a live change, so a fetch on its way does not take it back. A fetch
   * that landed after the push went out (`sentAt`, the phone's clock) read
   * the server at an unknown point around the write: then nothing lands and
   * one more fetch says what the server holds.
   */
  landChanges(tournamentId: string, changes: LiveChange[], since: number, sentAt: number, opts?: { flushing?: boolean; fetch?: boolean }): void
  /** The outbox's flush ended: the one more fetch its landings asked for goes now, once. */
  pushesDone(): void
}

let channel: RealtimeChannel | null = null
let reloadTimer: ReturnType<typeof setTimeout> | null = null

/** A reload, coalesced: a burst of structural changes (a draw writes many rows) costs one. */
function scheduleReload() {
  if (reloadTimer) clearTimeout(reloadTimer)
  reloadTimer = setTimeout(() => void useTournament.getState().reload(), 150)
}

const APPLIED = new Set<string>(APPLIED_TABLES)
/** Live changes wait this long, so a foursome saving a hole (four rows) recomputes once. */
const APPLY_MS = 40
let pendingChanges: LiveChange[] = []
let applyTimer: ReturnType<typeof setTimeout> | null = null
/**
 * Every change applied, numbered, for a short while: a reload that was on its
 * way when one arrived may have read its table before the change, so the
 * changes after its start are applied again on what it brings (they are
 * keyed, so applying one twice changes nothing).
 */
let changeSeq = 0
/**
 * `t`: when it was applied, on `liveClock`, which also ages the log: a clock
 * set forward would otherwise drop what a fetch or a push still asks about.
 * `landed`: a row this phone's own write brought back, which yields to a
 * newer one (realtimeApply `stale`).
 */
const changeLog: Array<{ seq: number; t: number; change: LiveChange; landed?: boolean }> = []
const LOG_MS = 2 * 60_000
/** A ceiling on the log, far above a burst (a tournament deleted or restored elsewhere sends every one of its deletes to every phone). */
const LOG_MAX = 10_000
let saveTimer: ReturnType<typeof setTimeout> | null = null
/**
 * Changes of a round or lot this phone has not loaded: another tournament's
 * (an account in two of them hears both), or a day or lot just created here,
 * whose own change brings it. Kept this long, and placed as soon as their day
 * or lot is on the phone, instead of a reload for each one.
 */
let parked: Array<{ at: number; t: number; change: LiveChange; landed?: boolean }> = []
const PARK_MS = 2 * 60_000
/** Far above what another tournament's traffic brings in PARK_MS (an account in two live tournaments hears both). */
const PARK_MAX = 5_000
function park(change: LiveChange, at: number, landed?: boolean, t = liveClock()) {
  parked.push({ at, t, change, ...(landed ? { landed } : {}) })
  if (parked.length > PARK_MAX) parked = parked.slice(-PARK_MAX)
}
/** A delete forgets what was parked for its row: placed later, the row would come back (round-1 repro G). */
function unpark(key: LiveChange) {
  const k = key.old
  const names = Object.keys(k)
  if (!names.length) return
  parked = parked.filter(({ change }) => change.table !== key.table || !names.every((n) => change.new[n] === k[n]))
}
/** The parked changes still worth trying, oldest first; the list is emptied (what still waits is parked again). */
function takeParked(now: number) {
  const out = parked.filter((p) => p.at >= now - PARK_MS)
  parked = []
  return out
}

function receive(change: LiveChange) {
  pendingChanges.push(change)
  applyTimer ??= setTimeout(flushChanges, APPLY_MS)
}

/**
 * Apply changes to `s` (a copy of the server's rows): log what landed, and
 * the deletes of rows it does not hold (a reload that read the row before
 * the delete must lose it too); park what waits for its day or lot.
 * Returns how many applied and whether one needs a reload.
 */
function applyAll(s: Snapshot, tournamentId: string, changes: Array<{ at: number; t?: number; change: LiveChange; landed?: boolean }>) {
  let applied = 0
  let reload = false
  let stale = 0
  const t = liveClock()
  for (const { at, t: first, change, landed } of changes) {
    const r = applyChange(s, tournamentId, change, { landed })
    if (r === 'applied') applied++
    if (change.eventType === 'DELETE') unpark(change)
    // A delete of a row the boards do not hold matters only to a fetch on its way, which may have read the row before it.
    if (r === 'applied' || (r === 'ignored' && change.eventType === 'DELETE' && fetching > 0)) changeLog.push({ seq: ++changeSeq, t, change, ...(landed ? { landed } : {}) })
    else if (r === 'unknown') park(change, at, landed, first)
    else if (r === 'reload') reload = true
    else if (r === 'stale') stale++
  }
  while (changeLog.length && (changeLog.length > LOG_MAX || changeLog[0]!.t < t - LOG_MS)) changeLog.shift()
  return { applied, reload, stale }
}

/** Keep the server's rows on the phone a moment after the last change (a burst saves once). */
function saveSoon(id: string) {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    saveTimer = null
    const cur = useTournament.getState()
    if (cur.tournamentId === id && cur.keepOnPhone && cur.data) void saveSnapshot(id, cur.data.base)
  }, 1500)
}

function flushChanges() {
  applyTimer = null
  const batch = pendingChanges
  pendingChanges = []
  const st = useTournament.getState()
  const d = st.data
  const id = st.tournamentId
  if (!d || !id) return scheduleReload()
  const next = structuredClone(d.base)
  const now = Date.now()
  // What waited for its day or lot goes first, in the order it came: a lot just sold places its bids.
  const { applied, reload } = applyAll(next, id, [...takeParked(now), ...batch.map((change) => ({ at: now, change }))])
  if (applied) {
    // The players are untouched, so their key stays; the boards are as fresh as the server's last change.
    useTournament.setState({ data: compute(next, d.playersKey), ...(st.source === 'server' ? { updatedAt: now } : {}) })
    if (st.keepOnPhone) saveSoon(id)
  }
  if (reload) scheduleReload()
}

/**
 * What a fetch brought, caught up: the changes applied since it started
 * (it may have read their tables before them; they are keyed, so applying
 * one twice changes nothing), then whatever waited for a day or lot it brings.
 */
function catchUp(snapshot: Snapshot, tournamentId: string, since: number) {
  for (const { seq, change, landed } of changeLog) if (seq > since) applyChange(snapshot, tournamentId, change, { landed })
  applyAll(snapshot, tournamentId, takeParked(Date.now()))
}

/** The live changes logged after `seq`: the outbox asks whether the server already answered for a write it sent. */
export function liveSeq(): number {
  return changeSeq
}
/**
 * A clock that never goes back, for when a push went out against when a
 * fetch landed: a phone's clock set back mid-push would otherwise make a
 * fetch that read before the write look later than it (#92's fourth
 * verifier, N6). Each tab counts from its own origin, and a sleep or a clock
 * change between two tabs' openings sets their readings apart, so another
 * tab says how long ago its push went out, never when (outbox `listen`).
 */
export function liveClock(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.timeOrigin + performance.now() : Date.now()
}
/** For tests: how much the log and the parked list hold, and the fetches on their way. */
export const _liveTest = { logSize: () => changeLog.length, parkedSize: () => parked.length, fetching: () => fetching, refetchAsked: () => refetch, fetchAfterPushesAsked: () => fetchAfterPushes, isOpen: () => open, LOG_MAX, PARK_MAX, LOG_MS }

/** When the boards last came from a fetch: a long quiet stretch on a live channel is checked against the server (`HEAL_MS`). */
let lastFetchAt = 0
/** The same, on `liveClock`: a fetch that landed after a push went out may have read past it. */
let lastFetchMono = 0
/**
 * When the fetch whose rows the boards hold now set out, on the wall clock
 * (which the app's tabs share, and which the outbox's `seq` is made from):
 * everything it read is the server as it stood at that moment or later.
 */
let baseReadAt = 0
/**
 * The boards of `tournamentId` came from the server (not the phone's copy):
 * when the fetch that brought them set out. Null when they did not. A round
 * missing from them was deleted, unless a write for it was queued after this.
 */
export function serverReadSince(tournamentId: string): number | null {
  const st = useTournament.getState()
  return st.tournamentId === tournamentId && st.source === 'server' && st.data ? baseReadAt : null
}
/** The one more fetch the outbox's landings asked for, sent once its flush ends (a reconnect's 36 rows cost one). */
let fetchAfterPushes = false
/** The gate is on the tournament: only then do an unlock or a reconnect fetch it. */
let open = false
/** The gate left the tournament: nothing fetches it any more, not a late answer, a refused write or another tab (N9). */
let left = false
/** Fetches on their way: the heal waits for them, and a delete is logged only for them. */
let fetching = 0
/** A write landed while a fetch was on its way, which may have read a later change than it: one more fetch once it lands. */
let refetch = false
/** Times the tournament was left (the gate went): a load still on its way then lands, but opens no channel. */
let leaves = 0
/** Once a fetch has landed: the one more fetch a write landed during it asked for. */
function afterFetch() {
  if (!refetch || fetching > 0) return
  refetch = false
  scheduleReload()
}
/** When the heal last asked, and how long it waits after a fetch that failed (doubling to HEAL_MAX_MS). */
let healAskedAt = 0
let healWait = 0
/** Monotonic id so a slow older fetch never overwrites a newer snapshot. */
let fetchSeq = 0
let listenersOn = false
/** Reload when the device comes back or the tab is shown again: Realtime does not replay what was missed. */
function ensureListeners() {
  if (listenersOn || typeof window === 'undefined') return
  listenersOn = true
  const kick = () => {
    if (open && useTournament.getState().tournamentId && !useTournament.getState().tournamentId!.startsWith('fixture:')) void useTournament.getState().reload()
  }
  window.addEventListener('online', kick)
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && kick())
}

/** Registered by the outbox: overlays pending writes on every fetched snapshot. */
const overlays: Array<(s: Snapshot) => void> = []
export function registerOverlay(fn: (s: Snapshot) => void) {
  overlays.push(fn)
}

/** A short, stable hash of a string (cyrb53): a key, not a secret. */
function hashKey(text: string): string {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 2654435761)
    h2 = Math.imul(h2 ^ c, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)
}
/** The players' rows as fetched, for the snapshots fetchSnapshot returns (their columns include the profile link). */
const fetchedPlayers = new WeakMap<Snapshot, string>()
const playersKeyOf = (snapshot: Snapshot) => fetchedPlayers.get(snapshot) ?? hashKey(JSON.stringify(snapshot.players))

function compute(raw: Snapshot, playersKey = playersKeyOf(raw)): TournamentData {
  // A snapshot cached by an older build has no instance-game tables.
  const base: Snapshot = { ...raw, gameEntries: raw.gameEntries ?? [], holeAwards: raw.holeAwards ?? [], gameResults: raw.gameResults ?? [], moneyAdjustments: raw.moneyAdjustments ?? [] }
  // The overlays write into lists of their own: the server's rows stay the server's.
  const snapshot: Snapshot = overlays.length
    ? { ...base, scores: [...base.scores], snakeTiebreaks: [...base.snakeTiebreaks], cardSignatures: [...base.cardSignatures], holeAwards: [...base.holeAwards!] }
    : base
  for (const fn of overlays) fn(snapshot)
  let settings: TournamentSettings
  let settingsError: string | null = null
  try {
    settings = parseSettings(snapshot.tournament.settings)
  } catch (e) {
    settings = DEFAULT_SETTINGS
    // The schema's own lines (what to fix), not ZodError's JSON dump; anything else as copy (COPY-04).
    settingsError = e instanceof z.ZodError ? e.issues.map((i) => i.message).join('; ') : humanError(e)
  }
  return { snapshot, base, settings, settingsError, state: computeTournament(snapshot, settings), playersKey }
}

/** The exact pipeline the app runs on every snapshot; also feeds the design fixtures (`src/dev`). */
export function dataFromSnapshot(snapshot: Snapshot): TournamentData {
  return compute(snapshot)
}

async function fetchSnapshot(tournamentId: string): Promise<Snapshot> {
  const sb = supabase()
  // Paged (PostgREST caps a response at 1,000 rows), ordered by each table's primary key so pages never overlap.
  const inList = <T = Row>(table: SnapshotTable, col: string, ids: string[]) =>
    ids.length
      ? fetchAll<T>((from, to) => {
          let qb = sb.from(table).select('*').in(col, ids)
          for (const c of SNAPSHOT_KEYS[table]) qb = qb.order(c)
          return qb.range(from, to)
        })
      : Promise.resolve([] as T[])
  const q = <T = Row>(table: SnapshotTable) => inList<T>(table, 'tournament_id', [tournamentId])

  const [tRes, players, rounds, pairs, teams, lots, payments, gameEntries, gameResults, adjustments] = await Promise.all([
    sb.from('tournaments').select('*').eq('id', tournamentId).single(),
    q('players'),
    q('rounds'),
    q('pairs'),
    q('teams'),
    q('calcutta_lots'),
    q('payments'),
    inList('game_entries', 'tournament_id', [tournamentId]),
    inList('game_results', 'tournament_id', [tournamentId]),
    // A database without 0027 has no such table yet: nothing assigned, rather than a tournament that won't open.
    q('money_adjustments').catch((e: unknown) => {
      if ((e as { code?: string } | null)?.code === 'PGRST205') return [] as Row[]
      throw e
    }),
  ])
  if (tRes.error) throw tRes.error
  const roundIds = rounds.map((r) => r.id)
  const lotIds = lots.map((l) => l.id)
  const courseIds = [...new Set(rounds.map((r) => r.course_id).filter(Boolean))] as string[]


  const [groups, roundTees, scores, tiebreaks, signatures, overrides, bids, buybacks, courses, tees, holeAwards] = await Promise.all([
    inList('groups', 'round_id', roundIds),
    inList('round_tees', 'round_id', roundIds),
    inList('scores', 'round_id', roundIds),
    inList('snake_tiebreaks', 'round_id', roundIds),
    inList('card_signatures', 'round_id', roundIds),
    inList('handicap_overrides', 'round_id', roundIds),
    inList('calcutta_bids', 'lot_id', lotIds),
    inList('calcutta_buybacks', 'lot_id', lotIds),
    inList('courses', 'id', courseIds),
    inList('tees', 'course_id', courseIds),
    inList('hole_awards', 'round_id', roundIds),
  ])
  const groupIds = groups.map((g) => g.id)
  const teeIds = tees.map((t) => t.id)
  const teamIds = teams.map((x) => x.id)
  const [members, holes, teamMembers] = await Promise.all([
    inList('group_members', 'group_id', groupIds),
    inList('holes', 'tee_id', teeIds),
    inList('team_members', 'team_id', teamIds),
  ])

  const snapshot: Snapshot = {
    tournament: mapTournament(tRes.data),
    players: players.map(mapPlayer).sort((a, b) => a.sortOrder - b.sortOrder),
    courses: courses.map((c) => mapCourse(c, tees, holes)),
    rounds: rounds.map(mapRound).sort((a, b) => a.number - b.number),
    groups: groups.map((g) => mapGroup(g, members)).sort((a, b) => a.number - b.number),
    roundTees: roundTees.map(mapRoundTee),
    pairs: pairs.map(mapPair),
    teams: teams.map((x) => mapTeam(x, teamMembers)).sort((a, b) => a.number - b.number),
    scores: scores.map(mapScore),
    snakeTiebreaks: tiebreaks.map(mapSnakeTiebreak),
    cardSignatures: signatures.map(mapCardSignature),
    handicapOverrides: overrides.map(mapHandicapOverride),
    calcuttaLots: lots.map(mapLot),
    calcuttaBids: bids.map(mapBid),
    calcuttaBuybacks: buybacks.map(mapBuyback),
    payments: payments.map(mapPayment),
    gameEntries: gameEntries.map(mapGameEntry),
    holeAwards: holeAwards.map(mapHoleAward),
    gameResults: gameResults.map(mapGameResult),
    moneyAdjustments: adjustments.map(mapMoneyAdjustment),
  }
  fetchedPlayers.set(snapshot, hashKey(JSON.stringify([...players].sort((a, b) => String(a.id).localeCompare(String(b.id))))))
  // In the order live changes insert in, whatever order the database's collation gave.
  return inLiveOrder(snapshot)
}

/** While live updates are down, reload this often so the boards keep moving. */
const POLL_MS = 15_000
/**
 * While they are up, check the boards against the server after this long
 * without a fetch: a change Realtime lost, or one this phone could not place,
 * would otherwise stay until the next structural change or reconnect (the TV
 * is never hidden). Until changes carry a sequence (PLAN §5.2), this is the
 * net: one fetch in five minutes per visible phone, none while one is on its
 * way, and after a fetch that failed the wait doubles (to 30 minutes).
 */
export const HEAL_MS = 5 * 60_000
const HEAL_MAX_MS = 30 * 60_000
let healTimer: ReturnType<typeof setInterval> | null = null
/** An errored channel never recovers by itself: rebuild it, backing off to this. */
const RETRY_MIN_MS = 30_000
const RETRY_MAX_MS = 5 * 60_000
let pollTimer: ReturnType<typeof setInterval> | null = null
let retryTimer: ReturnType<typeof setTimeout> | null = null
let retryDelay = RETRY_MIN_MS

function stopDegraded() {
  if (pollTimer) clearInterval(pollTimer)
  if (retryTimer) clearTimeout(retryTimer)
  pollTimer = null
  retryTimer = null
}

export const useTournament = create<StoreState>((set, get) => ({
  tournamentId: null,
  loading: false,
  error: null,
  data: null,
  realtime: 'off',
  updatedAt: 0,
  source: null,
  keepOnPhone: true,
  async load(tournamentId, opts) {
    if (get().tournamentId !== tournamentId) {
      get().unsubscribe()
      set({ tournamentId, data: null, error: null, source: null })
    }
    open = true
    left = false
    const leavesAtStart = leaves
    set({ loading: true, keepOnPhone: opts?.keepOnPhone ?? true })
    const seq = ++fetchSeq
    const readAt = Date.now()
    // The gate loads again on every resolve (back from Home, the PIN, a new session) while the channel stays live.
    const since = changeSeq
    fetching++
    try {
      const snapshot = await fetchSnapshot(tournamentId).finally(() => fetching--)
      if (get().tournamentId !== tournamentId) return
      if (seq !== fetchSeq) {
        // A newer fetch of this tournament brings the boards (a reload a live change asked for); this load still owes the channel,
        // and the one more fetch a write asked for while both were out (#92's fourth verifier, N2).
        if (get().data) set({ loading: false })
        if (leaves === leavesAtStart) get().subscribe()
        return afterFetch()
      }
      // A live change that landed while this was on its way may be newer than what it read.
      catchUp(snapshot, tournamentId, since)
      lastFetchAt = Date.now()
      lastFetchMono = liveClock()
      baseReadAt = readAt
      healWait = 0
      set({ data: compute(snapshot), updatedAt: Date.now(), loading: false, error: null, source: 'server' })
      if (get().keepOnPhone) void saveSnapshot(tournamentId, snapshot)
      afterFetch()
      if (leaves === leavesAtStart) get().subscribe()
    } catch (e) {
      if (seq !== fetchSeq) {
        if (get().tournamentId === tournamentId && get().data) set({ loading: false })
        return afterFetch()
      }
      set({ loading: false, error: humanError(e) })
      afterFetch()
    }
  },
  async reload() {
    const id = get().tournamentId
    // A design fixture (`src/dev`) has no server: its snapshot is the truth,
    // and a fetch would only replace it with nothing after a write.
    if (!id || id.startsWith('fixture:')) return
    // A tournament left is fetched by nothing, a refused write's answer included (N9).
    if (left) return
    const seq = ++fetchSeq
    const readAt = Date.now()
    const since = changeSeq
    fetching++
    try {
      const snapshot = await fetchSnapshot(id).finally(() => fetching--)
      if (get().tournamentId !== id) return
      // Superseded: the newer fetch brings the boards, and the one more fetch asked for while both were out still goes (N2).
      if (seq !== fetchSeq) return afterFetch()
      // A live change that landed while this was on its way may be newer than what it read.
      catchUp(snapshot, id, since)
      lastFetchAt = Date.now()
      lastFetchMono = liveClock()
      baseReadAt = readAt
      healWait = 0
      set({ data: compute(snapshot), updatedAt: Date.now(), loading: false, error: null, source: 'server' })
      if (get().keepOnPhone) void saveSnapshot(id, snapshot)
      afterFetch()
    } catch (e) {
      // The heal waits longer after each fetch that failed (a released device, a deleted tournament, a server down).
      healWait = Math.min(Math.max(healWait * 2, HEAL_MS * 2), HEAL_MAX_MS)
      if (seq !== fetchSeq) return afterFetch()
      set({ error: humanError(e) })
      // A failed fetch read nothing: the one more fetch a landing asked for still goes, once (V22).
      afterFetch()
    }
  },
  seed(tournamentId, snapshot, savedAt) {
    // Never over the live boards: a cache read that lands after the server's answer is older than it.
    if (get().tournamentId === tournamentId && get().source === 'server') return
    if (get().tournamentId !== tournamentId) get().unsubscribe()
    // Entering it from the copy: the reloads a cold open needs are this tournament's, not a left one's.
    left = false
    // A copy on the phone is of a tournament the phone keeps.
    set({ tournamentId, data: compute(snapshot), updatedAt: savedAt, loading: false, error: null, realtime: 'off', source: 'cache', keepOnPhone: true })
  },
  subscribe() {
    const id = get().tournamentId
    if (!id || channel) return
    open = true
    left = false
    set({ realtime: 'connecting' })
    const sb = supabase()
    // `wait`: the server confirms every postgres_changes binding before the join
    // succeeds, so a rejected subscription reports CHANNEL_ERROR instead of a
    // SUBSCRIBED that never delivers anything (REL-01).
    let ch = sb.channel(`tournament:${id}`, { config: { postgres_changes_options: { wait: true } } })
    for (const table of REALTIME_TABLES) {
      ch = ch.on('postgres_changes', { event: '*', schema: 'public', table }, (payload: { eventType?: LiveChange['eventType']; new?: Record<string, unknown>; old?: Record<string, unknown>; errors?: unknown }) => {
        // A channel that was left still delivers until the server takes the leave: its tournament is not on screen.
        if (channel !== ch) return
        // A row the event carries is applied where it belongs; anything else reloads (REL-11, PERF-07).
        const errors = Array.isArray(payload?.errors) ? payload.errors.length > 0 : !!payload?.errors
        if (APPLIED.has(table) && payload?.eventType && !errors) receive({ table, eventType: payload.eventType, new: (payload.new ?? {}) as LiveChange['new'], old: (payload.old ?? {}) as LiveChange['old'] })
        else scheduleReload()
      })
    }
    const degrade = () => {
      if (channel !== ch) return
      set({ realtime: 'error' })
      // Live updates are down: poll so the boards keep moving.
      pollTimer ??= setInterval(() => {
        if (typeof document === 'undefined' || document.visibilityState === 'visible') void get().reload()
      }, POLL_MS)
      // And try the channel again later, backing off once per rebuild (the
      // socket may report several errors before the rebuild fires).
      if (!retryTimer) {
        retryTimer = setTimeout(() => {
          retryTimer = null
          if (channel !== ch) return
          // Forget the channel first: removeChannel reports CLOSED synchronously.
          channel = null
          void sb.removeChannel(ch)
          get().subscribe()
        }, retryDelay)
        retryDelay = Math.min(retryDelay * 2, RETRY_MAX_MS)
      }
    }
    // Belt and braces for a server that answers the join before its bindings
    // are up, or that drops the channel later (extension 'system').
    ch = ch.on('system', {}, (payload: { extension?: string; status?: string }) => {
      if ((payload?.extension === 'postgres_changes' || payload?.extension === 'system') && payload.status === 'error') degrade()
    })
    let wasLive = false
    channel = ch
    healTimer ??= setInterval(() => {
      const st = get()
      if (st.realtime !== 'live' || !st.data || fetching > 0 || (typeof document !== 'undefined' && document.visibilityState !== 'visible')) return
      const now = Date.now()
      // A clock set back counts as time gone by: the check comes, instead of waiting for the clock to catch up.
      const quiet = now - lastFetchAt
      const waited = now - healAskedAt
      if ((quiet >= 0 && quiet < HEAL_MS) || (healWait > 0 && waited >= 0 && waited < healWait)) return
      healAskedAt = now
      void st.reload()
    }, HEAL_MS / 20)
    ch.subscribe((status) => {
      if (channel !== ch) return
      const live = status === 'SUBSCRIBED'
      if (live) {
        stopDegraded()
        retryDelay = RETRY_MIN_MS
        set({ realtime: 'live' })
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        // CLOSED here means the server dropped a channel we still want (e.g. a
        // token that expired while the app was hidden): realtime-js won't
        // rejoin it, so treat it as an outage. Our own removals clear
        // `channel` first and never reach this line.
        degrade()
      } else set({ realtime: 'connecting' })
      // Back after a gap: fetch what Realtime did not replay.
      if (live && !wasLive && get().data) void get().reload()
      wasLive = live
    })
    ensureListeners()
  },
  unsubscribe() {
    leaves++
    open = false
    left = true
    refetch = false
    fetchAfterPushes = false
    stopDegraded()
    retryDelay = RETRY_MIN_MS
    if (healTimer) clearInterval(healTimer)
    healTimer = null
    // Changes still waiting, logged or parked belong to the channel being left,
    // and so does a save still to come (the phone may just have forgotten it).
    if (applyTimer) clearTimeout(applyTimer)
    applyTimer = null
    if (reloadTimer) clearTimeout(reloadTimer)
    reloadTimer = null
    pendingChanges = []
    changeLog.length = 0
    parked = []
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = null
    if (channel) {
      // Forget the channel first: removeChannel reports CLOSED synchronously.
      const ch = channel
      channel = null
      void supabase().removeChannel(ch)
    }
    set({ realtime: 'off' })
  },
  patch(fn) {
    const d = get().data
    if (!d) return
    const snapshot = structuredClone(d.base)
    fn(snapshot)
    // `updatedAt` stays: nothing new came from the server (REL-04). A patch
    // that leaves the players alone (a score, a mark) keeps their key.
    const same = JSON.stringify(snapshot.players) === JSON.stringify(d.base.players)
    set({ data: compute(snapshot, same ? d.playersKey : undefined) })
  },
  refresh() {
    const d = get().data
    if (d) set({ data: compute(d.base, d.playersKey) })
  },
  landChanges(tournamentId, changes, since, sentAt, opts = {}) {
    const st = get()
    const d = st.data
    if (st.tournamentId !== tournamentId || !d) return
    // One more fetch, read after this write: now, or once the outbox's flush ends (a reconnect's rows ask it once).
    // A tournament left fetches nothing (N9).
    const askFetch = () => {
      if (left) return
      if (opts.flushing) fetchAfterPushes = true
      else scheduleReload()
    }
    // A fetch that landed while the write was out may have read before it, after it, or after a later change, and a
    // table with no stamp can't say which; so may an answer older than the change log, whose echo and what came after
    // have left it. The write lands all the same, so the hole the phone saved never leaves its boards or its copy
    // (#92's fourth verifier, N1), and one more fetch says which (R3, N5).
    const overlap = lastFetchMono >= sentAt || liveClock() - sentAt > LOG_MS
    // Events come in commit order: once a row's echo is in, what came after it is newer, and is in too. Only what came
    // since the push went out counts: an identical earlier row is not this write's echo (N3). Parked echoes count (N7).
    const heard = [...changeLog.filter((x) => x.seq > since && x.t >= sentAt).map((x) => x.change), ...parked.filter((p) => !p.landed && p.t >= sentAt).map((p) => p.change)]
    const fresh = changes.filter((c) => !heard.some((h) => sameChange(h, c)))
    if (fresh.length) {
      // A fetch on its way replays the write over what it read, which may be later: one more fetch after it.
      // In a flush, the one fetch at its end reads after it: one per overlapped fetch chained 17 for 36 rows (N8).
      if (fetching > 0 && !left) {
        if (opts.flushing) fetchAfterPushes = true
        else refetch = true
      }
      const next = structuredClone(d.base)
      const now = Date.now()
      const { reload, stale } = applyAll(next, tournamentId, fresh.map((change) => ({ at: now, change, landed: true })))
      set({ data: compute(next, d.playersKey) })
      if (st.keepOnPhone && !tournamentId.startsWith('fixture:')) saveSoon(tournamentId)
      if (reload) scheduleReload()
      // The boards hold the row stamped later, and kept it. A write that waited on the row's lock commits last with
      // the earlier stamp, so a fetch says which stands (N4).
      if (stale) askFetch()
    } else st.refresh()
    if (overlap || opts.fetch) askFetch()
  },
  pushesDone() {
    // Only a landing on an open tournament asks it, and leaving forgets it.
    if (!fetchAfterPushes) return
    fetchAfterPushes = false
    scheduleReload()
  },
}))

// The phone forgot a tournament («Salir», a sign-out, a link to nothing): nothing
// of it is written back by a change that lands afterwards, until it is opened again.
onCacheCleared((tournamentId) => {
  const st = useTournament.getState()
  if (tournamentId !== null && tournamentId !== st.tournamentId) return
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = null
  useTournament.setState({ keepOnPhone: false })
})
