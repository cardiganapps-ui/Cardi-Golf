/**
 * One hand-calculated case per format, on the same par-72 card, so the
 * arithmetic is checkable by eye. Every expected number is worked out in a
 * comment above the assertion.
 */
import { describe, expect, it } from 'vitest'
import { computeTournament } from '../computeTournament'
import { DEFAULT_SETTINGS } from '../settings/presets'
import { parseSettings, type TournamentSettings } from '../settings/schema'
import { PAR_72, makeGroup, makePlayer, makeSnapshot, score } from '../testing/fixtures'
import type { Snapshot } from '../types'

/** Scratch, so net equals gross and the sums are easy to follow. */
function settings(over: Partial<TournamentSettings> = {}): TournamentSettings {
  return {
    ...DEFAULT_SETTINGS,
    rounds: 1,
    handicap: { ...DEFAULT_SETTINGS.handicap, allowance: 1 },
    prizes: { ...DEFAULT_SETTINGS.prizes, stableford: [] },
    ...over,
  }
}

function withFormat(format: 'stableford' | 'strokePlay' | 'matchPlay' | 'team', options: Partial<TournamentSettings['modules']['individual']['formatOptions']> = {}, over: Partial<TournamentSettings> = {}) {
  const s = settings(over)
  return {
    ...s,
    modules: { ...s.modules, individual: { ...s.modules.individual, format, formatOptions: { ...s.modules.individual.formatOptions, ...options } } },
  }
}

/** Play a round as par plus a delta per hole. `null` means the player picked up. */
function play(snap: Snapshot, roundId: string, playerId: string, deltas: Array<number | null>) {
  PAR_72.forEach(([par], i) => {
    const d = deltas[i]
    if (d === undefined) return
    if (d === null) snap.scores.push(score(roundId, playerId, i + 1, null, 2, true))
    else snap.scores.push(score(roundId, playerId, i + 1, par + d, 2))
  })
}

const allPars = () => Array<number>(18).fill(0)

/** `makeSnapshot` puts the settings it was given on the row, where the type is raw jsonb. */
const cfgOf = (snap: Snapshot) => snap.tournament.settings as TournamentSettings

describe('stroke play', () => {
  it('counts strokes, fewest first, and shows the total against par', () => {
    const players = [1, 2, 3].map((i) => makePlayer(i, { baseHcp: 0 }))
    const snap = makeSnapshot({ players, rounds: 1, settings: withFormat('strokePlay', { scoring: 'gross' }) })
    play(snap, 'r1', 'p1', allPars()) //           18 pars       = 72, par 72 -> E
    play(snap, 'r1', 'p2', [1, ...Array<number>(17).fill(0)]) // one bogey    = 73 -> +1
    play(snap, 'r1', 'p3', [-1, ...Array<number>(17).fill(0)]) // one birdie  = 71 -> −1

    const state = computeTournament(snap, cfgOf(snap))
    const rows = state.modules.individual!.rows

    expect(state.modules.individual!.figureLabel).toBe('Gross')
    expect(rows.map((r) => r.playerId)).toEqual(['p3', 'p1', 'p2'])
    expect(rows.map((r) => r.figure.text)).toEqual(['−1', 'E', '+1'])
    expect(rows.map((r) => r.figure.value)).toEqual([71, 72, 73])
  })

  it('scores a pick-up as net double bogey, because stroke play needs a number', () => {
    // Hole 1 is a par 4 and this player is scratch, so the pick-up counts
    // 4 + 0 + 2 = 6. The other 17 holes are pars (68), so the round is 74.
    const players = [1, 2].map((i) => makePlayer(i, { baseHcp: 0 }))
    const snap = makeSnapshot({ players, rounds: 1, settings: withFormat('strokePlay', { scoring: 'gross' }) })
    play(snap, 'r1', 'p1', [null, ...Array<number>(17).fill(0)])
    play(snap, 'r1', 'p2', allPars())

    const rows = computeTournament(snap, cfgOf(snap)).modules.individual!.rows
    expect(rows.find((r) => r.playerId === 'p1')!.figure.value).toBe(74)
    expect(rows.find((r) => r.playerId === 'p1')!.figure.text).toBe('+2')
  })

  it('net subtracts the strokes each player receives', () => {
    // p2 plays off 18 at 100% allowance: one stroke on every hole. He goes
    // round in par+1 each hole (90 gross), so net is 90 − 18 = 72, level with
    // the scratch player's 72 — and the countback separates them.
    const players = [makePlayer(1, { baseHcp: 0 }), makePlayer(2, { baseHcp: 18 })]
    const snap = makeSnapshot({ players, rounds: 1, settings: withFormat('strokePlay', { scoring: 'net' }) })
    play(snap, 'r1', 'p1', allPars())
    play(snap, 'r1', 'p2', Array<number>(18).fill(1))

    const state = computeTournament(snap, cfgOf(snap))
    expect(state.modules.individual!.figureLabel).toBe('Neto')
    expect(state.modules.individual!.rows.map((r) => r.figure.value)).toEqual([72, 72])
    expect(state.modules.individual!.rows.every((r) => r.figure.text === 'E')).toBe(true)
  })
})

