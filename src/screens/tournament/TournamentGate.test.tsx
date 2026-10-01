// @vitest-environment happy-dom
/**
 * Opening a tournament, on the course (PERF-08, REL-02, REL-03, REL-15).
 * - The boards this phone saved show at once, before the session is even
 *   confirmed. They used to wait on five round trips with signal, 16 s with no
 *   signal and an expired token, and for ever on a connection that answers
 *   nothing.
 * - The gate keeps trying until the server's snapshot is on screen. A lookup
 *   that worked and a snapshot that didn't used to end the retries and leave
 *   the old boards up.
 * - A device the tournament no longer knows, or a player who leaves, loses the
 *   saved boards.
 *
 * The server is mocked; the copy on the phone is the real IndexedDB cache
 * (fake-indexeddb).
 */
import 'fake-indexeddb/auto'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const server = vi.hoisted(() => ({
  ensureSession: vi.fn(),
  lookupTournament: vi.fn(),
  myMembership: vi.fn(),
  releaseDevice: vi.fn(async () => undefined),
}))
vi.mock('../../data/auth', () => ({
  ensureSession: server.ensureSession,
  useAuth: (sel: (s: { ready: boolean }) => unknown) => sel({ ready: true }),
}))
vi.mock('../../data/api', () => ({
  lookupTournament: server.lookupTournament,
  myMembership: server.myMembership,
  releaseDevice: server.releaseDevice,
}))
vi.mock('../../lib/supabase', () => ({ supabaseConfigured: true, supabase: () => ({}) }))
vi.mock('../../data/outbox', () => ({ adoptQueuedWrites: vi.fn(async () => undefined), refreshOutboxCounters: vi.fn() }))
vi.mock('./EnterScreen', () => ({ EnterScreen: () => <p>Entrar</p> }))

import { getFixture } from '../../dev/fixtures'
import { clearCached, readCached, saveEntry, saveSnapshot } from '../../data/snapshotCache'
import { dataFromSnapshot, useTournament } from '../../data/tournamentStore'
import { TournamentGate, useTournamentCtx } from './TournamentGate'

const fx = getFixture('minimal4-live')!
const slug = fx.snapshot.tournament.slug
const id = fx.snapshot.tournament.id
const never = () => new Promise<never>(() => undefined)
const member = { playerId: fx.me.playerId, isOrganizer: false, isAdmin: false, via: 'device' as const }

/** What the shell would show: whose boards, and where they came from. */
function Board() {
  const { leave } = useTournamentCtx()
  const data = useTournament((s) => s.data)
  const source = useTournament((s) => s.source)
  return (
    <>
      <p>{`${data?.snapshot.tournament.name}: ${source}`}</p>
      <button type="button" onClick={() => void leave()}>
        Cambiar de jugador
      </button>
    </>
  )
}
/** Open a tournament link: its slug, or the join code typed at home. */
function open(link = slug) {
  return render(
    <MemoryRouter initialEntries={[`/t/${link}`]}>
      <Routes>
        <Route path="/t/:slug" element={<TournamentGate />}>
          <Route index element={<Board />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}
async function saveOnPhone(name = fx.snapshot.tournament.name) {
  const snapshot = structuredClone(fx.snapshot)
  snapshot.tournament.name = name
  await saveEntry({ slug, tournamentId: id, lookup: fx.lookup, me: fx.me })
  await saveSnapshot(id, snapshot)
}
/** The live snapshot arriving from the server (the store's fetch, stood in for). */
function serverLoads(name: string, fail = 0) {
  let failures = fail
  const load = vi.fn(async (tid: string) => {
    if (failures-- > 0) {
      useTournament.setState({ error: 'Sin conexión con el servidor.' })
      return
    }
    const snapshot = structuredClone(fx.snapshot)
    snapshot.tournament.name = name
    useTournament.setState({ tournamentId: tid, data: dataFromSnapshot(snapshot), updatedAt: Date.now(), source: 'server', error: null })
  })
  useTournament.setState({ load })
  return load
}

const realLoad = useTournament.getState().load
beforeEach(async () => {
  await clearCached(id)
  useTournament.setState({ tournamentId: null, data: null, source: null, error: null, load: realLoad })
  server.ensureSession.mockReset()
  server.lookupTournament.mockReset()
  server.myMembership.mockReset()
})
afterEach(() => cleanup())

describe('opening from the phone first', () => {
  it('shows the saved boards at once, while the session is still unconfirmed', async () => {
    await saveOnPhone('Guardado en el teléfono')
    // Lie-fi, or no signal with a lapsed token: the session never answers.
    server.ensureSession.mockImplementation(never)
    open()
    expect(await screen.findByText('Guardado en el teléfono: cache', {}, { timeout: 500 })).toBeTruthy()
  })

  it('with nothing saved, waits for the server as before', async () => {
    server.ensureSession.mockResolvedValue({})
    server.lookupTournament.mockResolvedValue(fx.lookup)
    server.myMembership.mockResolvedValue(member)
    serverLoads('En vivo del servidor')
    open()
    expect(await screen.findByText('En vivo del servidor: server')).toBeTruthy()
  })

  it('the server\'s boards replace the saved ones when they arrive', async () => {
    await saveOnPhone('Guardado en el teléfono')
    server.ensureSession.mockResolvedValue({})
    server.lookupTournament.mockResolvedValue(fx.lookup)
    server.myMembership.mockResolvedValue(member)
    serverLoads('En vivo del servidor')
    open()
    expect(await screen.findByText('En vivo del servidor: server')).toBeTruthy()
  })
})

describe('recovering when the signal comes back (REL-02)', () => {
  it('keeps trying after the session is back but the snapshot is not, until the server\'s boards are up', async () => {
    await saveOnPhone('Guardado en el teléfono')
    // Opened with no signal: the session can't be confirmed, the phone's copy shows.
    server.ensureSession.mockRejectedValueOnce(new Error('sin señal'))
    server.ensureSession.mockResolvedValue({})
    server.lookupTournament.mockResolvedValue(fx.lookup)
    server.myMembership.mockResolvedValue(member)
    // When the signal comes back the session, lookup and membership work, but the first snapshot doesn't arrive.
    const load = serverLoads('En vivo del servidor', 1)
    open()
    expect(await screen.findByText('Guardado en el teléfono: cache')).toBeTruthy()
    await act(async () => {
      window.dispatchEvent(new Event('online'))
    })
    await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(1))
    expect(screen.getByText('Guardado en el teléfono: cache')).toBeTruthy()
    // The next chances (the app shown again, the timer) keep trying until the server's boards are up.
    // It used to stop here: the session was back, so the old boards stayed until the app was killed.
    await vi.waitFor(async () => {
      await act(async () => {
        window.dispatchEvent(new Event('online'))
      })
      expect(screen.getByText('En vivo del servidor: server')).toBeTruthy()
    })
    expect(load).toHaveBeenCalledTimes(2)
  })
})

describe('saved boards that no longer belong here', () => {
  it('a device the tournament no longer knows sees Entrar, and the saved boards go', async () => {
    await saveOnPhone('Guardado en el teléfono')
    server.ensureSession.mockResolvedValue({})
    server.lookupTournament.mockResolvedValue(fx.lookup)
    server.myMembership.mockResolvedValue({ playerId: null, isOrganizer: false, isAdmin: false, via: null })
    open()
    expect(await screen.findByText('Entrar')).toBeTruthy()
    await vi.waitFor(async () => expect(await readCached(slug)).toBeNull())
  })

  it('a player who leaves takes the saved boards with him', async () => {
    await saveOnPhone('Guardado en el teléfono')
    server.ensureSession.mockResolvedValue({})
    server.lookupTournament.mockResolvedValue(fx.lookup)
    server.myMembership.mockResolvedValue(member)
    serverLoads('En vivo del servidor')
    open()
    await screen.findByText('En vivo del servidor: server')
    server.myMembership.mockResolvedValue({ playerId: null, isOrganizer: false, isAdmin: false, via: null })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Cambiar de jugador' }))
    })
    expect(server.releaseDevice).toHaveBeenCalled()
    expect(await readCached(slug)).toBeNull()
  })
})

