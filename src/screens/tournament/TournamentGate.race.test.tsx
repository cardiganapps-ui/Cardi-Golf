// @vitest-environment happy-dom
/**
 * The gate's timing, with the phone's copy and the server both under the
 * test's control (REL-02, REL-03, REL-15): which answer wins when they cross,
 * and when the gate stops asking.
 * - A copy read that lands after the server answered changes nothing.
 * - Until the server's boards are up the gate keeps asking (on reconnect, on
 *   return to the app, and every 20 s with no event at all); once they are
 *   up, it stops.
 *
 * The phone's copy (snapshotCache) and the server (auth, api) are mocked.
 */
import { act, cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const server = vi.hoisted(() => ({
  ensureSession: vi.fn(),
  lookupTournament: vi.fn(),
  myMembership: vi.fn(),
  releaseDevice: vi.fn(async () => undefined),
}))
const phone = vi.hoisted(() => ({
  readCached: vi.fn(),
  clearCached: vi.fn(async () => undefined),
  clearCachedSlug: vi.fn(async () => undefined),
  saveEntry: vi.fn(async () => undefined),
}))
vi.mock('../../data/auth', async () => {
  const { create } = await import('zustand')
  return { ensureSession: server.ensureSession, useAuth: create(() => ({ ready: true, user: { id: 'uid-phone' } as { id: string } | null })) }
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
import { dataFromSnapshot, useTournament } from '../../data/tournamentStore'
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
  const { me } = useTournamentCtx()
  const data = useTournament((s) => s.data)
  const source = useTournament((s) => s.source)
  return <p>{`${data?.snapshot.tournament.name}: ${source}, ${me.playerId}`}</p>
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
  useTournament.setState({ tournamentId: null, data: null, source: null, error: null, load: realLoad })
  for (const f of [server.ensureSession, server.lookupTournament, server.myMembership, phone.readCached]) f.mockReset()
  server.ensureSession.mockResolvedValue({})
  server.lookupTournament.mockResolvedValue(fx.lookup)
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
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
    // The stored session can't be confirmed at first (auth-js cools down after a failed refresh); `online` fired long ago.
    server.ensureSession.mockRejectedValueOnce(new Error('sin sesión todavía'))
    server.myMembership.mockResolvedValue(member)
    const load = serverLoads()
    open()
    expect(await screen.findByText(/^Guardado en el teléfono: cache/)).toBeTruthy()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000)
    })
    expect(await screen.findByText(/^En vivo del servidor: server/)).toBeTruthy()
    expect(load).toHaveBeenCalledTimes(1)
  })
})
