/**
 * Handicaps (CLAUDE.md §5.2, §13b-D/E). Pure functions; every result
 * carries its explanation for "¿Cómo se calculó?".
 */
import { whsCourseHandicap } from '../profile/whs'
import type { TournamentSettings } from '../settings/schema'
import { msg, say, type Msg } from '../messages'
import type { Explained } from '../types'
import { roundHalfUp, roundTo, roundWith } from './rounding'

type HandicapSettings = TournamentSettings['handicap']
type CutSettings = TournamentSettings['day2Cut']

/**
 * Playing handicap from a course handicap: cap, then allowance, then rounding.
 *   base 14 → 11.2 → 11 · base 21.875 → 17.5 → 18 · base 60 → capped 54 → 43
 * A plus handicap stays below zero (MONEY-21): −1.2 → −1, one stroke given
 * back on the easiest hole, as WHS allocates it and as the Polo index reads
 * the same round (`whs_strokes`, 0015). It used to stop at 0, so a plus
 * player played off scratch in every net game.
 */
export function playingHandicap(courseHcp: number, h: HandicapSettings): Explained<number> {
  const capped = Math.min(courseHcp, h.cap)
  const raw = h.allowance * capped
  const value = roundWith(raw, h.rounding)
  const steps: Msg[] = []
  // COPY-19: each step says what it does before its arithmetic.
  if (capped !== courseHcp) steps.push(msg('hcp.cap', { hcp: courseHcp, cap: h.cap }))
  steps.push(msg('hcp.allowance', { pct: Math.round(h.allowance * 100), of: capped, result: roundTo(raw, 2) }))
  if (roundTo(raw, 2) !== value) steps.push(msg('hcp.rounded', { value }))
  if (value < 0) steps.push(msg('hcp.givesBack', { value }))
  return { value, why: { title: msg('hcp.playingTitle', { value }), steps } }
}

/** A figure in tenths, half away from zero, as Postgres's `round(x * 10)` reads it (0015's `round(idx * 10)::int`). */
const tenths = (x: number) => (x < 0 ? -roundHalfUp(-x * 10) : roundHalfUp(x * 10))

/**
 * WHS course handicap for a tee: round(index × slope / 113 + (rating − par)).
 * A tee without rating/slope behaves like slope 113, rating = par → the index unchanged.
 * The arithmetic is `whsCourseHandicap`, in integer tenths, the one the Polo
 * index's SQL (`whs_course_hcp`) runs on the same index and tee: the engine
 * had a float copy of its own (ARCH-16).
 */
export function courseHandicap(
  index: number,
  tee: { slope: number | null; rating: number | null; par: number },
): Explained<number> {
  const slope = tee.slope ?? 113
  const rating = tee.rating ?? tee.par
  const raw = (index * slope) / 113 + (rating - tee.par)
  const value = whsCourseHandicap(tenths(index), slope, tenths(rating), tee.par)
  const scaled = roundTo((index * slope) / 113, 2)
  const diff = roundTo(rating - tee.par, 1)
  // COPY-19: what each step does, then its arithmetic; the WHS formula in three short sentences.
  const steps = [
    msg('hcp.courseScale', { index, slope, scaled }),
    msg('hcp.courseRating', { rating, par: tee.par, diff }),
    msg('hcp.courseSum', { scaled, diff, raw: roundTo(raw, 2), value }),
  ]
  return { value, why: { title: msg('hcp.courseTitle', { value }), steps } }
}

export interface EstimateScore {
  gross: number
  rating?: number | null
  slope?: number | null
  par?: number | null
}

export interface EstimateResult extends Explained<number> {
  /** Differentials in the order used (good, average, bad), after sorting. */
  differentials: [number, number, number]
  /** True when the scores had to be re-sorted (entered in the wrong order). */
  reordered: boolean
  /** True when any score used the assumed rating/slope/par. */
  assumed: boolean
}

