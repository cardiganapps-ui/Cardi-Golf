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
import {
  mapBid,
  mapBuyback,
  mapCardSignature,
  mapCourse,
  mapGroup,
  mapHandicapOverride,
  mapLot,
  mapPair,
  mapPayment,
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
  load(tournamentId: string): Promise<void>
  reload(): Promise<void>
  subscribe(): void
  unsubscribe(): void
  /** Optimistic local patch: apply a change to the snapshot and recompute immediately. */
  patch(fn: (s: Snapshot) => void): void
}

let channel: RealtimeChannel | null = null
let reloadTimer: ReturnType<typeof setTimeout> | null = null

function compute(snapshot: Snapshot): TournamentData {
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

async function fetchSnapshot(tournamentId: string): Promise<Snapshot> {
  const sb = supabase()
  const q = <T = Row>(table: string, col = 'tournament_id') =>
    sb
      .from(table)
      .select('*')
      .eq(col, tournamentId)
      .then(({ data, error }) => {
        if (error) throw error
        return (data ?? []) as T[]
      })

  const [tRes, players, rounds, pairs, lots, payments] = await Promise.all([
    sb.from('tournaments').select('*').eq('id', tournamentId).single(),
    q('players'),
    q('rounds'),
    q('pairs'),
    q('calcutta_lots'),
    q('payments'),
  ])
  if (tRes.error) throw tRes.error
  const roundIds = rounds.map((r) => r.id)
  const lotIds = lots.map((l) => l.id)
  const courseIds = [...new Set(rounds.map((r) => r.course_id).filter(Boolean))] as string[]

  const inList = <T = Row>(table: string, col: string, ids: string[]) =>
    ids.length
      ? sb
          .from(table)
          .select('*')
          .in(col, ids)
          .then(({ data, error }) => {
            if (error) throw error
            return (data ?? []) as T[]
          })
      : Promise.resolve([] as T[])

  const [groups, roundTees, scores, tiebreaks, signatures, overrides, bids, buybacks, courses, tees] = await Promise.all([
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
  ])
  const groupIds = groups.map((g) => g.id)
  const teeIds = tees.map((t) => t.id)
  const [members, holes] = await Promise.all([inList('group_members', 'group_id', groupIds), inList('holes', 'tee_id', teeIds)])

  return {
    tournament: mapTournament(tRes.data),
    players: players.map(mapPlayer).sort((a, b) => a.sortOrder - b.sortOrder),
    courses: courses.map((c) => mapCourse(c, tees, holes)),
    rounds: rounds.map(mapRound).sort((a, b) => a.number - b.number),
    groups: groups.map((g) => mapGroup(g, members)).sort((a, b) => a.number - b.number),
    roundTees: roundTees.map(mapRoundTee),
    pairs: pairs.map(mapPair),
    scores: scores.map(mapScore),
    snakeTiebreaks: tiebreaks.map(mapSnakeTiebreak),
    cardSignatures: signatures.map(mapCardSignature),
    handicapOverrides: overrides.map(mapHandicapOverride),
    calcuttaLots: lots.map(mapLot),
    calcuttaBids: bids.map(mapBid),
    calcuttaBuybacks: buybacks.map(mapBuyback),
    payments: payments.map(mapPayment),
  }
}

const REALTIME_TABLES = [
  'tournaments',
  'players',
  'pairs',
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
]

export const useTournament = create<StoreState>((set, get) => ({
  tournamentId: null,
  loading: false,
  error: null,
  data: null,
  realtime: 'off',
  async load(tournamentId) {
    if (get().tournamentId !== tournamentId) {
      get().unsubscribe()
      set({ tournamentId, data: null, error: null })
    }
    set({ loading: true })
    try {
      const snapshot = await fetchSnapshot(tournamentId)
      set({ data: compute(snapshot), loading: false, error: null })
      get().subscribe()
    } catch (e) {
      set({ loading: false, error: e instanceof Error ? e.message : String(e) })
    }
  },
  async reload() {
    const id = get().tournamentId
    if (!id) return
    try {
      const snapshot = await fetchSnapshot(id)
      set({ data: compute(snapshot), error: null })
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) })
    }
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
    ch.subscribe((status) => {
      set({ realtime: status === 'SUBSCRIBED' ? 'live' : status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' ? 'error' : 'connecting' })
    })
    channel = ch
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
    set({ data: compute(snapshot) })
  },
}))
