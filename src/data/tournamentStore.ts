/**
 * One tournament's live snapshot + computed state. Loads every table for the
 * tournament, recomputes with the engine on every change, and subscribes to
 * Realtime (§8). Data per tournament is tiny, so a change reloads the
 * affected table and recomputes everything.
 */
import type { RealtimeChannel } from '@supabase/supabase-js'
import { create } from 'zustand'
import { computeTournament, type TournamentState } from '../engine/computeTournament'
import { parseSettings, type TournamentSettings } from '../engine/settings/schema'
import { DEFAULT_SETTINGS } from '../engine/settings/presets'
import type { Snapshot } from '../engine/types'
import { supabase } from '../lib/supabase'
import { fetchAll } from './paged'
import { REALTIME_TABLES } from './realtimeTables'
import { saveSnapshot } from './snapshotCache'
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
  mapPlayer,
  mapRound,
  mapRoundTee,
  mapScore,
  mapSnakeTiebreak,
  mapTournament,
  type Row,
} from './mappers'

export interface TournamentData {
  snapshot: Snapshot
  settings: TournamentSettings
  settingsError: string | null
  state: TournamentState
}

interface StoreState {
  tournamentId: string | null
  loading: boolean
  error: string | null
  data: TournamentData | null
  /** Realtime connection status for the sync chip. */
  realtime: 'off' | 'connecting' | 'live' | 'error'
  /** Wall-clock time of the last snapshot applied (0 before the first). Display only. */
  updatedAt: number
  load(tournamentId: string): Promise<void>
  reload(): Promise<void>
  /** Show a cached snapshot (no signal on open) and keep the store pointed at that tournament. */
  seed(tournamentId: string, snapshot: Snapshot, savedAt: number): void
  subscribe(): void
  unsubscribe(): void
  /** Optimistic local patch: apply a change to the snapshot and recompute immediately. */
  patch(fn: (s: Snapshot) => void): void
}

let channel: RealtimeChannel | null = null
let reloadTimer: ReturnType<typeof setTimeout> | null = null
/** Monotonic id so a slow older fetch never overwrites a newer snapshot. */
let fetchSeq = 0
let listenersOn = false
/** Reload when the device comes back or the tab is shown again: Realtime does not replay what was missed. */
function ensureListeners() {
  if (listenersOn || typeof window === 'undefined') return
  listenersOn = true
  const kick = () => {
    if (useTournament.getState().tournamentId && !useTournament.getState().tournamentId!.startsWith('fixture:')) void useTournament.getState().reload()
  }
  window.addEventListener('online', kick)
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && kick())
}

/** Registered by the outbox: overlays pending writes on every fetched snapshot. */
const overlays: Array<(s: Snapshot) => void> = []
export function registerOverlay(fn: (s: Snapshot) => void) {
  overlays.push(fn)
}

function compute(raw: Snapshot): TournamentData {
  // A snapshot cached by an older build has no instance-game tables.
  const snapshot: Snapshot = { ...raw, gameEntries: raw.gameEntries ?? [], holeAwards: raw.holeAwards ?? [], gameResults: raw.gameResults ?? [] }
  for (const fn of overlays) fn(snapshot)
  let settings: TournamentSettings
  let settingsError: string | null = null
  try {
    settings = parseSettings(snapshot.tournament.settings)
  } catch (e) {
    settings = DEFAULT_SETTINGS
    settingsError = e instanceof Error ? e.message : String(e)
  }
  return { snapshot, settings, settingsError, state: computeTournament(snapshot, settings) }
}

/** The exact pipeline the app runs on every snapshot; also feeds the design fixtures (`src/dev`). */
export function dataFromSnapshot(snapshot: Snapshot): TournamentData {
  return compute(snapshot)
}

/** Primary keys of the tables without an `id` column (paging order). */
const PK: Record<string, string[]> = {
  group_members: ['group_id', 'player_id'],
  round_tees: ['round_id', 'player_id'],
  snake_tiebreaks: ['round_id', 'group_id', 'hole'],
  card_signatures: ['round_id', 'pair_id'],
  handicap_overrides: ['round_id', 'player_id'],
  calcutta_buybacks: ['lot_id'],
  game_entries: ['game_id', 'player_id'],
  game_results: ['game_id', 'player_id'],
  hole_awards: ['round_id', 'game_id', 'hole', 'player_id'],
  holes: ['tee_id', 'number'],
}

