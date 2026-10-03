/**
 * QA-06 (8): the app open in several tabs on one phone, and a clock that goes
 * back. A tab tells the others when it queues a write and when one lands; a
 * tab that finds another holding the outbox's lock tries again by itself; a
 * push that fails never writes its older version over a correction another
 * tab stored meanwhile; and after a restart a new save stays newer than what
 * is stored, even when the phone's clock was set back.
 *
 * Real outbox on the real Dexie (fake-indexeddb), and the app's real Supabase
 * client, entered as p1 with the PIN, against the fake server
 * (src/data/testing/fakePhone.ts). Another tab is its own BroadcastChannel
 * and its own writes to the shared IndexedDB.
 */
import 'fake-indexeddb/auto'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { enterAs, gate, holeScore, installFakePhone, isWrite, OUTBOX_CHANNEL, settle, until, type Outcome } from './testing/fakePhone'

const { server, phone } = installFakePhone()
const { _outboxTest, enqueueScore, startOutbox, useOutbox } = await import('./outbox')
const { useTournament } = await import('./tournamentStore')

const strokesOf = (x: { payload: unknown }) => (x.payload as { strokes: number }).strokes

beforeAll(async () => {
  await enterAs('p1')
  await startOutbox()
})
beforeEach(async () => {
  server.reset()
  phone.online = true
  _outboxTest.reset()
  _outboxTest.setLocks(null)
  await _outboxTest.clearStored()
  useTournament.setState({ tournamentId: 't1' })
})
afterEach(() => {
  _outboxTest.reset()
  _outboxTest.setLocks(null)
  vi.useRealTimers()
})

describe('other tabs', () => {
  it('hear from this one when it queues a write and when the write lands', async () => {
    const heard: unknown[] = []
    const other = new BroadcastChannel(OUTBOX_CHANNEL)
    other.onmessage = (e) => void heard.push(e.data)
    try {
      await enqueueScore('t1', holeScore('p1', 6, 5))
      await until(() => useOutbox.getState().pending === 0, 'the hole to land')
      await until(() => heard.length >= 2, 'two messages to the other tabs', 2000)
      expect(heard.slice(0, 2)).toEqual(['changed', 'changed'])
    } finally {
      other.close()
    }
  })

  it('holding the outbox’s lock: this tab tries again by itself once it is free', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    let held = true
    _outboxTest.setLocks({ request: async (_name, _options, cb) => cb(held ? null : { name: OUTBOX_CHANNEL }) })
    await enqueueScore('t1', holeScore('p1', 11, 5))
    await settle(useOutbox)
    expect(server.writeRequests()).toHaveLength(0)
    held = false
    await vi.advanceTimersByTimeAsync(5000)
    await settle(useOutbox)
    expect(server.score('p1', 11)).toMatchObject({ strokes: 5 })
  })

  it('a push that fails never writes its older version over a correction another tab stored meanwhile', async () => {
    const inFlight = gate()
    let n = 0
    server.decide = (req): Outcome | Promise<Outcome> => {
      if (!isWrite(req)) return 'answer'
      n++
      return n === 1 ? inFlight.wait.then(() => 'offline' as const) : 'offline'
    }
    await enqueueScore('t1', holeScore('p1', 9, 5))
    await until(() => server.writeRequests().length === 1, 'the first save to go out')
    // Another tab saves the same hole; its message has not arrived yet.
    const mine = _outboxTest.queue()[0]!
    await _outboxTest.db()!.items.put({ ...mine, payload: holeScore('p1', 9, 6), seq: mine.seq + 1 })
    inFlight.open()
    await settle(useOutbox)
    expect((await _outboxTest.stored()).map(strokesOf)).toEqual([6])
  })
})

describe('a restart after the phone’s clock went back', () => {
  it('keeps a new save newer than what is stored', async () => {
    phone.goOffline()
    await enqueueScore('t1', holeScore('p1', 10, 5))
    // The stored version is an hour ahead of the clock the app restarts with.
    const stored = (await _outboxTest.stored())[0]!
    await _outboxTest.db()!.items.put({ ...stored, seq: stored.seq + 3_600_000_000 })
    _outboxTest.reset()
    await _outboxTest.load()
    await enqueueScore('t1', holeScore('p1', 10, 6))
    expect(_outboxTest.queue().map(strokesOf)).toEqual([6])
    expect((await _outboxTest.stored()).map(strokesOf)).toEqual([6])
  })
})
