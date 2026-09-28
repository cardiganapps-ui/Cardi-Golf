import { describe, expect, it } from 'vitest'
import cases from './cases/whs.json'
import { adjustedGross, whsCourseHandicap, whsDiff10, whsIndex10, whsStrokes, type HoleIn } from './whs'

// The same file is run against the SQL functions by scripts/rls-test.mjs.
describe('WHS arithmetic (shared cases)', () => {
  it.each(cases.diff)('differential $ags on $rating10/$slope → $expect10 ($why)', (c) => {
    expect(whsDiff10(c.ags, c.rating10, c.slope)).toBe(c.expect10)
  })
  it.each(cases.courseHcp)('course handicap of $index10 on $slope/$rating10 → $expect ($why)', (c) => {
    expect(whsCourseHandicap(c.index10, c.slope, c.rating10, c.par)).toBe(c.expect)
  })
  it.each(cases.strokes)('course handicap $ch on SI $si → $expect strokes', (c) => {
    expect(whsStrokes(c.ch, c.si)).toBe(c.expect)
  })
  it.each(cases.index)('index of $diffs10 → $expect10 ($why)', (c) => {
    const r = whsIndex10(c.diffs10)
    expect(r.index10).toBe(c.expect10)
    expect(r.used).toEqual(c.used)
  })
})

describe('adjusted gross (net double bogey)', () => {
  const par4 = (si: number, strokes: number | null, pickedUp = false): HoleIn => ({ par: 4, si, strokes, pickedUp })
  it('caps a hole at par + 2 + strokes received and counts a pick-up as that cap', () => {
    // Course handicap 18: one stroke everywhere, so the cap on a par 4 is 7.
    const holes = [par4(1, 9), par4(2, 5), par4(3, null, true), ...Array.from({ length: 15 }, (_, i) => par4(i + 4, 5))]
    const r = adjustedGross(holes, 18)!
    // 7 (9 capped) + 5 + 7 (pick-up) + 15 × 5 = 94
    expect(r.ags).toBe(94)
    expect(r.capped).toEqual([0, 2])
  })
  it('a scratch player caps at double bogey; a missing hole means no adjusted gross', () => {
    expect(adjustedGross([par4(1, 8)], 0)!.ags).toBe(6)
    expect(adjustedGross([par4(1, 5), par4(2, null)], 0)).toBeNull()
  })
})
