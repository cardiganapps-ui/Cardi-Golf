import { describe, expect, it } from 'vitest'
import { computeTournament } from '../computeTournament'
import { FIRST_TOURNAMENT_SETTINGS } from '../settings/presets'
import { PAR_72, fillRound, makeFirstTournament, score } from '../testing/fixtures'

describe('stats and awards (§12)', () => {
  it('counts birdies, putts, streaks and picks the moment of the tournament', () => {
    const snap = makeFirstTournament()
    // p1: PH 5. Birdie on hole 3 (par 3 → gross 2), par elsewhere, pick-up on 18. One-putt on 3, three-putt on 9.
    const gross = [4, 4, 2, 5, 4, 4, 3, 4, 5, 4, 3, 4, 5, 4, 4, 3, 4, 0]
    const putts = [2, 2, 1, 2, 2, 2, 2, 2, 3, 2, 2, 2, 2, 2, 2, 2, 2, 2]
    for (let h = 1; h <= 18; h++) snap.scores.push(score('r1', 'p1', h, gross[h - 1]! || null, putts[h - 1]!, gross[h - 1] === 0))
    const st = computeTournament(snap, FIRST_TOURNAMENT_SETTINGS).stats
    const s = st.players.p1!
    expect(s.holesPlayed).toBe(18)
    expect(s.grossBirdies).toBe(1)
    expect(s.pickUps).toBe(1)
    expect(s.onePutts).toBe(1)
    expect(s.threePutts).toBe(1)
    expect(s.putts).toBe(36)
    expect(s.longestStreak).toBe(17)
    // 3 pts on hole 3 (gross birdie, SI 17) and on hole 5 (net birdie, SI 1): the harder hole wins.
    expect(s.bestHole?.hole).toBe(5)
    expect(s.worstHole?.hole).toBe(18)
    expect(st.moment?.playerId).toBe('p1')
    expect(st.awards.find((a) => a.id === 'mostBirdies')?.playerIds).toEqual(['p1'])
    expect(st.awards.find((a) => a.id === 'mostOnePutts')?.playerIds).toEqual(['p1'])
    expect(st.awards.find((a) => a.id === 'mostThreePutts')?.playerIds).toEqual(['p1'])
    expect(st.rounds[0]?.holes).toHaveLength(18)
    expect(st.rounds[0]?.hardest?.hole).toBe(18)
  })

  it('computes course stats, resurrection and consistency over a full tournament', () => {
    const snap = makeFirstTournament()
    fillRound(snap, 'r1', 3)
    fillRound(snap, 'r2', 4)
    const st = computeTournament(snap, FIRST_TOURNAMENT_SETTINGS).stats
    expect(Object.keys(st.players)).toHaveLength(12)
    for (const s of Object.values(st.players)) {
      expect(s.pointsPerRound).toHaveLength(2)
      expect(s.race).toHaveLength(36)
      expect(s.race.at(-1)).toBe(s.pointsPerRound[0]! + s.pointsPerRound[1]!)
    }
    expect(st.rounds).toHaveLength(2)
    expect(st.cursedHole).not.toBeNull()
    const gain = st.awards.find((a) => a.id === 'biggestGain')!
    const winner = st.players[gain.playerIds[0]!]!
    expect(winner.pointsPerRound[1]! - winner.pointsPerRound[0]!).toBe(gain.value)
    const consistent = st.awards.find((a) => a.id === 'mostConsistent')!
    expect(Object.values(st.players).every((s) => s.variance! >= consistent.value)).toBe(true)
    expect(st.awards.some((a) => a.id === 'snakeGold')).toBe(true)
    expect(PAR_72.reduce((a, h) => a + h[0], 0)).toBe(72)
  })

  it('leaves auction awards out when nothing was sold and snake out when the module is off', () => {
    const snap = makeFirstTournament()
    fillRound(snap, 'r1', 5)
    const settings = { ...FIRST_TOURNAMENT_SETTINGS, modules: { ...FIRST_TOURNAMENT_SETTINGS.modules, snake: { ...FIRST_TOURNAMENT_SETTINGS.modules.snake, enabled: false } } }
    const st = computeTournament(snap, settings).stats
    expect(st.awards.some((a) => a.id === 'bestRoi')).toBe(false)
    expect(st.awards.some((a) => a.id === 'snakeGold')).toBe(false)
  })
})

describe('feed', () => {
  it('emits birdies, lead changes and snake passes in save order', () => {
    const snap = makeFirstTournament()
    const at = (i: number) => new Date(Date.UTC(2027, 3, 9, 9, i)).toISOString()
    // p1 (PH 5) birdie on 3, p4 (PH 10) net birdie on hole 1 (SI 7 → stroke) with gross 4.
    snap.scores.push({ ...score('r1', 'p4', 1, 4, 2), updatedAt: at(1) })
    snap.scores.push({ ...score('r1', 'p1', 1, 4, 2), updatedAt: at(2) })
    snap.scores.push({ ...score('r1', 'p1', 2, 4, 2), updatedAt: at(3) })
    snap.scores.push({ ...score('r1', 'p1', 3, 2, 1), updatedAt: at(4) })
    snap.scores.push({ ...score('r1', 'p10', 3, 4, 3), updatedAt: at(5) })
    const feed = computeTournament(snap, FIRST_TOURNAMENT_SETTINGS).feed
    const kinds = feed.map((e) => `${e.kind}:${e.playerId}:${e.hole}`)
    expect(kinds[0]).toBe('snakePass:p10:3')
    expect(kinds).toContain('birdie:p4:1')
    expect(kinds).toContain('birdie:p1:3')
    expect(kinds).toContain('leadChange:p4:1')
    expect(kinds).toContain('leadChange:p1:2')
    // Newest first.
    expect(feed[feed.length - 1]?.kind).toBe('birdie')
  })
})