describe('a tournament joined with its code: the saved boards follow the tournament, not the link', () => {
  const code = fx.lookup.joinCode

  it('«Tu último torneo» opens the slug, and with no signal finds the boards saved when the code was typed', async () => {
    server.ensureSession.mockResolvedValue({})
    server.lookupTournament.mockResolvedValue(fx.lookup)
    server.myMembership.mockResolvedValue(member)
    serverLoads('En vivo del servidor')
    open(code)
    await screen.findByText('En vivo del servidor: server')
    // What the store's load keeps on the phone with the boards (stood in for here).
    await saveSnapshot(id, fx.snapshot)
    cleanup()
    // The next morning, no signal: home's «Tu último torneo» opens /t/<slug>.
    useTournament.setState({ tournamentId: null, data: null, source: null, error: null, load: realLoad })
    server.ensureSession.mockImplementation(never)
    open(slug)
    expect(await screen.findByText(`${fx.snapshot.tournament.name}: cache`, {}, { timeout: 500 })).toBeTruthy()
  })

  it('the code still opens them with no signal', async () => {
    await saveOnPhone('Guardado en el teléfono')
    server.ensureSession.mockImplementation(never)
    open(code)
    expect(await screen.findByText('Guardado en el teléfono: cache', {}, { timeout: 500 })).toBeTruthy()
  })

  it('a device the tournament no longer knows, opened by its code, loses the boards saved under the slug', async () => {
    await saveOnPhone('Guardado en el teléfono')
    server.ensureSession.mockResolvedValue({})
    server.lookupTournament.mockResolvedValue(fx.lookup)
    server.myMembership.mockResolvedValue({ playerId: null, isOrganizer: false, isAdmin: false, via: null })
    open(code)
    expect(await screen.findByText('Entrar')).toBeTruthy()
    await vi.waitFor(async () => expect(await readCached(slug)).toBeNull())
  })
})

describe('the store never puts the phone\'s copy over the server\'s', () => {
  it('a saved snapshot that lands after the live one is ignored', () => {
    const live = structuredClone(fx.snapshot)
    live.tournament.name = 'En vivo'
    useTournament.getState().seed(id, live, Date.now())
    useTournament.setState({ source: 'server' })
    const old = structuredClone(fx.snapshot)
    old.tournament.name = 'Viejo'
    useTournament.getState().seed(id, old, 0)
    expect(useTournament.getState().data?.snapshot.tournament.name).toBe('En vivo')
    expect(useTournament.getState().source).toBe('server')
  })
})
