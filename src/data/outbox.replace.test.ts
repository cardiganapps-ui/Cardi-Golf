/**
 * QA-06 (4, 5): saving a hole again replaces the earlier save (ARCH-01).
 * - Still queued: only the newest value ever goes out.
 * - Already in flight: it lands, the newest goes after it, and nothing older
 *   reaches the server after the newest.
 * - The newest is on the phone (IndexedDB), not only in memory, from the
 *   moment it is saved until it lands.
 * And the pending count is what is queued, in rows and in holes, at every
 * step (REL-17).
 *
 * Real outbox on the real Dexie (fake-indexeddb), and the app's real Supabase
 * client against a fake server (src/data/testing/fakePhone.ts).
 */
import 'fake-indexeddb/auto'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { gate, holeScore, installFakeSupabase, settle, snakeAnswer, until, type Outcome } from './testing/fakePhone'

vi.mock('./auth', () => ({ useAuth: { getState: () => ({ user: { id: 'uid-a' } }) } }))

const { server, browser } = installFakeSupabase()
const { _outboxTest, enqueueScore, enqueueTiebreak, queuedFor, startOutbox, useOutbox } = await import('./outbox')
const { useTournament } = await import('./tournamentStore')

const FOURSOME = ['p1', 'p2', 'p3', 'p4']
const strokesOf = (x: { payload: unknown }) => (x.payload as { strokes: number }).strokes

/** The first push is held in flight until `open()`; everything else is answered. */
function holdFirstPush(): { open: () => void } {
  const inFlight = gate()
  let first = true
  server.decide = (req): Outcome | Promise<Outcome> => {
    if (req.method !== 'POST' || !first) return 'answer'
    first = false
    return inFlight.wait.then(() => 'answer' as const)
  }
  return inFlight
}

beforeAll(async () => {
  await startOutbox()
})
beforeEach(async () => {
  server.reset()
  browser.online = true
  _outboxTest.reset()
  await _outboxTest.clearStored()
  useTournament.setState({ tournamentId: 't1' })
})

describe('the same hole saved again', () => {
  it('while the first save waits for signal: only the newest value ever goes out', async () => {
    browser.goOffline()
    await enqueueScore('t1', holeScore('p1', 5, 5))
    await enqueueScore('t1', holeScore('p1', 5, 6))
    expect((await _outboxTest.stored()).map(strokesOf)).toEqual([6])

    browser.goOnline()
    await until(() => useOutbox.getState().pending === 0, 'the hole to be sent')
    await settle(useOutbox)
    expect(server.strokesWritten('p1', 5)).toEqual([6])
    expect(server.writeRequests()).toHaveLength(1)
  })

  it('while it waits behind another push of the same pass: only the newest value goes', async () => {
    browser.goOffline()
    await enqueueScore('t1', holeScore('p1', 6, 4))
    await enqueueScore('t1', holeScore('p2', 6, 7))
    const p1InFlight = holdFirstPush()
    browser.goOnline()
    await until(() => server.writeRequests().length === 1, "p1's push to go out")
    // p2's hole is corrected while the pass that holds it is still on p1.
    await enqueueScore('t1', holeScore('p2', 6, 8))
    p1InFlight.open()
    await until(() => useOutbox.getState().pending === 0, 'the pass to end')
    await settle(useOutbox)
    expect(server.strokesWritten('p1', 6)).toEqual([4])
    expect(server.strokesWritten('p2', 6)).toEqual([8])
  })

  it('«Deshacer» while the hole is going out: every player ends on the undone value, nothing older after it', async () => {
    const p1InFlight = holdFirstPush()
    // «Guardar hoyo» for the foursome: p1's push goes out at once and is held.
    for (const p of FOURSOME) await enqueueScore('t1', holeScore(p, 7, 7))
    await until(() => server.writeRequests().length === 1, "p1's push to go out")
    // «Deshacer» a moment later, back to 4 for everyone.
    for (const p of FOURSOME) await enqueueScore('t1', holeScore(p, 7, 4))
    p1InFlight.open()
    await until(() => useOutbox.getState().pending === 0, 'the outbox to empty')
    await settle(useOutbox)

    for (const p of FOURSOME) expect(server.score(p, 7), p).toMatchObject({ strokes: 4 })
    // The push already in flight lands, and the undo lands after it; the others never sent the 7.
    expect(server.strokesWritten('p1', 7)).toEqual([7, 4])
    for (const p of ['p2', 'p3', 'p4']) expect(server.strokesWritten(p, 7), p).toEqual([4])
    expect(await _outboxTest.stored()).toEqual([])
  })

  it('keeps the correction on the phone while the first save lands: a restart before it goes still sends it', async () => {
    const inFlight = gate()
    let n = 0
    server.decide = (req): Outcome | Promise<Outcome> => {
      if (req.method !== 'POST') return 'answer'
      n++
      // The first save is in flight and lands; then the signal drops.
      return n === 1 ? inFlight.wait.then(() => 'answer' as const) : 'offline'
    }
    await enqueueScore('t1', holeScore('p1', 8, 5))
    await until(() => server.writeRequests().length === 1, 'the first save to go out')
    await enqueueScore('t1', holeScore('p1', 8, 6))
    inFlight.open()
    await until(() => server.writeRequests().length === 2, 'the correction to be tried')
    await settle(useOutbox)
    expect(server.strokesWritten('p1', 8)).toEqual([5])
    expect((await _outboxTest.stored()).map(strokesOf)).toEqual([6])

    // The phone restarts and the signal is back.
    _outboxTest.reset()
    await _outboxTest.load()
    server.decide = () => 'answer'
    browser.goOnline()
    await until(() => server.strokesWritten('p1', 8).length === 2, 'the correction to be sent')
    expect(server.strokesWritten('p1', 8)).toEqual([5, 6])
  })

  it('from another tab while this one pushes: the newer save stays on the phone and goes out after', async () => {
    const p1InFlight = holdFirstPush()
    await enqueueScore('t1', holeScore('p1', 9, 5))
    await until(() => server.writeRequests().length === 1, 'the first save to go out')
    // Another tab of the app saves the same hole; its message has not reached this tab yet.
    const mine = _outboxTest.queue()[0]!
    await _outboxTest.db()!.items.put({ ...mine, payload: holeScore('p1', 9, 6), seq: mine.seq + 1 })
    p1InFlight.open()
    await until(() => server.writeRequests()[0]!.result === 201, 'the first save to land')
    await settle(useOutbox)
    expect((await _outboxTest.stored()).map(strokesOf)).toEqual([6])

    // The other tab's message arrives: this tab reloads the queue and sends the newer save.
    const otherTab = new BroadcastChannel('cardi-golf-outbox')
    otherTab.postMessage('changed')
    await until(() => server.strokesWritten('p1', 9).length === 2, "the other tab's save to be sent")
    otherTab.close()
    expect(server.strokesWritten('p1', 9)).toEqual([5, 6])
  })
})

