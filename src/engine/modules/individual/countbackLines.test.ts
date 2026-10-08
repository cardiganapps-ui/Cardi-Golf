/**
 * Suggested by #91's fourth verifier: the round-4 lines and lengths nothing pinned yet.
 * A match day under way reads «cómo va», a side that hasn't teed off is not «empatado»'s twin of a played day,
 * and a team event's countback reads its last round on that round's own length, live or not.
 */
import { expect, it } from 'vitest'
import { getFixture } from '../../../dev/fixtures'
import { computeTournament } from '../../computeTournament'
import { parseSettings } from '../../settings/schema'
import { DEFAULT_SETTINGS } from '../../settings/presets'
import { PAR_72, makeGroup, makePlayer, makeRound, makeSnapshot, score } from '../../testing/fixtures'
import type { Snapshot } from '../../types'

const PARS = PAR_72.map(([p]) => p)
const rows = (snap: Snapshot) => computeTournament(snap, parseSettings(snap.tournament.settings)).modules.individual!.rows
const steps = (snap: Snapshot, name: string) => rows(snap).find((r) => r.entrant.name === name)!.countbackWhy?.steps ?? []

it('match play, day 2 under way: a live pair «va», an unstarted pair «todavía no»', () => {
  // match8's eight players over two days: day 1 as in the fixture, day 2 drawn winners v winners, losers v losers.
  const fx = getFixture('match8')!
  const snap = structuredClone(fx.snapshot)
  const st = snap.tournament.settings as typeof DEFAULT_SETTINGS
  snap.tournament.settings = { ...st, rounds: 2 }
  snap.rounds = [{ ...snap.rounds[0]!, status: 'finished' }, makeRound(2, { status: 'live' })]
  const p = (n: string) => fx.snapshot.players.find((x) => x.displayName === n)!.id
  // Day 2: Elías beats Leonel on every hole through 10 (10&8, over); Iván J. leads Gael H. by 2 after 2; Fabián v Matías, Julián v Hugo I. not started.
  snap.groups.push(makeGroup('r2', 1, [p('Elías'), p('Leonel')]), makeGroup('r2', 2, [p('Iván J.'), p('Gael H.')]), makeGroup('r2', 3, [p('Fabián'), p('Matías')]), makeGroup('r2', 4, [p('Julián'), p('Hugo I.')]))
  for (let h = 1; h <= 10; h++) {
    snap.scores.push(score('r2', p('Elías'), h, PARS[h - 1]! - 1, 1))
    snap.scores.push(score('r2', p('Leonel'), h, PARS[h - 1]! + 3, 2))
  }
  for (let h = 1; h <= 2; h++) {
    snap.scores.push(score('r2', p('Iván J.'), h, PARS[h - 1]! - 1, 1))
    snap.scores.push(score('r2', p('Gael H.'), h, PARS[h - 1]! + 3, 2))
  }
  // Both under way: «cómo va». Neither started: «todavía no».
  expect(steps(snap, 'Gael H.')).toContain('Día 2, cómo va su partido: Iván J. 2 arriba contra Gael H. 2 abajo')
  expect(steps(snap, 'Hugo I.')).toContain('Día 2: todavía no juegan su partido')
})

