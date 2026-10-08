/**
 * QA-06 rounds 4 and 5: what PR #93's third and fourth verifiers found no
 * test pinned.
 * - A write the server refuses for good goes to «rechazados», and the write
 *   queued behind it goes out in the same pass. Misread as a lost signal, a
 *   refusal would stay first in the queue for ever («Sin conexión con el
 *   servidor. Se reintenta solo.»), and nothing behind it would land. Pinned
 *   for each kind of write the row-level security refuses (a signature, a
 *   hole's winners, a snake answer; a score's own refusal is in
 *   outbox.retry.test.ts), for each constraint (23502, 23503, 23505, 23514),
 *   for each data exception the database gives a hole (22P02, 22003, 22007,
 *   22008, 22009), and for a value too long for its column (22001).
 * - A hole's winners replace the group's winners of that contest on that hole
 *   only: not another contest's, not another hole's, not another group's (the
 *   Comité plays as an admin player), on the server and, while they wait on
 *   the phone, on the boards. «Nadie» lost on the way stays queued.
 *
 * The server answers each refusal with its own rules (testing/fakeSupabase.ts,
 * held to the database's by cases/serverRules.json), but 22001: no column a
 * phone writes has a length limit today, so that answer is PostgREST's own,
 * written out.
 */
import 'fake-indexeddb/auto'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Snapshot } from '../engine/types'
import type { Row } from './mappers'
import { enterAs, holeAward, holeScore, installFakePhone, isWrite, settle, snakeAnswer } from './testing/fakePhone'

const { server, phone } = installFakePhone()
const { _outboxTest, enqueueAward, enqueueScore, enqueueSignature, enqueueTiebreak, overlayPending, startOutbox, useOutbox } = await import('./outbox')
const { useTournament } = await import('./tournamentStore')
const { t } = await import('../i18n/es-MX')

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
const rejected = () => useOutbox.getState().rejected.map((r) => r.key)
/** A second group in the round, g9. */
function secondGroup() {
  server.tables.groups!.push({ id: 'g9', round_id: 'r1', number: 2, tee_time: null, start_hole: 1 })
}
/** p9, a player of the tournament who plays in g9. */
function playerInSecondGroup() {
  secondGroup()
  server.tables.players!.push({ id: 'p9', tournament_id: 't1', full_name: 'Nueve', display_name: 'Nueve', is_admin: false })
  server.tables.group_members!.push({ group_id: 'g9', player_id: 'p9' })
}
/** The Comité moves `player` from this phone's foursome to g9 while the phone still has him. */
function moveToSecondGroup(player: string) {
  secondGroup()
  server.tables.group_members = server.tables.group_members!.map((m) => (m.player_id === player ? { ...m, group_id: 'g9' } : m))
}
/** The writes are saved in this order with no signal; the signal comes back, and one pass sends them. */
async function savedThenSent(...writes: Array<() => Promise<void>>) {
  phone.online = false
  for (const write of writes) await write()
  phone.goOnline()
  await settle(useOutbox)
}
/** The boards as the server sent them, with these winners. */
const boards = (holeAwards: Array<{ groupId: string; hole: number; gameId: string; playerId: string }>) =>
  ({ tournament: { id: 't1' }, scores: [], snakeTiebreaks: [], cardSignatures: [], holeAwards: holeAwards.map((a) => ({ roundId: 'r1', ...a })) }) as unknown as Snapshot