describe('the pending count', () => {
  it('is what is queued, in rows and in holes, through corrections, answers and each landing', async () => {
    const counts = () => {
      const s = useOutbox.getState()
      return [s.pending, s.pendingHoles, queuedFor('t1').holes]
    }
    browser.goOffline()
    for (const p of FOURSOME) await enqueueScore('t1', holeScore(p, 1, 4))
    expect(counts()).toEqual([4, 1, 1])
    for (const p of FOURSOME) await enqueueScore('t1', holeScore(p, 2, 5))
    expect(counts()).toEqual([8, 2, 2])
    // A correction replaces a row; it adds nothing.
    await enqueueScore('t1', holeScore('p2', 2, 6))
    expect(counts()).toEqual([8, 2, 2])
    // The snake answer is one more write, not one more hole.
    await enqueueTiebreak('t1', snakeAnswer(2, 'p3'))
    expect(counts()).toEqual([9, 2, 2])
    expect(await _outboxTest.stored()).toHaveLength(9)

    // Back online: read the count as each write reaches the server (the one arriving still counts).
    const seen: Array<[string, number, number]> = []
    server.decide = (req) => {
      if (req.method === 'POST') {
        const body = req.body as { player_id?: string; hole: number }
        seen.push([`${body.player_id ?? 'answer'}:${body.hole}`, useOutbox.getState().pending, useOutbox.getState().pendingHoles])
      }
      return 'answer'
    }
    browser.goOnline()
    await until(() => useOutbox.getState().pending === 0, 'the queue to drain')
    await settle(useOutbox)
    expect(seen).toEqual([
      ['p1:1', 9, 2],
      ['p2:1', 8, 2],
      ['p3:1', 7, 2],
      ['p4:1', 6, 2],
      ['p1:2', 5, 1],
      ['p3:2', 4, 1],
      ['p4:2', 3, 1],
      ['p2:2', 2, 1],
      ['answer:2', 1, 0],
    ])
    expect(counts()).toEqual([0, 0, 0])
    expect(await _outboxTest.stored()).toEqual([])
  })
})