describe('match play', () => {
  it('wins a match 3&2 and stops counting once it is decided', () => {
    // p1 takes holes 1, 2 and 3; every other hole is halved. After 16 he is
    // 3 up with 2 to play, which is more than remain, so the match ends there
    // — even though both cards carry 17 and 18, and p2 wins both.
    const players = [1, 2].map((i) => makePlayer(i, { baseHcp: 0 }))
    const snap = makeSnapshot({ players, rounds: 1, settings: withFormat('matchPlay', { matchMode: 'singles', scoring: 'gross' }) })
    snap.groups = [makeGroup('r1', 1, ['p1', 'p2'])]
    play(snap, 'r1', 'p1', [...Array<number>(16).fill(0), 1, 1])
    play(snap, 'r1', 'p2', [1, 1, 1, ...Array<number>(13).fill(0), 0, 0])

    const state = computeTournament(snap, cfgOf(snap))
    const rows = state.modules.individual!.rows
    expect(rows[0]!.playerId).toBe('p1')
    expect(rows[0]!.perRound[0]!.text).toBe('3&2')
    expect(rows[0]!.figure.value).toBe(1) // a won match is one point
    // Both sides read the match's own score; the points column says who won it.
    expect(rows[1]!.perRound[0]!.text).toBe('3&2')
    expect(rows[1]!.figure.value).toBe(0)
  })

  it('halves a match and splits the point', () => {
    const players = [1, 2].map((i) => makePlayer(i, { baseHcp: 0 }))
    const snap = makeSnapshot({ players, rounds: 1, settings: withFormat('matchPlay', { matchMode: 'singles', scoring: 'gross' }) })
    snap.groups = [makeGroup('r1', 1, ['p1', 'p2'])]
    play(snap, 'r1', 'p1', allPars())
    play(snap, 'r1', 'p2', allPars())

    const rows = computeTournament(snap, cfgOf(snap)).modules.individual!.rows
    expect(rows.map((r) => r.perRound[0]!.text)).toEqual(['Empate', 'Empate'])
    expect(rows.map((r) => r.figure.value)).toEqual([0.5, 0.5])
    expect(rows.map((r) => r.figure.text)).toEqual(['½', '½'])
  })

  it('plays fourball off the better ball of each pair', () => {
    // Pair A is p1 + p2, pair B is p3 + p4. On hole 1 the best of pair A is a
    // par and the best of pair B a bogey, so A wins the hole; the rest halve.
    const players = [1, 2, 3, 4].map((i) => makePlayer(i, { baseHcp: 0 }))
    const snap = makeSnapshot({ players, rounds: 1, settings: withFormat('matchPlay', { matchMode: 'fourball', scoring: 'gross' }) })
    snap.pairs = [
      { id: 'A', name: 'Pareja A', player1Id: 'p1', player2Id: 'p2', kind: null, pickedByHonoree: false, drawnAt: null },
      { id: 'B', name: 'Pareja B', player1Id: 'p3', player2Id: 'p4', kind: null, pickedByHonoree: false, drawnAt: null },
    ]
    snap.groups = [makeGroup('r1', 1, ['p1', 'p2', 'p3', 'p4'])]
    play(snap, 'r1', 'p1', allPars()) // A's better ball on hole 1: par
    play(snap, 'r1', 'p2', [3, ...Array<number>(17).fill(0)])
    play(snap, 'r1', 'p3', [1, ...Array<number>(17).fill(0)]) // B's better ball: bogey
    play(snap, 'r1', 'p4', [2, ...Array<number>(17).fill(0)])

    const state = computeTournament(snap, cfgOf(snap))
    const rows = state.modules.individual!.rows
    expect(state.modules.individual!.byTeam).toBe(true)
    expect(rows[0]!.entrant.name).toBe('Pareja A')
    expect(rows[0]!.perRound[0]!.text).toBe('1 arriba')
    expect(rows[0]!.figure.value).toBe(1)
  })

  it('says so when a group is not a match instead of scoring it wrong', () => {
    const players = [1, 2, 3].map((i) => makePlayer(i, { baseHcp: 0 }))
    const snap = makeSnapshot({ players, rounds: 1, settings: withFormat('matchPlay', { matchMode: 'singles' }) })
    snap.groups = [makeGroup('r1', 1, ['p1', 'p2', 'p3'])]
    play(snap, 'r1', 'p1', allPars())

    const state = computeTournament(snap, cfgOf(snap))
    expect(state.modules.individual!.warnings.join(' ')).toContain('exactamente dos jugadores')
  })
})

