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
import { saveSnapshot } from './snapshotCache'
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

const REALTIME_TABLES = [
  'tournaments',
  'players',
  'pairs',
  'teams',
  'team_members',
  'rounds',
  'groups',
  'group_members',
  'round_tees',
  'scores',
  'snake_tiebreaks',
  'card_signatures',
  'handicap_overrides',
  'calcutta_lots',
  'calcutta_bids',
  'calcutta_buybacks',
  'payments',
  'game_entries',
  'hole_awards',
  'game_results',
]

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
    let ch = sb.channel(`tournament:${id}`)
    for (const table of REALTIME_TABLES) {
      ch = ch.on('postgres_changes', { event: '*', schema: 'public', table }, () => {
        // Coalesce bursts (a foursome saving a hole = 4 rows) into one reload.
        if (reloadTimer) clearTimeout(reloadTimer)
        reloadTimer = setTimeout(() => void get().reload(), 150)
      })
    }
    let wasLive = false
    ch.subscribe((status) => {
      const live = status === 'SUBSCRIBED'
      set({ realtime: live ? 'live' : status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' ? 'error' : 'connecting' })
      // Back after a gap: fetch what Realtime did not replay.
      if (live && !wasLive && get().data) void get().reload()
      wasLive = live
    })
    channel = ch
    ensureListeners()
  },
  unsubscribe() {
    if (channel) {
      void supabase().removeChannel(channel)
      channel = null
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
