/**
 * `/demo`: «Ver un torneo de ejemplo» (STRAT-17). The example tournament
 * (`./demoTournament`) on the link to watch's own read-only screens (En vivo,
 * Juegos, Dinero and the TV), «Con dinero», so a curious organizer sees the
 * board, the Calcutta and the settlement before making an account.
 *
 * It is a link page (`src/lib/linkPage.ts`): no session read or started, no
 * outbox, no telemetry, nothing written to the phone or the server. The
 * boards live in memory while it is on screen and go when it closes.
 */
import { useEffect, useMemo } from 'react'
import { Outlet } from 'react-router'
import { forSpectators } from '../data/spectator'
import { showBoards, useTournament } from '../data/tournamentStore'
import { TournamentContext } from '../screens/tournament/tournamentContext'
import { forgetBoards, SPECTATOR_ME, spectatorLookup } from '../screens/spectator/spectatorView'
import { DEMO_ID, demoSnapshot } from './demoTournament'

const noop = () => Promise.resolve()
/** Where the example lives: its screens, the TV, and the link its share cards carry. */
export const DEMO_BASE = '/demo'

export function DemoGate() {
  // What a link «Con dinero» would show of it: the same rules the phone applies to the server's answer.
  const snapshot = useMemo(() => forSpectators(demoSnapshot(), true, DEMO_ID), [])
  const has = useTournament((s) => s.tournamentId === DEMO_ID && !!s.data)

  useEffect(() => {
    showBoards(DEMO_ID, snapshot)
    // Boards of its own, from no server: no connection to say and no age to give (a design fixture's rules, MOT-17).
    useTournament.setState({ source: null, updatedAt: 0 })
    return () => forgetBoards(DEMO_ID)
  }, [snapshot])

  const value = useMemo(
    () => ({
      tournamentId: DEMO_ID,
      slug: '',
      base: DEMO_BASE,
      lookup: spectatorLookup(snapshot),
      me: SPECTATOR_ME,
      spectator: { money: true, url: `${window.location.origin}${DEMO_BASE}`, demo: true },
      refresh: noop,
      leave: noop,
    }),
    [snapshot],
  )
  if (!has) return null
  return (
    <TournamentContext.Provider value={value}>
      <Outlet />
    </TournamentContext.Provider>
  )
}
