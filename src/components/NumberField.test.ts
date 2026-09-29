/**
 * What a half-typed number is allowed to look like. Every case here is a
 * keystroke sequence that the old inputs destroyed.
 */
import { describe, expect, it } from 'vitest'
import { keepNumeric } from './NumberField'

const whole = (raw: string) => keepNumeric(raw, 0, false)
const oneDp = (raw: string) => keepNumeric(raw, 1, false)
const signed = (raw: string) => keepNumeric(raw, 0, true)

describe('keepNumeric', () => {
  it('keeps digits and drops anything that is not one', () => {
    expect(whole('12')).toBe('12')
    expect(whole('1a2')).toBe('12')
    expect(whole('$1 200')).toBe('1200')
  })

  it('lets the box go empty, so a value can be cleared and retyped', () => {
    expect(whole('')).toBe('')
  })

  it('treats a separator in a whole-number field as grouping, not a decimal', () => {
    // Pasting a formatted amount into an integer money field is the common case;
    // typing "12.5" into one is not, so grouping wins.
    expect(whole('1,200')).toBe('1200')
    expect(whole('1.200')).toBe('1200')
  })

  it('holds a trailing point while a decimal is being typed', () => {
    expect(oneDp('12')).toBe('12')
    expect(oneDp('12.')).toBe('12.')
    expect(oneDp('12.5')).toBe('12.5')
  })

  it('accepts a comma as the decimal separator, because both keypads offer one', () => {
    expect(oneDp('12,5')).toBe('12.5')
  })

  it('keeps only one separator and only as many decimals as allowed', () => {
    expect(oneDp('12.5.7')).toBe('12.5')
    expect(oneDp('12.57')).toBe('12.5')
    expect(keepNumeric('12.579', 2, false)).toBe('12.57')
  })

  it('allows a lone minus only where negatives are allowed, and only in front', () => {
    expect(signed('-')).toBe('-')
    expect(signed('-5')).toBe('-5')
    expect(signed('5-')).toBe('5')
    expect(whole('-5')).toBe('5')
  })

  it('survives the keystroke sequence that broke the old field', () => {
    // A max=10 field: typing "1" then "2" used to clamp to 10, rewrite the text
    // to "10" mid-typing, and append the next keystroke onto it ("103").
    // The parser holds what was typed; clamping is the caller's business.
    expect(whole('1')).toBe('1')
    expect(whole('12')).toBe('12')
  })
})
