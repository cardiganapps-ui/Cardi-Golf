import { describe, expect, it } from 'vitest'
import { placePoints, seasons, seasonTable, type SeasonResult } from './season'

const r = (tournamentId: string, handle: string, rank: number | null, date = '2026-05-10'): SeasonResult => ({ tournamentId, date, handle, rank, rankLabel: rank == null ? null : String(rank), field: 4 })

describe('placePoints', () => {
  it('pays the place plus one for playing; ties average the places they fill', () => {
    expect(placePoints(1, 1)).toBe(26) // 25 + 1
    expect(placePoints(1, 2)).toBe(22.5) // (25 + 18) / 2 + 1
    expect(placePoints(9, 3)).toBe(2) // (2 + 1 + 0) / 3 + 1
    expect(placePoints(11, 1)).toBe(1) // off the table: just for playing
    expect(placePoints(null, 1)).toBe(1)
  })
})

describe('seasonTable', () => {
  it('adds up a season (hand-checked)', () => {
    // E1: A 1st 26, B 2nd 19, C 3rd 16, D 4th 13.
    // E2 (C absent): A and B tie for 1st, 22.5 each; D 3rd 16.
    // A 48.5, B 41.5, D 29, C 16.
    const rows = seasonTable([r('e1', 'a', 1), r('e1', 'b', 2), r('e1', 'c', 3), r('e1', 'd', 4), r('e2', 'a', 1), r('e2', 'b', 1), r('e2', 'd', 3)], 2026)
    expect(rows.map((x) => [x.handle, x.points, x.events, x.wins, x.label])).toEqual([
      ['a', 48.5, 2, 2, '1'],
      ['b', 41.5, 2, 1, '2'],
      ['d', 29, 2, 0, '3'],
      ['c', 16, 1, 0, '4'],
    ])
  })

  it('breaks equal points on wins, then shares the position when all is equal', () => {
    // X: a win (26) and a 9th (3) = 29. Y: a 3rd (16) and a 4th (13) = 29. X has the win.
    const byWins = seasonTable([r('e1', 'x', 1), r('e2', 'x', 9), r('e3', 'y', 3), r('e4', 'y', 4)], 2026)
    expect(byWins.map((x) => [x.handle, x.points, x.label])).toEqual([
      ['x', 29, '1'],
      ['y', 29, '2'],
    ])
    // P and Q each win one outing: 26, one win, best 1st.
    const level = seasonTable([r('e1', 'p', 1), r('e2', 'q', 1)], 2026)
    expect(level.map((x) => x.label)).toEqual(['T1', 'T1'])
  })

  it('shares a place with players outside the crew', () => {
    // A member tied for 1st with a guest (not in the results): (25 + 18) / 2 + 1 = 22.5, still a win.
    const rows = seasonTable([{ ...r('e1', 'a', 1), tied: 2 }], 2026)
    expect(rows[0]).toMatchObject({ points: 22.5, wins: 1 })
  })

  it('counts only the chosen year', () => {
    const all = [r('e1', 'a', 1, '2025-11-02'), r('e2', 'a', 2, '2026-02-01')]
    expect(seasons(all)).toEqual([2026, 2025])
    expect(seasonTable(all, 2026)[0]!.points).toBe(19)
  })
})
