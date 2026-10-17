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
import { useTournamentDevices } from '../data/tournamentDevices'
import { usePushFixture, type PushState } from '../data/push'
import { dataFromSnapshot } from '../data/tournamentStore'
import { TournamentContext, type Me } from '../screens/tournament/tournamentContext'
import { EnterScreen } from '../screens/tournament/EnterScreen'
import { FIXTURE_NAMES, getFixture } from './fixtures'
import { t } from '../i18n/es-MX'
import { TournamentCurrency } from '../components/TournamentCurrency'

const noop = async () => undefined
const PUSH_STATES: readonly string[] = ['unsupported', 'needsInstall', 'denied', 'off', 'on'] satisfies PushState[]

type NetState = Pick<ReturnType<typeof useTournament.getState>, 'source' | 'realtime' | 'error' | 'updatedAt'>
/**
 * `?net=`: the header's connection as a real tournament would show it (REL-21), for the browser suite. A
 * fixture has no server, so by default it says nothing (offline still shows). `cache`: the phone's copy, 5
 * min old, the live one on its way. `failed`: the server's boards after a fetch that failed, 7 min old.
 * `joining`: the server's boards, the live channel joining. `live`: the channel up.
 */
function netState(net: string | null): NetState {
  const ago = (min: number) => Date.now() - min * 60_000
  if (net === 'cache') return { source: 'cache', realtime: 'off', error: null, updatedAt: ago(5) }
  if (net === 'failed') return { source: 'server', realtime: 'live', error: t.errors.network, updatedAt: ago(7) }
  if (net === 'joining') return { source: 'server', realtime: 'connecting', error: null, updatedAt: ago(0) }
  if (net === 'live') return { source: 'server', realtime: 'live', error: null, updatedAt: ago(0) }
  return { source: null, realtime: 'off', error: null, updatedAt: 0 }
}

export function FixtureGate() {
  const { name = '' } = useParams()
  const fixture = useMemo(() => getFixture(name), [name])
  const tournamentId = useTournament((s) => s.tournamentId)
  const [params] = useSearchParams()
  const as = params.get('as')
  const net = params.get('net')
  const navigate = useNavigate()
  // `?push=off` (or on, denied, needsInstall, unsupported): the notices' switches as on such a phone, with no
  // browser asked; kept while moving between the tournament's tabs, gone with the fixture.
  const push = params.get('push')
  useEffect(() => {
    if (push && PUSH_STATES.includes(push)) usePushFixture.setState({ state: push as PushState })
  }, [push])
  useEffect(() => () => usePushFixture.setState({ state: null }), [])

  useEffect(() => {
    if (!fixture) return
    useTournament.getState().unsubscribe()
    useTournament.setState({
      tournamentId: `fixture:${fixture.name}`,
      data: dataFromSnapshot(structuredClone(fixture.snapshot)),
      loading: false,
      ...netState(net),
    })
    // The Comité's inbox is read from the server; a fixture's is what it says.
    useRejectedInbox.setState({
      tournamentId: fixture.snapshot.tournament.id,
      items: structuredClone(fixture.inbox ?? []),
      status: 'ready',
      error: null,
      fixture: true,
    })
    // And its phones (STRAT-02): what their heartbeats would say.
    useTournamentDevices.setState({
      tournamentId: fixture.snapshot.tournament.id,
      items: structuredClone(fixture.devices ?? []),
      status: 'ready',
      fixture: true,
    })
  }, [fixture, net])

  if (!fixture) return <FixtureIndex />
  // `?as=new-phone`: the same tournament on a phone that has not picked its face yet (the grid, then the PIN).
  if (as === 'new-phone')
    return <EnterScreen lookup={fixture.lookup} onEntered={() => void navigate(`/t/_/${fixture.name}`)} />
  if (tournamentId !== `fixture:${fixture.name}`) return null
  // `?as=platform` / `?as=platform-locked`: the same tournament seen by the Admin de Polo.
  const me: Me =
    as === 'platform'
      ? { playerId: null, isOrganizer: true, isComite: true, via: 'platform', protected: false }
      : as === 'platform-locked'
        ? { playerId: null, isOrganizer: false, isComite: false, via: 'platform', protected: true }
        : fixture.me
  return (
    <TournamentContext.Provider
      value={{
        tournamentId: fixture.snapshot.tournament.id,
        slug: `_/${fixture.name}`,
        lookup: fixture.lookup,
        me,
        refresh: noop,
        leave: noop,
      }}
    >
      {/* Every money render reads the tournament's currency (ARCH-06). */}
      <TournamentCurrency>
        <Outlet />
      </TournamentCurrency>
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
