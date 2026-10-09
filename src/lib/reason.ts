/**
 * A reason as the database reads it (resolve_rejected_write, 0028): trimmed
 * of whitespace at both ends, every kind the database's `\s` matches (tabs
 * and newlines, not only spaces), and counted in characters, not in UTF-16
 * units (two golfers are two characters, not four).
 *
 * The set is what Postgres's `\s` matches under the server's UTF-8 locale
 * (glibc's iswspace): the ASCII ones, the Unicode spaces, the line and
 * paragraph separators, but not the no-break spaces (U+00A0, U+2007,
 * U+202F) nor U+FEFF, which JavaScript's own `\s` would take too.
 */
const SPACE = '[\\t\\n\\v\\f\\r \\u1680\\u2000-\\u2006\\u2008-\\u200a\\u2028\\u2029\\u205f\\u3000]'
const ENDS = new RegExp(`^${SPACE}+|${SPACE}+$`, 'g')

export const trimReason = (s: string): string => s.replace(ENDS, '')
/** Characters (code points), as Postgres's char_length counts them. */
export const reasonLength = (s: string): number => [...s].length
