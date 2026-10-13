/** MONEY-19: a custom bid goes up in the increment from the bid standing, or it is refused with the amounts either side. */
import { describe, expect, it } from 'vitest'
import { bidSteps } from './bids'

describe('bids go up in the increment (MONEY-19)', () => {
  it('the review’s fat finger: $1,370 over $1,250 is refused, the next bid is $1,500', () => {
    expect(bidSteps(1250, 250, 1370)).toEqual([1500])
  })
  it('on the step it goes: one step, several steps', () => {
    expect(bidSteps(1250, 250, 1500)).toBeNull()
    expect(bidSteps(1250, 250, 2250)).toBeNull()
  })
  it('between two steps further up: both are offered', () => {
    expect(bidSteps(1250, 250, 2100)).toEqual([2000, 2250])
  })
  it('not above the bid standing: the next step', () => {
    expect(bidSteps(1250, 250, 1250)).toEqual([1500])
    expect(bidSteps(1250, 250, 1000)).toEqual([1500])
  })
  it('the step counts from the bid standing, even an old one off it', () => {
    // An older build let $1,370 in: the next bids are $1,620, $1,870…
    expect(bidSteps(1370, 250, 1500)).toEqual([1620])
    expect(bidSteps(1370, 250, 1620)).toBeNull()
  })
  it('a centavo is never a step', () => {
    expect(bidSteps(250, 250, 500.5)).toEqual([500, 750])
  })
})
