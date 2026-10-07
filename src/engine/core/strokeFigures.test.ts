/**
 * What stroke play counts, pinned case by case (STRAT-03 round 3). PR #91's
 * second verifier found each of these words or figures could change with no
 * test failing: the close of a stroke-play tournament, stats read on the
 * gross score, El Resucitado on a partial day, and the figure text a team
 * player or a decided match shows. Each case fails on its mutant.
 */
import { describe, expect, it } from 'vitest'
import { computeTournament } from '../computeTournament'
import { computeFeed } from './feed'
import { computeCore } from './compute'
import { parseSettings, type TournamentSettings } from '../settings/schema'
import { DEFAULT_SETTINGS } from '../settings/presets'
import { PAR_72, makeGroup, makePlayer, makeRound, makeSnapshot, score } from '../testing/fixtures'
import { dayFigureText, feedKey, feedText, holeMark, ownDayText } from '../../lib/figureText'
import { mainScoring, ranksPlayersByTotal } from '../formats'
import type { Snapshot } from '../types'

const PARS = PAR_72.map(([p]) => p)

function strokeSettings(scoring: 'net' | 'gross', rounds = 1): TournamentSettings {
  const s = structuredClone(DEFAULT_SETTINGS)
  s.rounds = rounds
  s.modules.individual = { ...s.modules.individual, format: 'strokePlay', label: 'Golpes', formatOptions: { ...s.modules.individual.formatOptions, scoring } }
  return parseSettings(s)
}
function snapOf(settings: TournamentSettings, hcps: number[], rounds = 1, finished = true): Snapshot {
  const players = hcps.map((h, i) => makePlayer(i + 1, { baseHcp: h }))
  const snap = makeSnapshot({ players, rounds: Array.from({ length: rounds }, (_, i) => makeRound(i + 1, { status: finished ? 'finished' : 'live' })), settings, status: finished ? 'finished' : 'live' })
  for (let r = 1; r <= rounds; r++) snap.groups.push(makeGroup(`r${r}`, 1, players.map((p) => p.id)))
  return snap
}
/** Save one card's holes (gross by hole number; null = pick-up; undefined = not played), stamping each save in order. */
let clock = 0
function save(snap: Snapshot, roundId: string, pid: string, holes: Array<[hole: number, gross: number | null]>) {
  for (const [hole, g] of holes) {
    const s = g == null ? score(roundId, pid, hole, null, 2, true) : score(roundId, pid, hole, g, Math.min(2, g))
    s.updatedAt = new Date(Date.UTC(2027, 3, 9, 15, 0) + clock++ * 30_000).toISOString()
    snap.scores = snap.scores.filter((x) => !(x.roundId === roundId && x.playerId === pid && x.hole === hole))
    snap.scores.push(s)
  }
}
const card = (f: (par: number, i: number) => number | null) => PARS.map((p, i) => [i + 1, f(p, i)] as [number, number | null])
const name = (id: string) => id.toUpperCase()

