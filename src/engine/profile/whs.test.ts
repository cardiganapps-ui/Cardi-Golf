import { describe, expect, it } from 'vitest'
import cases from './cases/whs.json'
import { courseHandicap, strokesReceived } from '../core/handicap'
import { adjustedGross, whsDiff10, type HoleIn } from '../testing/whs'
import { whsCourseHandicap, whsIndex10 } from './whs'

// The same file is run against the SQL functions by scripts/whs-parity.mjs, in the db job (ARCH-16).
describe('WHS arithmetic (shared cases)', () => {
  it.each(cases.diff)('differential $ags on $rating10/$slope → $expect10 ($why)', (c) => {
    expect(whsDiff10(c.ags, c.rating10, c.slope)).toBe(c.expect10)
  })
  it.each(cases.courseHcp)('course handicap of $index10 on $slope/$rating10 → $expect ($why)', (c) => {
    expect(whsCourseHandicap(c.index10, c.slope, c.rating10, c.par)).toBe(c.expect)
  })
  // ARCH-16: the tournament engine's course handicap is the same arithmetic, explained.
  it.each(cases.courseHcp)(
    'the engine reads the course handicap of $index10 on $slope/$rating10 as $expect too',
    (c) => {
      expect(courseHandicap(c.index10 / 10, { slope: c.slope, rating: c.rating10 / 10, par: c.par }).value).toBe(
        c.expect,
      )
    },
  )
  // One allocation in the product (MONEY-21): the engine's strokes received are the SQL's whs_strokes.
  it.each(cases.strokes)('course handicap $ch on SI $si → $expect strokes', (c) => {
    expect(strokesReceived(c.ch, c.si)).toBe(c.expect)
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
