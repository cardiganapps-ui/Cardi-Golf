/**
 * MONEY-09: a balanced pool can still pay a place nobody can occupy. A 4th
 * prize with three players, a 2nd pairs prize with one pair, a low score
 * paying three places to two entrants: the money stayed with the bank, under
 * a green check at setup and a red verdict at the end. The check now refuses
 * those places, the boards warn once the field shrinks, and an entrant with
 * no result never takes a paid place.
 */
import { describe, expect, it } from 'vitest'
import { computeTournament, type TournamentState } from '../computeTournament'
import type { GameConfig, GameMoney } from './games'
import { checkPrizePool } from './prizeCheck'
import { DEFAULT_SETTINGS, FIRST_TOURNAMENT_PLAYER_COUNT, FIRST_TOURNAMENT_SETTINGS } from './presets'
import type { TournamentSettings } from './schema'
import { makeGroup, makePlayer, makeSnapshot, PAR_72, score } from '../testing/fixtures'
import type { Snapshot } from '../types'

type Over = Partial<TournamentSettings> & { format?: TournamentSettings['modules']['individual']['format']; matchMode?: 'singles' | 'fourball' }

function settings(over: Over = {}): TournamentSettings {
  const { format, matchMode, ...rest } = over
  const s: TournamentSettings = { ...structuredClone(DEFAULT_SETTINGS), ...rest }
  if (format) s.modules.individual = { ...s.modules.individual, format, formatOptions: { ...s.modules.individual.formatOptions, ...(matchMode ? { matchMode } : {}) } }
  return s
}
const prizes = (over: Partial<TournamentSettings['prizes']>): TournamentSettings['prizes'] => ({ ...DEFAULT_SETTINGS.prizes, ...over })
const money = (over: Partial<GameMoney>): GameMoney => ({ source: 'none', buyIn: 0, amount: 0, stake: 0, split: [100], ...over })
const low = (m: GameMoney, scope: 'overall' | 'perRound' = 'overall', entrants: 'all' | 'list' = 'all'): GameConfig => ({ id: 'low', type: 'lowScore', label: 'Low neto', enabled: true, rounds: 'all', entrants, options: { basis: 'net', scope }, money: m })
const strip = (c: ReturnType<typeof checkPrizePool>) => c.unreachable.map(({ id, places, reachable, amount }) => ({ id, places, reachable, amount }))

