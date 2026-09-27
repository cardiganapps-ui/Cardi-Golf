import { describe, expect, it } from 'vitest'
import { strokesReceived } from './handicap'
import { stablefordPoints } from './stableford'

describe('Stableford points', () => {
  it('par 4, SI 3, PH 16 (1 stroke): gross 4 → 3 · 5 → 2 · 6 → 1 · 7 → 0', () => {
    const sr = strokesReceived(16, 3)
    expect(sr).toBe(1)
    expect(stablefordPoints(4, sr, 4, false)).toBe(3)
    expect(stablefordPoints(4, sr, 5, false)).toBe(2)
    expect(stablefordPoints(4, sr, 6, false)).toBe(1)
    expect(stablefordPoints(4, sr, 7, false)).toBe(0)
  })
  it('par 4, SI 3, PH 43 (3 strokes): gross 5 → 4 · 7 → 2 · 9 → 0', () => {
    const sr = strokesReceived(43, 3)
    expect(sr).toBe(3)
    expect(stablefordPoints(4, sr, 5, false)).toBe(4)
    expect(stablefordPoints(4, sr, 7, false)).toBe(2)
    expect(stablefordPoints(4, sr, 9, false)).toBe(0)
  })
  it('par 3, SI 18, PH 16 (0 strokes): gross 2 → 3', () => {
    const sr = strokesReceived(16, 18)
    expect(sr).toBe(0)
    expect(stablefordPoints(3, sr, 2, false)).toBe(3)
  })
  it('any hole picked up → 0', () => {
    expect(stablefordPoints(4, 3, 3, true)).toBe(0)
    expect(stablefordPoints(5, 0, null, true)).toBe(0)
  })
})