describe('a write the server refuses goes to «rechazados», and the one queued behind it lands', () => {
  describe('refused by the row-level security', () => {
    it('a card signature in a round that closed meanwhile; behind it, a hole of the next round', async () => {
      // Day 1 closed while the signature waited on the phone; the foursome plays day 2 together.
      const [r1] = server.tables.rounds as [Row]
      server.tables.rounds = [{ ...r1, status: 'finished' }, { ...r1, id: 'r2', number: 2, status: 'live' }]
      server.tables.groups!.push({ id: 'g2', round_id: 'r2', number: 1, tee_time: null, start_hole: 1 })
      server.tables.group_members!.push(...['p1', 'p2', 'p3', 'p4'].map((player_id) => ({ group_id: 'g2', player_id })))
      await savedThenSent(
        () => enqueueSignature('t1', { round_id: 'r1', pair_id: 'pb', signed_by: 'p1' }),
        () => enqueueScore('t1', holeScore('p2', 1, 4, 'r2')),
      )
      expect(rejected()).toEqual(['signature:r1:pb'])
      expect(server.score('p2', 1, 'r2')).toMatchObject({ strokes: 4 })
    })

    it('a hole’s winner the Comité moved to another group meanwhile', async () => {
      moveToSecondGroup('p2')
      await savedThenSent(
        () => enqueueAward('t1', holeAward(5, ['p2'])),
        () => enqueueScore('t1', holeScore('p3', 6, 4)),
      )
      expect(rejected()).toEqual(['award:r1:g1:closest:5'])
      expect(server.score('p3', 6)).toMatchObject({ strokes: 4 })
    })

    it('a snake answer naming a player the Comité moved to another group meanwhile', async () => {
      moveToSecondGroup('p2')
      await savedThenSent(
        () => enqueueTiebreak('t1', snakeAnswer(4, 'p2')),
        () => enqueueScore('t1', holeScore('p3', 6, 4)),
      )
      expect(rejected()).toEqual(['tiebreak:r1:g1:4'])
      expect(server.score('p3', 6)).toMatchObject({ strokes: 4 })
    })
  })

  describe('refused by a constraint', () => {
    it('two phones name the same winner at once: a duplicate key (23505)', async () => {
      let raced = false
      server.decide = (req) => {
        // The group's other phone inserts the same winner between this phone's delete and its insert.
        if (!raced && isWrite(req, 'hole_awards') && req.method === 'POST') {
          raced = true
          server.seed('hole_awards', [award({ player_id: 'p2', decided_by: 'p3' })])
        }
        return 'answer'
      }
      await savedThenSent(
        () => enqueueAward('t1', holeAward(5, ['p2'])),
        () => enqueueScore('t1', holeScore('p2', 6, 4)),
      )
      expect(rejected()).toEqual(['award:r1:g1:closest:5'])
      expect(server.score('p2', 6)).toMatchObject({ strokes: 4 })
    })

    it('a check: 16 strokes (23514)', async () => {
      await savedThenSent(
        () => enqueueScore('t1', holeScore('p1', 7, 16)),
        () => enqueueScore('t1', holeScore('p2', 6, 4)),
      )
      expect(rejected()).toEqual(['score:r1:p1:7'])
      expect(server.score('p2', 6)).toMatchObject({ strokes: 4 })
    })

    it('a foreign key (23503)', async () => {
      // Since 0026 the server names a hole's writer itself, so no body a phone sends reaches a foreign key: the
      // answer is the one PostgREST gives for one, and the outbox must still read it as a refusal (X04).
      server.decide = (req) =>
        isWrite(req) && (req.body as { hole: number }).hole === 7
          ? { status: 409, body: { code: '23503', details: null, hint: null, message: 'insert or update on table "scores" violates foreign key constraint "scores_entered_by_fkey"' } }
          : 'answer'
      await savedThenSent(
        () => enqueueScore('t1', holeScore('p2', 7, 5)),
        () => enqueueScore('t1', holeScore('p2', 6, 4)),
      )
      expect(rejected()).toEqual(['score:r1:p2:7'])
      expect(server.score('p2', 6)).toMatchObject({ strokes: 4 })
    })

    it('NOT NULL: a pick-up flag sent as null (23502)', async () => {
      await savedThenSent(
        () => enqueueScore('t1', { ...holeScore('p1', 7, 5), picked_up: null as unknown as boolean }),
        () => enqueueScore('t1', holeScore('p2', 6, 4)),
      )
      expect(rejected()).toEqual(['score:r1:p1:7'])
      expect(server.score('p2', 6)).toMatchObject({ strokes: 4 })
    })
  })

  describe('a value its column can’t take (a data exception: refused the same way every time it is sent)', () => {
    it.each([
      ['22P02, a hole that is no whole number', { hole: 7.5 }],
      ['22007, a client time that is no time', { client_ts: 'ayer' }],
      ['22003, strokes past the integer range', { strokes: 3_000_000_000 }],
      ['22008, a client time on 30 February', { client_ts: '2027-02-30T12:00:00Z' }],
      ['22009, a client time 16 hours off UTC', { client_ts: '2027-04-09T12:00:00+16:00' }],
    ])('%s', async (_name, value) => {
      const bad = { ...holeScore('p1', 7, 5), ...value }
      await savedThenSent(
        () => enqueueScore('t1', bad),
        () => enqueueScore('t1', holeScore('p2', 6, 4)),
      )
      expect(useOutbox.getState().rejected).toEqual([expect.objectContaining({ key: `score:r1:p1:${bad.hole}`, message: t.sync.errDenied })])
      expect(server.score('p2', 6)).toMatchObject({ strokes: 4 })
      expect(useOutbox.getState()).toMatchObject({ pending: 0, lastError: null })
    })

    it('22001, a value too long for its column', async () => {
      server.decide = (req) =>
        isWrite(req) && (req.body as { hole: number }).hole === 7
          ? { status: 400, body: { code: '22001', details: null, hint: null, message: 'value too long for type character varying(32)' } }
          : 'answer'
      await savedThenSent(
        () => enqueueScore('t1', holeScore('p1', 7, 5)),
        () => enqueueScore('t1', holeScore('p2', 6, 4)),
      )
      expect(useOutbox.getState().rejected).toEqual([expect.objectContaining({ key: 'score:r1:p1:7', message: t.sync.errDenied })])
      expect(server.score('p2', 6)).toMatchObject({ strokes: 4 })
    })
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
    playerInSecondGroup()
    server.tables.players = server.tables.players!.map((p) => (p.id === 'p1' ? { ...p, is_admin: true } : p))
    server.seed('hole_awards', [award({ group_id: 'g9', player_id: 'p9', decided_by: 'p9' })])
    await enqueueAward('t1', holeAward(5, ['p2']))
    await settle(useOutbox)
    expect(server.tables.hole_awards!.map((a) => `${a.group_id}:${a.player_id}`).sort()).toEqual(['g1:p2', 'g9:p9'])
  })

  // On the boards, while they wait on the phone: with no signal they stay queued however long the outbox runs.
  it('a queued «nadie» takes the old winners off the boards before it goes', async () => {
    phone.online = false
    await enqueueAward('t1', holeAward(5, []))
    await settle(useOutbox)
    const shown = boards([{ groupId: 'g1', hole: 5, gameId: 'closest', playerId: 'p3' }])
    overlayPending(shown)
    expect(shown.holeAwards).toEqual([])
  })

  it('queued winners leave on the boards the group’s winners of another contest on that hole, and of that contest on other holes', async () => {
    phone.online = false
    await enqueueAward('t1', holeAward(5, ['p2']))
    await settle(useOutbox)
    const shown = boards([
      { groupId: 'g1', hole: 5, gameId: 'longest', playerId: 'p4' },
      { groupId: 'g1', hole: 6, gameId: 'closest', playerId: 'p3' },
      { groupId: 'g1', hole: 5, gameId: 'closest', playerId: 'p3' },
    ])
    overlayPending(shown)
    expect(shown.holeAwards!.map((a) => `${a.gameId}:${a.hole}:${a.playerId}`).sort()).toEqual(['closest:5:p2', 'closest:6:p3', 'longest:5:p4'])
  })
})
