/**
 * QA-06 (3): retries run on their own. A write the network loses is tried
 * again by the outbox's own timer, backing off 2 s, 4 s, 8 s, 16 s, then every
 * 30 s, with nobody touching the phone. A request that never answers is given
 * up after 12 s by the client's timeout (REL-14) and retried, and the holes
 * behind it follow. A write the server refuses for good lands in «rechazados»
 * once and is never sent again; an expired session is not a refusal.
 *
 * The clock is fake for setTimeout only: IndexedDB (fake-indexeddb) and the
 * app's real Supabase client, entered as p1 with the PIN, keep running on
 * real event-loop turns against the fake server (src/data/testing/fakePhone.ts).
 */
import 'fake-indexeddb/auto'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { enterAs, holeScore, installFakePhone, isWrite, settle, turn, until } from './testing/fakePhone'

const { server, phone } = installFakePhone()
const { _outboxTest, enqueueScore, startOutbox, useOutbox } = await import('./outbox')
const { useTournament } = await import('./tournamentStore')
const { REQUEST_TIMEOUT_MS } = await import('../lib/fetchWithTimeout')
const { t } = await import('../i18n/es-MX')

const sent = (hole: number) => server.writeRequests().filter((r) => (r.body as { hole: number }).hole === hole).length

describe('retries', () => {
  beforeAll(async () => {
    // The auth client arms its own timers when it starts: let it start on the real clock.
    await enterAs('p1')
    await startOutbox()
  })
  beforeEach(async () => {
    server.reset()
    phone.online = true
    _outboxTest.reset()
    await _outboxTest.clearStored()
    useTournament.setState({ tournamentId: 't1' })
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  })
  afterEach(() => {
    _outboxTest.reset()
    vi.useRealTimers()
  })

  it('retries a write the network loses by itself, backing off 2, 4, 8, 16, then 30 s', async () => {
    // Bars on the screen, but nothing gets through.
    server.decide = () => 'offline'
    await enqueueScore('t1', holeScore('p1', 4, 5))
    await settle(useOutbox)
    expect(sent(4)).toBe(1)
    expect(useOutbox.getState()).toMatchObject({ pending: 1, lastError: t.sync.errNetwork, rejected: [] })

    for (const [n, wait] of [[2, 2000], [3, 4000], [4, 8000], [5, 16000], [6, 30000], [7, 30000]] as const) {
      await vi.advanceTimersByTimeAsync(wait - 1)
      await settle(useOutbox)
      expect(sent(4), `nothing before ${wait} ms`).toBe(n - 1)
      await vi.advanceTimersByTimeAsync(1)
      await settle(useOutbox)
      expect(sent(4), `attempt ${n}, ${wait} ms after the last`).toBe(n)
    }
    expect(_outboxTest.queue()).toEqual([expect.objectContaining({ key: 'score:r1:p1:4', attempts: 7 })])
    expect(await _outboxTest.stored()).toEqual([expect.objectContaining({ key: 'score:r1:p1:4', attempts: 7 })])
    expect(useOutbox.getState()).toMatchObject({ pending: 1, rejected: [] })

    // The signal is good again: the next retry lands, still by itself.
    server.decide = () => 'answer'
    await vi.advanceTimersByTimeAsync(30_000)
    await settle(useOutbox)
    expect(server.score('p1', 4)).toMatchObject({ strokes: 5 })
    expect(useOutbox.getState()).toMatchObject({ pending: 0, lastError: null })
    expect(await _outboxTest.stored()).toEqual([])
  })

  it('gives up on a request that never answers after 12 s, retries it, and the holes behind it follow', async () => {
    let first = true
    server.decide = (req) => {
      if (!isWrite(req) || !first) return 'answer'
      first = false
      return 'stall'
    }
    await enqueueScore('t1', holeScore('p1', 15, 4))
    await enqueueScore('t1', holeScore('p2', 15, 5))
    await until(() => server.writeRequests().length === 1, 'the first push to go out')

    // Connected, nothing answers: the queue waits on it, but not for ever.
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS - 1)
    for (let i = 0; i < 50; i++) await turn()
    expect(server.writeRequests()).toHaveLength(1)
    expect(useOutbox.getState()).toMatchObject({ pending: 2, syncing: true })

    await vi.advanceTimersByTimeAsync(1)
    await settle(useOutbox)
    expect(server.writeRequests()[0]!.result).toBe('aborted')
    expect(_outboxTest.queue()[0]).toMatchObject({ key: 'score:r1:p1:15', attempts: 1, lastError: expect.stringMatching(/^RequestTimeout/) })
    expect(useOutbox.getState()).toMatchObject({ pending: 2, lastError: t.sync.errNetwork, rejected: [] })

    // Retried by itself 2 s later; the hole behind it goes in the same pass.
    await vi.advanceTimersByTimeAsync(2000)
    await settle(useOutbox)
    expect(server.score('p1', 15)).toMatchObject({ strokes: 4 })
    expect(server.score('p2', 15)).toMatchObject({ strokes: 5 })
    expect(server.writeRequests()).toHaveLength(3)
    expect(useOutbox.getState()).toMatchObject({ pending: 0, lastError: null })
  })

  it('sets a refused write aside once, keeps it on the phone, and never sends it again', async () => {
    // The Comité moved p4 to another group while this phone still had him: the server refuses his hole (§7).
    server.tables.group_members = server.tables.group_members!.filter((m) => m.player_id !== 'p4')
    await enqueueScore('t1', holeScore('p4', 9, 4))
    await settle(useOutbox)
    expect(server.writeRequests().map((r) => r.result)).toEqual([403])
    expect(useOutbox.getState().rejected).toEqual([expect.objectContaining({ key: 'score:r1:p4:9', message: t.sync.errDenied })])
    expect(useOutbox.getState()).toMatchObject({ pending: 0, lastError: t.sync.errDenied })
    expect(await _outboxTest.stored()).toEqual([])
    // On the phone, for the Comité, across a restart.
    expect((await _outboxTest.db()!.rejected.toArray()).map((r) => r.key)).toEqual(['score:r1:p4:9'])

    // Time passes, the signal comes and goes, the app comes to the front, other holes are saved and sent.
    await vi.advanceTimersByTimeAsync(10 * 60_000)
    phone.goOffline()
    phone.goOnline()
    phone.show()
    await enqueueScore('t1', holeScore('p1', 10, 5))
    await settle(useOutbox)
    await vi.advanceTimersByTimeAsync(10 * 60_000)
    await settle(useOutbox)
    expect(server.score('p1', 10)).toMatchObject({ strokes: 5 })
    expect(sent(9)).toBe(1)
    expect(server.score('p4', 9)).toBeUndefined()
    expect(useOutbox.getState().rejected.map((r) => r.key)).toEqual(['score:r1:p4:9'])
  })

  it('sets aside a write the database cannot take as typed («invalid input»), as it does a refused one', async () => {
    // What PostgREST answers when a value does not parse as its column's type (22P02): sending it again changes nothing.
    server.decide = (req) => (isWrite(req) ? { status: 400, body: { code: '22P02', details: null, hint: null, message: 'invalid input syntax for type uuid: "p1"' } } : 'answer')
    await enqueueScore('t1', holeScore('p1', 12, 4))
    await settle(useOutbox)
    expect(useOutbox.getState()).toMatchObject({ pending: 0, lastError: t.sync.errDenied })
    expect(useOutbox.getState().rejected).toEqual([expect.objectContaining({ key: 'score:r1:p1:12', message: t.sync.errDenied })])
    expect(await _outboxTest.stored()).toEqual([])

    await vi.advanceTimersByTimeAsync(10 * 60_000)
    await settle(useOutbox)
    expect(sent(12)).toBe(1)
  })

  it('retries a write refused for an expired session: that is not a refusal of the hole', async () => {
    let n = 0
    server.decide = (req) => (isWrite(req) && n++ === 0 ? { status: 401, body: { code: 'PGRST303', details: null, hint: null, message: 'JWT expired' } } : 'answer')
    await enqueueScore('t1', holeScore('p1', 11, 6))
    await settle(useOutbox)
    expect(useOutbox.getState()).toMatchObject({ pending: 1, rejected: [] })

    await vi.advanceTimersByTimeAsync(2000)
    await settle(useOutbox)
    expect(server.score('p1', 11)).toMatchObject({ strokes: 6 })
    expect(useOutbox.getState()).toMatchObject({ pending: 0, rejected: [] })
  })
})
