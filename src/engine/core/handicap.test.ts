import { describe, expect, it } from 'vitest'
import { FIRST_TOURNAMENT_SETTINGS } from '../settings/presets'
import { courseHandicap, estimateIndex, nextRoundCut, playingHandicap, strokesReceived } from './handicap'

const H = FIRST_TOURNAMENT_SETTINGS.handicap
const CUT = FIRST_TOURNAMENT_SETTINGS.day2Cut

describe('playing handicap (80%, round half up, cap 54)', () => {
  it.each([
    [14, 11],
    [25, 20],
    [33, 26],
    [21.875, 18],
    [50, 40],
    [54, 43],
    [60, 43],
  ])('base %s → PH %s', (base, ph) => {
    expect(playingHandicap(base, H).value).toBe(ph)
  })

  it('explains the cap and the rounding', () => {
    const r = playingHandicap(60, H)
    expect(r.why.steps.join(' | ')).toContain('tope 54')
    expect(r.why.steps.join(' | ')).toContain('80% de 54 = 43.2')
  })
})

describe('strokes received', () => {
  it('PH 0 → 0 on every hole', () => {
    for (let si = 1; si <= 18; si++) expect(strokesReceived(0, si)).toBe(0)
  })
  it('PH 16 → 1 on SI 1–16, 0 on SI 17–18', () => {
    for (let si = 1; si <= 16; si++) expect(strokesReceived(16, si)).toBe(1)
    expect(strokesReceived(16, 17)).toBe(0)
    expect(strokesReceived(16, 18)).toBe(0)
  })
  it('PH 18 → 1 on every hole', () => {
    for (let si = 1; si <= 18; si++) expect(strokesReceived(18, si)).toBe(1)
  })
  it('PH 43 → 3 on SI 1–7, 2 on SI 8–18', () => {
    for (let si = 1; si <= 7; si++) expect(strokesReceived(43, si)).toBe(3)
    for (let si = 8; si <= 18; si++) expect(strokesReceived(43, si)).toBe(2)
  })
})

describe('Day 2 cut', () => {
  it.each([
    [35, 0],
    [36, 0],
    [37, 0],
    [38, 1],
    [39, 1],
    [40, 2],
    [42, 3],
    [44, 4],
    [47, 4],
  ])('P1 %s → cut %s', (p1, cut) => {
    expect(nextRoundCut(p1, CUT).value).toBe(cut)
  })
  it('PH1 16, P1 42 → PH2 13', () => {
    expect(Math.max(0, 16 - nextRoundCut(42, CUT).value)).toBe(13)
  })
  it('PH1 2, P1 44 → PH2 0 (floor at 0)', () => {
    expect(Math.max(0, 2 - nextRoundCut(44, CUT).value)).toBe(0)
  })
})

describe('course handicap (WHS, §13b-D)', () => {
  it('index 8.1, slope 128, rating 71.2, par 72 → 8', () => {
    expect(courseHandicap(8.1, { slope: 128, rating: 71.2, par: 72 }).value).toBe(8)
  })
  it('index 20 on slope 113 rating 72 par 72 → 20', () => {
    expect(courseHandicap(20, { slope: 113, rating: 72, par: 72 }).value).toBe(20)
  })
  it('a tee without rating/slope leaves the index unchanged', () => {
    expect(courseHandicap(17, { slope: null, rating: null, par: 72 }).value).toBe(17)
  })
})

describe('three-score estimate (§13b-E)', () => {
  it('(75, 82, 90) on 72.0 / 113 → 3.0 / 10.0 / 18.0 → 8.05 → 8.1', () => {
    const r = estimateIndex(
      [
        { gross: 75, rating: 72, slope: 113, par: 72 },
        { gross: 82, rating: 72, slope: 113, par: 72 },
        { gross: 90, rating: 72, slope: 113, par: 72 },
      ],
      H,
    )
    expect(r.differentials).toEqual([3, 10, 18])
    expect(r.value).toBe(8.1)
    expect(r.assumed).toBe(false)
  })
  it('the same scores on 71.2 / 128 → 3.35 / 9.53 / 16.60 → 7.81 → 7.8', () => {
    const r = estimateIndex(
      [
        { gross: 75, rating: 71.2, slope: 128, par: 72 },
        { gross: 82, rating: 71.2, slope: 128, par: 72 },
        { gross: 90, rating: 71.2, slope: 128, par: 72 },
      ],
      H,
    )
    expect(r.differentials).toEqual([3.35, 9.53, 16.6])
    expect(r.value).toBe(7.8)
  })
  it('(98, 105, 115) with par-72 defaults → 26 / 33 / 43 → 31.35 → 31.4, flagged as assumed', () => {
    const r = estimateIndex([{ gross: 98 }, { gross: 105 }, { gross: 115 }], H)
    expect(r.differentials).toEqual([26, 33, 43])
    expect(r.value).toBe(31.4)
    expect(r.assumed).toBe(true)
  })
  it('(120, 130, 140) → capped at 54', () => {
    expect(estimateIndex([{ gross: 120 }, { gross: 130 }, { gross: 140 }], H).value).toBe(54)
  })
  it('scores in the wrong order are sorted silently and flagged', () => {
    const r = estimateIndex([{ gross: 90 }, { gross: 75 }, { gross: 82 }], H)
    expect(r.value).toBe(8.1)
    expect(r.reordered).toBe(true)
  })
})
