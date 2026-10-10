/**
 * A reason as the database reads it (0028): trimmed at both ends of the set
 * the migration spells out, and counted in characters. The set below is what
 * `chr(c) ~ '^[…]$'` answers on the database harness for that class, over
 * every code point: whitespace, the no-break spaces, the zero-width ones and
 * U+FEFF. Nothing else is trimmed (a control character like U+001C stays).
 */
import { describe, expect, it } from 'vitest'
import { reasonLength, trimReason } from './reason'

const TRIMMED = [
  0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x20, 0x85, 0xa0, 0x1680, 0x180e, 0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006, 0x2007, 0x2008, 0x2009, 0x200a, 0x200b, 0x2028, 0x2029,
  0x202f, 0x205f, 0x2060, 0x3000, 0xfeff,
]
const KEPT = [0x1c, 0x1f, 0x200c, 0x200d, 0x2061, 0xe000]

describe('a reason as the server reads it', () => {
  it('trims at both ends what the database trims, and nothing else', () => {
    for (const c of TRIMMED) expect(trimReason(`${String.fromCodePoint(c)}ab${String.fromCodePoint(c)}`), c.toString(16)).toBe('ab')
    for (const c of KEPT) expect(trimReason(`${String.fromCodePoint(c)}ab`), c.toString(16)).toBe(`${String.fromCodePoint(c)}ab`)
    expect(trimReason('\t\t\t')).toBe('')
    expect(trimReason('Lo vio el Comité')).toBe('Lo vio el Comité')
    expect(trimReason(' a  b ')).toBe('a  b')
  })
  it('a reason of no-break spaces is blank', () => {
    expect(trimReason('   ')).toBe('')
    expect(trimReason(' ab ​﻿')).toBe('ab')
  })
  it('counts characters, not UTF-16 units', () => {
    expect(reasonLength('\u{1F3CC}\u{1F3CC}')).toBe(2)
    expect(reasonLength('día')).toBe(3)
  })
})
