import { describe, expect, it } from 'vitest'
import { h2hRecord, proposedStrokes, type H2HRound } from './social'

const round = (myNet: number | null, theirNet: number | null, myGross: number | null, theirGross: number | null): H2HRound => ({
  roundId: `${myNet}-${theirNet}-${myGross}-${theirGross}`,
  playedOn: null,
  roundNumber: 1,
  course: null,
  practice: false,
  tournament: 'T',
  slug: 't',
  myGross,
  theirGross,
  myAgs: myGross ?? 0,
  theirAgs: theirGross ?? 0,
  myNet,
  theirNet,
})

describe('h2hRecord', () => {
  // Net: 70 < 72 won, 75 > 72 lost, 72 = 72 tied. Gross: 88 < 90 won, 95 > 80 lost, the pick-up round is skipped.
  const rounds = [round(70, 72, 88, 90), round(75, 72, 95, 80), round(72, 72, null, 85)]
  it('counts net over every round', () => {
    expect(h2hRecord(rounds, 'net')).toEqual({ won: 1, lost: 1, tied: 1 })
  })
  it('counts gross only where both have one', () => {
    expect(h2hRecord(rounds, 'gross')).toEqual({ won: 1, lost: 1, tied: 0 })
  })
})

describe('proposedStrokes', () => {
  it('starts from the index suggestion, level without one, within the cap', () => {
    expect(proposedStrokes(4)).toBe(4)
    expect(proposedStrokes(null)).toBe(0)
    expect(proposedStrokes(-25)).toBe(-18)
    expect(proposedStrokes(7, 5)).toBe(5)
  })
})
