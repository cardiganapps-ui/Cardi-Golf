/**
 * Stats and awards (§12): display only, no money. Pure derivation from the
 * core state plus the snake and auction module states when they are on.
 * Award ids are generic; the fun names live in the i18n copy.
 */
import type { Id, Snapshot } from '../types'
import type { CoreState, HoleResult } from './types'
import type { SnakeState } from '../modules/snake'
import type { AuctionState } from '../modules/auction'

export interface PlayerStats {
  playerId: Id
  pointsPerRound: number[]
  pointsByPar: Record<3 | 4 | 5, number>
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
  bestHole: { roundNumber: number; hole: number; points: number; strokeIndex: number } | null
  worstHole: { roundNumber: number; hole: number; points: number; strokeIndex: number } | null
  /** Longest run of consecutive scoring holes (points > 0), in play order. */
  longestStreak: number
  /** Population variance of points per hole. */
  variance: number | null
  /** Cumulative points hole by hole across rounds (for the race chart). */
  race: number[]
}

export interface HoleStat {
  hole: number
  par: number
  strokeIndex: number
  avgPoints: number
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
  /** How to show the value ("count", "points", "pct", "variance"). */
  unit: 'count' | 'points' | 'pct' | 'variance'
}

export interface StatsState {
  players: Record<Id, PlayerStats>
  rounds: RoundStats[]
  awards: Award[]
  cursedHole: { roundNumber: number; hole: number; avgPoints: number } | null
  moment: { playerId: Id; roundNumber: number; hole: number; points: number; strokeIndex: number } | null
}

function playedHoles(holes: HoleResult[]) {
  return holes.filter((h) => h.played)
}

export function computeStats(snapshot: Snapshot, core: CoreState, mods: { snake?: SnakeState; auction?: AuctionState }): StatsState {
  const players: Record<Id, PlayerStats> = {}
  const allMoments: Array<{ playerId: Id; roundNumber: number; hole: number; points: number; strokeIndex: number }> = []

  for (const p of snapshot.players) {
    const st: PlayerStats = {
      playerId: p.id,
      pointsPerRound: [],
      pointsByPar: { 3: 0, 4: 0, 5: 0 },
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
    const pointsList: number[] = []
    let cum = 0
    for (const rid of core.roundIds) {
      const pr = core.rounds[rid]?.[p.id]
      if (!pr) continue
      st.pointsPerRound.push(pr.points)
      for (const h of pr.holes) {
        if (!h.played) continue
        st.holesPlayed++
        pointsList.push(h.points)
        cum += h.points
        st.race.push(cum)
        const par = (h.par === 3 || h.par === 5 ? h.par : 4) as 3 | 4 | 5
        st.pointsByPar[par] += h.points
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
        const m = { roundNumber: pr.roundNumber, hole: h.hole, points: h.points, strokeIndex: h.strokeIndex }
        if (!st.bestHole || m.points > st.bestHole.points || (m.points === st.bestHole.points && m.strokeIndex < st.bestHole.strokeIndex)) st.bestHole = m
        if (!st.worstHole || m.points < st.worstHole.points || (m.points === st.worstHole.points && m.strokeIndex > st.worstHole.strokeIndex)) st.worstHole = m
        allMoments.push({ playerId: p.id, ...m })
      }
    }
    if (puttHoles > 0) st.puttsPerHole = Math.round((st.putts / puttHoles) * 100) / 100
    if (pointsList.length > 0) {
      const mean = pointsList.reduce((a, b) => a + b, 0) / pointsList.length
      st.variance = Math.round((pointsList.reduce((a, b) => a + (b - mean) ** 2, 0) / pointsList.length) * 1000) / 1000
    }
    players[p.id] = st
  }

  // Course stats per round.
  const rounds: RoundStats[] = []
  for (const rid of core.roundIds) {
    const round = snapshot.rounds.find((r) => r.id === rid)
    if (!round) continue
    const acc = new Map<number, { par: number; strokeIndex: number; sum: number; n: number }>()
    for (const pr of Object.values(core.rounds[rid] ?? {})) {
      for (const h of playedHoles(pr.holes)) {
        const a = acc.get(h.hole) ?? { par: h.par, strokeIndex: h.strokeIndex, sum: 0, n: 0 }
        a.sum += h.points
        a.n++
        acc.set(h.hole, a)
      }
    }
    const holes: HoleStat[] = [...acc.entries()]
      .map(([hole, a]) => ({ hole, par: a.par, strokeIndex: a.strokeIndex, avgPoints: Math.round((a.sum / a.n) * 100) / 100, played: a.n }))
      .sort((a, b) => a.hole - b.hole)
    const ranked = [...holes].sort((a, b) => a.avgPoints - b.avgPoints || a.hole - b.hole)
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
  top('biggestGain', 'points', (s) => (s.pointsPerRound.length >= 2 ? s.pointsPerRound[1]! - s.pointsPerRound[0]! : null), {
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
      if (!cursedHole || h.avgPoints < cursedHole.avgPoints) cursedHole = { roundNumber: r.roundNumber, hole: h.hole, avgPoints: h.avgPoints }
    }
  }
  // Moment of the tournament: most points on one hole; ties go to the harder stroke index.
  const moment = allMoments.length ? allMoments.reduce((a, b) => (b.points > a.points || (b.points === a.points && b.strokeIndex < a.strokeIndex) ? b : a)) : null

  return { players, rounds, awards, cursedHole, moment: moment && moment.points > 0 ? moment : null }
}