function teams(lens: number[], status: Array<'finished' | 'live'>, thru: number[]): Snapshot {
  const s = structuredClone(DEFAULT_SETTINGS)
  s.rounds = lens.length
  s.entryFee = 500
  s.prizes = { ...s.prizes, stableford: [60, 40], stablefordMode: 'percent' }
  s.modules.individual = { ...s.modules.individual, format: 'team', formatOptions: { ...s.modules.individual.formatOptions, teamMode: 'bestBall', teamScoring: 'strokes', scoring: 'gross' } }
  const settings = parseSettings(s)
  const players = [1, 2, 3, 4].map((i) => makePlayer(i, { baseHcp: 0 }))
  const snap = makeSnapshot({ players, rounds: lens.map((n, i) => makeRound(i + 1, { status: status[i]!, holes: n as 9 | 18 })), settings, status: status.at(-1)! })
  snap.groups = lens.map((_, i) => makeGroup(`r${i + 1}`, 1, ['p1', 'p2', 'p3', 'p4']))
  snap.pairs = [
    { id: 'tA', name: 'A', player1Id: 'p1', player2Id: 'p2', kind: null, pickedByHonoree: false, drawnAt: null },
    { id: 'tB', name: 'B', player1Id: 'p3', player2Id: 'p4', kind: null, pickedByHonoree: false, drawnAt: null },
  ]
  lens.forEach((_, i) => {
    const last = i === lens.length - 1
    const n = thru[i]!
    // Last round: A birdies the 1st and bogeys the last hole played, B the other way round. Partners bogey everything.
    for (let h = 1; h <= n; h++) {
      const par = PARS[h - 1]!
      snap.scores.push(score(`r${i + 1}`, 'p1', h, last && h === 1 ? par - 1 : last && h === n ? par + 1 : par, 2))
      snap.scores.push(score(`r${i + 1}`, 'p3', h, last && h === 1 ? par + 1 : last && h === n ? par - 1 : par, 2))
      snap.scores.push(score(`r${i + 1}`, 'p2', h, par + 1, 2))
      snap.scores.push(score(`r${i + 1}`, 'p4', h, par + 1, 2))
    }
  })
  return snap
}

it('a team event of an 18 and a 9 breaks its tie on the nine’s own 5–9; of a 9 and an 18, on 10–18', () => {
  expect(steps(teams([18, 9], ['finished', 'finished'], [18, 9]), 'A')).toContain('Día 2, Hoyos 5–9: B −1 contra A +1')
  expect(steps(teams([9, 18], ['finished', 'finished'], [9, 18]), 'A')).toContain('Día 2, Hoyos 10–18: B −1 contra A +1')
})

it('an 18-hole team day live through 9 still reads 10–18: the tie stands, shared', () => {
  const r = rows(teams([18], ['live'], [9]))
  expect(r.map((x) => x.label)).toEqual(['T1', 'T1'])
})

it('a team that has not started the last nine still breaks its tie on that nine’s holes (NEW-07, #91 round 5)', () => {
  const snap = teams([9, 9], ['finished', 'live'], [9, 6])
  // Team B hasn't teed off on day 2.
  snap.scores = snap.scores.filter((s) => !(s.roundId === 'r2' && (s.playerId === 'p3' || s.playerId === 'p4')))
  const all = rows(snap).flatMap((r) => r.countbackWhy?.steps ?? [])
  expect(all.join('\n')).not.toMatch(/Hoyos 10–18|Hoyo 18/)
})

it('match play: a side whose match is over and one that hasn’t teed off are each worded on their own', () => {
  const fx = getFixture('match8')!
  const snap = structuredClone(fx.snapshot)
  const st = snap.tournament.settings as typeof DEFAULT_SETTINGS
  snap.tournament.settings = { ...st, rounds: 2 }
  snap.rounds = [{ ...snap.rounds[0]!, status: 'finished' }, makeRound(2, { status: 'live' })]
  const p = (n: string) => fx.snapshot.players.find((x) => x.displayName === n)!.id
  snap.groups.push(makeGroup('r2', 1, [p('Elías'), p('Leonel')]), makeGroup('r2', 2, [p('Fabián'), p('Matías')]))
  for (let h = 1; h <= 10; h++) {
    snap.scores.push(score('r2', p('Elías'), h, PARS[h - 1]! - 1, 1))
    snap.scores.push(score('r2', p('Leonel'), h, PARS[h - 1]! + 3, 2))
  }
  const all = rows(snap).flatMap((r) => r.countbackWhy?.steps ?? [])
  expect(all.join('\n')).not.toMatch(/empatado/)
  expect(all.join('\n')).toMatch(/terminó 10 arriba contra .* no ha salido|no ha salido contra .* terminó 10 arriba/)
})

it('a finished bracket: players out before the last day never read «todavía no juegan»', () => {
  // bracket8 with its last day closed: the players knocked out earlier never play it.
  const snap = structuredClone(getFixture('bracket8')!.snapshot)
  snap.rounds = snap.rounds.map((r) => ({ ...r, status: 'finished' as const }))
  const all = rows(snap).flatMap((r) => r.countbackWhy?.steps ?? []).join('\n')
  expect(all).not.toMatch(/todavía no juegan/)
  expect(all).toMatch(/Día 3: ninguno jugó partido ese día/)
})