describe('the close of a stroke-play tournament (computeTournament)', () => {
  it('N2/N43: a board tied at the top after countback crowns nobody', () => {
    const settings = strokeSettings('net')
    const snap = snapOf(settings, [0, 0, 0])
    // p3 leads early; p2 then leads alone; p1 ties him on the last save. p1 and p2 have identical cards (a full tie).
    save(snap, 'r1', 'p3', [[1, 3]])
    save(snap, 'r1', 'p1', [[1, 4]])
    save(snap, 'r1', 'p2', [[1, 4]])
    for (let h = 2; h <= 18; h++) {
      const g = h === 3 || h === 7 ? PARS[h - 1]! - 1 : PARS[h - 1]!
      save(snap, 'r1', 'p2', [[h, g]])
      save(snap, 'r1', 'p1', [[h, g]])
    }
    save(snap, 'r1', 'p3', card((p) => p).slice(1))
    const state = computeTournament(snap, settings)
    const top = state.modules.individual!.rows.filter((r) => r.position === 1).map((r) => r.playerId)
    expect(top.sort()).toEqual(['p1', 'p2'])
    // Nobody «toma la punta» at the close: the board says T1.
    const lead = state.feed.find((e) => e.kind === 'leadChange')!
    expect(lead.playerId).toBe('p2')
    expect(feedText(state.feed[0]!, name)).not.toMatch(/P1 toma la punta/)
  })

  it('N3: the close names the champion with the board\'s figure («−2»), not his strokes', () => {
    const settings = strokeSettings('net')
    const snap = snapOf(settings, [0, 0])
    // p2 leads the replay at −3 but misses the 18th: the close ranks his incomplete card last.
    save(snap, 'r1', 'p1', card((p, i) => (i === 0 || i === 1 ? p - 1 : p)))
    save(snap, 'r1', 'p2', card((p, i) => (i === 17 ? null : i < 3 ? p - 1 : p)).filter(([h]) => h !== 18))
    const state = computeTournament(snap, settings)
    expect(state.modules.individual!.rows[0]!.playerId).toBe('p1')
    expect(state.feed[0]).toMatchObject({ kind: 'leadChange', playerId: 'p1', figure: '−2' })
    expect(feedText(state.feed[0]!, name)).toBe('¡Cambio de líder! P1 toma la punta con −2')
  })

  it('N4: when the replay already named the champion, the close adds nothing', () => {
    const settings = strokeSettings('net')
    const snap = snapOf(settings, [0, 0])
    save(snap, 'r1', 'p2', card((p) => p))
    save(snap, 'r1', 'p1', card((p, i) => (i === 0 ? p - 1 : p)))
    const state = computeTournament(snap, settings)
    const core = computeCore(snap, settings)
    const replay = computeFeed(snap, core, state.modules.snake, { scoring: mainScoring(settings), leaders: ranksPlayersByTotal(settings) })
    expect(state.feed).toEqual(replay)
  })
})

describe('lead changes in the feed (round 3)', () => {
  it('a leader who retakes the lead alone after a tie is not announced again', () => {
    const settings = strokeSettings('net')
    const snap = snapOf(settings, [0, 0], 1, false)
    // p1 leads after the 1st (birdie); p2 ties with a birdie on the 2nd; p1 goes ahead again on the 3rd.
    save(snap, 'r1', 'p2', [[1, PARS[0]!]])
    save(snap, 'r1', 'p1', [[1, PARS[0]! - 1]])
    save(snap, 'r1', 'p2', [[2, PARS[1]! - 1]])
    save(snap, 'r1', 'p1', [[2, PARS[1]!], [3, PARS[2]! - 1]])
    const leads = computeTournament(snap, settings).feed.filter((e) => e.kind === 'leadChange')
    expect(leads.map((e) => e.playerId)).toEqual(['p1'])
  })

  it('the close’s lead change keys apart from the save that led on the same hole', () => {
    const settings = strokeSettings('net')
    const snap = snapOf(settings, [0, 0])
    // p2 leaves the 9th blank: at the close his card ranks after p1's complete one (MONEY-02).
    save(snap, 'r1', 'p2', card((p) => p).filter(([h]) => h !== 9 && h < 17))
    save(snap, 'r1', 'p1', card((p) => p).slice(0, 17))
    // p1 takes the lead alone on the 18th; p2 birdies the 17th and 18th and leads the replay.
    save(snap, 'r1', 'p1', [[18, PARS[17]! - 1]])
    save(snap, 'r1', 'p2', [[17, PARS[16]! - 1], [18, PARS[17]! - 1]])
    const state = computeTournament(snap, settings)
    expect(state.modules.individual!.rows[0]!.playerId).toBe('p1')
    const leads = state.feed.filter((e) => e.kind === 'leadChange')
    expect(leads.map((e) => [e.playerId, e.hole, e.kind === 'leadChange' && !!e.close])).toEqual([['p1', 18, true], ['p2', 18, false], ['p1', 18, false]])
    const keys = state.feed.map(feedKey)
    expect(new Set(keys).size).toBe(keys.length)
  })
})

