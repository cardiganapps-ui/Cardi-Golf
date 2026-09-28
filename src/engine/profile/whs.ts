/**
 * World Handicap System arithmetic for the Polo index (profiles, migration
 * 0015). Everything is integer tenths so this file and the SQL functions of
 * the same names agree to the digit; `cases/whs.json` runs against both.
 * Half-way values round up (toward +∞), like `roundHalfUp` in the engine.
 */

/** floor(a / b) for integers, b > 0, exact for negatives too. */
const fdiv = (a: number, b: number) => Math.floor(a / b)

/** Strokes a course handicap gives on a hole of stroke index `si` (plus handicaps give strokes back on the easiest holes). */
export function whsStrokes(courseHcp: number, si: number): number {
  if (courseHcp >= 0) return Math.floor(courseHcp / 18) + (si <= courseHcp % 18 ? 1 : 0)
  return si > 18 + courseHcp ? -1 : 0
}

/** Course handicap = index × slope / 113 + (rating − par), half up. Index and rating in tenths. */
export function whsCourseHandicap(index10: number, slope: number, rating10: number, par: number): number {
  const num = index10 * slope + (rating10 - par * 10) * 113 // × 1130 of the real value
  return fdiv(2 * num + 1130, 2260)
}

/** Score differential in tenths: (AGS − rating) × 113 / slope, half up. */
export function whsDiff10(ags: number, rating10: number, slope: number): number {
  const num = (ags * 10 - rating10) * 113
  return fdiv(2 * num + slope, 2 * slope)
}

export interface HoleIn {
  par: number
  si: number
  strokes: number | null
  pickedUp: boolean
}

/**
 * Adjusted gross: each hole capped at net double bogey (par + 2 + strokes
 * received); a pick-up counts as net double bogey. Null when a hole is missing.
 */
export function adjustedGross(holes: HoleIn[], courseHcp: number): { ags: number; capped: number[] } | null {
  let ags = 0
  const capped: number[] = []
  for (const [i, h] of holes.entries()) {
    const ndb = h.par + 2 + whsStrokes(courseHcp, h.si)
    if (h.pickedUp) {
      ags += ndb
      capped.push(i)
    } else if (h.strokes == null) return null
    else if (h.strokes > ndb) {
      ags += ndb
      capped.push(i)
    } else ags += h.strokes
  }
  return { ags, capped }
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
  return { index10: Math.min(avg10 + rule.adjust10, WHS_CAP10), used: used.sort((a, b) => a - b), considered: recent.length }
}

/** Tenths → the number shown ("12.4"). */
export const fromTenths = (t: number) => t / 10
