/**
 * PWA-15: the installed app had no way to reload (the browser's pull-to-refresh is off, and a home-screen
 * app has no reload button). The boards take a pull now; these are its thresholds.
 */
import { describe, expect, it } from 'vitest'
import {
  PULL_MAX_PX,
  PULL_RATE,
  PULL_SLOP_PX,
  PULL_THRESHOLD_PX,
  pullArmed,
  pullIntent,
  pullMayStart,
  pullOffset,
} from './pull'

describe('a pull, apart from a scroll (PWA-15)', () => {
  it('a finger that has barely moved is neither', () => {
    expect(pullIntent(0, PULL_SLOP_PX)).toBeNull()
    expect(pullIntent(4, -6)).toBeNull()
  })

  it('down, and mostly down, is a pull', () => {
    expect(pullIntent(0, PULL_SLOP_PX + 1)).toBe('pull')
    expect(pullIntent(8, 30)).toBe('pull')
  })

  it('up is the page scrolling; sideways is a table or a swipe; a diagonal is not a pull', () => {
    expect(pullIntent(0, -(PULL_SLOP_PX + 1))).toBe('other')
    expect(pullIntent(PULL_SLOP_PX + 1, 0)).toBe('other')
    expect(pullIntent(30, 30)).toBe('other')
  })
})

describe('how far it comes, and when letting go refreshes', () => {
  it('half the finger’s travel past the slop, up to its limit', () => {
    expect(pullOffset(PULL_SLOP_PX)).toBe(0)
    expect(pullOffset(PULL_SLOP_PX + 40)).toBe(40 * PULL_RATE)
    expect(pullOffset(10_000)).toBe(PULL_MAX_PX)
    expect(pullOffset(-50)).toBe(0)
  })

  it('only past the threshold', () => {
    const travel = PULL_SLOP_PX + PULL_THRESHOLD_PX / PULL_RATE
    expect(pullArmed(pullOffset(travel - 1))).toBe(false)
    expect(pullArmed(pullOffset(travel))).toBe(true)
  })
})

describe('when a touch may start one', () => {
  const ok = {
    enabled: true,
    refreshing: false,
    fingers: 1,
    pageTop: 0,
    sheetOpen: false,
    inDialog: false,
    boxScrolled: false,
  }

  it('on a board, at the top of the page, one finger, nothing open or under way', () => {
    expect(pullMayStart(ok)).toBe(true)
  })

  it('never on a screen that is not a board (the Tarjeta), below the top, with two fingers, under a sheet, from a dialog, from a box scrolled down, or while a refresh runs', () => {
    expect(pullMayStart({ ...ok, enabled: false })).toBe(false)
    expect(pullMayStart({ ...ok, pageTop: 1 })).toBe(false)
    expect(pullMayStart({ ...ok, fingers: 2 })).toBe(false)
    expect(pullMayStart({ ...ok, sheetOpen: true })).toBe(false)
    expect(pullMayStart({ ...ok, inDialog: true })).toBe(false)
    expect(pullMayStart({ ...ok, boxScrolled: true })).toBe(false)
    expect(pullMayStart({ ...ok, refreshing: true })).toBe(false)
  })
})
