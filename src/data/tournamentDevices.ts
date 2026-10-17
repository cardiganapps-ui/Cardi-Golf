/**
 * The tournament's phones (0037 `tournament_devices`, STRAT-02): which ones
 * reported in the last 7 days, whose player each is, its app version and how
 * many holes it still has to send. Read by the Comité only (Rondas), so a
 * phone that went out of signal can be found before a day closes.
 */
import { create } from 'zustand'
import { isMissingFunction, rpc } from './rpc'

export interface TournamentDevice {
  playerId: string | null
  /** The player's short name, or null while the phone has entered with no PIN. */
  player: string | null
  build: number | null
  buildSha: string | null
  platform: 'ios' | 'android' | 'desktop' | 'other' | null
  standalone: boolean | null
  /** Holes it still has to send (all its tournaments; up to 500). */
  pending: number
  rejected: number
  oldestPendingAt: string | null
  lastSyncAt: string | null
  lastSeenAt: string
}

interface DevicesState {
  tournamentId: string | null
  items: TournamentDevice[]
  status: 'idle' | 'loading' | 'ready' | 'unavailable' | 'error'
  /** A design fixture: its list is what it says, never read from a server. */
  fixture: boolean
}
export const useTournamentDevices = create<DevicesState>(() => ({ tournamentId: null, items: [], status: 'idle', fixture: false }))


/** The tournament's phones, or null on a database without them. */
export async function tournamentDevices(tournamentId: string): Promise<TournamentDevice[] | null> {
  try {
    const data = await rpc('tournament_devices', { p_tournament_id: tournamentId }).as<TournamentDevice[] | null>()
    return Array.isArray(data) ? data : []
  } catch (e) {
    if (isMissingFunction(e)) return null
    throw e
  }
}

let generation = 0
/** Read them into the store. Never throws: a failure is the store's `error` status. */
export async function loadTournamentDevices(tournamentId: string): Promise<void> {
  const s = useTournamentDevices.getState()
  if (s.fixture && s.tournamentId === tournamentId) return
  const mine = ++generation
  useTournamentDevices.setState({ tournamentId, status: 'loading', items: s.tournamentId === tournamentId ? s.items : [], fixture: false })
  try {
    const items = await tournamentDevices(tournamentId)
    if (mine !== generation) return
    useTournamentDevices.setState(items ? { items, status: 'ready' } : { items: [], status: 'unavailable' })
  } catch {
    if (mine !== generation) return
    useTournamentDevices.setState({ status: 'error' })
  }
}

/** The phones that still have holes to send, most first. */
export function withPending(items: TournamentDevice[]): TournamentDevice[] {
  return items.filter((d) => d.pending > 0).sort((a, b) => b.pending - a.pending)
}