describe('stats under gross stroke play (stats.ts)', () => {
  const settings = strokeSettings('gross')
  const snap = snapOf(settings, [18, 18, 0, 0])
  // p1: gross bogey everywhere with a stroke a hole (net par). p2: gross double everywhere (net bogey).
  save(snap, 'r1', 'p1', card((p) => p + 1))
  save(snap, 'r1', 'p2', card((p) => p + 2))
  // p3: a pick-up on the 1st, pars after. p4: a birdie on the 1st, pars after.
  save(snap, 'r1', 'p3', card((p, i) => (i === 0 ? null : p)))
  save(snap, 'r1', 'p4', card((p, i) => (i === 0 ? p - 1 : p)))
  const stats = computeTournament(snap, settings).stats

  it('N9: pars and bogeys are read on the gross score the event counts', () => {
    expect(stats.players.p1).toMatchObject({ pars: 0, bogeys: 18 })
  })
  it('N10: a gross double bogey breaks the streak, even when it is a net bogey', () => {
    expect(stats.players.p2!.longestStreak).toBe(0)
  })
  it('N11: a pick-up is counted under «Levantó», not also under «Doble o peor»', () => {
    expect(stats.players.p3).toMatchObject({ pickUps: 1, doubleOrWorse: 0 })
  })
  it('M2: a birdie is not a par', () => {
    expect(stats.players.p4).toMatchObject({ pars: 17 })
  })
})

describe('El Resucitado under strokes (stats.ts)', () => {
  it('N15/M4: a player whose day 1 is not whole does not «gain» on day 2', () => {
    const settings = strokeSettings('net', 2)
    const snap = snapOf(settings, [0, 0], 2)
    // p1: day 1 only the front nine, all bogeys (+9); day 2 all pars. p2: day 1 +4, day 2 all pars.
    save(snap, 'r1', 'p1', card((p) => p + 1).slice(0, 9))
    save(snap, 'r1', 'p2', card((p, i) => (i < 4 ? p + 1 : p)))
    save(snap, 'r2', 'p1', card((p) => p))
    save(snap, 'r2', 'p2', card((p) => p))
    const award = computeTournament(snap, settings).stats.awards.find((a) => a.id === 'biggestGain')
    expect(award?.playerIds).toEqual(['p2'])
  })
})

describe('figure text (figureText.ts)', () => {
  const settings = strokeSettings('net')
  const snap = snapOf(settings, [18], 1, false)
  // Three holes, each a gross double with a stroke received: +3 net, +6 gross.
  save(snap, 'r1', 'p1', card((p) => p + 2).slice(0, 3))
  const pr = computeTournament(snap, settings).core.rounds.r1!.p1!

  it('N16: a team player\'s own day is over par when he is over par', () => {
    expect(ownDayText(pr, 'net')).toBe('+3 neto')
  })
  it('N17: under gross, his own day is his gross score', () => {
    expect(ownDayText(pr, 'gross')).toBe('+6 gross')
  })
  it('N27: a decided match says whose it was', () => {
    expect(dayFigureText({ value: 0, text: '8&6', tone: 'over', result: 'lost' })).toBe('perdió 8&6')
    expect(dayFigureText({ value: 1, text: '8&6', tone: 'under', result: 'won' })).toBe('ganó 8&6')
  })
  it('N7/M1: a bogey is plain on a card, under strokes and under points', () => {
    const h = pr.holes[0]!
    expect(holeMark({ ...h, gross: h.par + 2, strokesReceived: 1, points: 1 }, 'net')).toBeNull()
    expect(holeMark({ ...h, gross: h.par + 2, strokesReceived: 1, points: 1 }, 'points')).toBeNull()
  })
})
