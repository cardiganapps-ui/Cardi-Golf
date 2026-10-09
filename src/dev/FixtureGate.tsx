/**
 * `/t/_/:name`: the real tournament screens fed by an in-memory fixture
 * (`./fixtures`). No Supabase, no auth. Read-only by nature: writes fail and
 * surface through the normal toast. Unlinked from the UI; used for design
 * review and screenshots.
 */
import { useEffect, useMemo } from 'react'
import { Link, Outlet, useNavigate, useParams, useSearchParams } from 'react-router'
import { useTournament } from '../data/tournamentStore'
import { useRejectedInbox } from '../data/rejectedInbox'
import { dataFromSnapshot } from '../data/tournamentStore'
import { TournamentContext, type Me } from '../screens/tournament/TournamentGate'
import { EnterScreen } from '../screens/tournament/EnterScreen'
import { FIXTURE_NAMES, getFixture } from './fixtures'

const noop = async () => undefined

export function FixtureGate() {
  const { name = '' } = useParams()
  const fixture = useMemo(() => getFixture(name), [name])
  const tournamentId = useTournament((s) => s.tournamentId)
  const as = useSearchParams()[0].get('as')
  const navigate = useNavigate()

  useEffect(() => {
    if (!fixture) return
    useTournament.getState().unsubscribe()
    useTournament.setState({ tournamentId: `fixture:${fixture.name}`, data: dataFromSnapshot(structuredClone(fixture.snapshot)), loading: false, error: null, realtime: 'off' })
    // The Comité's inbox is read from the server; a fixture's is what it says.
    useRejectedInbox.setState({ tournamentId: fixture.snapshot.tournament.id, items: structuredClone(fixture.inbox ?? []), status: 'ready', error: null, fixture: true })
  }, [fixture])

  if (!fixture) return <FixtureIndex />
  // `?as=new-phone`: the same tournament on a phone that has not picked its face yet (the grid, then the PIN).
  if (as === 'new-phone') return <EnterScreen lookup={fixture.lookup} onEntered={() => navigate(`/t/_/${fixture.name}`)} />
  if (tournamentId !== `fixture:${fixture.name}`) return null
  // `?as=platform` / `?as=platform-locked`: the same tournament seen by the Admin de Polo.
  const me: Me =
    as === 'platform'
      ? { playerId: null, isOrganizer: true, isAdmin: true, via: 'platform', protected: false }
      : as === 'platform-locked'
        ? { playerId: null, isOrganizer: false, isAdmin: false, via: 'platform', protected: true }
        : fixture.me
  return (
    <TournamentContext.Provider value={{ tournamentId: fixture.snapshot.tournament.id, slug: `_/${fixture.name}`, lookup: fixture.lookup, me, refresh: noop, leave: noop }}>
      <Outlet />
    </TournamentContext.Provider>
  )
}

export function FixtureIndex() {
  return (
    <div className="screen">
      <h1>Fixtures</h1>
      <p className="muted">Torneos de muestra en memoria para revisar el diseño. No tocan ninguna base de datos.</p>
      <ul>
        {FIXTURE_NAMES.map((n) => (
          <li key={n}>
            <Link to={`/t/_/${n}`}>{n}</Link> <span className="muted">{getFixture(n)?.description}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
