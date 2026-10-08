/**
 * QA-06 (2): the optimistic overlay. A saved hole shows on this phone at once
 * and over every snapshot fetched while it waits, so the boards never flicker
 * back to the server's older value; once the write lands, the snapshot is the
 * server's own again. A write the server refuses stops showing.
 *
 * Real outbox, real tournament store (fetch, overlay, engine), and the app's
 * real Supabase client, entered as p1 with the PIN, against the fake server
 * (src/data/testing/fakePhone.ts).
 */
import 'fake-indexeddb/auto'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { enterAs, gate, holeScore, installFakePhone, isWrite, settle, snakeAnswer, until } from './testing/fakePhone'

const { server, phone } = installFakePhone()
const { _outboxTest, enqueueScore, enqueueTiebreak, startOutbox, useOutbox } = await import('./outbox')
const { useTournament } = await import('./tournamentStore')
const { t } = await import('../i18n/es-MX')

/** What this phone shows for a player's hole: the snapshot's row and the engine's gross. */
function shown(player: string, hole: number) {
  const data = useTournament.getState().data!
  const row = data.snapshot.scores.find((s) => s.roundId === 'r1' && s.playerId === player && s.hole === hole)
  const gross = data.state.core.rounds.r1?.[player]?.holes.find((h) => h.hole === hole)?.gross ?? null
  return { strokes: row?.strokes ?? null, gross, updatedAt: row?.updatedAt ?? null }
}
/** Who holed out last on a hole, per the snapshot (one answer per hole). */
function answers(hole: number): string[] {
  return useTournament.getState().data!.snapshot.snakeTiebreaks.filter((x) => x.roundId === 'r1' && x.hole === hole).map((x) => x.lastHoledPlayerId)
}

describe('the optimistic overlay', () => {
  beforeAll(async () => {
    await enterAs('p1')
    await startOutbox()
  })
  beforeEach(async () => {
    server.reset()
    // Earlier in the round: the server has p1's hole 5 as a 5, and p1 as the last to hole out there.
    server.seed('scores', [holeScore('p1', 5, 5)])
    server.seed('snake_tiebreaks', [snakeAnswer(5, 'p1')])
    phone.online = true
    _outboxTest.reset()
    await _outboxTest.clearStored()
    useTournament.setState({ tournamentId: 't1', data: null })
    await useTournament.getState().reload()
    expect(shown('p1', 5).strokes).toBe(5)
    expect(shown('p2', 5).strokes).toBe(null)
  })

  it('shows a saved hole at once and over every reload until the server has it, then the server row', async () => {
    // Slow 4G: the first push is held in flight; the rest wait behind it.
    const inFlight = gate()
    let first = true
    server.decide = (req) => {
      if (!isWrite(req) || !first) return 'answer'
      first = false
      return inFlight.wait.then(() => 'answer' as const)
    }
    await enqueueScore('t1', holeScore('p1', 5, 6)) // a correction of the server's row
    await enqueueScore('t1', holeScore('p2', 5, 4)) // a hole the server has never seen
    await enqueueTiebreak('t1', snakeAnswer(5, 'p2'))

    // At once, before any answer: the board and the engine see the new values.
    expect(shown('p1', 5)).toMatchObject({ strokes: 6, gross: 6 })
    expect(shown('p2', 5)).toMatchObject({ strokes: 4, gross: 4 })
    expect(answers(5)).toEqual(['p2'])

    // Another phone's save makes Realtime reload the snapshot; the server still has the old values.
    await useTournament.getState().reload()
    expect(server.score('p1', 5)).toMatchObject({ strokes: 5 })
    expect(server.score('p2', 5)).toBeUndefined()
    expect(shown('p1', 5)).toMatchObject({ strokes: 6, gross: 6 })
    expect(shown('p2', 5)).toMatchObject({ strokes: 4, gross: 4 })
    expect(answers(5)).toEqual(['p2'])

    // The writes land.
    inFlight.open()
    await until(() => useOutbox.getState().pending === 0, 'the writes to land')
    await settle(useOutbox)

    // From now on the snapshot is the server's own: a Comité correction shows as it is,
    // and the rows carry the server's time, not the phone's copy.
    server.score('p1', 5)!.strokes = 7
    await useTournament.getState().reload()
    expect(shown('p1', 5)).toMatchObject({ strokes: 7, gross: 7 })
    expect(shown('p2', 5)).toMatchObject({ strokes: 4, updatedAt: server.score('p2', 5)!.updated_at })
    expect(answers(5)).toEqual(['p2'])
  })

  it('stops showing a write the server refuses: the board goes back to the server value', async () => {
    // The Comité closed the round while the hole was on its way: the server refuses it (§7).
    server.tables.rounds![0]!.status = 'finished'
    await enqueueScore('t1', holeScore('p1', 5, 9))
    expect(shown('p1', 5).strokes).toBe(9)

    await until(() => useOutbox.getState().rejected.length === 1, 'the refusal')
    await until(() => shown('p1', 5).strokes === 5, "the server's value to show again")
    expect(shown('p1', 5)).toMatchObject({ strokes: 5, gross: 5 })
    expect(useOutbox.getState().rejected).toEqual([expect.objectContaining({ key: 'score:r1:p1:5', message: t.sync.errDenied })])
    expect(server.writeRequests().map((r) => r.result)).toEqual([403])
  })
})
