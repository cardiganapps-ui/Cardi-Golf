/**
 * Writing one hole (ARCH-14): a group's phone sends it as one save of only what changed (REL-05), the Comité's
 * correction where a phone may not write goes to the server in one call (REL-22), another group's card keeps
 * the direct write, and the snake's answer and the contest winners go with the hole on screen. Every write
 * starts at the call, before anything waits (PERF-10).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const calls = vi.hoisted(() => [] as Array<[string, unknown]>)
vi.mock('../../../data/outbox', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../data/outbox')>()),
  enqueueHole: vi.fn(async (_tid: string, h: unknown) => void calls.push(['hole', h])),
  enqueueScore: vi.fn(async (_tid: string, s: unknown) => void calls.push(['score', s])),
  enqueueAward: vi.fn(async (_tid: string, a: unknown) => void calls.push(['award', a])),
  enqueueTiebreak: vi.fn(async (_tid: string, tb: unknown) => void calls.push(['tiebreak', tb])),
}))
vi.mock('../../../data/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../data/api')>()),
  adminSaveHole: vi.fn(
    async (_round: string, hole: number, rows: unknown, reason: string | null) =>
      void calls.push(['admin', { hole, rows, reason }]),
  ),
}))

import { adminSaveHole } from '../../../data/api'
import type { HoleFields } from '../../../data/outbox'
import type { Draft } from '../tarjetaDrafts'
import { writeHole, type HoleWriter } from './writeHole'

const d = (strokes: number, putts = 2, pickedUp = false): Draft => ({ strokes, putts, pickedUp })
const rows: Record<string, HoleFields> = { a: { strokes: 5, putts: 2, picked_up: false } }
const writer = (o: Partial<HoleWriter> = {}): HoleWriter => ({
  tournamentId: 't1',
  roundId: 'r1',
  groupId: 'g1',
  playerIds: ['a', 'b'],
  groupPlayerIds: ['a', 'b'],
  myPlayerId: 'a',
  viaServer: () => false,
  rowOf: (pid) => rows[pid] ?? {},
  parOf: (pid) => (pid === 'b' ? 5 : 4),
  holeOnScreen: 7,
  awards: [],
  reason: '',
  ...o,
})

beforeEach(() => {
  calls.length = 0
})

describe('writeHole', () => {
  it('a phone of the group: one save of the hole, each player over the row it saw, with only what changed', async () => {
    await writeHole(writer(), { a: d(5, 3), b: d(5) }, 7, { auto: new Set(['b']) })
    expect(calls).toEqual([
      [
        'hole',
        {
          round_id: 'r1',
          hole: 7,
          entered_by: 'a',
          entries: [
            {
              player_id: 'a',
              fields: { putts: 3 },
              base: rows.a,
              auto: false,
              dflt: { strokes: 4, putts: 2, picked_up: false },
            },
            // His default is par for his own tee: a par 5 here.
            {
              player_id: 'b',
              fields: { strokes: 5, putts: 2 },
              base: {},
              auto: true,
              dflt: { strokes: 5, putts: 2, picked_up: false },
            },
          ],
        },
      ],
    ])
  })

  it('what the phone saw at the first touch is the base, not the boards now', async () => {
    await writeHole(writer(), { a: d(6) }, 7, { seen: new Map([['a', {}]]) })
    expect(calls[0]).toMatchObject([
      'hole',
      { entries: [{ player_id: 'a', base: {}, fields: { strokes: 6, putts: 2 } }] },
    ])
  })

  it('the Comité outside the group writes each player directly, as before (0026)', async () => {
    await writeHole(writer({ myPlayerId: 'z' }), { a: d(4), b: d(1, 0, true) }, 7)
    expect(
      calls.map(([k, v]) => [
        k,
        (v as { player_id: string; strokes: number | null; entered_by: string }).player_id,
        (v as { strokes: number | null }).strokes,
      ]),
    ).toEqual([
      ['score', 'a', 4],
      ['score', 'b', null],
    ])
  })

  it('a correction on the server: the whole hole in one call, with the reason trimmed, and nothing through the outbox (REL-22)', async () => {
    await writeHole(writer({ viaServer: () => true, reason: '  firmó mal  ' }), { a: d(4), b: d(6, 3) }, 7)
    expect(calls).toEqual([
      [
        'admin',
        {
          hole: 7,
          rows: [
            { player_id: 'a', strokes: 4, putts: 2, picked_up: false },
            { player_id: 'b', strokes: 6, putts: 3, picked_up: false },
          ],
          reason: 'firmó mal',
        },
      ],
    ])
  })

  it('a refused correction is the call’s refusal, after the phone’s own writes went', async () => {
    vi.mocked(adminSaveHole).mockRejectedValueOnce(new Error('Failed to fetch'))
    await expect(
      writeHole(writer({ viaServer: () => true, awards: [{ gameId: 'cp', playerIds: ['a'] }] }), { a: d(4) }, 7, {
        lastHoled: 'a',
      }),
    ).rejects.toThrow('Failed to fetch')
    expect(calls.map(([k]) => k)).toEqual(['award', 'tiebreak'])
  })

  it('the snake’s answer goes with the hole; «No sabemos» sends none, and the Comité decides (UX-08)', async () => {
    await writeHole(writer(), { a: d(5, 3), b: d(5, 3) }, 7, { lastHoled: 'b' })
    expect(calls.map(([k]) => k)).toEqual(['hole', 'tiebreak'])
    expect(calls[1]![1]).toEqual({
      round_id: 'r1',
      group_id: 'g1',
      hole: 7,
      last_holed_player_id: 'b',
      decided_by: 'a',
    })
    calls.length = 0
    await writeHole(writer(), { a: d(5, 3), b: d(5, 3) }, 7)
    expect(calls.map(([k]) => k)).toEqual(['hole'])
  })

  it('the contest winners picked go with the hole on screen only; an undo of another hole carries none', async () => {
    const awards = [{ gameId: 'cp', playerIds: ['b'] }]
    await writeHole(writer({ awards }), { a: d(4) }, 7)
    expect(calls.map(([k]) => k)).toEqual(['hole', 'award'])
    expect(calls[1]![1]).toEqual({
      round_id: 'r1',
      group_id: 'g1',
      hole: 7,
      game_id: 'cp',
      player_ids: ['b'],
      decided_by: 'a',
    })
    calls.length = 0
    await writeHole(writer({ awards }), { a: d(4) }, 6)
    expect(calls.map(([k]) => k)).toEqual(['hole'])
  })

  it('every write starts at the call, before anything waits: the boards wait for `settle`, the storage does not', async () => {
    let settled = false
    const settle = new Promise<void>((r) =>
      setTimeout(() => {
        settled = true
        r()
      }, 0),
    )
    const done = writeHole(writer(), { a: d(4) }, 7, { settle, lastHoled: 'a' })
    expect(calls.map(([k]) => k)).toEqual(['hole', 'tiebreak'])
    expect(settled).toBe(false)
    await done
  })
})
