/**
 * The heartbeat's view of the outbox (STRAT-02): holes still to send across
 * tournaments, the oldest one, and when the server last answered. Real outbox
 * and store against the fake server, entered as p1 with the PIN.
 */
import 'fake-indexeddb/auto'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { enterAs, installFakePhone, settle } from './testing/fakePhone'

const { server, phone } = installFakePhone()
const { _outboxTest, enqueueHole, flush, startOutbox, useOutbox } = await import('./outbox')
const { useTournament } = await import('./tournamentStore')
const { deviceSnapshot } = await import('../lib/telemetry')

beforeAll(async () => {
  await enterAs('p1')
  await startOutbox()
})
beforeEach(async () => {
  server.reset()
  phone.online = true
  _outboxTest.reset()
  await _outboxTest.clearStored()
  useTournament.setState({ tournamentId: 't1' })
  await useTournament.getState().reload()
})
afterEach(() => _outboxTest.reset())

describe('the heartbeat reads the outbox', () => {
  it('a hole kept offline is one to send, dated; once the server answers, none, and the answer is dated', async () => {
    expect(deviceSnapshot()).toMatchObject({ pending: 0, oldestPendingAt: null })
    phone.online = false
    const before = Date.now()
    await enqueueHole('t1', {
      round_id: 'r1',
      hole: 4,
      entered_by: 'p1',
      entries: [{ player_id: 'p1', fields: { strokes: 5, putts: 2 }, base: {} }],
    })
    const waiting = deviceSnapshot()
    expect(waiting.pending).toBe(1)
    expect(Date.parse(waiting.oldestPendingAt!)).toBeGreaterThanOrEqual(before - 1)
    phone.online = true
    await flush()
    await settle(useOutbox)
    const sent = deviceSnapshot()
    expect(sent).toMatchObject({ pending: 0, rejected: 0, oldestPendingAt: null })
    expect(Date.parse(sent.lastSyncAt!)).toBeGreaterThanOrEqual(before - 1)
  })
})
