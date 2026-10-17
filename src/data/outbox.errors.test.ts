/**
 * QA-06 round 3: what PR #93's second verifier found no test pinned, every
 * one a real way to lose a write with the suite green.
 * - A snake answer, a card signature or a hole's winners that the network
 *   loses on the way ("bars but no data") stays queued and on the phone: each
 *   kind's error was ignorable, and only scores had a test.
 * - One the server refuses goes to «rechazados», not away.
 * - «Nadie» as a contest's answer takes the old winners away on the server.
 * - The refused list keeps its truth across a restart: a refusal discarded or
 *   retried does not come back, and two refusals both survive.
 */
import 'fake-indexeddb/auto'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Snapshot } from '../engine/types'
import { t } from '../i18n/es-MX'
import { enterAs, holeAward, holeScore, installFakePhone, isAwardCall, isWrite, refusedByRls, settle, snakeAnswer } from './testing/fakePhone'

const { server, phone } = installFakePhone()
const { _outboxTest, discardRejected, enqueueAward, enqueueScore, enqueueSignature, enqueueTiebreak, overlayPending, retryRejected, startOutbox, useOutbox } = await import('./outbox')
const { useTournament } = await import('./tournamentStore')

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
})
afterEach(() => _outboxTest.reset())

describe('bars but no data: a write the network loses stays queued, and on the phone', () => {
  it('a snake answer', async () => {
    server.decide = (req) => (isWrite(req, 'snake_tiebreaks') ? 'offline' : 'answer')
    await enqueueTiebreak('t1', snakeAnswer(4, 'p2'))
    await settle(useOutbox)
    expect(server.writeRequests('snake_tiebreaks')).toHaveLength(1)
    expect(_outboxTest.queue().map((x) => x.key)).toEqual(['tiebreak:r1:g1:4'])
    expect((await _outboxTest.stored()).map((x) => x.key)).toEqual(['tiebreak:r1:g1:4'])
  })

  it('a card signature', async () => {
    server.decide = (req) => (isWrite(req, 'card_signatures') ? 'offline' : 'answer')
    await enqueueSignature('t1', { round_id: 'r1', pair_id: 'pb', signed_by: 'p1' })
    await settle(useOutbox)
    expect(server.writeRequests('card_signatures')).toHaveLength(1)
    expect(_outboxTest.queue().map((x) => x.key)).toEqual(['signature:r1:pb'])
    expect((await _outboxTest.stored()).map((x) => x.key)).toEqual(['signature:r1:pb'])
  })

  it('a hole’s winners, when the call is lost: it stays queued, and the claim on the server is as it was', async () => {
    server.seed('hole_awards', [{ round_id: 'r1', group_id: 'g1', hole: 5, game_id: 'closest', player_id: 'p3', decided_by: 'p1' }])
    server.decide = (req) => (isAwardCall(req) ? 'offline' : 'answer')
    await enqueueAward('t1', holeAward(5, ['p2']))
    await settle(useOutbox)
    expect(_outboxTest.queue().map((x) => x.key)).toEqual(['award:r1:g1:closest:5'])
    expect((await _outboxTest.stored()).map((x) => x.key)).toEqual(['award:r1:g1:closest:5'])
    expect(server.tables.hole_awards!.map((a) => a.player_id)).toEqual(['p3'])
    // One call, never a delete or an insert of their own (0044): there is no halfway for a lost answer to leave.
    expect(server.writeRequests('hole_awards')).toEqual([])
  })
})

