/** What a numeric box keeps of what is typed (NumberField.tsx); apart so that file exports components only (QA-15). */

/**
 * Keep only what could still become the number the person is aiming at: digits,
 * one leading minus when negatives are allowed, and one decimal separator when
 * decimals are. A comma types as a point, because both keypads offer one.
 *
 * In a whole-number field a separator is dropped rather than ending the number,
 * so pasting a formatted amount ("1,200") into a money box gives 1200. Typing
 * "12.5" into one is not a case worth optimising for.
 */
export function keepNumeric(raw: string, decimals: number, negative: boolean): string {
  let out = ''
  let seenPoint = false
  for (const ch of raw) {
    if (ch >= '0' && ch <= '9') out += ch
    else if (negative && ch === '-' && out === '') out += ch
    else if (decimals > 0 && (ch === '.' || ch === ',') && !seenPoint) {
      out += '.'
      seenPoint = true
    }
  }
  if (seenPoint) {
    const point = out.indexOf('.')
    out = out.slice(0, point + 1) + out.slice(point + 1, point + 1 + decimals)
  }
  return out
}
