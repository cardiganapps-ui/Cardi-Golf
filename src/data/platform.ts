/**
 * The Polo platform admin (migration 0021): one account with oversight of
 * every tournament. Who the admin is lives only in the database
 * (`platform_admins`); the client asks `is_platform_admin()` and never
 * compares an email. Every read here is a `platform_*` RPC that refuses
 * anyone else, so hiding the UI is courtesy, not security.
 *
 * Screens get the API through `PlatformApiContext`, so the design fixtures
 * can render the panel without Supabase.
 */
import { createContext, useContext } from 'react'
import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import { withTimeout } from '../lib/timeout'

export type TournamentStatus = 'setup' | 'auction' | 'live' | 'finished'

export interface PlatformEvent {
  kind: 'tournament' | 'profile' | 'platform'
  at: string
  id: string
  label: string
  quick?: boolean
  handle?: string
  targetKind?: string
  tournamentId?: string | null
  reason?: string | null
}

export interface PlatformOverview {
  accounts: number
  accounts7d: number
  devices: number
  profiles: number
  pushProfiles: number
  tournaments: number
  quickRounds: number
  byStatus: Partial<Record<TournamentStatus, number>>
  live: number
  practice: number
  protected: number
  roundsFinished: number
  rounds30d: number
  scores30d: number
  crews: number
  courses: number
  recent: PlatformEvent[]
}

export interface PlatformDay {
  day: string
  accounts: number
  tournaments: number
  quickRounds: number
  rounds: number
  scores: number
}

export interface PlatformTournamentRow {
  id: string
  slug: string
  name: string
  status: TournamentStatus
  joinCode: string
  logoUrl: string | null
  quick: boolean
  practice: boolean
  protected: boolean
  crewName: string | null
  createdAt: string
  players: number
  rounds: number
  organizers: number
  ownerName: string | null
  ownerEmail: string | null
  lastActivityAt: string | null
}

export interface PlatformTournamentList {
  total: number
  rows: PlatformTournamentRow[]
}

export type TournamentKind = 'real' | 'quick' | 'crew' | 'practice' | 'protected' | 'orphan'

export interface TournamentQuery {
  q?: string
  status?: TournamentStatus | null
  kind?: TournamentKind | null
  limit?: number
  offset?: number
}

export interface PlatformAuditEntry {
  id: number
  at: string
  table: string
  action: 'INSERT' | 'UPDATE' | 'DELETE'
  platform: boolean
  actor: string | null
  reason: string | null
}

export interface PlatformTournament {
  id: string
  slug: string
  name: string
  tagline: string | null
  logoUrl: string | null
  status: TournamentStatus
  joinCode: string
  quick: boolean
  practice: boolean
  protected: boolean
  createdAt: string
  timezone: string
  currency: string
  crew: { id: string; slug: string; name: string } | null
  unlockedUntil: string | null
  organizers: Array<{ userId: string; role: 'owner' | 'admin'; email: string; name: string; handle: string | null }>
  rounds: Array<{ id: string; number: number; date: string | null; status: string; course: string | null; scores: number }>
  counts: { players: number; linked: number; devices: number; groups: number; payments: number; disputes: number }
  audit: PlatformAuditEntry[]
}

export interface PlatformApi {
  overview(): Promise<PlatformOverview>
  daily(days: number): Promise<PlatformDay[]>
  tournaments(q: TournamentQuery): Promise<PlatformTournamentList>
  tournament(id: string): Promise<PlatformTournament | null>
  unlock(tournamentId: string, reason: string, minutes?: number): Promise<string>
  relock(tournamentId: string): Promise<void>
  setProtected(tournamentId: string, on: boolean, reason?: string): Promise<void>
}

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase().rpc(fn, args)
  if (error) throw new Error(error.message)
  return data as T
}

const TZ = 'America/Mazatlan'

export const supabasePlatformApi: PlatformApi = {
  overview: () => rpc<PlatformOverview>('platform_overview'),
  daily: (days) => rpc<PlatformDay[]>('platform_daily', { p_days: days, p_tz: Intl.DateTimeFormat().resolvedOptions().timeZone || TZ }),
  tournaments: ({ q, status, kind, limit = 50, offset = 0 }) =>
    rpc<PlatformTournamentList>('platform_tournaments', {
      p_q: q?.trim() || null,
      p_status: status ?? null,
      p_kind: kind ?? null,
      p_limit: limit,
      p_offset: offset,
    }),
  tournament: (id) => rpc<PlatformTournament | null>('platform_tournament', { p_tournament_id: id }),
  unlock: (tournamentId, reason, minutes = 30) => rpc<string>('platform_unlock', { p_tournament_id: tournamentId, p_reason: reason, p_minutes: minutes }),
  relock: (tournamentId) => rpc<void>('platform_relock', { p_tournament_id: tournamentId }),
  setProtected: (tournamentId, on, reason) =>
    rpc<void>('set_tournament_protected', { p_tournament_id: tournamentId, p_on: on, p_reason: reason ?? null }),
}

export const PlatformApiContext = createContext<PlatformApi>(supabasePlatformApi)
export const usePlatformApi = () => useContext(PlatformApiContext)

interface PlatformState {
  /** null until asked: an unknown answer must not flash the section or a «no encontrado». */
  isAdmin: boolean | null
  load(): Promise<void>
  clear(): void
}

/** Is this account the platform admin? Loaded by AppShell when the account changes. */
export const usePlatform = create<PlatformState>((set, get) => ({
  isAdmin: null,
  async load() {
    // A "no" from before the account signed in is stale: back to unknown, so
    // /admin waits instead of saying «no encontrado» for a moment.
    if (get().isAdmin === false) set({ isAdmin: null })
    try {
      const yes = await withTimeout(rpc<boolean>('is_platform_admin'), 8000, 'admin')
      set({ isAdmin: yes === true })
    } catch {
      set({ isAdmin: false })
    }
  },
  clear() {
    set({ isAdmin: false })
  },
}))
