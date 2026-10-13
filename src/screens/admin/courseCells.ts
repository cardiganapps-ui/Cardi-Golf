/**
 * A cell of a tee started from scratch that nobody has typed (UX-16). A blank
 * card used to be eighteen par 4s with the stroke index equal to the hole
 * number: a permutation that summed to 72, so it saved, and every stroke and
 * point was computed from a card nobody typed. 0 is no par and no index.
 */
import type { CourseDraftTee } from '../../data/api'

export const NOT_TYPED = 0

/** The holes of a tee with a par or an index still to type. */
export const untypedHoles = (tee: CourseDraftTee) => tee.holes.filter((h) => h.par === NOT_TYPED || h.strokeIndex === NOT_TYPED).map((h) => h.number)
