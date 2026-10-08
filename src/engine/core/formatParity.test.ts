/**
 * STRAT-03, after PR #91's verifier: what the stats, the feed, the hole
 * explanation and the Reglamento say under strokes, pinned case by case
 * (each of these survived a mutant before).
 */
import { describe, expect, it } from 'vitest'
import { getFixture } from '../../dev/fixtures'
import { computeTournament } from '../computeTournament'
import { parseSettings, type TournamentSettings } from '../settings/schema'
import { moduleRules } from '../settings/describeModule'
import { fieldShape } from '../settings/prizeCheck'
import { holeStrokes, strokesWhy } from '../formats'
import type { Snapshot } from '../types'
import type { HoleResult } from './types'

function run(name: string, edit?: (s: TournamentSettings, snap: Snapshot) => void) {
  const snap = structuredClone(getFixture(name)!.snapshot)
  const settings = parseSettings(snap.tournament.settings)
  edit?.(settings, snap)
  return { snap, settings, state: computeTournament(snap, settings) }
}
const holesOf = (state: ReturnType<typeof computeTournament>) =>
  Object.values(state.core.rounds).flatMap((r) => Object.values(r).flatMap((pr) => pr.holes.filter((h) => h.played).map((h) => ({ pr, h }))))

describe('stats under strokes: fewer is better, everywhere', () => {
  const { state } = run('stroke8')
  const toPar = (h: HoleResult) => holeStrokes(h, true)! - h.par

  it('the moment is the best hole against par (the harder index on a tie)', () => {
    const best = Math.min(...holesOf(state).map(({ h }) => toPar(h)))
    expect(state.stats.moment!.value).toBe(best)
    expect(best).toBeLessThan(0)
  })

  it('each player\'s best hole is no worse than his worst', () => {
    for (const s of Object.values(state.stats.players)) {
      if (!s.bestHole || !s.worstHole) continue
      expect(s.bestHole.value).toBeLessThanOrEqual(s.worstHole.value)
    }
  })

  it('the hardest hole has the most strokes against par on average, the easiest the fewest; the Hoyo Maldito is the hardest of all', () => {
    for (const r of state.stats.rounds) {
      const avgs = r.holes.map((h) => h.avg)
      expect(r.hardest!.avg).toBe(Math.max(...avgs))
      expect(r.easiest!.avg).toBe(Math.min(...avgs))
    }
    expect(state.stats.cursedHole!.avg).toBe(Math.max(...state.stats.rounds.flatMap((r) => r.holes.filter((h) => h.played >= 2).map((h) => h.avg))))
  })

  it('the race ends on each player\'s board figure against par', () => {
    for (const row of state.modules.individual!.rows) {
      expect(state.stats.players[row.playerId]!.race.at(-1)).toBe(row.figure.rank)
    }
  })
})

describe('El Resucitado needs both days played whole', () => {
  it('a knockout: a player out after day 1 never «gains» on a day he did not play', () => {
    const { state } = run('bracket8')
    expect(state.stats.awards.find((a) => a.id === 'biggestGain')).toBeUndefined()
  })

  it('a 2-day stroke play after day 1 only: nobody gains yet', () => {
    const { state } = run('stroke8', (s, snap) => {
      s.rounds = 2
      snap.rounds.push({ ...snap.rounds[0]!, id: 'r2', number: 2, status: 'scheduled' })
    })
    expect(state.stats.awards.find((a) => a.id === 'biggestGain')).toBeUndefined()
  })
})

describe('the pairs race counts points whatever the main event plays', () => {
  it('each player\'s points race ends on his Stableford points', () => {
    const { state } = run('stroke8')
    for (const [pid, s] of Object.entries(state.stats.players)) {
      expect(s.pointsRace.at(-1) ?? 0).toBe(state.core.totals[pid]!.points)
    }
  })
})

describe('feed under strokes', () => {
  it('no leader on a single card: the first hole of the first player leads nothing', () => {
    const { state } = run('stroke8', (_s, snap) => {
      const first = snap.scores.find((x) => x.hole === 1)!
      snap.scores = [first]
    })
    expect(state.feed.filter((e) => e.kind === 'leadChange')).toEqual([])
  })

  it('gross stroke play: the latest leader is the gross board\'s leader, not the net one', () => {
    // p6 gets every stroke there is: he leads on net, and not on gross.
    const edit = (scoring: 'net' | 'gross') => (s: TournamentSettings, snap: Snapshot) => {
      s.modules.individual.formatOptions.scoring = scoring
      snap.players = snap.players.map((p) => (p.id === 'p6' ? { ...p, baseHcp: 54 } : p))
    }
    const netLeader = run('stroke8', edit('net')).state.modules.individual!.rows[0]!.playerId
    const { state } = run('stroke8', edit('gross'))
    const grossLeader = state.modules.individual!.rows[0]!.playerId
    expect(netLeader).not.toBe(grossLeader)
    expect(state.feed.find((e) => e.kind === 'leadChange')!.playerId).toBe(grossLeader)
  })

  it('the close names the board\'s champion when the replay never did (an incomplete card drops)', () => {
    const { state } = run('stroke8', (_s, snap) => {
      // The leader misses his last hole, and the tournament closes.
      const top = 'p2'
      snap.scores = snap.scores.filter((x) => !(x.playerId === top && x.hole === 9))
      snap.rounds = snap.rounds.map((r) => ({ ...r, status: 'finished' as const }))
      snap.tournament = { ...snap.tournament, status: 'finished' }
    })
    const latest = state.feed.find((e) => e.kind === 'leadChange')!
    expect(latest.playerId).toBe(state.modules.individual!.rows[0]!.playerId)
  })
})

describe('a hole explained in strokes', () => {
  const h = (over: Partial<HoleResult>): HoleResult =>
    ({ hole: 3, par: 4, strokeIndex: 5, yards: null, strokesReceived: 1, gross: 5, net: 4, points: 2, putts: 2, pickedUp: false, played: true, disputed: false, why: { title: '', steps: [] }, ...over }) as HoleResult

  it('net: the strokes received off the gross, and the result against par', () => {
    expect(strokesWhy(h({}), true).steps).toEqual(['Par 4, SI 5: 1 golpe de ventaja', '5 − 1 = 4 neto', '4 golpes netos: par'])
  })

  it('a pick-up counts as net double bogey, and says what each number is', () => {
    const why = strokesWhy(h({ pickedUp: true, gross: null }), true)
    expect(why.steps).toEqual(['Par 4, SI 5: 1 golpe de ventaja', 'Levantó: cuenta como doble bogey neto, par 4 + 1 golpe de ventaja + 2 = 7', '7 − 1 = 6 neto', '6 golpes netos: 2 sobre par'])
    expect(strokesWhy(h({ pickedUp: true, gross: null }), false).steps.at(-1)).toBe('7 golpes: 3 sobre par')
  })
})

describe('the Reglamento says what the format does', () => {
  it('match play states its own tiebreak, and no «gana Último lugar» without a name of its own', () => {
    const { snap, settings } = run('match8')
    const lines = moduleRules('individual', settings, fieldShape(snap, settings), null)
    expect(lines.join('\n')).toContain('va adelante quien terminó mejor su partido del último día')
    expect(lines.join('\n')).not.toMatch(/gana Último lugar/)
  })
})
