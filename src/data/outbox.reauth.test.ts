/**
 * QA-06 (6): re-authentication (REL-16). A phone sits in a dead zone past its
 * token's expiry, and by the time the signal returns the server has forgotten
 * its refresh token. auth-js finds the session dead and signs the phone out;
 * the tournament gate starts a new anonymous session. Under that identity the
 * server would refuse every queued hole (it holds no player), and a refused
 * hole is one a player can only discard. So nothing queued is sent while the
 * device waits for its player: not by the backoff timer, the signal coming
 * back, the app coming to the front, or a direct nudge. The PIN claims the
 * player for the new session, the gate confirms it and adopts the writes
 * (`adoptQueuedWrites`), and they go out by themselves, as the player: with
 * the new session's token, which the server now takes for p1. Another
 * tournament's holes keep waiting for that tournament's own PIN.
 *
 * And every request of a push carries the token the push checked (#87), even
 * if the session goes between that check and the request.
 *
 * Nothing stands in for the session: auth-js keeps it in the phone's
 * localStorage, refreshes it against the fake auth server and announces the
 * sign-out to the app's auth store. Fake clock for setTimeout only
 * (src/data/testing/fakePhone.ts).
 */
import 'fake-indexeddb/auto'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { enterAs, holeAward, holeScore, installFakePhone, PIN, SESSION_KEY, settle } from './testing/fakePhone'

const { server, phone } = installFakePhone()
const { _outboxTest, adoptQueuedWrites, enqueueAward, enqueueScore, flush, queuedFor, startOutbox, useOutbox } = await import('./outbox')
const { ensureSession, useAuth } = await import('./auth')
const { claimPlayer, myMembership } = await import('./api')
const { useTournament } = await import('./tournamentStore')
const { t } = await import('../i18n/es-MX')

/** The user this phone is now, holding p1 by the PIN. */
let player = ''

beforeAll(async () => {
  await startOutbox()
})
beforeEach(async () => {
  server.reset()
  phone.online = true
  // On the real clock: the auth client arms timers of its own when it signs in.
  player = await enterAs('p1')
  _outboxTest.reset()
  await _outboxTest.clearStored()
  useTournament.setState({ tournamentId: 't1' })
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
})
afterEach(() => {
  _outboxTest.reset()
  vi.useRealTimers()
})

