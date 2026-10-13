/** Structural sharing for the boards (PERF-09): what reads the same comes back as the object the screens already hold. */
import { describe, expect, it } from 'vitest'
import { getFixture } from '../dev/fixtures'
import type { Snapshot } from '../engine/types'
import { same, shareList, shareSnapshot } from './share'

const snap = (): Snapshot => structuredClone(getFixture('full12-live')!.snapshot)

describe('same', () => {
  it('reads values: primitives by value, arrays in order, objects by their keys in any order', () => {
    expect(same(1, 1)).toBe(true)
    expect(same(NaN, NaN)).toBe(true)
    expect(same('a', 'b')).toBe(false)
    expect(same(null, undefined)).toBe(false)
    expect(same([1, 2], [1, 2])).toBe(true)
    expect(same([1, 2], [2, 1])).toBe(false)
    expect(same({ a: 1, b: { c: [1] } }, { b: { c: [1] }, a: 1 })).toBe(true)
    expect(same({ a: 1 }, { a: 1, b: undefined })).toBe(false)
    expect(same([], {})).toBe(false)
    expect(same({ a: null }, { a: 0 })).toBe(false)
  })
})

describe('shareList', () => {
  it('a list that reads the same is the previous list', () => {
    const prev = [{ id: 1 }, { id: 2 }]
    expect(shareList(prev, [{ id: 1 }, { id: 2 }])).toBe(prev)
  })

  it('one row changed: a new list, the changed row new, every other row the previous object', () => {
    const prev = [{ id: 1, v: 1 }, { id: 2, v: 1 }, { id: 3, v: 1 }]
    const next = [{ id: 1, v: 1 }, { id: 2, v: 2 }, { id: 3, v: 1 }]
    const out = shareList(prev, next)
    expect(out).not.toBe(prev)
    expect(out[0]).toBe(prev[0])
    expect(out[1]).toBe(next[1])
    expect(out[2]).toBe(prev[2])
  })

  it('a row added at the end keeps the rows before it', () => {
    const prev = [{ id: 1 }]
    const out = shareList(prev, [{ id: 1 }, { id: 2 }])
    expect(out).toHaveLength(2)
    expect(out[0]).toBe(prev[0])
  })
})

describe('shareSnapshot', () => {
  it('a snapshot built again from the same rows is the previous snapshot', () => {
    const prev = snap()
    expect(shareSnapshot(prev, snap())).toBe(prev)
  })

  it('one score changed: only the scores list and that row are new; every other table and the tournament row stay', () => {
    const prev = snap()
    const next = snap()
    const i = next.scores.findIndex((s) => s.strokes != null)
    next.scores[i] = { ...next.scores[i]!, strokes: next.scores[i]!.strokes! + 1 }
    const out = shareSnapshot(prev, next)
    expect(out).not.toBe(prev)
    expect(out.tournament).toBe(prev.tournament)
    expect(out.players).toBe(prev.players)
    expect(out.rounds).toBe(prev.rounds)
    expect(out.payments).toBe(prev.payments)
    expect(out.scores).not.toBe(prev.scores)
    expect(out.scores[i]).toBe(next.scores[i])
    expect(out.scores.filter((s, k) => k !== i && s === prev.scores[k])).toHaveLength(prev.scores.length - 1)
  })

  it('a table a snapshot lacks (an older build’s copy) is no reason to share it wrongly', () => {
    const prev = { ...snap(), moneyAdjustments: [] }
    const next = snap()
    delete next.moneyAdjustments
    const out = shareSnapshot(prev, next)
    expect(out).not.toBe(prev)
    expect('moneyAdjustments' in out).toBe(false)
  })

  it('nothing before: the snapshot as it came', () => {
    const next = snap()
    expect(shareSnapshot(null, next)).toBe(next)
  })
})