async function fetchSnapshot(tournamentId: string): Promise<Snapshot> {
  const sb = supabase()
  const q = <T = Row>(table: string, col = 'tournament_id') => fetchAll<T>((from, to) => sb.from(table).select('*').eq(col, tournamentId).order('id').range(from, to))

  // Paged (PostgREST caps a response at 1,000 rows), ordered by each table's primary key so pages never overlap.
  const inList = <T = Row>(table: string, col: string, ids: string[]) =>
    ids.length
      ? fetchAll<T>((from, to) => {
          let qb = sb.from(table).select('*').in(col, ids)
          for (const c of PK[table] ?? ['id']) qb = qb.order(c)
          return qb.range(from, to)
        })
      : Promise.resolve([] as T[])

  const [tRes, players, rounds, pairs, teams, lots, payments, gameEntries, gameResults] = await Promise.all([
    sb.from('tournaments').select('*').eq('id', tournamentId).single(),
    q('players'),
    q('rounds'),
    q('pairs'),
    q('teams'),
    q('calcutta_lots'),
    q('payments'),
    inList('game_entries', 'tournament_id', [tournamentId]),
    inList('game_results', 'tournament_id', [tournamentId]),
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

  return {
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
  }
}

/** While live updates are down, reload this often so the boards keep moving. */
const POLL_MS = 15_000
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
  async load(tournamentId) {
    if (get().tournamentId !== tournamentId) {
      get().unsubscribe()
      set({ tournamentId, data: null, error: null })
    }
    set({ loading: true })
    const seq = ++fetchSeq
    try {
      const snapshot = await fetchSnapshot(tournamentId)
      if (seq !== fetchSeq || get().tournamentId !== tournamentId) return
      set({ data: compute(snapshot), updatedAt: Date.now(), loading: false, error: null })
      void saveSnapshot(tournamentId, snapshot)
      get().subscribe()
    } catch (e) {
      if (seq !== fetchSeq) return
      set({ loading: false, error: e instanceof Error ? e.message : String(e) })
    }
  },
  async reload() {
    const id = get().tournamentId
    if (!id) return
    const seq = ++fetchSeq
    try {
      const snapshot = await fetchSnapshot(id)
      if (seq !== fetchSeq || get().tournamentId !== id) return
      set({ data: compute(snapshot), updatedAt: Date.now(), error: null })
      void saveSnapshot(id, snapshot)
    } catch (e) {
      if (seq !== fetchSeq) return
      set({ error: e instanceof Error ? e.message : String(e) })
    }
  },
  seed(tournamentId, snapshot, savedAt) {
    if (get().tournamentId !== tournamentId) get().unsubscribe()
    set({ tournamentId, data: compute(snapshot), updatedAt: savedAt, loading: false, error: null, realtime: 'off' })
  },
  subscribe() {
    const id = get().tournamentId
    if (!id || channel) return
    set({ realtime: 'connecting' })
    const sb = supabase()
    // `wait`: the server confirms every postgres_changes binding before the join
    // succeeds, so a rejected subscription reports CHANNEL_ERROR instead of a
    // SUBSCRIBED that never delivers anything (REL-01).
    let ch = sb.channel(`tournament:${id}`, { config: { postgres_changes_options: { wait: true } } })
    for (const table of REALTIME_TABLES) {
      ch = ch.on('postgres_changes', { event: '*', schema: 'public', table }, () => {
        // Coalesce bursts (a foursome saving a hole = 4 rows) into one reload.
        if (reloadTimer) clearTimeout(reloadTimer)
        reloadTimer = setTimeout(() => void get().reload(), 150)
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
    stopDegraded()
    retryDelay = RETRY_MIN_MS
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
    const snapshot = structuredClone(d.snapshot)
    fn(snapshot)
    set({ data: compute(snapshot), updatedAt: Date.now() })
  },
}))
