/**
 * QA-06 round 4: what PR #93's third verifier found no test pinned.
 * - Refusals other than the snake's: a signature in a round that closed, a
 *   winner the rules refuse, the same winner named by two phones at once (a
 *   unique violation). Each goes to «rechazados» and the queue behind it
 *   moves; misread as a network error, it would block every later write.
 * - A hole's winners replace the group's winners of that contest on that hole
 *   only: not another contest's, not another hole's, not another group's (the
 *   Comité plays as an admin player). «Nadie» lost on the way stays queued.
 */
import 'fake-indexeddb/auto'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Snapshot } from '../engine/types'
import { enterAs, holeAward, holeScore, installFakePhone, isWrite, settle } from './testing/fakePhone'

const { server, phone } = installFakePhone()
const { _outboxTest, enqueueAward, enqueueScore, enqueueSignature, overlayPending, startOutbox, useOutbox } = await import('./outbox')
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

const award = (o: Record<string, unknown>) => ({ round_id: 'r1', group_id: 'g1', hole: 5, game_id: 'closest', player_id: 'p3', decided_by: 'p1', ...o })
/** A second group in the round: p9 plays in g9. */
function secondGroup() {
  server.tables.players!.push({ id: 'p9', tournament_id: 't1', full_name: 'Nueve', display_name: 'Nueve', is_admin: false })
  server.tables.groups!.push({ id: 'g9', round_id: 'r1', number: 2, tee_time: null, start_hole: 1 })
  server.tables.group_members!.push({ group_id: 'g9', player_id: 'p9' })
}

describe('refusals of every kind go to «rechazados», and the queue behind them moves', () => {
  it('a signature in a round that closed meanwhile', async () => {
    server.tables.rounds = server.tables.rounds!.map((r) => ({ ...r, status: 'finished' }))
    await enqueueSignature('t1', { round_id: 'r1', pair_id: 'pb', signed_by: 'p1' })
    await settle(useOutbox)
    expect(useOutbox.getState().rejected.map((r) => r.key)).toEqual(['signature:r1:pb'])
    expect(_outboxTest.queue()).toEqual([])
  })

  it('a winner the rules refuse: a player of another group', async () => {
    secondGroup()
    await enqueueAward('t1', holeAward(5, ['p9']))
    await settle(useOutbox)
    expect(useOutbox.getState().rejected.map((r) => r.key)).toEqual(['award:r1:g1:closest:5'])
    expect(_outboxTest.queue()).toEqual([])
  })

  it('two phones name the same winner at once: the duplicate (23505) is set aside, and the hole behind it lands', async () => {
    let raced = false
    server.decide = (req) => {
      // The group's other phone inserts the same winner between this phone's delete and its insert.
      if (!raced && isWrite(req, 'hole_awards') && req.method === 'POST') {
        raced = true
        server.seed('hole_awards', [award({ player_id: 'p2', decided_by: 'p3' })])
      }
      return 'answer'
    }
    await enqueueAward('t1', holeAward(5, ['p2']))
    await enqueueScore('t1', holeScore('p2', 6, 4))
    await settle(useOutbox)
    expect(useOutbox.getState().rejected.map((r) => r.key)).toEqual(['award:r1:g1:closest:5'])
    expect(server.score('p2', 6)).toMatchObject({ strokes: 4 })
  })
})

describe('a hole’s winners, and «nadie»', () => {
  it('«nadie» whose delete the network loses stays queued, and the old winner stays on the server', async () => {
    server.seed('hole_awards', [award({})])
    server.decide = (req) => (isWrite(req, 'hole_awards') && req.method === 'DELETE' ? 'offline' : 'answer')
    await enqueueAward('t1', holeAward(5, []))
    await settle(useOutbox)
    expect(_outboxTest.queue().map((x) => x.key)).toEqual(['award:r1:g1:closest:5'])
    expect(server.tables.hole_awards).toHaveLength(1)
  })

  it('leaves the group’s winners of another contest on that hole', async () => {
    server.seed('hole_awards', [award({ game_id: 'longest', player_id: 'p4' })])
    await enqueueAward('t1', holeAward(5, ['p2']))
    await settle(useOutbox)
    expect(server.tables.hole_awards!.map((a) => `${a.game_id}:${a.player_id}`).sort()).toEqual(['closest:p2', 'longest:p4'])
  })

  it('leaves the group’s winners of that contest on other holes', async () => {
    server.seed('hole_awards', [award({ hole: 6, player_id: 'p4' })])
    await enqueueAward('t1', holeAward(5, ['p2']))
    await settle(useOutbox)
    expect(server.tables.hole_awards!.map((a) => `${a.hole}:${a.player_id}`).sort()).toEqual(['5:p2', '6:p4'])
  })

  it('from an admin player (the Comité plays as one), leaves another group’s winners of the hole', async () => {
    secondGroup()
    server.tables.players = server.tables.players!.map((p) => (p.id === 'p1' ? { ...p, is_admin: true } : p))
    server.seed('hole_awards', [award({ group_id: 'g9', player_id: 'p9', decided_by: 'p9' })])
    await enqueueAward('t1', holeAward(5, ['p2']))
    await settle(useOutbox)
    expect(server.tables.hole_awards!.map((a) => `${a.group_id}:${a.player_id}`).sort()).toEqual(['g1:p2', 'g9:p9'])
  })

  it('a queued «nadie» takes the old winners off the boards before it goes', async () => {
    phone.online = false
    await enqueueAward('t1', holeAward(5, []))
    const boards = { tournament: { id: 't1' }, scores: [], snakeTiebreaks: [], cardSignatures: [], holeAwards: [{ roundId: 'r1', groupId: 'g1', hole: 5, gameId: 'closest', playerId: 'p3' }] } as unknown as Snapshot
    overlayPending(boards)
    expect(boards.holeAwards).toEqual([])
  })
})
