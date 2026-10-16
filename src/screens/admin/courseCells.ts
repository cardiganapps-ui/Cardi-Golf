/**
 * A cell of a tee started from scratch that nobody has typed (UX-16). A blank
 * card used to be eighteen par 4s with the stroke index equal to the hole
 * number: a permutation that summed to 72, so it saved, and every stroke and
 * point was computed from a card nobody typed. 0 is no par and no index.
 */
import type { CourseDraftTee } from '../../data/api'
import { t } from '../../i18n/es-MX'

const C = t.admin.courses

export const NOT_TYPED = 0

/** The holes of a tee with a par or an index still to type. */
export const untypedHoles = (tee: CourseDraftTee) => tee.holes.filter((h) => h.par === NOT_TYPED || h.strokeIndex === NOT_TYPED).map((h) => h.number)

/** What keeps a tee from saving, in words (the course editor lists them under it). */
export function validateTee(tee: CourseDraftTee): string[] {
  const missing = untypedHoles(tee)
  // The rest can only be judged on a whole card.
  if (missing.length) return [C.holesUntyped(missing)]
  const issues: string[] = []
  const n = tee.holes.length
  const sis = [...tee.holes.map((h) => h.strokeIndex)].sort((a, b) => a - b)
  if (sis.some((si, i) => si !== i + 1)) issues.push(C.siNotPermutation)
  const par = tee.holes.reduce((s, h) => s + h.par, 0)
  if (n === 18 && (par < 62 || par > 78)) issues.push(C.parSum(par))
  return issues
}

/** A tee with nothing typed yet: eighteen holes, every par and index to type. */
export const blankTee = (name: string = C.defaultTee): CourseDraftTee => ({
  name,
  color: null,
  rating: null,
  slope: null,
  holes: Array.from({ length: 18 }, (_, i) => ({ number: i + 1, par: NOT_TYPED, strokeIndex: NOT_TYPED, yards: null })),
})
