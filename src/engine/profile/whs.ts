/**
 * World Handicap System arithmetic for the Polo index (profiles, migration
 * 0015). Everything is integer tenths so this file and the SQL functions of
 * the same names agree to the digit; `cases/whs.json` runs against both (the
 * TS in whs.test.ts, the SQL in the db job: scripts/whs-parity.mjs, ARCH-16).
 * Half-way values round up (toward +∞), like `roundHalfUp` in the engine.
 *
 * The rest of the SQL's arithmetic has one TS reading each, where the app
 * uses it: the strokes a handicap gives on a hole are the engine's own
 * `strokesReceived` (core/handicap.ts, plus handicaps included, MONEY-21),
 * and the course handicap here is the one `courseHandicap` explains. The
 * differential and the adjusted gross run in SQL only (`refresh_round_results`);
 * their TS readings, for the shared cases, are in src/engine/testing/whs.ts.
 */

/** floor(a / b) for integers, b > 0, exact for negatives too. */
export const fdiv = (a: number, b: number) => Math.floor(a / b)

/** Course handicap = index × slope / 113 + (rating − par), half up. Index and rating in tenths. */
export function whsCourseHandicap(index10: number, slope: number, rating10: number, par: number): number {
  const num = index10 * slope + (rating10 - par * 10) * 113 // × 1130 of the real value
  return fdiv(2 * num + 1130, 2260)
}

/** How many of the latest differentials count, and the adjustment, by how many there are (WHS table). */
export function whsRule(n: number): { count: number; adjust10: number } | null {
  if (n < 3) return null
  if (n === 3) return { count: 1, adjust10: -20 }
  if (n === 4) return { count: 1, adjust10: -10 }
  if (n === 5) return { count: 1, adjust10: 0 }
  if (n === 6) return { count: 2, adjust10: -10 }
  if (n <= 8) return { count: 2, adjust10: 0 }
  if (n <= 11) return { count: 3, adjust10: 0 }
  if (n <= 14) return { count: 4, adjust10: 0 }
  if (n <= 16) return { count: 5, adjust10: 0 }
  if (n <= 18) return { count: 6, adjust10: 0 }
  if (n === 19) return { count: 7, adjust10: 0 }
  return { count: 8, adjust10: 0 }
}

export const WHS_CAP10 = 540

/**
 * The index from differentials in tenths, newest first (only the latest 20
 * are read). `used` are the positions (in the input) of the ones averaged.
 */
export function whsIndex10(diffsNewestFirst: number[]): { index10: number | null; used: number[]; considered: number } {
  const recent = diffsNewestFirst.slice(0, 20)
  const rule = whsRule(recent.length)
  if (!rule) return { index10: null, used: [], considered: recent.length }
  // Lowest first; on equal values the newer one counts (stable by position).
  const order = recent.map((d, i) => ({ d, i })).sort((a, b) => a.d - b.d || a.i - b.i)
  const used = order.slice(0, rule.count).map((x) => x.i)
  const sum = order.slice(0, rule.count).reduce((s, x) => s + x.d, 0)
  const avg10 = fdiv(2 * sum + rule.count, 2 * rule.count)
  return {
    index10: Math.min(avg10 + rule.adjust10, WHS_CAP10),
    used: used.sort((a, b) => a - b),
    considered: recent.length,
  }
}
