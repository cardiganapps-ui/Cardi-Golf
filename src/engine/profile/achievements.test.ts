import { describe, expect, it } from 'vitest'
import { badges, noDoubles, parStreak, records, recapYears, yearRecap, type AchRound, type AchTournament, type HoleDetail } from './achievements'

// Par 72: 4s everywhere except par 3s on 3, 8, 12, 17 and par 5s on 5, 9, 13, 18.
const PARS = [4, 4, 3, 4, 5, 4, 4, 3, 5, 4, 4, 3, 5, 4, 4, 4, 3, 5]
/** A card from gross per hole (null = picked up) and 2 putts unless given. */
const card = (strokes: Array<number | null>, putts: Array<number | null> = strokes.map(() => 2)): HoleDetail[] => strokes.map((s, i) => [i + 1, PARS[i]!, i + 1, s, putts[i] ?? null, s == null])
const bogeyGolf = () => card(PARS.map((p) => p + 1)) // 90

let n = 0
const round = (playedOn: string, detail: HoleDetail[], extra: Partial<AchRound> = {}): AchRound => {
  const gross = detail.some((h) => h[5]) ? null : detail.reduce((s, h) => s + h[3]!, 0)
  const under = (d: number) => detail.filter((h) => !h[5] && h[3]! - h[1] === d).length
  return {
    roundId: `r${++n}`,
    tournament: 'Sábados',
    slug: 'sabados',
    course: 'Chapultepec',
    playedOn,
    holes: 18,
    complete: true,
    practice: false,
    gross,
    differential: gross == null ? null : gross - 72,
    putts: detail.every((h) => h[4] != null) ? detail.reduce((s, h) => s + h[4]!, 0) : null,
    eagles: under(-2),
    birdies: under(-1),
    detail,
    ...extra,
  }
}
const tourney = (startsOn: string, rank: number | null, extra: Partial<AchTournament> = {}): AchTournament => ({ tournamentId: `t${++n}`, slug: `t${n}`, name: `Copa ${n}`, practice: false, status: 'finished', rank, field: 8, startsOn, ...extra })

describe('hole helpers', () => {
  it('par streaks run in hole order and a pick-up breaks them', () => {
    // Pars on 1–6, a bogey on 7, pars on 8–18 → 11.
    expect(parStreak(card(PARS.map((p, i) => (i === 6 ? p + 1 : p))))).toBe(11)
    expect(parStreak(card(PARS.map((p, i) => (i === 3 ? null : p))))).toBe(14)
    expect(parStreak(bogeyGolf())).toBe(0)
  })
  it('a double or a pick-up is not "no doubles"', () => {
    expect(noDoubles(bogeyGolf())).toBe(true)
    expect(noDoubles(card(PARS.map((p, i) => (i === 0 ? p + 2 : p + 1))))).toBe(false)
    expect(noDoubles(card(PARS.map((p, i) => (i === 0 ? null : p))))).toBe(false)
  })
})

describe('badges', () => {
  const r1 = round('2026-03-01', card(PARS.map((p) => p + 2))) // 108
  const r2 = round('2026-04-05', bogeyGolf()) // 90: not under 90
  // Birdies on 1–2 (−2), bogeys on 3–17 (+15), par on 18: 72 + 13 = 85. A 3-putt on 4.
  const r3 = round(
    '2026-05-10',
    card(
      PARS.map((p, i) => (i < 2 ? p - 1 : i < 17 ? p + 1 : p)),
      PARS.map((_, i) => (i === 3 ? 3 : 2)),
    ),
  )
  const practice = round('2026-02-01', card(PARS.map((p) => p - 1)), { practice: true }) // 54, never counts
  const all = badges([r3, practice, r1, r2], [tourney('2026-06-01', 2), tourney('2026-07-01', 1)])
  const get = (id: string) => all.find((b) => b.id === id)!

  it('dates each badge by the first round that earned it, in play order', () => {
    expect(get('firstRound')).toMatchObject({ earned: true, unlockedAt: '2026-03-01', roundId: r1.roundId })
    expect(get('break100')).toMatchObject({ earned: true, unlockedAt: '2026-04-05' })
    expect(get('break90')).toMatchObject({ earned: true, unlockedAt: '2026-05-10', roundId: r3.roundId })
    expect(get('firstBirdie').unlockedAt).toBe('2026-05-10')
    expect(get('noDoubles').unlockedAt).toBe('2026-04-05')
  })
  it('practice rounds and 3-putts keep badges locked', () => {
    expect(get('break80').earned).toBe(false)
    expect(get('birdies3').earned).toBe(false)
    // r1 and r2 have no 3-putts and every putt recorded.
    expect(get('noThreePutts').unlockedAt).toBe('2026-03-01')
    expect(get('putts28').earned).toBe(false) // 36 putts
  })
  it('tournament badges come from finished, counting tournaments', () => {
    expect(get('podium').unlockedAt).toBe('2026-06-01')
    expect(get('firstWin').unlockedAt).toBe('2026-07-01')
    expect(get('wins3').earned).toBe(false)
  })
})

describe('records', () => {
  it('keeps the best of each, the earliest on a tie', () => {
    const a = round('2026-03-01', bogeyGolf()) // 90
    const b = round('2026-04-01', bogeyGolf()) // 90 again: a keeps it
    const c = round('2026-05-01', card(PARS.map((p, i) => (i < 3 ? p - 1 : p + 1)))) // 3 birdies (−3), 15 bogeys (+15): 84
    const rec = records([b, c, a], [tourney('2026-06-01', 3), tourney('2026-07-01', 2, { field: 12 })])
    const get = (id: string) => rec.find((x) => x.id === id)
    expect(get('bestGross')).toMatchObject({ value: 84, roundId: c.roundId })
    expect(get('mostBirdies')).toMatchObject({ value: 3, roundId: c.roundId })
    expect(get('fewestPutts')).toMatchObject({ value: 36, roundId: a.roundId })
    expect(get('longestParStreak')).toMatchObject({ value: 3, roundId: c.roundId })
    expect(get('bestFinish')).toMatchObject({ value: 2, of: 12 })
  })
})

describe('yearRecap', () => {
  it('sums one calendar year, without practice', () => {
    const rounds = [
      round('2025-12-20', bogeyGolf()),
      round('2026-03-01', bogeyGolf()), // 90
      round('2026-04-01', card(PARS.map((p, i) => (i < 2 ? p - 1 : p + 1))), { course: 'Bosque Real' }), // 2 birdies (−2), 16 bogeys (+16): 86
      round('2026-05-01', card(PARS.map((p) => p - 1)), { practice: true }),
    ]
    const tournaments = [tourney('2026-04-01', 1), tourney('2026-08-01', 3), tourney('2026-09-01', 5, { practice: true })]
    expect(recapYears(rounds, tournaments)).toEqual([2026, 2025])
    const y = yearRecap(rounds, tournaments, 2026)
    // Average of 90 and 86 = 88.0; best differential 86 − 72 = 14; two courses, one round each: no favorite.
    expect(y).toMatchObject({ rounds: 2, tournaments: 2, wins: 1, podiums: 2, birdies: 2, eagles: 0, bestGross: 86, avgGross: 88, bestDifferential: 14, courses: 2, favoriteCourse: null })
    expect(y.badges).toContain('firstBirdie')
    expect(y.badges).not.toContain('firstRound') // earned in 2025
    // A second round at Bosque Real makes it the favorite.
    const more = yearRecap([...rounds, round('2026-06-01', bogeyGolf(), { course: 'Bosque Real' })], tournaments, 2026)
    expect(more.favoriteCourse).toBe('Bosque Real')
  })
})