describe('team formats', () => {
  it('best ball takes the better score on every hole', () => {
    // Team A: p1 pars every hole, p2 is worse everywhere, so A's card is 72.
    // Team B: p3 birdies hole 1 and pars the rest (71), p4 is worse. B wins.
    const players = [1, 2, 3, 4].map((i) => makePlayer(i, { baseHcp: 0 }))
    const snap = makeSnapshot({ players, rounds: 1, settings: withFormat('team', { teamMode: 'bestBall', teamScoring: 'strokes', scoring: 'gross' }) })
    snap.pairs = [
      { id: 'A', name: 'Equipo A', player1Id: 'p1', player2Id: 'p2', kind: null, pickedByHonoree: false, drawnAt: null },
      { id: 'B', name: 'Equipo B', player1Id: 'p3', player2Id: 'p4', kind: null, pickedByHonoree: false, drawnAt: null },
    ]
    play(snap, 'r1', 'p1', allPars())
    play(snap, 'r1', 'p2', Array<number>(18).fill(2))
    play(snap, 'r1', 'p3', [-1, ...Array<number>(17).fill(0)])
    play(snap, 'r1', 'p4', Array<number>(18).fill(3))

    const state = computeTournament(snap, cfgOf(snap))
    const rows = state.modules.individual!.rows
    expect(rows.map((r) => r.entrant.name)).toEqual(['Equipo B', 'Equipo A'])
    expect(rows.map((r) => r.figure.value)).toEqual([71, 72])
    expect(rows.map((r) => r.figure.text)).toEqual(['−1', 'E'])
  })

  it('counts a team on Stableford points when the tournament asks for it', () => {
    // Scratch, so a par is 2 points and a birdie 3. Team A's better ball is
    // 17 pars and one birdie: 17 × 2 + 3 = 37.
    const players = [1, 2].map((i) => makePlayer(i, { baseHcp: 0 }))
    const snap = makeSnapshot({ players, rounds: 1, settings: withFormat('team', { teamMode: 'bestBall', teamScoring: 'stableford' }) })
    snap.pairs = [{ id: 'A', name: 'Equipo A', player1Id: 'p1', player2Id: 'p2', kind: null, pickedByHonoree: false, drawnAt: null }]
    play(snap, 'r1', 'p1', [-1, ...Array<number>(17).fill(0)])
    play(snap, 'r1', 'p2', Array<number>(18).fill(2))

    const state = computeTournament(snap, cfgOf(snap))
    expect(state.modules.individual!.figureLabel).toBe('Puntos')
    expect(state.modules.individual!.rows[0]!.figure.value).toBe(37)
  })

  it('asks for a draw instead of showing an empty board', () => {
    const players = [1, 2].map((i) => makePlayer(i, { baseHcp: 0 }))
    const snap = makeSnapshot({ players, rounds: 1, settings: withFormat('team') })
    const state = computeTournament(snap, cfgOf(snap))
    expect(state.modules.individual!.warnings.join(' ')).toContain('equipos sorteados')
  })
})

describe('the seam itself', () => {
  it('leaves the money alone: the same prizes whatever the main format is', () => {
    // The pot pays 1st and 2nd the same amounts; who wins changes with the
    // format, but the total that leaves the bank does not.
    const players = [1, 2].map((i) => makePlayer(i, { baseHcp: 0 }))
    const prizes = { ...DEFAULT_SETTINGS.prizes, stableford: [1000, 500] }
    const mk = (format: 'stableford' | 'strokePlay') => {
      const snap = makeSnapshot({ players, rounds: 1, settings: withFormat(format, { scoring: 'gross' }, { entryFee: 750, prizes }) })
      play(snap, 'r1', 'p1', allPars())
      play(snap, 'r1', 'p2', [1, ...Array<number>(17).fill(0)])
      return computeTournament(snap, cfgOf(snap))
    }
    const totalPaid = (s: ReturnType<typeof computeTournament>) => s.prizes.reduce((a, p) => a + p.amount, 0)

    expect(totalPaid(mk('stableford'))).toBe(1500)
    expect(totalPaid(mk('strokePlay'))).toBe(1500)
    // p1 wins either way here, so the split is identical too.
    expect(mk('stableford').modules.individual!.rows[0]!.playerId).toBe('p1')
    expect(mk('strokePlay').modules.individual!.rows[0]!.playerId).toBe('p1')
  })

  it('reads a tournament saved before formats existed as Stableford', () => {
    // No `format` and no `formatOptions` on the row: the defaults fill in and
    // nothing has to be migrated.
    const legacy = { ...DEFAULT_SETTINGS, modules: { ...DEFAULT_SETTINGS.modules, individual: { enabled: true, label: 'Individual' } } }
    const parsed = parseSettings(legacy).modules.individual
    expect(parsed.format).toBe('stableford')
    expect(parsed.formatOptions.scoring).toBe('net')
  })
})
