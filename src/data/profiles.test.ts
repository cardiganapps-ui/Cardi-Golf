import { describe, expect, it } from 'vitest'
import { formatIndex, handleOk, indexBreakdown, parseIndex } from './profiles'
import { PROFILE_FIXTURES } from '../dev/profileFixtures'

describe('profile helpers', () => {
  it('reads a typed index: plus handicaps with a sign, a comma as the decimal point, one decimal', () => {
    expect(parseIndex('12.4')).toBe(12.4)
    expect(parseIndex('12,4')).toBe(12.4)
    expect(parseIndex('+1.2')).toBe(-1.2) // plus handicap, stored negative
    expect(parseIndex('−0.8')).toBe(-0.8) // a true minus sign works too
    expect(parseIndex('8.06')).toBe(8.1)
    expect(parseIndex('54')).toBe(54)
    expect(parseIndex('54.1')).toBeNull() // above the cap
    expect(parseIndex('+10.5')).toBeNull() // below −10
    expect(parseIndex('')).toBeNull()
    expect(parseIndex('doce')).toBeNull()
  })

  it('shows an index the way golfers write it', () => {
    expect(formatIndex(12.4)).toBe('12.4')
    expect(formatIndex(8)).toBe('8.0')
    expect(formatIndex(-1.2)).toBe('+1.2')
    expect(formatIndex(null)).toBe('—')
  })

  it('explains the index from the rounds: practice and incomplete rounds are left out, the best ones marked', () => {
    const b = indexBreakdown(PROFILE_FIXTURES.yo!.rounds!)
    expect(b.considered).toHaveLength(14)
    expect(b.considered.some((x) => x.round.practice || x.round.differential == null)).toBe(false)
    expect(b.count).toBe(4)
    expect(b.index10).toBe(124) // (11.8 + 12.2 + 12.6 + 13.0) / 4 = 12.4, the card's index
    expect(b.considered.filter((x) => x.used).map((x) => x.round.differential)).toEqual([11.8, 12.2, 12.6, 13])
  })

  it('checks handles like handle_ok() in the database (format; reserved words are the server’s)', () => {
    for (const ok of ['nico', 'nicolas.castro', 'diego_a', 'a1b', 'x'.repeat(20)]) expect(handleOk(ok), ok).toBe(true)
    for (const bad of ['ab', 'x'.repeat(21), '.nico', 'nico.', '_nico', 'ni..co', 'ni._co', 'Nico', 'ni co', 'niño', '@nico']) expect(handleOk(bad), bad).toBe(false)
  })
})