describe('what the server says about them', () => {
  it('a snake answer it refuses goes to «rechazados», not away', async () => {
    server.decide = (req) => (isWrite(req, 'snake_tiebreaks') ? refusedByRls('snake_tiebreaks') : 'answer')
    await enqueueTiebreak('t1', snakeAnswer(4, 'p2'))
    await settle(useOutbox)
    expect(useOutbox.getState().rejected.map((r) => r.key)).toEqual(['tiebreak:r1:g1:4'])
  })

  it('a hole’s winner the server refuses leaves the claim it would have replaced (ARCH-13)', async () => {
    // It was a delete and then an insert: the insert refused, the hole lost its claim for good.
    server.seed('hole_awards', [{ round_id: 'r1', group_id: 'g1', hole: 5, game_id: 'closest', player_id: 'p3', decided_by: 'p1' }])
    server.tables.group_members = server.tables.group_members!.filter((m) => m.player_id !== 'p2')
    await enqueueAward('t1', holeAward(5, ['p2']))
    await settle(useOutbox)
    expect(useOutbox.getState().rejected.map((r) => [r.key, r.message])).toEqual([['award:r1:g1:closest:5', t.sync.errInvalid]])
    expect(server.tables.hole_awards!.map((a) => a.player_id)).toEqual(['p3'])
  })

  it('two phones name the same winner at once: the second call replaces the first one’s row, and nothing is refused (0044)', async () => {
    // The group's other phone got there first. Two requests met halfway on a duplicate key (23505); one call takes the hole's lock.
    server.seed('hole_awards', [{ round_id: 'r1', group_id: 'g1', hole: 5, game_id: 'closest', player_id: 'p2', decided_by: 'p3' }])
    await enqueueAward('t1', holeAward(5, ['p2']))
    await settle(useOutbox)
    expect(useOutbox.getState().rejected).toEqual([])
    expect(server.tables.hole_awards!.map((a) => `${a.player_id}:${a.decided_by}`)).toEqual(['p2:p1'])
  })

  it('a group’s winners waiting to go out leave another group’s winners of the hole on the boards', async () => {
    server.decide = (req) => (isAwardCall(req) ? 'offline' : 'answer')
    await enqueueAward('t1', holeAward(5, ['p2']))
    await settle(useOutbox)
    const boards = { tournament: { id: 't1' }, scores: [], snakeTiebreaks: [], cardSignatures: [], holeAwards: [{ roundId: 'r1', groupId: 'g2', hole: 5, gameId: 'closest', playerId: 'p7' }] } as unknown as Snapshot
    overlayPending(boards)
    expect(boards.holeAwards.map((a) => `${a.groupId}:${a.playerId}`).sort()).toEqual(['g1:p2', 'g2:p7'])
  })

  it('«nadie» as a contest’s answer takes the old winners away on the server', async () => {
    server.seed('hole_awards', [{ round_id: 'r1', group_id: 'g1', hole: 5, game_id: 'closest', player_id: 'p3', decided_by: 'p1' }])
    await enqueueAward('t1', holeAward(5, []))
    await settle(useOutbox)
    expect(server.tables.hole_awards).toEqual([])
  })
})

describe('the refused list across a restart', () => {
  /** p4 leaves the group: the server refuses his hole from this phone. */
  async function refuse(hole: number) {
    server.tables.group_members = server.tables.group_members!.filter((m) => m.player_id !== 'p4')
    await enqueueScore('t1', holeScore('p4', hole, 4))
    await settle(useOutbox)
  }

  it('a refusal discarded does not come back', async () => {
    await refuse(9)
    expect(useOutbox.getState().rejected.map((r) => r.key)).toEqual(['score:r1:p4:9'])
    await discardRejected('score:r1:p4:9')
    _outboxTest.reset()
    await _outboxTest.load()
    expect(useOutbox.getState().rejected).toEqual([])
  })

  it('a refusal retried and taken does not come back', async () => {
    await refuse(9)
    server.reset()
    await retryRejected('score:r1:p4:9')
    await settle(useOutbox)
    expect(server.score('p4', 9)).toMatchObject({ strokes: 4 })
    _outboxTest.reset()
    await _outboxTest.load()
    expect(useOutbox.getState().rejected).toEqual([])
  })

  it('the same hole refused twice is one line', async () => {
    await refuse(9)
    await enqueueScore('t1', holeScore('p4', 9, 6))
    await settle(useOutbox)
    expect(useOutbox.getState().rejected.map((r) => r.key)).toEqual(['score:r1:p4:9'])
  })

  it('two refusals both survive', async () => {
    await refuse(9)
    await enqueueScore('t1', holeScore('p4', 10, 5))
    await settle(useOutbox)
    _outboxTest.reset()
    await _outboxTest.load()
    expect(useOutbox.getState().rejected.map((r) => r.key).sort()).toEqual(['score:r1:p4:10', 'score:r1:p4:9'])
  })
})