describe('a session that lapsed in a dead zone', () => {
  it('sends nothing until the PIN; then the queued holes go out by themselves, as the player', async () => {
    // A dead zone. Two holes saved with no signal; the same phone also plays another tournament today.
    phone.goOffline()
    await enqueueScore('t1', holeScore('p1', 3, 5))
    await enqueueScore('t1', holeScore('p2', 3, 4))
    await enqueueScore('t2', holeScore('p9', 1, 6, 'r9'))
    // Bars come back but nothing gets through: one try fails, a retry is armed.
    server.decide = () => 'offline'
    phone.goOnline()
    await settle(useOutbox)
    expect(server.writeRequests()).toHaveLength(1)

    // Hours go by there: the token runs out, and the server forgets the refresh token.
    server.auth.lapse(player)
    phone.ageSession()
    server.decide = () => 'answer'

    // The armed retry fires. The push asks auth-js for the session; auth-js tries to refresh it, the
    // server says it is dead, and auth-js signs the phone out. The hole waits: nothing sent, nothing refused.
    await vi.advanceTimersByTimeAsync(2000)
    await settle(useOutbox)
    expect(server.wire.filter((r) => r.target === 'auth/token').map((r) => r.result)).toEqual([400])
    expect(useAuth.getState().user).toBeNull()
    expect(server.writeRequests()).toHaveLength(1)
    expect(useOutbox.getState()).toMatchObject({ pending: 2, rejected: [], lastError: t.sync.errSession })

    // The gate asks the server again: a new anonymous session, which holds no player.
    await ensureSession()
    const fresh = useAuth.getState().user!.id
    expect(fresh).not.toBe(player)
    expect(server.auth.playerOf(fresh, 't1')).toBeNull()

    // The armed retry, the signal coming back, the app coming to the front, a direct nudge: nothing goes out.
    await vi.advanceTimersByTimeAsync(10 * 60_000)
    await settle(useOutbox)
    phone.goOffline()
    phone.goOnline()
    phone.show()
    await flush()
    await vi.advanceTimersByTimeAsync(10 * 60_000)
    await settle(useOutbox)
    expect(server.writeRequests()).toHaveLength(1)
    // Still on the phone, under the identity that saved them, counted as waiting for the PIN (what Entrar shows).
    expect(useOutbox.getState()).toMatchObject({ pending: 2, held: 2, heldHoles: 1, rejected: [] })
    expect(queuedFor('t1')).toEqual({ holes: 1, heldHoles: 1, writes: 2 })
    expect((await _outboxTest.stored()).map((x) => [x.key, x.actingUid])).toEqual([
      ['score:r1:p1:3', player],
      ['score:r1:p2:3', player],
      ['score:r9:p9:1', player],
    ])

    // The player taps his face and enters the PIN: the new session holds p1, and the gate, seeing
    // him in the tournament, adopts the writes the phone kept for it.
    expect(await claimPlayer('p1', PIN)).toMatchObject({ ok: true, playerId: 'p1' })
    expect(await myMembership('t1')).toMatchObject({ playerId: 'p1' })
    await adoptQueuedWrites('t1')
    await settle(useOutbox)

    // They went out by themselves, as the player: the new session's token, which the server takes for p1.
    expect(server.writeRequests().slice(1).map((r) => [(r.body as { player_id: string }).player_id, r.as, r.result])).toEqual([
      ['p1', fresh, 201],
      ['p2', fresh, 201],
    ])
    expect(server.score('p1', 3)).toMatchObject({ strokes: 5 })
    expect(server.score('p2', 3)).toMatchObject({ strokes: 4 })
    expect(useOutbox.getState()).toMatchObject({ pending: 0, held: 0, rejected: [], lastError: null })
    expect(queuedFor('t1')).toEqual({ holes: 0, heldHoles: 0, writes: 0 })

    // The other tournament's hole waits for that tournament's own PIN.
    expect(server.score('p9', 1, 'r9')).toBeUndefined()
    expect(queuedFor('t2')).toEqual({ holes: 1, heldHoles: 1, writes: 1 })
    expect(server.writeRequests()).toHaveLength(3)
  })
})

describe('the token a push checked', () => {
  /** Another tab signs out right after this push read the session; it is back for the next test. */
  async function whileAnotherTabSignsOut(save: () => Promise<void>) {
    const kept = phone.localStorage.peek(SESSION_KEY)!
    phone.localStorage.dropAfterRead(SESSION_KEY)
    try {
      await save()
      await settle(useOutbox)
    } finally {
      phone.localStorage.setItem(SESSION_KEY, kept)
    }
  }

  it('goes on every request of that push, whatever the session does meanwhile', async () => {
    // Without it, supabase-js reads the session again for each request, finds none, and sends the publishable key.
    await whileAnotherTabSignsOut(() => enqueueScore('t1', holeScore('p2', 14, 5)))
    expect(server.writeRequests().map((r) => [r.method, r.as, r.result])).toEqual([['POST', player, 201]])

    // A hole award is two requests: the old answer goes, the new one goes in.
    await whileAnotherTabSignsOut(() => enqueueAward('t1', holeAward(14, ['p2'])))
    expect(server.writeRequests('hole_awards').map((r) => [r.method, r.as, r.result])).toEqual([
      ['DELETE', player, 204],
      ['POST', player, 201],
    ])
    expect(server.tables.hole_awards).toEqual([expect.objectContaining({ hole: 14, game_id: 'closest', player_id: 'p2' })])
    expect(server.score('p2', 14)).toMatchObject({ strokes: 5 })
    expect(useOutbox.getState()).toMatchObject({ pending: 0, rejected: [] })
  })
})
