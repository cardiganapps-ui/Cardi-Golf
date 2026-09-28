import { describe, expect, it } from 'vitest'
import { currentHole, lastPlayedHole } from './holes'
import { t } from '../i18n/es-MX'

const holes = (played: number[]) => Array.from({ length: 18 }, (_, i) => ({ hole: i + 1, played: played.includes(i + 1) }))

describe('holes in play order', () => {
  it('start hole 10: hole 2 comes after hole 18', () => {
    const h = holes([10, 11, 12, 13, 14, 15, 16, 17, 18, 1, 2])
    expect(lastPlayedHole(h, 10)?.hole).toBe(2)
    expect(currentHole(h, 10)).toBe(3)
  })
  it('start hole 1: the highest played hole', () => {
    const h = holes([1, 2, 3])
    expect(lastPlayedHole(h, 1)?.hole).toBe(3)
    expect(currentHole(h, 1)).toBe(4)
    expect(lastPlayedHole(holes([]), 1)).toBeNull()
    expect(currentHole(holes([]), 10)).toBe(10)
  })
  it('a complete round sits on its last hole', () => {
    const all = holes(Array.from({ length: 18 }, (_, i) => i + 1))
    expect(currentHole(all, 10)).toBe(9)
    expect(currentHole(holes(Array.from({ length: 9 }, (_, i) => i + 1)), 1, 9)).toBe(9)
  })
})

describe('t.round.thru', () => {
  it('shows F only at the round length', () => {
    expect(t.round.thru(18)).toBe('F')
    expect(t.round.thru(9)).toBe('9')
    expect(t.round.thru(9, 9)).toBe('F')
    expect(t.round.thru(36, 36)).toBe('F')
    expect(t.round.thru(0)).toBe('0')
  })
})
