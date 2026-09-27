/**
 * Handicaps (CLAUDE.md §5.2, §13b-D/E). Pure functions; every result
 * carries its explanation for "¿Cómo se calculó?".
 */
import type { TournamentSettings } from '../settings/schema'
import type { Explained } from '../types'
import { roundHalfUp, roundTo, roundWith } from './rounding'

type HandicapSettings = TournamentSettings['handicap']
type CutSettings = TournamentSettings['day2Cut']

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, ''))

/**
 * Playing handicap from a course handicap: cap, then allowance, then rounding.
 *   base 14 → 11.2 → 11 · base 21.875 → 17.5 → 18 · base 60 → capped 54 → 43
 */
export function playingHandicap(courseHcp: number, h: HandicapSettings): Explained<number> {
  const capped = Math.min(courseHcp, h.cap)
  const raw = h.allowance * capped
  const value = Math.max(0, roundWith(raw, h.rounding))
  const steps: string[] = []
  if (capped !== courseHcp) steps.push(`Hándicap ${fmt(courseHcp)} → tope ${fmt(h.cap)}`)
  steps.push(`${Math.round(h.allowance * 100)}% de ${fmt(capped)} = ${fmt(roundTo(raw, 2))}`)
  if (roundTo(raw, 2) !== value) steps.push(`Redondeado → ${value}`)
  return { value, why: { title: `Hándicap de juego ${value}`, steps } }
}

/**
 * WHS course handicap for a tee: round(index × slope / 113 + (rating − par)).
 * A tee without rating/slope behaves like slope 113, rating = par → the index unchanged.
 */
export function courseHandicap(
  index: number,
  tee: { slope: number | null; rating: number | null; par: number },
): Explained<number> {
  const slope = tee.slope ?? 113
  const rating = tee.rating ?? tee.par
  const raw = (index * slope) / 113 + (rating - tee.par)
  const value = roundHalfUp(raw)
  const steps = [
    `Índice ${fmt(index)} × slope ${slope} ÷ 113 = ${fmt(roundTo((index * slope) / 113, 2))}`,
    `+ (rating ${fmt(rating)} − par ${tee.par}) = ${fmt(roundTo(rating - tee.par, 1))}`,
    `= ${fmt(roundTo(raw, 2))} → ${value}`,
  ]
  return { value, why: { title: `Hándicap de campo ${value}`, steps } }
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
  const d = sorted.map((x) => fmt(roundTo(x, 2)))
  const steps = [
    `Diferenciales: ${d[0]} (buen día), ${d[1]} (normal), ${d[2]} (mal día)`,
    `${wg} × ${d[0]} + ${wa} × ${d[1]} + ${wb} × ${d[2]} = ${fmt(roundTo(weighted, 2))}`,
    `Redondeado a 1 decimal → ${fmt(uncapped)}`,
  ]
  if (value !== uncapped) steps.push(`Tope ${fmt(h.cap)} → ${fmt(value)}`)
  if (reordered) steps.push('Los scores venían en otro orden; se acomodaron de mejor a peor.')
  if (assumed) steps.push('Rating/slope asumidos (par 72, slope 113) donde no se capturaron.')
  return {
    value,
    differentials: [roundTo(sorted[0], 2), roundTo(sorted[1], 2), roundTo(sorted[2], 2)],
    reordered,
    assumed,
    why: { title: `Índice estimado ${fmt(value)}`, steps },
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
  const steps: string[] = []
  if (over <= 0) steps.push(`${points} pts no pasa de ${c.threshold}: sin recorte`)
  else {
    steps.push(`${points} − ${c.threshold} = ${over} pts de más`)
    steps.push(`${over} ÷ ${c.pointsPerStroke} = ${Math.floor(over / c.pointsPerStroke)} golpes`)
    if (Math.floor(over / c.pointsPerStroke) > c.maxStrokes) steps.push(`Máximo ${c.maxStrokes}`)
  }
  return { value, why: { title: value ? `Recorte de ${value}` : 'Sin recorte', steps } }
}

/**
 * Strokes received on a hole: floor(PH / holes) + (SI <= PH % holes ? 1 : 0).
 *   PH 16 → 1 on SI 1–16, 0 on SI 17–18 · PH 43 → 3 on SI 1–7, 2 on SI 8–18
 */
export function strokesReceived(playingHcp: number, strokeIndex: number, holes = 18): number {
  if (playingHcp <= 0) return 0
  return Math.floor(playingHcp / holes) + (strokeIndex <= playingHcp % holes ? 1 : 0)
}
