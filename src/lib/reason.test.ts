/**
 * A reason as the database reads it (0028): trimmed of every whitespace
 * Postgres's `\s` matches and counted in characters. The set below is what
 * `chr(c) ~ '^\s$'` answered on the database harness (UTF-8, glibc): the
 * no-break spaces and U+FEFF are not whitespace there, though JavaScript's
 * own `trim` takes them.
 */
import { describe, expect, it } from 'vitest'
import { reasonLength, trimReason } from './reason'

const POSTGRES_SPACE = [0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x20, 0x1680, 0x2000, 0x2006, 0x2008, 0x200a, 0x2028, 0x2029, 0x205f, 0x3000]
const POSTGRES_NOT_SPACE = [0x1c, 0x85, 0xa0, 0x180e, 0x2007, 0x202f, 0xfeff]

describe('a reason as the server reads it', () => {
  it('trims at both ends what the database trims, and nothing else', () => {
    for (const c of POSTGRES_SPACE) expect(trimReason(`${String.fromCodePoint(c)}ab${String.fromCodePoint(c)}`), c.toString(16)).toBe('ab')
    for (const c of POSTGRES_NOT_SPACE) expect(trimReason(`${String.fromCodePoint(c)}ab`), c.toString(16)).toBe(`${String.fromCodePoint(c)}ab`)
    expect(trimReason('\t\t\t')).toBe('')
    expect(trimReason('Lo vio el Comité')).toBe('Lo vio el Comité')
    expect(trimReason(' a  b ')).toBe('a  b')
  })
  it('counts characters, not UTF-16 units', () => {
    expect(reasonLength('\u{1F3CC}\u{1F3CC}')).toBe(2)
    expect(reasonLength('día')).toBe(3)
  })
})
