/**
 * Handicaps (CLAUDE.md §5.2, §13b-D/E). Pure functions; every result
 * carries its explanation for "¿Cómo se calculó?".
 */
import { handicapText, ptsText } from '../../i18n/es-MX'
import { whsCourseHandicap } from '../profile/whs'
import type { TournamentSettings } from '../settings/schema'
import type { Explained } from '../types'
import { roundHalfUp, roundTo, roundWith } from './rounding'

type HandicapSettings = TournamentSettings['handicap']
type CutSettings = TournamentSettings['day2Cut']

/** A number in an explanation: up to 2 decimals, and a true minus (−0.8, never -0.8). */
const fmt = (n: number) => {
  const abs = Number.isInteger(n) ? String(Math.abs(n)) : Math.abs(n).toFixed(2).replace(/\.?0+$/, '')
  return n < 0 && abs !== '0' ? `−${abs}` : abs
}
/** A plus handicap's arithmetic is negative; say once how it is written. */
const written = (n: number) => (n < 0 ? `, se escribe ${handicapText(n)}` : '')

/** What a plus playing handicap does on the card (MONEY-21): it gives strokes back on the easiest holes. */
function givesBack(ph: number): string {
  const n = -ph
  return `Juega con ${handicapText(ph)}: devuelve ${n} golpe${n === 1 ? '' : 's'}, en ${n === 1 ? 'el hoyo más fácil' : `los ${n} hoyos más fáciles`}`
}

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
  const steps: string[] = []
  // COPY-19: each step says what it does before its arithmetic.
  if (capped !== courseHcp) steps.push(`Hándicap ${fmt(courseHcp)}; el tope es ${fmt(h.cap)}, así que cuenta ${fmt(h.cap)}`)
  steps.push(`Se juega con el ${Math.round(h.allowance * 100)}%: ${Math.round(h.allowance * 100)}% de ${fmt(capped)} = ${fmt(roundTo(raw, 2))}`)
  if (roundTo(raw, 2) !== value) steps.push(`Redondeado al entero: ${fmt(value)}`)
  if (value < 0) steps.push(givesBack(value))
  return { value, why: { title: `Hándicap de juego ${handicapText(value)}`, steps } }
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
    `El índice se ajusta a la dificultad del tee: índice ${index < 0 ? `${handicapText(index)}, en la cuenta ${fmt(index)},` : fmt(index)} × slope ${slope} ÷ 113 = ${fmt(scaled)}`,
    `Se suma lo que el rating del tee pasa del par: rating ${fmt(rating)} − par ${tee.par} = ${fmt(diff)}`,
    `${fmt(scaled)} ${diff < 0 ? '−' : '+'} ${fmt(Math.abs(diff))} = ${fmt(roundTo(raw, 2))}, redondeado ${fmt(value)}${written(value)}: el hándicap de campo`,
  ]
  return { value, why: { title: `Hándicap de campo ${handicapText(value)}`, steps } }
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
    `Redondeado a 1 decimal: ${fmt(uncapped)}${value === uncapped ? written(value) : ''}`,
  ]
  if (value !== uncapped) steps.push(`Tope ${fmt(h.cap)}: ${fmt(value)}`)
  if (reordered) steps.push('Las rondas venían en otro orden; se acomodaron de mejor a peor.')
  if (assumed) steps.push('Rating/slope asumidos (par 72, slope 113) donde no se capturaron.')
  return {
    value,
    differentials: [roundTo(sorted[0], 2), roundTo(sorted[1], 2), roundTo(sorted[2], 2)],
    reordered,
    assumed,
    why: { title: `Índice estimado ${handicapText(value)}`, steps },
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
  const steps: string[] = []
  if (over <= 0) steps.push(`hizo ${ptsText(points)}, no más de ${c.threshold}: sin recorte`)
  else {
    steps.push(`hizo ${ptsText(points)}: ${points} − ${c.threshold} = ${ptsText(over)} de más`)
    steps.push(
      `se recorta 1 golpe por ${c.pointsPerStroke === 1 ? 'cada punto' : `cada ${c.pointsPerStroke} puntos`} de más: ${over} ÷ ${c.pointsPerStroke} = ${over % c.pointsPerStroke ? `${(over / c.pointsPerStroke).toFixed(1)}, ` : ''}${Math.floor(over / c.pointsPerStroke)} golpe${Math.floor(over / c.pointsPerStroke) === 1 ? '' : 's'}`,
    )
    if (Math.floor(over / c.pointsPerStroke) > c.maxStrokes) steps.push(`el máximo es ${c.maxStrokes}`)
  }
  return { value, why: { title: value ? `Recorte de ${value}` : 'Sin recorte', steps } }
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
