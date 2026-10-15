/**
 * The outbox's own guards, each on the real Dexie (fake-indexeddb) and the fake server, entered as p1 with the
 * PIN: the update switch set to what it already is, an adopt with no session, «Volver a mandar» on a write that
 * is gone, the queue read while this tab saves, another tab's capture of the same hole, a conflict store that
 * fails, a newer capture another tab already took, a contest the server says this phone may not save, and a
 * write an older build stored without its order.
 *
 * Vitest 5's coverage counts each `return`, `.catch` and callback on its own; Vitest 3 counted lines, and every
 * one of these passed as covered with no test on it.
 */
import 'fake-indexeddb/auto'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Row } from './mappers'
import { enterAs, gate, holeAward, holeScore, installFakePhone, settle, until, type Outcome } from './testing/fakePhone'

const { server, phone } = installFakePhone()
const { _outboxTest, adoptQueuedWrites, enqueueAward, enqueueHole, flush, retryRejected, setOutboxBlocked, startOutbox, useOutbox } = await import('./outbox')
type HoleEntry = import('./outbox').HoleEntry
type HoleItem = Extract<import('./outbox').OutboxItem, { kind: 'hole' }>
const { useTournament } = await import('./tournamentStore')
const { useAuth } = await import('./auth')
const { t } = await import('../i18n/es-MX')

