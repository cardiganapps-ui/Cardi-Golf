/**
 * What a link to watch (STRAT-05) is to the screens: nobody, with the boards
 * the page polled in the store, and nothing left behind once it closes.
 * Shared by the real gate and its design fixtures.
 */
import { useEffect } from 'react'
import type { LookupResult } from '../../data/api'
import { useTournament } from '../../data/tournamentStore'
import type { Snapshot } from '../../engine/types'
import type { Me } from '../tournament/tournamentContext'

/** Who a link to watch is: nobody. No player, not the Comité: every write and every Comité screen stay out of reach. */
export const SPECTATOR_ME: Me = { playerId: null, isOrganizer: false, isComite: false, via: null }

/** The few words the frame reads besides the boards: no slug, no join code, no faces to pick. */
export function spectatorLookup(s: Snapshot): LookupResult {
  const tr = s.tournament
  return {
    id: tr.id,
    slug: '',
    name: tr.name,
    tagline: tr.tagline,
    logoUrl: tr.logoUrl,
    accentColor: tr.accentColor,
    status: tr.status,
    joinCode: '',
    players: [],
  }
}

/**
 * A link to watch is never a search engine's: its address is the key to the boards. The page says so while it is
 * on screen (`vercel.json` says it in the response's headers too, for a crawler that reads no script).
 */
export function useNoIndex() {
  useEffect(() => {
    const meta = document.createElement('meta')
    meta.name = 'robots'
    meta.content = 'noindex, nofollow'
    document.head.appendChild(meta)
    return () => meta.remove()
  }, [])
}

/** The store, once this link's boards are no longer on screen: money it showed does not stay in memory. */
export function forgetBoards(id: string) {
  if (useTournament.getState().tournamentId !== id) return
  useTournament.setState({
    tournamentId: null,
    data: null,
    error: null,
    loading: false,
    realtime: 'off',
    updatedAt: 0,
    source: null,
    keepOnPhone: true,
  })
}
