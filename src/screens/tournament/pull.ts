/**
 * Pull to refresh on the boards (PWA-15): the indicator follows a finger that drags down from the top of
 * the page, and letting go past the threshold brings the boards again. Pure, so the thresholds are tested
 * apart from the screen, as the Tarjeta's swipe is (`swipe.ts`).
 */

/** The finger must go this far before the board takes it: a tap or a hesitation is neither a pull nor a scroll. */
export const PULL_SLOP_PX = 10
/** The indicator comes down at half the finger's pace: a pull resists, as a page's edge does. */
export const PULL_RATE = 0.5
/** Let go with the indicator this far down, or further, and the boards come again. About 140 px of finger. */
export const PULL_THRESHOLD_PX = 64
/** It never comes further than this. */
export const PULL_MAX_PX = 96
/** Where it waits while the boards come. */
export const PULL_REST_PX = 56

export type PullIntent = 'pull' | 'other' | null

/** What a finger that started at the top of the page is doing: null until it is clear. */
export function pullIntent(dx: number, dy: number): PullIntent {
  // Down, and mostly down: a pull. Up, or sideways (a table that scrolls across, a swipe), is the page's.
  if (dy > PULL_SLOP_PX && dy > Math.abs(dx) * 1.5) return 'pull'
  if (Math.abs(dy) > PULL_SLOP_PX || Math.abs(dx) > PULL_SLOP_PX) return 'other'
  return null
}

/** How far down the indicator is for a finger `dy` below where it started. */
export function pullOffset(dy: number): number {
  return Math.min(PULL_MAX_PX, Math.max(0, dy - PULL_SLOP_PX) * PULL_RATE)
}

/** Letting go here refreshes. */
export function pullArmed(offset: number): boolean {
  return offset >= PULL_THRESHOLD_PX
}

/**
 * Whether a touch may start a pull: the board screen, one finger, the page at its top, nothing under way,
 * no sheet open, and not from inside a dialog or a box scrolled down on its own.
 */
export function pullMayStart(at: {
  enabled: boolean
  refreshing: boolean
  fingers: number
  pageTop: number
  sheetOpen: boolean
  inDialog: boolean
  boxScrolled: boolean
}): boolean {
  return (
    at.enabled &&
    !at.refreshing &&
    at.fingers === 1 &&
    at.pageTop <= 0 &&
    !at.sheetOpen &&
    !at.inDialog &&
    !at.boxScrolled
  )
}
