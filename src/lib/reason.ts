/**
 * A reason as the database reads it (resolve_rejected_write, 0028): trimmed
 * at both ends of every whitespace (tabs and newlines, not only spaces) and
 * of the no-break and zero-width spaces, and counted in characters, not in
 * UTF-16 units (two golfers are two characters, not four).
 *
 * The set is spelled out the same way in the migration, not left to `\s`:
 * Postgres's `\s` follows the server's locale and leaves the no-break spaces
 * (U+00A0, U+2007, U+202F) and U+FEFF out, so a reason of three of them would
 * have counted as three letters there.
 */
const SPACE = '[\\t\\n\\v\\f\\r \\u0085\\u00a0\\u1680\\u180e\\u2000-\\u200b\\u2028\\u2029\\u202f\\u205f\\u2060\\u3000\\ufeff]'
const ENDS = new RegExp(`^${SPACE}+|${SPACE}+$`, 'g')

export const trimReason = (s: string): string => s.replace(ENDS, '')
/** Characters (code points), as Postgres's char_length counts them. */
export const reasonLength = (s: string): number => [...s].length
