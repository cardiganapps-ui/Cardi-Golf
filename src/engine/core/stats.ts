/**
 * Stats and awards (§12): display only, no money. Pure derivation from the
 * core state plus the snake and auction module states when they are on.
 * Award ids are generic; the fun names live in the i18n copy.
 *
 * The figures follow what the main event counts (STRAT-03). Under Stableford
 * a hole is worth its points, and more is better. Under strokes a hole is its
 * score against par (net or gross, a pick-up as net double bogey, as the
 * board counts it), and less is better: the race, the best and worst hole,
 * the hardest hole, the moment, the day-to-day gain and the consistency all
 * read that figure. The birdie, par and bogey counts stay on net scores
 * whatever the format: they are labelled that way.
 */
import type { Id, Snapshot } from '../types'
import type { CoreState, HoleResult } from './types'
import type { SnakeState } from '../modules/snake'
import type { AuctionState } from '../modules/auction'
import { holeStrokes } from '../formats/strokePlay'
import type { MainScoring } from '../formats'

export interface PlayerStats {
  playerId: Id
  pointsPerRound: number[]
  pointsByPar: Record<3 | 4 | 5, number>
  /** The hole figure (points, or strokes against par) summed per round and by par: what the screen shows. */
  valuePerRound: number[]
  valueByPar: Record<3 | 4 | 5, number>
  holesPlayed: number
  grossBirdies: number
  netBirdies: number
  pars: number
  bogeys: number
  doubleOrWorse: number
  pickUps: number
  putts: number
  puttsPerHole: number | null
  onePutts: number
  threePutts: number
  snakeHoles: number
  /** `value` is the hole figure: points, or strokes against par. */
  bestHole: { roundNumber: number; hole: number; points: number; value: number; strokeIndex: number } | null
  worstHole: { roundNumber: number; hole: number; points: number; value: number; strokeIndex: number } | null
  /** Longest run of consecutive scoring holes (points > 0), in play order. */
  longestStreak: number
  /** Population variance of the hole figure. */
  variance: number | null
  /** The hole figure, cumulative hole by hole across rounds (for the race chart). */
  race: number[]
}

export interface HoleStat {
  hole: number
  par: number
  strokeIndex: number
  avgPoints: number
  /** Average hole figure: points, or strokes against par. */
  avg: number
  played: number
}

export interface RoundStats {
  roundId: Id
  roundNumber: number
  holes: HoleStat[]
  hardest: HoleStat | null
  easiest: HoleStat | null
}

export type AwardId = 'mostBirdies' | 'mostOnePutts' | 'mostThreePutts' | 'biggestGain' | 'mostConsistent' | 'snakeGold' | 'bestRoi' | 'worstRoi'

export interface Award {
  id: AwardId
  /** Winners (several when tied). */
  playerIds: Id[]
  value: number
  /** How to show the value ("count", "points", "strokes" fewer, "pct", "variance"). */
  unit: 'count' | 'points' | 'strokes' | 'pct' | 'variance'
}

export interface StatsState {
  /** What the figures count: Stableford points (more is better) or strokes against par (less is better). */
  scoring: MainScoring
  players: Record<Id, PlayerStats>
  rounds: RoundStats[]
  awards: Award[]
  cursedHole: { roundNumber: number; hole: number; avgPoints: number; avg: number } | null
  moment: { playerId: Id; roundNumber: number; hole: number; points: number; value: number; strokeIndex: number } | null
}

function playedHoles(holes: HoleResult[]) {
  return holes.filter((h) => h.played)
}

