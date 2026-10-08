/**
 * QA-06 (7): what else a group sends, and who sent it. A hole is stored as
 * entered by this phone's player, and the server flags it when it replaces
 * what another phone entered; the boards say who entered a hole that still
 * waits for signal. A hole's winners and a card's signature show the moment
 * they are saved, and a card the other phone already signed keeps that
 * signature. A phone in two tournaments sends both tournaments' holes, and
 * each shows only on its own boards.
 *
 * Real outbox and tournament store, and the app's real Supabase client,
 * entered as p1 with the PIN, against the fake server, whose rules are the
 * database's (src/data/testing/fakePhone.ts, cases/serverRules.json).
 */
import 'fake-indexeddb/auto'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { enterAs, holeAward, holeScore, installFakePhone, settle, until } from './testing/fakePhone'

const { server, phone } = installFakePhone()
const { _outboxTest, enqueueAward, enqueueScore, enqueueSignature, startOutbox, useOutbox } = await import('./outbox')
const { useTournament } = await import('./tournamentStore')

/** The user this phone is, holding p1 by the PIN. */
let player = ''
beforeAll(async () => {
  player = await enterAs('p1')
  await startOutbox()
})
beforeEach(async () => {
  server.reset()
  phone.online = true
  _outboxTest.reset()
  await _outboxTest.clearStored()
  useTournament.setState({ tournamentId: 't1' })
})
afterEach(() => {
  _outboxTest.reset()
})

/** What this phone's boards hold now. */
const boards = () => useTournament.getState().data!.snapshot

describe('who entered a hole', () => {
  it('is this phone’s player, on the server’s row, sent with this phone’s session', async () => {
    await enqueueScore('t1', holeScore('p2', 4, 5))
    await until(() => useOutbox.getState().pending === 0, 'the hole to land')
    expect(server.score('p2', 4)).toMatchObject({ strokes: 5, entered_by: 'p1', disputed: false })
    expect(server.writes.map((w) => w.by)).toEqual([player])
  })

  it('replacing what another phone entered, the server flags the hole and keeps the old values', async () => {
    // p2's own phone entered his hole first.
    server.seed('scores', [{ round_id: 'r1', player_id: 'p2', hole: 4, strokes: 4, putts: 2, picked_up: false, entered_by: 'p2', client_ts: null }])
    await enqueueScore('t1', holeScore('p2', 4, 6))
    await until(() => useOutbox.getState().pending === 0, 'the hole to land')
    expect(server.score('p2', 4)).toMatchObject({ strokes: 6, entered_by: 'p1', disputed: true, previous: { strokes: 4, entered_by: 'p2' } })
    expect(useOutbox.getState().rejected).toEqual([])
  })

  it('shows on the boards while the hole waits for signal', async () => {
    await useTournament.getState().reload()
    phone.goOffline()
    await enqueueScore('t1', holeScore('p3', 4, 5))
    expect(boards().scores.find((s) => s.playerId === 'p3' && s.hole === 4)).toMatchObject({ strokes: 5, enteredBy: 'p1' })
  })
})

describe('a hole’s winners and a card’s signature', () => {
  it('the winners saved replace the server’s earlier winners on the boards at once', async () => {
    server.seed('hole_awards', [{ round_id: 'r1', group_id: 'g1', hole: 5, game_id: 'closest', player_id: 'p1', decided_by: 'p1' }])
    await useTournament.getState().reload()
    phone.goOffline()
    await enqueueAward('t1', holeAward(5, ['p2']))
    const winners = (boards().holeAwards ?? []).filter((a) => a.hole === 5 && a.gameId === 'closest').map((a) => a.playerId)
    expect(winners).toEqual(['p2'])
  })

  it('a signature saved shows at once, before it reaches the server', async () => {
    await useTournament.getState().reload()
    phone.goOffline()
    await enqueueSignature('t1', { round_id: 'r1', pair_id: 'pb', signed_by: 'p1' })
    expect(boards().cardSignatures.filter((x) => x.pairId === 'pb')).toEqual([expect.objectContaining({ roundId: 'r1', signedBy: 'p1' })])
  })

  it('a card the other phone already signed keeps that signature, and this phone’s is not refused', async () => {
    // p2's phone signed pb's card first; p1's phone signs it too.
    server.seed('card_signatures', [{ round_id: 'r1', pair_id: 'pb', signed_by: 'p2' }])
    await enqueueSignature('t1', { round_id: 'r1', pair_id: 'pb', signed_by: 'p1' })
    await until(() => useOutbox.getState().pending === 0, 'the signature to land')
    await settle(useOutbox)
    expect(server.tables.card_signatures!.filter((x) => x.pair_id === 'pb').map((x) => x.signed_by)).toEqual(['p2'])
    expect(server.writeRequests('card_signatures').map((r) => r.result)).toEqual([201])
    expect(useOutbox.getState().rejected).toEqual([])
  })
})

describe('a phone with holes of two tournaments', () => {
  it('another tournament’s queued hole never shows on this one’s boards', async () => {
    await useTournament.getState().reload()
    phone.goOffline()
    await enqueueScore('t2', holeScore('p9', 4, 9, 'r9'))
    expect(boards().scores.filter((s) => s.roundId === 'r9')).toEqual([])
  })

  it('sends the holes of a tournament that is not the one open', async () => {
    useTournament.setState({ tournamentId: 'tX' })
    await enqueueScore('t1', holeScore('p1', 12, 5))
    await until(() => server.score('p1', 12) !== undefined, 'the hole of the tournament that is not open')
    expect(server.score('p1', 12)).toMatchObject({ strokes: 5 })
  })
})
