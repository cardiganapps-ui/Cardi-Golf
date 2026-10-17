/** VIS-18: a face's letters and its tint. */
import { describe, expect, it } from 'vitest'
import { initials, monogramTone, MONOGRAM_TONES } from './monogram'

describe('initials (VIS-18)', () => {
  it.each([
    ['Diego A.', 'DA'],
    ['Justo Fernández Del Valle', 'JF'],
    ['Ángel', 'Á'],
    ['  rené   nosti ', 'RN'],
    ['Jugador 12', '12'],
    ['Jugador 3', '3'],
    ['(Invitado) Iván', 'II'],
    ['', ''],
  ])('%s → %s', (name, want) => expect(initials(name)).toBe(want))
})

describe('monogramTone (VIS-18)', () => {
  it('is the same for the same seed, and within the tints', () => {
    for (const seed of ['p1', 'p2', 'abc', '']) {
      expect(monogramTone(seed)).toBe(monogramTone(seed))
      expect(monogramTone(seed)).toBeGreaterThanOrEqual(1)
      expect(monogramTone(seed)).toBeLessThanOrEqual(MONOGRAM_TONES)
    }
  })
  it('spreads twelve players over the tints', () => {
    const tones = new Set(Array.from({ length: 12 }, (_, i) => monogramTone(`p${i + 1}`)))
    expect(tones.size).toBeGreaterThanOrEqual(5)
  })
})
