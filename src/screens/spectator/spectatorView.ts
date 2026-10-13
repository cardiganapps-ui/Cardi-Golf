/**
 * What a link to watch (STRAT-05) is to the screens: nobody, with the boards
 * the page polled in the store, and nothing left behind once it closes.
 * Shared by the real gate and its design fixtures.
 */
import type { LookupResult } from '../../data/api'
import { useTournament } from '../../data/tournamentStore'
import type { Snapshot } from '../../engine/types'
import type { Me } from '../tournament/TournamentGate'

/** Who a link to watch is: nobody. No player, not the Comité: every write and every Comité screen stay out of reach. */
export const SPECTATOR_ME: Me = { playerId: null, isOrganizer: false, isAdmin: false, via: null }

/** The few words the frame reads besides the boards: no slug, no join code, no faces to pick. */
export function spectatorLookup(s: Snapshot): LookupResult {
  const tr = s.tournament
  return { id: tr.id, slug: '', name: tr.name, tagline: tr.tagline, logoUrl: tr.logoUrl, accentColor: tr.accentColor, status: tr.status, joinCode: '', players: [] }
}

/** The store, once this link's boards are no longer on screen: money it showed does not stay in memory. */
export function forgetBoards(id: string) {
  if (useTournament.getState().tournamentId !== id) return
  useTournament.setState({ tournamentId: null, data: null, error: null, loading: false, realtime: 'off', updatedAt: 0, source: null, keepOnPhone: true })
}
