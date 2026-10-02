/**
 * STRAT-03: a card's marks and the ticker's lines speak the figure the event
 * counts. Each case here survived a mutant in PR #91's verification.
 */
import { describe, expect, it } from 'vitest'
import type { HoleResult } from '../engine/core/types'
import type { FeedEvent } from '../engine/core/feed'
import { feedText, holeMark } from './figureText'

const hole = (over: Partial<HoleResult>): HoleResult =>
  ({ hole: 7, par: 4, strokeIndex: 3, yards: null, strokesReceived: 1, gross: 4, net: 3, points: 3, putts: 2, pickedUp: false, played: true, disputed: false, why: { title: '', steps: [] }, ...over }) as HoleResult

describe('holeMark', () => {
  it('Stableford marks on points: three or more is good, none is bad', () => {
    expect(holeMark(hole({}), 'points')).toBe('good')
    expect(holeMark(hole({ gross: 7, net: 6, points: 0 }), 'points')).toBe('bad')
    expect(holeMark(hole({ gross: 5, net: 4, points: 2 }), 'points')).toBeNull()
  })

  it('a gross par with a stroke received is three points, and a plain par on a gross card', () => {
    expect(holeMark(hole({}), 'gross')).toBeNull()
    expect(holeMark(hole({}), 'net')).toBe('good')
    expect(holeMark(hole({ gross: 3, net: 2, points: 4 }), 'gross')).toBe('good')
  })

  it('under strokes a double bogey is bad, whatever the points say', () => {
    // Two strokes received: a gross double bogey is a net par, two points.
    const h = hole({ strokesReceived: 2, gross: 6, net: 4, points: 2 })
    expect(holeMark(h, 'gross')).toBe('bad')
    expect(holeMark(h, 'net')).toBeNull()
    expect(holeMark(h, 'points')).toBeNull()
  })

  it('a pick-up counts as net double bogey; a hole not played is not marked', () => {
    expect(holeMark(hole({ pickedUp: true, gross: null, net: null, points: 0 }), 'net')).toBe('bad')
    expect(holeMark(hole({ played: false, gross: null, net: null, points: 0 }), 'points')).toBeNull()
    expect(holeMark(hole({ played: false, gross: null, net: null, points: 0 }), 'net')).toBeNull()
  })
})

describe('feedText', () => {
  const name = () => 'Nacho'
  const base = { at: null, roundNumber: 1, hole: 7, playerId: 'p4' }

  it("the honoree's hole under strokes is named, never counted in points", () => {
    const e: FeedEvent = { ...base, kind: 'honoreeHole', points: 2, toPar: 1, scoring: 'net' }
    expect(feedText(e, name)).toBe('Nacho en el 7: bogey neto.')
    expect(feedText({ ...e, toPar: null }, name)).toBe('Nacho en el 7: levantó.')
    expect(feedText({ ...e, scoring: 'points' }, name)).toBe('Nacho en el 7: 2 pts')
  })

  it('a birdie under strokes says how far under par, not its points', () => {
    const e: FeedEvent = { ...base, kind: 'birdie', points: 3, gross: false, under: 1, scoring: 'net' }
    expect(feedText(e, name)).not.toMatch(/pts|punto/)
    expect(feedText(e, name)).toMatch(/birdie/)
    expect(feedText({ ...e, scoring: 'points' }, name)).toMatch(/3 pts/)
  })

  it('a new leader is announced with the board\'s own figure', () => {
    const e: FeedEvent = { ...base, kind: 'leadChange', figure: '−3', scoring: 'net' }
    expect(feedText(e, name)).toBe('¡Cambio de líder! Nacho toma la punta con −3')
  })
})
