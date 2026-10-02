/**
 * QA-06 (6): the pause for re-authentication (REL-16). The session lapsed in a
 * dead zone and auth started over as a new anonymous user: under that identity
 * the server would refuse every queued hole, and a refused hole is one a
 * player can only discard. So nothing queued is even sent while the device
 * waits for its player: not by the backoff timer, the signal coming back, the
 * app coming to the front, or a direct nudge. When the PIN claims the player
 * again (the tournament gate calls `adoptQueuedWrites`), that tournament's
 * holes go by themselves; another tournament's keep waiting for its own PIN.
 *
 * Fake clock for setTimeout only; the app's real Supabase client runs against
 * a fake server (src/data/testing/fakePhone.ts).
 */
import 'fake-indexeddb/auto'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { holeScore, installFakeSupabase, refusedByRls, settle } from './testing/fakePhone'

let uid: string | null = 'uid-a'
vi.mock('./auth', () => ({ useAuth: { getState: () => ({ user: uid ? { id: uid } : null }) } }))

const { server, browser } = installFakeSupabase()
const { _outboxTest, adoptQueuedWrites, enqueueScore, flush, queuedFor, startOutbox, useOutbox } = await import('./outbox')
const { useTournament } = await import('./tournamentStore')
const { supabase } = await import('../lib/supabase')

describe('while the device waits for its player to enter again', () => {
  beforeAll(async () => {
    await supabase().auth.getSession()
    await startOutbox()
  })
  beforeEach(async () => {
    uid = 'uid-a'
    server.reset()
    browser.online = true
    _outboxTest.reset()
    await _outboxTest.clearStored()
    useTournament.setState({ tournamentId: 't1' })
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  })
  afterEach(() => {
    _outboxTest.reset()
    vi.useRealTimers()
  })

  it('sends nothing; after the PIN the queued holes go by themselves', async () => {
    // A dead zone. The hole is saved with no signal; the same phone also plays another tournament today.
    browser.goOffline()
    await enqueueScore('t1', holeScore('p1', 3, 5))
    await enqueueScore('t1', holeScore('p2', 3, 4))
    await enqueueScore('t2', holeScore('p9', 1, 6, 'r9'))
    // Bars come back but nothing gets through: one try fails, a retry is armed.
    server.decide = () => 'offline'
    browser.goOnline()
    await settle(useOutbox)
    expect(server.writeRequests()).toHaveLength(1)

    // The session lapses there and auth starts over as a new anonymous user.
    uid = 'uid-b'
    let pinEntered = false
    // What the server would do: refuse the new identity until the PIN claims the player.
    server.decide = (req) => (req.method === 'GET' || pinEntered ? 'answer' : refusedByRls(req.table))

    // The armed retry fires, the signal returns, the app comes to the front, something nudges it.
    await vi.advanceTimersByTimeAsync(2000)
    await settle(useOutbox)
    browser.goOffline()
    browser.goOnline()
    browser.show()
    await flush()
    await vi.advanceTimersByTimeAsync(10 * 60_000)
    await settle(useOutbox)

    // Not one request: nothing refused, nothing lost, all still on the phone, counted as waiting
    // for the PIN (what Entrar shows; `useOutbox().held` is only refreshed by the next publish).
    expect(server.writeRequests()).toHaveLength(1)
    expect(useOutbox.getState()).toMatchObject({ pending: 2, rejected: [] })
    expect(queuedFor('t1')).toEqual({ holes: 1, heldHoles: 1 })
    expect((await _outboxTest.stored()).map((x) => [x.key, x.actingUid])).toEqual([
      ['score:r1:p1:3', 'uid-a'],
      ['score:r1:p2:3', 'uid-a'],
      ['score:r9:p9:1', 'uid-a'],
    ])

    // The player taps his face and enters the PIN: the gate confirms him in t1 and adopts its writes.
    pinEntered = true
    await adoptQueuedWrites('t1')
    await settle(useOutbox)
    expect(server.score('p1', 3)).toMatchObject({ strokes: 5 })
    expect(server.score('p2', 3)).toMatchObject({ strokes: 4 })
    expect(useOutbox.getState()).toMatchObject({ pending: 0, rejected: [] })
    expect(queuedFor('t1')).toEqual({ holes: 0, heldHoles: 0 })

    // The other tournament's hole waits for that tournament's own PIN.
    expect(server.score('p9', 1, 'r9')).toBeUndefined()
    expect(queuedFor('t2')).toEqual({ holes: 1, heldHoles: 1 })
    expect(server.writeRequests()).toHaveLength(3)
  })
})