export function computeStats(snapshot: Snapshot, core: CoreState, mods: { snake?: SnakeState; auction?: AuctionState }, scoring: MainScoring = 'points'): StatsState {
  const players: Record<Id, PlayerStats> = {}
  const allMoments: Array<{ playerId: Id; roundNumber: number; hole: number; points: number; value: number; strokeIndex: number }> = []
  const points = scoring === 'points'
  /** A played hole's figure: its points, or its strokes against par. */
  const valueOf = (h: HoleResult) => (points ? h.points : (holeStrokes(h, scoring === 'net') ?? h.par) - h.par)
  /** `a` is a better hole figure than `b`. */
  const better = (a: number, b: number) => (points ? a > b : a < b)

  for (const p of snapshot.players) {
    const st: PlayerStats = {
      playerId: p.id,
      pointsPerRound: [],
      pointsByPar: { 3: 0, 4: 0, 5: 0 },
      valuePerRound: [],
      valueByPar: { 3: 0, 4: 0, 5: 0 },
      holesPlayed: 0,
      grossBirdies: 0,
      netBirdies: 0,
      pars: 0,
      bogeys: 0,
      doubleOrWorse: 0,
      pickUps: 0,
      putts: 0,
      puttsPerHole: null,
      onePutts: 0,
      threePutts: 0,
      snakeHoles: mods.snake?.holesHeld[p.id] ?? 0,
      bestHole: null,
      worstHole: null,
      longestStreak: 0,
      variance: null,
      race: [],
    }
    let puttHoles = 0
    let streak = 0
    const valueList: number[] = []
    let cum = 0
    for (const rid of core.roundIds) {
      const pr = core.rounds[rid]?.[p.id]
      if (!pr) continue
      st.pointsPerRound.push(pr.points)
      let roundValue = 0
      for (const h of pr.holes) {
        if (!h.played) continue
        const v = valueOf(h)
        st.holesPlayed++
        valueList.push(v)
        cum += v
        roundValue += v
        st.race.push(cum)
        const par = (h.par === 3 || h.par === 5 ? h.par : 4) as 3 | 4 | 5
        st.pointsByPar[par] += h.points
        st.valueByPar[par] += v
        if (h.pickedUp) st.pickUps++
        else if (h.gross != null && h.gross <= h.par - 1) st.grossBirdies++
        if (h.points >= 3) st.netBirdies++
        else if (h.points === 2) st.pars++
        else if (h.points === 1) st.bogeys++
        else if (!h.pickedUp) st.doubleOrWorse++
        if (h.putts != null) {
          st.putts += h.putts
          puttHoles++
          if (h.putts === 1) st.onePutts++
          if (h.putts >= 3) st.threePutts++
        }
        streak = h.points > 0 ? streak + 1 : 0
        st.longestStreak = Math.max(st.longestStreak, streak)
        const m = { roundNumber: pr.roundNumber, hole: h.hole, points: h.points, value: v, strokeIndex: h.strokeIndex }
        if (!st.bestHole || better(m.value, st.bestHole.value) || (m.value === st.bestHole.value && m.strokeIndex < st.bestHole.strokeIndex)) st.bestHole = m
        if (!st.worstHole || better(st.worstHole.value, m.value) || (m.value === st.worstHole.value && m.strokeIndex > st.worstHole.strokeIndex)) st.worstHole = m
        allMoments.push({ playerId: p.id, ...m })
      }
      st.valuePerRound.push(roundValue)
    }
    if (puttHoles > 0) st.puttsPerHole = Math.round((st.putts / puttHoles) * 100) / 100
    if (valueList.length > 0) {
      const mean = valueList.reduce((a, b) => a + b, 0) / valueList.length
      st.variance = Math.round((valueList.reduce((a, b) => a + (b - mean) ** 2, 0) / valueList.length) * 1000) / 1000
    }
    players[p.id] = st
  }

  // Course stats per round.
  const rounds: RoundStats[] = []
  for (const rid of core.roundIds) {
    const round = snapshot.rounds.find((r) => r.id === rid)
    if (!round) continue
    const acc = new Map<number, { par: number; strokeIndex: number; sum: number; value: number; n: number }>()
    for (const pr of Object.values(core.rounds[rid] ?? {})) {
      for (const h of playedHoles(pr.holes)) {
        const a = acc.get(h.hole) ?? { par: h.par, strokeIndex: h.strokeIndex, sum: 0, value: 0, n: 0 }
        a.sum += h.points
        a.value += valueOf(h)
        a.n++
        acc.set(h.hole, a)
      }
    }
    const holes: HoleStat[] = [...acc.entries()]
      .map(([hole, a]) => ({ hole, par: a.par, strokeIndex: a.strokeIndex, avgPoints: Math.round((a.sum / a.n) * 100) / 100, avg: Math.round((a.value / a.n) * 100) / 100, played: a.n }))
      .sort((a, b) => a.hole - b.hole)
    // Hardest first: fewest points, or most strokes against par.
    const ranked = [...holes].sort((a, b) => (points ? a.avg - b.avg : b.avg - a.avg) || a.hole - b.hole)
    rounds.push({ roundId: rid, roundNumber: round.number, holes, hardest: ranked[0] ?? null, easiest: ranked.at(-1) ?? null })
  }

  // Awards.
  const awards: Award[] = []
  const list = Object.values(players)
  const top = (id: AwardId, unit: Award['unit'], value: (s: PlayerStats) => number | null, opts: { min?: boolean; ok?: (s: PlayerStats) => boolean } = {}) => {
    const cands = list.map((s) => ({ s, v: value(s) })).filter((x): x is { s: PlayerStats; v: number } => x.v != null && (opts.ok ? opts.ok(x.s) : true))
    if (cands.length === 0) return
    const best = opts.min ? Math.min(...cands.map((c) => c.v)) : Math.max(...cands.map((c) => c.v))
    if (!opts.min && best <= 0) return
    awards.push({ id, playerIds: cands.filter((c) => c.v === best).map((c) => c.s.playerId), value: best, unit })
  }
  top('mostBirdies', 'count', (s) => s.grossBirdies)
  top('mostOnePutts', 'count', (s) => s.onePutts)
  top('mostThreePutts', 'count', (s) => s.threePutts)
  // Points gained from day 1 to day 2, or strokes saved against par.
  top('biggestGain', points ? 'points' : 'strokes', (s) => (s.valuePerRound.length >= 2 ? (points ? 1 : -1) * (s.valuePerRound[1]! - s.valuePerRound[0]!) : null), {
    ok: (s) => s.holesPlayed >= 2 * 9,
  })
  top('mostConsistent', 'variance', (s) => s.variance, { min: true, ok: (s) => s.holesPlayed >= 9 })
  if (mods.snake) top('snakeGold', 'count', (s) => s.snakeHoles)
  if (mods.auction && mods.auction.soldCount > 0) {
    const roi = new Map(mods.auction.portfolios.filter((pf) => pf.roi != null).map((pf) => [pf.ownerId, pf.roi as number]))
    if (roi.size > 0) {
      const best = Math.max(...roi.values())
      const worst = Math.min(...roi.values())
      awards.push({ id: 'bestRoi', playerIds: [...roi].filter(([, v]) => v === best).map(([k]) => k), value: best, unit: 'pct' })
      if (worst !== best) awards.push({ id: 'worstRoi', playerIds: [...roi].filter(([, v]) => v === worst).map(([k]) => k), value: worst, unit: 'pct' })
    }
  }

  // Cursed hole: lowest average across every round (min 2 cards played).
  let cursedHole: StatsState['cursedHole'] = null
  for (const r of rounds) {
    for (const h of r.holes) {
      if (h.played < 2) continue
      if (!cursedHole || better(cursedHole.avg, h.avg)) cursedHole = { roundNumber: r.roundNumber, hole: h.hole, avgPoints: h.avgPoints, avg: h.avg }
    }
  }
  // Moment of the tournament: the best hole figure; ties go to the harder stroke index.
  const moment = allMoments.length ? allMoments.reduce((a, b) => (better(b.value, a.value) || (b.value === a.value && b.strokeIndex < a.strokeIndex) ? b : a)) : null
  // A moment is a good hole: some points, or under par.
  const memorable = moment && (points ? moment.value > 0 : moment.value < 0)

  return { scoring, players, rounds, awards, cursedHole, moment: memorable ? moment : null }
}
