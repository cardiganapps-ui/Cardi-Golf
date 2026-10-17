/**
 * A player's monogram when he has no photo (VIS-18): his initials on a tint of his own. Entrar showed twelve
 * identical grey discs (three «M», two «R»), and «Jugador 12» became «J1».
 */

/** How many tints there are (`--mono-1` … in tokens.css). */
export const MONOGRAM_TONES = 6

/**
 * The letters a face shows: the first letter of each of the first two words («Diego A.» is «DA»), or the
 * number of a placeholder name («Jugador 12» is «12», never «J1»).
 */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  const number = /^\d+$/.test(words.at(-1) ?? '') ? words.at(-1)! : null
  if (number) return number.slice(0, 3)
  return words
    .map((w) => Array.from(w).find((c) => /\p{L}|\p{N}/u.test(c)) ?? '')
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toLocaleUpperCase('es-MX')
}

/** The player's tint, 1 to MONOGRAM_TONES, the same on every phone for the same seed (his id): FNV-1a. */
export function monogramTone(seed: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return (h % MONOGRAM_TONES) + 1
}