describe('the prize check: places nobody can occupy (MONEY-09)', () => {
  it('3 players and a 4th prize: balanced, but not ok; the $2,000 of the 4th has no taker', () => {
    const s = settings({ entryFee: 2000, prizes: prizes({ stableford: [3000, 500, 500, 2000] }) })
    const c = checkPrizePool(s, { players: 3 })
    expect(c.balanced).toBe(true)
    expect(c.ok).toBe(false)
    expect(strip(c)).toEqual([{ id: 'individual', places: 4, reachable: 3, amount: 2000 }])
    expect(c.unreachable[0]!.detail).toBe('4 lugares con premio y 3 jugadores')
    // With a 4th player the same prizes are fine.
    expect(checkPrizePool({ ...s, entryFee: 1500 }, { players: 4 }).ok).toBe(true)
  })

  it('percent places: 3 places for 2 players leave the 3rd share', () => {
    const s = settings({ entryFee: 1000, prizes: prizes({ stableford: [50, 30, 20], stablefordMode: 'percent' }) })
    // $2,000 → $1,000 / $600 / $400.
    expect(strip(checkPrizePool(s, { players: 2 }))).toEqual([{ id: 'individual', places: 3, reachable: 2, amount: 400 }])
  })

  it('a team format counts teams: drawn ones, else half the field at most', () => {
    const s = settings({ format: 'team', entryFee: 1000, prizes: prizes({ stableford: [4000, 2000, 1500, 500] }) })
    // 8 players can make 4 teams of two: nothing to say before the draw.
    expect(checkPrizePool(s, { players: 8 }).ok).toBe(true)
    // Drawn as 3 teams: the 4th prize has no team.
    expect(strip(checkPrizePool(s, { players: 8, teams: 3 }))).toEqual([{ id: 'individual', places: 4, reachable: 3, amount: 500 }])
    expect(checkPrizePool(s, { players: 8, teams: 3 }).unreachable[0]!.detail).toBe('4 lugares con premio y 3 equipos')
  })

  it('fourball match play with two players is one side: its 2nd prize has nobody (the panel’s case)', () => {
    const s = settings({ format: 'matchPlay', matchMode: 'fourball', entryFee: 777, prizes: prizes({ stableford: [1117, 437] }) })
    const c = checkPrizePool(s, { players: 2 })
    expect(c.balanced).toBe(true)
    expect(strip(c)).toEqual([{ id: 'individual', places: 2, reachable: 1, amount: 437 }])
    expect(c.unreachable[0]!.detail).toBe('2 lugares con premio y 1 equipo')
  })

  it('the pairs game counts pairs: [$2,000, $1,000] with one pair leaves $1,000', () => {
    const s = settings({ entryFee: 1500, prizes: prizes({ stableford: [], pairs: [2000, 1000] }) })
    s.modules.pairs = { ...s.modules.pairs, enabled: true }
    s.modules.individual = { ...s.modules.individual, enabled: false }
    const c = checkPrizePool(s, { players: 2 })
    expect(c.balanced).toBe(true)
    expect(strip(c)).toEqual([{ id: 'pairs', places: 2, reachable: 1, amount: 1000 }])
    expect(c.unreachable[0]!.detail).toBe('2 lugares con premio y 1 pareja')
    // Drawn pairs win over the estimate.
    expect(checkPrizePool(s, { players: 6, pairs: 1 }).unreachable.map((u) => u.reachable)).toEqual([1])
  })

  it('a low-score side pot paying 50/30/20 to two entrants strands the 3rd: $60 of $300', () => {
    const s = settings({ games: [low(money({ source: 'side', buyIn: 150, split: [50, 30, 20] }), 'overall', 'list')] })
    const c = checkPrizePool(s, { players: 6, entrants: { low: 2 } })
    expect(strip(c)).toEqual([{ id: 'game:low', places: 3, reachable: 2, amount: 60 }])
    expect(c.ok).toBe(false)
  })

  it('a low score from the inscriptions, per day: each day’s pot strands its own share', () => {
    const s = settings({ rounds: 2, entryFee: 400, games: [low(money({ source: 'main', amount: 400, split: [60, 40] }), 'perRound', 'list')] })
    // $200 a day, 60/40 → $120 / $80; one entrant leaves $80 a day.
    expect(strip(checkPrizePool(s, { players: 1, entrants: { low: 1 } }))).toEqual([{ id: 'game:low', places: 2, reachable: 1, amount: 160 }])
  })

  it('nothing to say with no players yet, or for the first tournament as planned', () => {
    const s = settings({ entryFee: 2000, prizes: prizes({ stableford: [3000, 500, 500, 2000] }) })
    expect(checkPrizePool(s, { players: 0 }).unreachable).toEqual([])
    const first = checkPrizePool(FIRST_TOURNAMENT_SETTINGS, { players: FIRST_TOURNAMENT_PLAYER_COUNT })
    expect(first.unreachable).toEqual([])
    expect(first.ok).toBe(true)
  })
})

/** Strokes for one player: par on every hole of the first `holes`. */
function card(snap: Snapshot, roundId: string, pid: string, diffs: Record<number, number> = {}, holes = 18) {
  for (let h = 1; h <= holes; h++) snap.scores.push(score(roundId, pid, h, PAR_72[h - 1]![0] + (diffs[h] ?? 0), 2))
}
function finish(snap: Snapshot) {
  snap.rounds.forEach((r) => (r.status = 'finished'))
  snap.tournament.status = 'finished'
}
const run = (snap: Snapshot): TournamentState => computeTournament(snap, snap.tournament.settings as TournamentSettings)
const paid = (st: TournamentState, moduleId: string) => Object.fromEntries(st.prizes.filter((p) => p.moduleId === moduleId).map((p) => [p.playerId, p.amount]))

