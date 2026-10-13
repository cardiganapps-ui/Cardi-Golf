/** MOT-02: the swipe between holes follows the finger and commits on a long drag or a fast flick. */
import { describe, expect, it } from 'vitest'
import { dragOffset, swipeEnd, swipeIntent } from './swipe'

describe('the Tarjeta swipe (MOT-02)', () => {
  it('a sideways move is a swipe; a vertical one is the page scrolling; a few pixels are nothing yet', () => {
    expect(swipeIntent(-14, 3)).toBe('swipe')
    expect(swipeIntent(6, 20)).toBe('scroll')
    expect(swipeIntent(5, 4)).toBeNull()
    // Diagonal, more down than across: the page scrolls.
    expect(swipeIntent(14, 12)).toBe('scroll')
  })

  it('the hole follows the finger, and gives only a quarter past the first or the last hole', () => {
    expect(dragOffset(-80, true, true)).toBe(-80)
    expect(dragOffset(80, false, true)).toBe(20)
    expect(dragOffset(-80, true, false)).toBe(-20)
  })

  it('a long level drag commits, as before (70 px)', () => {
    expect(swipeEnd(-90, 10, 600, true, true)).toBe(1)
    expect(swipeEnd(90, 10, 600, true, true)).toBe(-1)
    expect(swipeEnd(-60, 10, 600, true, true)).toBe(0)
    expect(swipeEnd(-90, 60, 600, true, true)).toBe(0)
  })

  it('a short fast flick commits; a short slow one springs back', () => {
    expect(swipeEnd(-40, 5, 60, true, true)).toBe(1)
    expect(swipeEnd(-40, 5, 400, true, true)).toBe(0)
  })

  it('nothing past the ends', () => {
    expect(swipeEnd(-120, 0, 100, true, false)).toBe(0)
    expect(swipeEnd(120, 0, 100, false, true)).toBe(0)
  })
})
