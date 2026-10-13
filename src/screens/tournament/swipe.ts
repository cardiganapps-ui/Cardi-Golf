/**
 * The Tarjeta's swipe between holes (MOT-02): the hole follows the finger, and
 * on release it goes to the next or previous hole, or springs back. Pure, so
 * the thresholds are tested apart from the screen.
 */

/** Horizontal past this, and mostly sideways, the finger is swiping, not scrolling. */
export const INTENT_PX = 10
/** A drag this far commits, as before (70 px), as long as it stayed level. */
export const COMMIT_PX = 70
/** A shorter flick commits when it is fast. */
export const FLICK_PX = 30
export const FLICK_PX_PER_MS = 0.5
/** Past the first or the last hole the drag gives a quarter: the card says there is nothing there. */
export const EDGE_GIVE = 0.25

export type Intent = 'swipe' | 'scroll' | null

/** What a finger that moved this far is doing: null until it is clear. */
export function swipeIntent(dx: number, dy: number): Intent {
  if (Math.abs(dx) > INTENT_PX && Math.abs(dx) > Math.abs(dy) * 1.5) return 'swipe'
  if (Math.abs(dy) > INTENT_PX) return 'scroll'
  return null
}

/** How far the hole moves under a drag of `dx`: all of it, or a quarter past the ends. */
export function dragOffset(dx: number, canPrev: boolean, canNext: boolean): number {
  if ((dx > 0 && !canPrev) || (dx < 0 && !canNext)) return dx * EDGE_GIVE
  return dx
}

/** On release: +1 for the next hole, -1 for the previous, 0 to spring back. */
export function swipeEnd(dx: number, dy: number, ms: number, canPrev: boolean, canNext: boolean): -1 | 0 | 1 {
  const far = Math.abs(dx) > COMMIT_PX && Math.abs(dy) < 50
  const flick = Math.abs(dx) > FLICK_PX && Math.abs(dy) < 40 && Math.abs(dx) / Math.max(ms, 1) > FLICK_PX_PER_MS
  if (!far && !flick) return 0
  if (dx < 0) return canNext ? 1 : 0
  return canPrev ? -1 : 0
}
