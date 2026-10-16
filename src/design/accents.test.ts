/**
 * VIS-09: a tournament stores its accent's hex. The curated set changed on
 * 2026-10-16; one that stored a value of the first set keeps its accent's
 * name, and any other value maps to the nearest as people see color (OKLab),
 * never by RGB distance, which sent a club green to Pizarra.
 */
import { describe, expect, it } from 'vitest'
import { ACCENTS, DEFAULT_ACCENT, LEGACY, nearestAccent } from './accents'

describe('nearestAccent', () => {
  it('reads every curated value as itself, in any case', () => {
    for (const a of ACCENTS) {
      expect(nearestAccent(a.hex)).toBe(a)
      expect(nearestAccent(a.hex.toUpperCase())).toBe(a)
    }
  })
  it('keeps the name of a value from the first set', () => {
    expect(Object.keys(LEGACY)).toHaveLength(5)
    for (const [hex, id] of Object.entries(LEGACY)) expect(nearestAccent(hex).id, hex).toBe(id)
    expect(nearestAccent('#2B5B8C').name).toBe('Agua')
  })
  it('maps a free value to the one that looks nearest', () => {
    // The Ensayo's old teal is Agua (DESIGN_NOTES.md); friends8's club green is Fairway, not slate.
    expect(nearestAccent('#0f6e77').id).toBe('agua')
    expect(nearestAccent('#3f6b4f').id).toBe('fairway')
    expect(nearestAccent('#7a2a6a').id).toBe('vino')
    expect(nearestAccent('#e07a1f').id).toBe('atardecer')
  })
  it('falls back to Fairway on nothing or nonsense', () => {
    for (const v of [null, undefined, '', 'teal', '#12', 'rgb(0,0,0)']) expect(nearestAccent(v)).toBe(DEFAULT_ACCENT)
  })
})
