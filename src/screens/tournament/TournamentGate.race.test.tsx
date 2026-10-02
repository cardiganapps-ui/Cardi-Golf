// @vitest-environment happy-dom
/**
 * The gate's timing, with the phone's copy and the server both under the
 * test's control (REL-02, REL-03, REL-15): which answer wins when they cross,
 * and when the gate stops asking.
 * - A copy read that lands after the server answered changes nothing.
 * - Until the server's boards are up the gate keeps asking (on reconnect, on
 *   return to the app, and every 20 s with no event at all); once they are
 *   up, or the server said Entrar or «no existe», it stops.
 * - Of two asks at once, only the newer one's answer counts.
 * - A phone that loses its session mid-round asks again, so holes saved since
 *   lead to Entrar and the PIN instead of waiting in silence (REL-16).
 *
 * The phone's copy (snapshotCache) and the server (auth, api) are mocked.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const server = vi.hoisted(() => ({
  ensureSession: vi.fn(),
  lookupTournament: vi.fn(),
  myMembership: vi.fn(),
  releaseDevice: vi.fn(async () => undefined),
  /** The person signed out on purpose (auth's `signedOutOnPurpose`). */
  signedOut: false,
}))
const phone = vi.hoisted(() => ({
  readCached: vi.fn(),
  clearCached: vi.fn(async () => undefined),
  clearCachedSlug: vi.fn(async () => undefined),
  saveEntry: vi.fn(async () => undefined),
}))
vi.mock('../../data/auth', async () => {
  const { create } = await import('zustand')
  return {
    ensureSession: server.ensureSession,
    signedOutOnPurpose: () => server.signedOut,
    useAuth: create(() => ({ ready: true, user: { id: 'uid-phone' } as { id: string } | null })),
  }
})
vi.mock('../../data/api', () => ({
  lookupTournament: server.lookupTournament,
  myMembership: server.myMembership,
  releaseDevice: server.releaseDevice,
}))
vi.mock('../../data/snapshotCache', () => ({ ...phone, saveSnapshot: vi.fn(async () => undefined) }))
vi.mock('../../lib/supabase', () => ({ supabaseConfigured: true, supabase: () => ({}) }))
vi.mock('../../data/outbox', () => ({ adoptQueuedWrites: vi.fn(async () => undefined), refreshOutboxCounters: vi.fn() }))
vi.mock('./EnterScreen', () => ({
  EnterScreen: ({ onEntered }: { onEntered: () => void }) => (
    <button type="button" onClick={onEntered}>
      Entrar con el PIN
    </button>
  ),
}))

import { getFixture } from '../../dev/fixtures'
import { useAuth } from '../../data/auth'
import { dataFromSnapshot, useTournament } from '../../data/tournamentStore'
import { t } from '../../i18n/es-MX'
import { TournamentGate, useTournamentCtx } from './TournamentGate'

const fx = getFixture('minimal4-live')!
const slug = fx.snapshot.tournament.slug
const id = fx.snapshot.tournament.id
const member = { playerId: fx.me.playerId, isOrganizer: false, isAdmin: false, via: 'device' as const }
const stranger = { playerId: null, isOrganizer: false, isAdmin: false, via: null }

function deferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => (resolve = r))
  return { promise, resolve }
}
/** The boards this phone saved, as readCached returns them. */
function savedCopy(name = 'Guardado en el teléfono') {
  const snapshot = structuredClone(fx.snapshot)
  snapshot.tournament.name = name
  return { entry: { slug, tournamentId: id, lookup: fx.lookup, me: fx.me, savedAt: 1 }, snapshot, savedAt: Date.now() - 60_000 }
}
/** What the shell would show: whose boards, and where they came from. */
function Board() {
  const { me, leave } = useTournamentCtx()
  const data = useTournament((s) => s.data)
  const source = useTournament((s) => s.source)
  return (
    <>
      <p>{`${data?.snapshot.tournament.name}: ${source}, ${me.playerId}`}</p>
      <button type="button" onClick={() => void leave()}>
        Cambiar de jugador
      </button>
    </>
  )
}
function open() {
  return render(
    <MemoryRouter initialEntries={[`/t/${slug}`]}>
      <Routes>
        <Route path="/t/:slug" element={<TournamentGate />}>
          <Route index element={<Board />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}
/** The live snapshot arriving from the server (the store's fetch, stood in for). */
function serverLoads(name = 'En vivo del servidor') {
  const load = vi.fn(async (tid: string) => {
    const snapshot = structuredClone(fx.snapshot)
    snapshot.tournament.name = name
    useTournament.setState({ tournamentId: tid, data: dataFromSnapshot(snapshot), updatedAt: Date.now(), source: 'server', error: null })
  })
  useTournament.setState({ load })
  return load
}
/** How many times the gate asked the server who this device is. */
const asked = () => server.myMembership.mock.calls.length
async function backOnline() {
  await act(async () => {
    window.dispatchEvent(new Event('online'))
    document.dispatchEvent(new Event('visibilitychange'))
  })
}

const realLoad = useTournament.getState().load
beforeEach(() => {
  useAuth.setState({ ready: true, user: { id: 'uid-phone' } as never })
  useTournament.setState({ tournamentId: null, data: null, source: null, error: null, load: realLoad })
  for (const f of [server.ensureSession, server.lookupTournament, server.myMembership, phone.readCached]) f.mockReset()
  for (const f of [phone.clearCached, phone.clearCachedSlug, phone.saveEntry]) f.mockClear()
  server.ensureSession.mockResolvedValue({})
  server.lookupTournament.mockResolvedValue(fx.lookup)
  server.signedOut = false
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('a copy read that lands after the server answered changes nothing', () => {
  it('the device was released: Entrar stays, with no boards and no player behind it', async () => {
    const slow = deferred<ReturnType<typeof savedCopy> | null>()
    // iOS reads IndexedDB slowly on a cold start: the server answers first.
    phone.readCached.mockReturnValueOnce(slow.promise).mockResolvedValue(savedCopy())
    server.myMembership.mockResolvedValue(stranger)
    open()
    expect(await screen.findByRole('button', { name: 'Entrar con el PIN' })).toBeTruthy()
    await act(async () => slow.resolve(savedCopy()))
    await new Promise((r) => setTimeout(r, 20))
    expect(screen.queryByRole('button', { name: 'Entrar con el PIN' })).toBeTruthy()
    expect(useTournament.getState().data).toBeNull()
  })

  it('…the same when the copy is read again to be entered, and that read is the slow one', async () => {
    const slow = deferred<ReturnType<typeof savedCopy> | null>()
    phone.readCached.mockResolvedValueOnce(savedCopy()).mockReturnValueOnce(slow.promise).mockResolvedValue(savedCopy())
    server.myMembership.mockResolvedValue(stranger)
    open()
    expect(await screen.findByRole('button', { name: 'Entrar con el PIN' })).toBeTruthy()
    // It used to put the released player back on the boards.
    await act(async () => slow.resolve(savedCopy()))
    await new Promise((r) => setTimeout(r, 20))
    expect(screen.queryByRole('button', { name: 'Entrar con el PIN' })).toBeTruthy()
    expect(screen.queryByText(/: cache/)).toBeNull()
  })
})

describe('of two asks at once, only the newer one counts', () => {
  it('an answer from before the player left, landing after, never puts him back', async () => {
    phone.readCached.mockResolvedValue(savedCopy())
    // Opened with no signal: the phone's copy.
    server.ensureSession.mockRejectedValueOnce(new Error('sin señal'))
    const slow = deferred<typeof member>()
    server.myMembership.mockReturnValueOnce(slow.promise).mockResolvedValue(stranger)
    open()
    await screen.findByText(/^Guardado en el teléfono: cache/)
    // The signal comes back: the gate asks who this device is, and the answer is slow.
    await backOnline()
    await vi.waitFor(() => expect(asked()).toBe(1))
    // Meanwhile the player hands the phone over.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Cambiar de jugador' }))
    })
    expect(await screen.findByRole('button', { name: 'Entrar con el PIN' })).toBeTruthy()
    // The first answer, from before he left, lands last: it used to put him back, and save his boards again.
    await act(async () => slow.resolve(member))
    await new Promise((r) => setTimeout(r, 20))
    expect(screen.getByRole('button', { name: 'Entrar con el PIN' })).toBeTruthy()
    expect(phone.saveEntry).not.toHaveBeenCalled()
  })
})

describe('when the gate stops asking (REL-02)', () => {
  it('once the server’s boards are up, nothing asks again: not the signal, not the app shown again, not the timer', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    phone.readCached.mockResolvedValue(savedCopy())
    server.myMembership.mockResolvedValue(member)
    serverLoads()
    open()
    expect(await screen.findByText(/^En vivo del servidor: server/)).toBeTruthy()
    const before = asked()
    await backOnline()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5 * 60_000)
    })
    expect(asked()).toBe(before)
  })

  it('with no event at all, the timer asks again until the server’s boards are up', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    phone.readCached.mockResolvedValue(savedCopy())
    // Opened with no signal: the first ask fails, and with no signal nothing is scheduled.
    const onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    server.ensureSession.mockRejectedValueOnce(new Error('sin señal'))
    server.myMembership.mockResolvedValue(member)
    const load = serverLoads()
    open()
    expect(await screen.findByText(/^Guardado en el teléfono: cache/)).toBeTruthy()
    // The signal comes back without an `online` event (it fires only once, and not at all on a connection that heals).
    onLine.mockReturnValue(true)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000)
    })
    expect(await screen.findByText(/^En vivo del servidor: server/)).toBeTruthy()
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('an ask lost as the signal came back is tried again in seconds, not on the 20 s timer', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    phone.readCached.mockResolvedValue(savedCopy())
    // Opened with no signal; when it comes back, the first lookup is lost on the way.
    const onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    server.ensureSession.mockRejectedValueOnce(new Error('sin señal'))
    server.lookupTournament.mockRejectedValueOnce(new Error('TypeError: Failed to fetch')).mockResolvedValue(fx.lookup)
    server.myMembership.mockResolvedValue(member)
    serverLoads()
    open()
    await screen.findByText(/^Guardado en el teléfono: cache/)
    onLine.mockReturnValue(true)
    await backOnline()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_500)
    })
    expect(await screen.findByText(/^En vivo del servidor: server/)).toBeTruthy()
  })

  it('on Entrar, or «no existe», the server has answered: no more asking', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    phone.readCached.mockResolvedValue(savedCopy())
    server.myMembership.mockResolvedValue(stranger)
    open()
    await screen.findByRole('button', { name: 'Entrar con el PIN' })
    const before = asked()
    await backOnline()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10 * 60_000)
    })
    // It asked every 20 s, for as long as the app stayed open.
    expect(asked()).toBe(before)
    cleanup()
    server.lookupTournament.mockResolvedValue(null)
    open()
    await screen.findByText(t.enter.notFound)
    const lookups = server.lookupTournament.mock.calls.length
    await backOnline()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10 * 60_000)
    })
    expect(server.lookupTournament.mock.calls.length).toBe(lookups)
  })
})

