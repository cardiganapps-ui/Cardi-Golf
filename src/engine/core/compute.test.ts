import { describe, expect, it } from 'vitest'
import { FIRST_TOURNAMENT_SETTINGS } from '../settings/presets'
import { makeCourse, makePlayer, makeSnapshot, makeTee, score } from '../testing/fixtures'
import { computeCore } from './compute'

describe('computeCore', () => {
  it('computes per-hole points, thru and totals', () => {
    const snap = makeSnapshot({ players: [makePlayer(1, { baseHcp: 20 })], rounds: 1, settings: FIRST_TOURNAMENT_SETTINGS })
    // PH = 80% of 20 = 16 → 1 stroke on SI 1–16. Hole 5 is par 4, SI 1.
    snap.scores.push(score('r1', 'p1', 5, 5, 2), score('r1', 'p1', 3, 3, 1)) // hole 3: par 3, SI 17 → 0 strokes → par = 2 pts
    const core = computeCore(snap, FIRST_TOURNAMENT_SETTINGS)
    const pr = core.rounds.r1!.p1!
    expect(pr.playingHcp).toBe(16)
    expect(pr.holes[4]!.points).toBe(2) // net par
    expect(pr.holes[2]!.points).toBe(2)
    expect(pr.thru).toBe(2)
    expect(pr.points).toBe(4)
    expect(pr.putts).toBe(3)
    expect(core.totals.p1!.points).toBe(4)
    expect(pr.holes[4]!.why.steps[0]).toContain('SI 1')
  })

  it('applies the Day 2 cut from Day 1 points', () => {
    const snap = makeSnapshot({ players: [makePlayer(1, { baseHcp: 20 })], rounds: 2, settings: FIRST_TOURNAMENT_SETTINGS })
    // 42 points on Day 1: 18 holes × 2 + 6 birdies. Give net birdie on 6 holes.
    for (let h = 1; h <= 18; h++) {
      const hole = snap.courses[0]!.tees[0]!.holes[h - 1]!
      const sr = hole.strokeIndex <= 16 ? 1 : 0
      const gross = hole.par + sr - (h <= 6 ? 1 : 0)
      snap.scores.push(score('r1', 'p1', h, gross))
    }
    const core = computeCore(snap, FIRST_TOURNAMENT_SETTINGS)
    expect(core.rounds.r1!.p1!.points).toBe(42)
    expect(core.rounds.r2!.p1!.cut).toBe(3)
    expect(core.rounds.r2!.p1!.playingHcp).toBe(13)
    expect(core.rounds.r2!.p1!.playingHcpWhy.steps.join(' ')).toContain('16 − 3 = 13')
  })

  it('never adds strokes and floors at 0', () => {
    const snap = makeSnapshot({ players: [makePlayer(1, { baseHcp: 2 })], rounds: 2, settings: FIRST_TOURNAMENT_SETTINGS })
    for (let h = 1; h <= 18; h++) {
      const hole = snap.courses[0]!.tees[0]!.holes[h - 1]!
      snap.scores.push(score('r1', 'p1', h, hole.par - (h <= 8 ? 1 : 0)))
    }
    const core = computeCore(snap, FIRST_TOURNAMENT_SETTINGS)
    // PH 2 → one stroke on SI 1–2 → 36 + 8 birdies + 2 strokes = 46 pts → cut 4 → max(0, 2 − 4) = 0
    expect(core.rounds.r1!.p1!.points).toBe(46)
    expect(core.rounds.r2!.p1!.cut).toBe(4)
    expect(core.rounds.r2!.p1!.playingHcp).toBe(0)
  })

  it('an override replaces the playing handicap and is explained', () => {
    const snap = makeSnapshot({ players: [makePlayer(1, { baseHcp: 20 })], rounds: 1, settings: FIRST_TOURNAMENT_SETTINGS })
    snap.handicapOverrides.push({ roundId: 'r1', playerId: 'p1', playingHcp: 14, reason: 'Jugó de azules', by: null, at: '' })
    const core = computeCore(snap, FIRST_TOURNAMENT_SETTINGS)
    expect(core.rounds.r1!.p1!.playingHcp).toBe(14)
    expect(core.rounds.r1!.p1!.overridden).toBe(true)
    expect(core.rounds.r1!.p1!.playingHcpWhy.steps.at(-1)).toContain('Jugó de azules')
  })

  it('uses the WHS course handicap for index players and the tee from round_tees', () => {
    const course = makeCourse('course1', [
      makeTee('tee1', 'course1', { name: 'Azules', rating: 71.2, slope: 128 }),
      makeTee('tee2', 'course1', { name: 'Rojas', rating: 68, slope: 113 }),
    ])
    const settings = structuredClone(FIRST_TOURNAMENT_SETTINGS)
    settings.handicap.perRoundSlope = true
    const snap = makeSnapshot({
      players: [makePlayer(1, { handicapSource: 'index', handicapIndex: 8.1, baseHcp: 8.1, defaultTeeId: 'tee1' })],
      rounds: 2,
      courses: [course],
      settings,
    })
    snap.roundTees.push({ roundId: 'r2', playerId: 'p1', teeId: 'tee2' })
    const core = computeCore(snap, settings)
    expect(core.rounds.r1!.p1!.courseHcp).toBe(8) // 8.1 × 128/113 + (71.2 − 72) = 8.37
    expect(core.rounds.r1!.p1!.playingHcp).toBe(6) // 80% of 8 = 6.4
    expect(core.rounds.r2!.p1!.tee?.id).toBe('tee2')
    expect(core.rounds.r2!.p1!.courseHcp).toBe(4) // 8.1 + (68 − 72) = 4.1
  })

  it('a manual handicap is used unchanged even with a rated tee', () => {
    const course = makeCourse('course1', [makeTee('tee1', 'course1', { rating: 71.2, slope: 128 })])
    const snap = makeSnapshot({ players: [makePlayer(1, { baseHcp: 20 })], rounds: 1, courses: [course], settings: FIRST_TOURNAMENT_SETTINGS })
    expect(computeCore(snap, FIRST_TOURNAMENT_SETTINGS).rounds.r1!.p1!.courseHcp).toBe(20)
  })

  it('a cancelled round is left out', () => {
    const snap = makeSnapshot({ players: 2, rounds: 2, settings: FIRST_TOURNAMENT_SETTINGS })
    snap.rounds[1]!.status = 'cancelled'
    const core = computeCore(snap, FIRST_TOURNAMENT_SETTINGS)
    expect(core.roundIds).toEqual(['r1'])
  })

  it('warns when no course is loaded and scores with par 4', () => {
    const snap = makeSnapshot({ players: 1, rounds: 1, courses: [] })
    snap.scores.push(score('r1', 'p1', 1, 4))
    const core = computeCore(snap, snap.tournament.settings as never)
    expect(core.warnings[0]).toContain('sin campo')
    expect(core.rounds.r1!.p1!.holes[0]!.par).toBe(4)
  })
})