describe('the boards: an entrant with no result takes no paid place (MONEY-09)', () => {
  function four(prizeList: number[]) {
    const s = settings({ entryFee: 1000, prizes: prizes({ stableford: prizeList }) })
    const snap = makeSnapshot({ settings: s, players: [1, 2, 3, 4].map((i) => makePlayer(i, { baseHcp: 0 })), rounds: 1 })
    snap.groups = [makeGroup('r1', 1, ['p1', 'p2', 'p3', 'p4'])]
    return snap
  }

  it('a player who never played is not paid 4th; the 4th stays unassigned, and the Comité is told', () => {
    const snap = four([2000, 1000, 600, 400])
    card(snap, 'r1', 'p1', { 1: -1 })
    card(snap, 'r1', 'p2')
    card(snap, 'r1', 'p3', { 2: 1 })
    // p4 never teed off.
    finish(snap)
    const st = run(snap)
    expect(paid(st, 'individual')).toEqual({ p1: 2000, p2: 1000, p3: 600 })
    expect(st.flags.warnings).toContain('Individual: el 4.º lugar no lo gana nadie (3 jugadores con resultado): $400 sin asignar. El Comité decide.')
    // He still shows on the board, last.
    expect(st.modules.individual!.rows.at(-1)!.playerId).toBe('p4')
  })

  it('while the round is on, the one who has not started is simply not in the money yet', () => {
    const snap = four([2000, 1000, 600, 400])
    card(snap, 'r1', 'p1', {}, 9)
    card(snap, 'r1', 'p2', {}, 9)
    card(snap, 'r1', 'p3', {}, 9)
    const st = run(snap)
    expect(Object.keys(paid(st, 'individual')).sort()).toEqual(['p1', 'p2', 'p3'])
    expect(st.flags.warnings.filter((w) => w.includes('no lo gana nadie'))).toEqual([])
  })

  it('a field that shrank below the places: one warning while playing, the game’s own once final', () => {
    const snap = four([2000, 1000, 600, 400])
    snap.players = snap.players.filter((p) => p.id !== 'p4')
    snap.groups[0]!.playerIds = ['p1', 'p2', 'p3']
    for (const id of ['p1', 'p2', 'p3']) card(snap, 'r1', id, {}, 9)
    let st = run(snap)
    const live = st.flags.warnings.filter((w) => w.startsWith('Individual:'))
    expect(live).toEqual(['Individual: 4 lugares con premio y 3 jugadores, $400 que nadie puede ganar. El Comité ajusta los premios en Comité, sección Torneo.'])
    finish(snap)
    st = run(snap)
    expect(st.flags.warnings.filter((w) => w.startsWith('Individual:'))).toEqual(['Individual: el 4.º lugar no lo gana nadie (3 jugadores con resultado): $400 sin asignar. El Comité decide.'])
  })

  it('fourball with one side and no match: nobody is paid 1st for a match never played', () => {
    const s = settings({ format: 'matchPlay', matchMode: 'fourball', entryFee: 777, prizes: prizes({ stableford: [1117, 437] }) })
    const snap = makeSnapshot({ settings: s, players: [1, 2].map((i) => makePlayer(i, { baseHcp: 0 })), rounds: 1 })
    snap.pairs = [{ id: 'A', name: 'Pareja A', player1Id: 'p1', player2Id: 'p2', kind: null, pickedByHonoree: false, drawnAt: null }]
    snap.groups = [makeGroup('r1', 1, ['p1', 'p2'])]
    card(snap, 'r1', 'p1')
    card(snap, 'r1', 'p2')
    finish(snap)
    const st = run(snap)
    expect(paid(st, 'individual')).toEqual({})
    expect(st.flags.warnings).toContain('Individual: los lugares 1.º y 2.º no los gana nadie (nadie tiene resultado): $1,554 sin asignar. El Comité decide.')
  })

  it('the pairs game: a pair neither of whom played is not paid 2nd', () => {
    const s = settings({ entryFee: 750, prizes: prizes({ stableford: [], pairs: [2000, 1000] }) })
    s.modules.individual = { ...s.modules.individual, enabled: false }
    s.modules.pairs = { ...s.modules.pairs, enabled: true }
    const snap = makeSnapshot({ settings: s, players: [1, 2, 3, 4].map((i) => makePlayer(i, { baseHcp: 0 })), rounds: 1 })
    snap.pairs = [
      { id: 'A', name: 'Pareja A', player1Id: 'p1', player2Id: 'p2', kind: null, pickedByHonoree: false, drawnAt: null },
      { id: 'B', name: 'Pareja B', player1Id: 'p3', player2Id: 'p4', kind: null, pickedByHonoree: false, drawnAt: null },
    ]
    snap.groups = [makeGroup('r1', 1, ['p1', 'p2', 'p3', 'p4'])]
    card(snap, 'r1', 'p1')
    card(snap, 'r1', 'p2')
    finish(snap)
    const st = run(snap)
    expect(paid(st, 'pairs')).toEqual({ p1: 1000, p2: 1000 })
    expect(st.flags.warnings).toContain('Parejas: el 2.º lugar no lo gana nadie (1 pareja con resultado): $1,000 sin asignar. El Comité decide.')
  })

  it('low score: three places and two cards, once final the 3rd is named with its pesos', () => {
    const s = settings({ games: [low(money({ source: 'side', buyIn: 100, split: [50, 30, 20] }))] })
    const snap = makeSnapshot({ settings: s, players: [1, 2, 3].map((i) => makePlayer(i, { baseHcp: 0 })), rounds: 1 })
    snap.groups = [makeGroup('r1', 1, ['p1', 'p2', 'p3'])]
    card(snap, 'r1', 'p1', { 1: -1 })
    card(snap, 'r1', 'p2')
    finish(snap)
    const st = run(snap)
    expect(paid(st, 'lowScore')).toEqual({ p1: 150, p2: 90 })
    expect(st.flags.warnings).toContain('Low neto: el 3.º lugar no lo gana nadie (2 jugadores con resultado): $60 sin asignar. El Comité decide.')
  })
})