describe('the phone loses its session mid-round (REL-16)', () => {
  it('not when the person signed out on purpose: nothing asks again, so no anonymous session starts behind them', async () => {
    phone.readCached.mockResolvedValue(null)
    server.myMembership.mockResolvedValue(member)
    serverLoads()
    open()
    await screen.findByText(/^En vivo del servidor: server/)
    const sessions = server.ensureSession.mock.calls.length
    const asks = asked()
    // Más › «Cerrar sesión»: the session goes, and the phone is on its way home.
    server.signedOut = true
    await act(async () => useAuth.setState({ user: null }))
    await backOnline()
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })
    expect(server.ensureSession.mock.calls.length).toBe(sessions)
    expect(asked()).toBe(asks)
  })

  it('the gate asks again, and the player gets Entrar and the PIN', async () => {
    phone.readCached.mockResolvedValue(null)
    server.myMembership.mockResolvedValue(member)
    serverLoads()
    open()
    await screen.findByText(/^En vivo del servidor: server/)
    // auth-js found the refresh token dead and signed the phone out; a new anonymous session is nobody here.
    server.myMembership.mockResolvedValue(stranger)
    await act(async () => useAuth.setState({ user: null }))
    expect(await screen.findByRole('button', { name: 'Entrar con el PIN' })).toBeTruthy()
  })

  it('with no signal then, it keeps asking until the server answers', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    phone.readCached.mockResolvedValue(null)
    server.myMembership.mockResolvedValue(member)
    serverLoads()
    open()
    await screen.findByText(/^En vivo del servidor: server/)
    server.ensureSession.mockRejectedValueOnce(new Error('sin señal'))
    server.myMembership.mockResolvedValue(stranger)
    await act(async () => useAuth.setState({ user: null }))
    // The ask failed: the boards stay up meanwhile.
    expect(screen.getByText(/^En vivo del servidor: server/)).toBeTruthy()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000)
    })
    expect(await screen.findByRole('button', { name: 'Entrar con el PIN' })).toBeTruthy()
  })
})
