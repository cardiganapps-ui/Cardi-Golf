/**
 * `/v/_/:name` and `/v/_dinero/:name`: a link to watch (STRAT-05) on an
 * in-memory fixture (`./fixtures`), «Sin dinero» and «Con dinero». The
 * fixture goes through `forSpectators`, the same rules the phone applies to
 * the server's answer, so what renders is what a link would show. No
 * Supabase, no auth; for design review, screenshots and the browser suite.
 */
import { useEffect, useMemo } from 'react'
import { Outlet, useParams } from 'react-router'
import { forSpectators } from '../data/spectator'
import { showBoards, useTournament } from '../data/tournamentStore'
import { TournamentContext } from '../screens/tournament/TournamentGate'
import { forgetBoards, SPECTATOR_ME, spectatorLookup } from '../screens/spectator/spectatorView'
import { FixtureIndex } from './FixtureGate'
import { getFixture } from './fixtures'

const noop = async () => undefined

export function SpectatorFixture({ money = false }: { money?: boolean }) {
  const { name = '' } = useParams()
  // A fixture's id: the store's fixture rules apply (no fetch, no age line), and the spectator's on top.
  const id = `fixture:spectator:${money ? 'dinero:' : ''}${name}`
  const snapshot = useMemo(() => {
    const fixture = getFixture(name)
    return fixture ? forSpectators(structuredClone(fixture.snapshot), money, id) : null
  }, [name, money, id])
  const has = useTournament((s) => s.tournamentId === id && !!s.data)

  useEffect(() => {
    if (!snapshot) return
    showBoards(id, snapshot)
    return () => forgetBoards(id)
  }, [snapshot, id])

  const base = `/v/${money ? '_dinero' : '_'}/${name}`
  const value = useMemo(
    () => (snapshot ? { tournamentId: id, slug: '', base, lookup: spectatorLookup(snapshot), me: SPECTATOR_ME, spectator: { money, url: `${window.location.origin}${base}` }, refresh: noop, leave: noop } : null),
    [snapshot, id, base, money],
  )
  if (!snapshot) return <FixtureIndex />
  if (!value || !has) return null
  return (
    <TournamentContext.Provider value={value}>
      <Outlet />
    </TournamentContext.Provider>
  )
}