/**
 * Estimated index from three gross scores (good day, normal day, bad day):
 *   d = (gross − rating) × 113 / slope; index ≈ Σ weights·d, 1 decimal, capped.
 *   (75, 82, 90) on 72.0 / 113 → 3.0 / 10.0 / 18.0 → 8.05 → 8.1
 */
export function estimateIndex(
  scores: [EstimateScore, EstimateScore, EstimateScore],
  h: HandicapSettings,
): EstimateResult {
  let assumed = false
  const diffs = scores.map((s) => {
    const par = s.par ?? 72
    const rating = s.rating ?? par
    const slope = s.slope ?? 113
    if (s.rating == null || s.slope == null || s.par == null) assumed = true
    return ((s.gross - rating) * 113) / slope
  })
  const sorted = [...diffs].sort((a, b) => a - b) as [number, number, number]
  const reordered = sorted.some((d, i) => d !== diffs[i])
  const [wg, wa, wb] = h.estimateWeights
  const weighted = wg * sorted[0] + wa * sorted[1] + wb * sorted[2]
  const uncapped = roundTo(weighted, 1)
  const value = Math.min(uncapped, h.cap)
  const d = sorted.map((x) => roundTo(x, 2)) as [number, number, number]
  const steps = [
    msg('est.diffs', { d }),
    msg('est.weighted', { w: [wg, wa, wb], d, result: roundTo(weighted, 2) }),
    msg('est.rounded', { value: uncapped, written: value === uncapped }),
  ]
  if (value !== uncapped) steps.push(msg('est.cap', { cap: h.cap, value }))
  if (reordered) steps.push(say('est.reordered'))
  if (assumed) steps.push(say('est.assumed'))
  return {
    value,
    differentials: [roundTo(sorted[0], 2), roundTo(sorted[1], 2), roundTo(sorted[2], 2)],
    reordered,
    assumed,
    why: { title: msg('est.title', { value }), steps },
  }
}

/**
 * Anti-sandbag cut from a round's points (§5.2):
 *   cut = P > threshold ? min(max, floor((P − threshold) / pointsPerStroke)) : 0
 *   35 → 0 · 38 → 1 · 42 → 3 · 47 → 4 (max)
 */
export function nextRoundCut(points: number, c: CutSettings): Explained<number> {
  const over = points - c.threshold
  const value = over > 0 ? Math.min(c.maxStrokes, Math.floor(over / c.pointsPerStroke)) : 0
  // COPY-19: sentences that follow «El día 1» in the playing handicap's explanation, hence the lower case.
  const steps: Msg[] = []
  if (over <= 0) steps.push(msg('cut.under', { points, threshold: c.threshold }))
  else {
    steps.push(msg('cut.over', { points, threshold: c.threshold, over }))
    steps.push(msg('cut.per', { per: c.pointsPerStroke, over }))
    if (Math.floor(over / c.pointsPerStroke) > c.maxStrokes) steps.push(msg('cut.max', { max: c.maxStrokes }))
  }
  return { value, why: { title: msg('cut.title', { value }), steps } }
}

/**
 * Strokes received on a hole: floor(PH / holes) + (SI <= PH % holes ? 1 : 0).
 *   PH 16 → 1 on SI 1–16, 0 on SI 17–18 · PH 43 → 3 on SI 1–7, 2 on SI 8–18
 * A plus handicap gives them back from the easiest hole up (MONEY-21):
 *   PH −1 → −1 on SI 18 · PH −2 → −1 on SI 17–18
 * The one allocation in the product: the Polo index's adjusted gross reads the
 * same in SQL (`whs_strokes`), and cases/whs.json holds the two to each other.
 */
export function strokesReceived(playingHcp: number, strokeIndex: number, holes = 18): number {
  if (playingHcp < 0) {
    const back = strokesReceived(-playingHcp, holes + 1 - strokeIndex, holes)
    return back ? -back : 0
  }
  return Math.floor(playingHcp / holes) + (strokeIndex <= playingHcp % holes ? 1 : 0)
}