/** The user this phone is, holding p1 by the PIN. */
let me = ''
beforeAll(async () => {
  me = await enterAs('p1')
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
afterEach(() => {
  vi.restoreAllMocks()
  _outboxTest.reset()
})

/** This phone's save_hole calls. */
const calls = () => server.wire.filter((r) => r.target === 'rpc/save_hole' && r.as === me)
const saveHole = (hole: number, entries: HoleEntry[]) => enqueueHole('t1', { round_id: 'r1', hole, entered_by: 'p1', entries })
const played = (strokes: number, putts = 2): HoleEntry['fields'] => ({ strokes, putts })
const holesQueued = () => _outboxTest.queue().map((x) => (x as HoleItem).payload.hole).sort((a, b) => a - b)

/** The other phone of the group (p3's), saving through the same door with its own session. */
async function otherPhoneSaves(hole: number, entries: Array<{ player_id: string; fields: Row; base: Row }>) {
  if (!(server.tables.device_sessions ?? []).some((d) => d.auth_user_id === 'phone-b')) {
    server.tables.device_sessions = [...(server.tables.device_sessions ?? []), { auth_user_id: 'phone-b', player_id: 'p3', tournament_id: 't1' }]
  }
  const token = server.auth.sessionFor('phone-b')
  const reachable = server.reachable
  server.reachable = () => true
  try {
    await server.fetch(`${server.url}/rest/v1/rpc/save_hole`, {
      method: 'POST',
      headers: { apikey: server.anonKey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p: { round_id: 'r1', hole, mutation_id: `other-${hole}`, entries } }),
    })
  } finally {
    server.reachable = reachable
  }
}

describe('switches and calls that find nothing to do', () => {
  it('the update switch set to what it already is changes nothing: nothing goes until it opens, and then once', async () => {
    setOutboxBlocked(true)
    await saveHole(5, [{ player_id: 'p2', fields: played(5), base: {} }])
    setOutboxBlocked(true)
    await flush()
    expect(calls()).toHaveLength(0)
    expect(useOutbox.getState().blocked).toBe(true)
    setOutboxBlocked(false)
    await until(() => calls().length === 1, 'the hole, once the switch opens')
    await settle(useOutbox)
    setOutboxBlocked(false)
    await flush()
    expect(calls()).toHaveLength(1)
    expect(useOutbox.getState().blocked).toBe(false)
  })

  it('adopting with no session yet adopts nothing: the held hole waits, and goes once there is one', async () => {
    phone.goOffline()
    await saveHole(5, [{ player_id: 'p2', fields: played(5), base: {} }])
    // Held: queued before any identity was confirmed.
    const d = _outboxTest.db()!
    for (const it of await d.items.toArray()) await d.items.put({ ...it, actingUid: null })
    await _outboxTest.load()
    phone.goOnline()
    const user = useAuth.getState().user
    useAuth.setState({ user: null })
    try {
      await adoptQueuedWrites('t1')
      expect((await d.items.toArray()).map((x) => x.actingUid)).toEqual([null])
      expect(calls()).toHaveLength(0)
    } finally {
      useAuth.setState({ user })
    }
    await adoptQueuedWrites('t1')
    await until(() => calls().length === 1, 'the hole, adopted')
  })

  it('«Volver a mandar» on a write that is no longer there does nothing', async () => {
    await retryRejected('score:r1:p2:9')
    expect(_outboxTest.queue()).toEqual([])
    expect(await _outboxTest.stored()).toEqual([])
  })
})

describe('storage read and written by more than this tab', () => {
  it('a queue read while this tab saves keeps both the save and what storage held', async () => {
    phone.goOffline()
    await saveHole(5, [{ player_id: 'p2', fields: played(5), base: {} }])
    const d = _outboxTest.db()!
    const read = d.items.toArray.bind(d.items)
    vi.spyOn(d.items, 'toArray').mockImplementationOnce(async () => {
      const rows = await read()
      // The read is out when the player saves the next hole.
      await saveHole(7, [{ player_id: 'p2', fields: played(6), base: {} }])
      return rows
    })
    await _outboxTest.load()
    expect(holesQueued()).toEqual([5, 7])
    expect((await _outboxTest.stored()).length).toBe(2)
  })

  it('a second save of a hole goes into the newest capture of it in storage, another tab’s included', async () => {
    phone.goOffline()
    await saveHole(7, [{ player_id: 'p2', fields: played(5), base: {} }])
    const d = _outboxTest.db()!
    const [mine] = (await d.items.toArray()) as HoleItem[]
    // Another tab saved the hole after this one: its own key and a later order, not in this tab's queue.
    const theirs: HoleItem = {
      ...structuredClone(mine!),
      key: 'hole:r1:7:other-tab',
      seq: mine!.seq + 1,
      payload: { ...structuredClone(mine!.payload), mutation_id: 'other-tab', entries: [{ player_id: 'p3', fields: played(4), base: {} }] },
    }
    await d.items.put(theirs)
    await saveHole(7, [{ player_id: 'p4', fields: played(6, 1), base: {} }])
    const stored = (await d.items.toArray()) as HoleItem[]
    expect(stored.find((x) => x.key === theirs.key)!.payload.entries.map((e) => e.player_id).sort()).toEqual(['p3', 'p4'])
    // This tab's first capture is as it was: a merge goes into the newest one only.
    expect(stored.find((x) => x.key === mine!.key)!.payload.entries.map((e) => e.player_id)).toEqual(['p2'])
  })

  it('a conflict the phone can no longer clear from storage still lets the hole be saved again', async () => {
    phone.goOffline()
    const d = _outboxTest.db()!
    await d.conflicts.put({ key: 'conflict:r1:p2:4', tournamentId: 't1', round_id: 'r1', hole: 4, player_id: 'p2', fields: played(5), base: {}, clash: ['strokes'], server: null, at: Date.now() })
    await _outboxTest.load()
    expect(useOutbox.getState().conflicts).toHaveLength(1)
    vi.spyOn(d.conflicts, 'bulkDelete').mockRejectedValueOnce(new Error('QuotaExceededError'))
    await saveHole(4, [{ player_id: 'p2', fields: played(6), base: {} }])
    expect(holesQueued()).toEqual([4])
    // Captured again: the question is settled on this phone, whatever storage managed.
    expect(useOutbox.getState().conflicts).toEqual([])
  })

  it('a newer capture another tab already took is left alone: the conflict is asked with this phone’s own values', async () => {
    const held = gate()
    server.decide = async (req): Promise<Outcome> => {
      if (req.target === 'rpc/save_hole' && req.as === me && calls().length === 1) await held.wait
      return 'answer'
    }
    await saveHole(4, [{ player_id: 'p2', fields: played(5), base: {} }])
    await until(() => calls().length === 1, 'the first call to go out')
    await otherPhoneSaves(4, [{ player_id: 'p2', fields: played(6), base: {} }])
    // The correction, typed over this phone's 5, waits behind the call; another tab marks it sent before the answer.
    await saveHole(4, [{ player_id: 'p2', fields: { putts: 1 }, base: { strokes: 5, putts: 2, picked_up: false } }])
    const d = _outboxTest.db()!
    const correction = ((await d.items.toArray()) as HoleItem[]).find((x) => !x.sent)!
    await d.items.put({ ...correction, sent: true })
    held.open()
    await until(() => useOutbox.getState().conflicts.length === 1, 'the question')
    // Not carried over into the correction (whose putts would ride with it): asked with what this call sent.
    expect(useOutbox.getState().conflicts).toMatchObject([{ player_id: 'p2', fields: { strokes: 5, putts: 2 } }])
    await settle(useOutbox)
  })

  it('a write an older build stored without its order is read at its time, goes out and leaves storage', async () => {
    phone.goOffline()
    const d = _outboxTest.db()!
    const createdAt = Date.now() - 60_000
    await d.items.put({ key: 'score:r1:p2:9', kind: 'score', tournamentId: 't1', payload: holeScore('p2', 9, 5), attempts: 0, createdAt, actingUid: me } as never)
    await _outboxTest.load()
    expect(_outboxTest.queue()).toMatchObject([{ key: 'score:r1:p2:9', seq: createdAt * 1000 }])
    phone.goOnline()
    await until(() => _outboxTest.queue().length === 0, 'the write to go out')
    expect(await _outboxTest.stored()).toEqual([])
    expect(server.score('p2', 9)).toMatchObject({ strokes: 5 })
  })
})

describe('a contest refused', () => {
  it('a group this phone is not in: refused as not allowed, never as a closed day', async () => {
    await enqueueAward('t1', { ...holeAward(3, ['p2']), group_id: 'g9' })
    await until(() => useOutbox.getState().rejected.length === 1, 'the refusal')
    expect(useOutbox.getState().rejected).toMatchObject([{ kind: 'award', message: t.sync.errDenied }])
  })

  it('a contest saved after its day closed: refused as a closed day, the Comité’s to capture', async () => {
    server.tables.rounds = server.tables.rounds!.map((r) => (r.id === 'r1' ? { ...r, status: 'finished' } : r))
    await enqueueAward('t1', holeAward(3, ['p2']))
    await until(() => useOutbox.getState().rejected.length === 1, 'the refusal')
    expect(useOutbox.getState().rejected).toMatchObject([{ kind: 'award', message: t.sync.errNotLive }])
  })
})
