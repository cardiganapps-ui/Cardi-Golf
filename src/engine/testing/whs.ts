/**
 * The TS readings of the Polo index's SQL that no screen runs (ARCH-19): the
 * score differential (`whs_diff10`) and the adjusted gross that
 * `refresh_round_results` sums. They live with the test builders so no build
 * ships them; whs.test.ts holds them to cases/whs.json, which the db job
 * holds the SQL to (scripts/whs-parity.mjs).
 */
import { strokesReceived } from '../core/handicap'
import { fdiv } from '../profile/whs'

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
    const ndb = h.par + 2 + strokesReceived(courseHcp, h.si)
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
