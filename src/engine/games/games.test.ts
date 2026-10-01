/**
 * The four computed instance games, each checked by hand. Players play off
 * handicap 0 (gross = net) unless a test says otherwise. Course: PAR_72.
 */
import { describe, expect, it } from 'vitest'
import { computeTournament, type TournamentState } from '../computeTournament'
import { DEFAULT_SETTINGS } from '../settings/presets'
import type { GameConfig, GameMoney } from '../settings/games'
import type { TournamentSettings } from '../settings/schema'
import { makeGroup, makePlayer, makeRound, makeSnapshot, PAR_72, score } from '../testing/fixtures'
import type { Snapshot } from '../types'
import type { SkinsState } from './skins'
import type { MatchState } from './match'

const PARS = PAR_72.map(([p]) => p)

function money(over: Partial<GameMoney>): GameMoney {
  return { source: 'none', buyIn: 0, amount: 0, stake: 0, split: [100], ...over }
}

function setup(games: GameConfig[], opts: { players?: number; rounds?: number; hcp?: number; holes?: 9 | 18 } = {}): Snapshot {
  const settings: TournamentSettings = { ...DEFAULT_SETTINGS, rounds: opts.rounds ?? 1, games }
  const players = Array.from({ length: opts.players ?? 3 }, (_, i) => makePlayer(i + 1, { baseHcp: opts.hcp ?? 0 }))
  const rounds = Array.from({ length: opts.rounds ?? 1 }, (_, i) => makeRound(i + 1, { holes: opts.holes ?? 18 }))
  return makeSnapshot({ settings, players, rounds })
}

/** Strokes for one player: par everywhere except the given holes. */
function card(snap: Snapshot, roundId: string, pid: string, diffs: Record<number, number> = {}, opts: { holes?: number; putts?: Record<number, number> } = {}) {
  for (let h = 1; h <= (opts.holes ?? 18); h++) snap.scores.push(score(roundId, pid, h, PARS[h - 1]! + (diffs[h] ?? 0), opts.putts?.[h] ?? 2))
}

function run(snap: Snapshot): TournamentState {
  return computeTournament(snap, snap.tournament.settings as TournamentSettings)
}

function finish(snap: Snapshot) {
  snap.rounds.forEach((r) => (r.status = 'finished'))
  snap.tournament.status = 'finished'
}

const skins = (m: GameMoney, carryOver = true, basis: 'gross' | 'net' = 'gross'): GameConfig => ({ id: 'skins', type: 'skins', label: 'Skins', enabled: true, rounds: 'all', entrants: 'all', options: { basis, carryOver }, money: m })

describe('skins', () => {
  // Hole 1: J1 birdie, alone → 1 skin. Hole 2: all par → carries. Hole 3: J2 birdie → 2 skins.
  // Holes 4–18 all par → 15 skins ride to the end and are not paid.
  function play(snap: Snapshot) {
    card(snap, 'r1', 'p1', { 1: -1 })
    card(snap, 'r1', 'p2', { 3: -1 })
    card(snap, 'r1', 'p3')
    finish(snap)
  }

  it('carry-over: side pot 3 × $100 = $300 ÷ 3 skins = $100 each → J1 $100, J2 $200', () => {
    const snap = setup([skins(money({ source: 'side', buyIn: 100 }))])
    play(snap)
    const st = run(snap)
    const s = st.games.skins!.state as SkinsState
    expect(s.units).toEqual({ p1: 1, p2: 2, p3: 0 })
    expect(s.holes[2]).toMatchObject({ hole: 3, winnerId: 'p2', value: 2, status: 'won' })
    expect(s.unclaimed).toBe(15)
    const paid = Object.fromEntries(st.prizes.filter((p) => p.gameId === 'skins').map((p) => [p.playerId, p.amount]))
    expect(paid).toEqual({ p1: 100, p2: 200 })
    expect(st.money.banker.balanced).toBe(true)
  })

  it('without carry-over the hole-3 skin is worth 1: $300 ÷ 2 = $150 each', () => {
    const snap = setup([skins(money({ source: 'side', buyIn: 100 }), false)])
    play(snap)
    const paid = Object.fromEntries(run(snap).prizes.map((p) => [p.playerId, p.amount]))
    expect(paid).toEqual({ p1: 150, p2: 150 })
  })

  it('direct: $10 per skin from each player, netted: J1 pays J2 $10, J3 pays J1 $10 and J2 $20', () => {
    const snap = setup([skins(money({ source: 'direct', stake: 10 }))])
    play(snap)
    const bets = run(snap).money.flows.filter((f) => f.kind === 'bet').map((f) => `${f.from}>${f.to}:${f.amount}`).sort()
    // J1 won 1 skin: +$10 from J2, +$10 from J3. J2 won 2: +$20 from J1, +$20 from J3.
    expect(bets).toEqual(['p1>p2:10', 'p3>p1:10', 'p3>p2:20'])
  })

  it('a hole resolves only when every entrant has played it; later holes wait', () => {
    const snap = setup([skins(money({ source: 'side', buyIn: 100 }))])
    card(snap, 'r1', 'p1', { 1: -1 })
    card(snap, 'r1', 'p2', { 3: -1 })
    card(snap, 'r1', 'p3', {}, { holes: 2 }) // J3 is on the 3rd tee
    const s = run(snap).games.skins!.state as SkinsState
    expect(s.holes.slice(0, 3).map((h) => h.status)).toEqual(['won', 'tied', 'pending'])
    expect(s.holes[2]!.value).toBe(2)
    expect(s.units).toEqual({ p1: 1, p2: 0, p3: 0 })
    // Board note: the carry riding to the next hole.
    expect(run(snap).games.skins!.board.notes[0]).toContain('2 skins para el hoyo 3')
  })

  it('net skins use strokes received: a stroke on SI 1 turns a par into a net birdie', () => {
    const snap = setup([skins(money({ source: 'side', buyIn: 100 }), true, 'net')])
    // J1 plays off 1 (base 1.25 → 80% = 1): a stroke on hole 5 (SI 1).
    snap.players[0]!.baseHcp = 1.25
    card(snap, 'r1', 'p1')
    card(snap, 'r1', 'p2')
    card(snap, 'r1', 'p3')
    finish(snap)
    const s = run(snap).games.skins!.state as SkinsState
    expect(s.units.p1).toBe(5) // holes 1–4 carry into hole 5
  })

  it('9-hole round: nine skins at most, all resolved', () => {
    const snap = setup([skins(money({ source: 'none' }))], { holes: 9 })
    card(snap, 'r1', 'p1', { 9: -1 }, { holes: 9 })
    card(snap, 'r1', 'p2', {}, { holes: 9 })
    card(snap, 'r1', 'p3', {}, { holes: 9 })
    finish(snap)
    const s = run(snap).games.skins!.state as SkinsState
    expect(s.holes).toHaveLength(9)
    expect(s.units.p1).toBe(9)
  })
})

describe('low score', () => {
  it('per round, net, 4 × $100 = $400 → $200 a day paid 60/40', () => {
    const g: GameConfig = { id: 'low', type: 'lowScore', label: 'Low neto', enabled: true, rounds: 'all', entrants: 'all', options: { basis: 'net', scope: 'perRound' }, money: money({ source: 'side', buyIn: 100, split: [60, 40] }) }
    const snap = setup([g], { players: 4, rounds: 2 })
    // Day 1: J1 −2, J2 −1, J3 E, J4 +1. Day 2: J4 −3, J3 −1, J1/J2 E.
    card(snap, 'r1', 'p1', { 1: -1, 2: -1 })
    card(snap, 'r1', 'p2', { 1: -1 })
    card(snap, 'r1', 'p3')
    card(snap, 'r1', 'p4', { 1: 1 })
    card(snap, 'r2', 'p1')
    card(snap, 'r2', 'p2')
    card(snap, 'r2', 'p3', { 4: -1 })
    card(snap, 'r2', 'p4', { 4: -1, 5: -1, 6: -1 })
    finish(snap)
    const st = run(snap)
    const paid = st.prizes.filter((p) => p.gameId === 'low').map((p) => `${p.label}=${p.amount}`)
    // $200 per day: 60% = $120, 40% = $80.
    expect(paid.sort()).toEqual(['Low neto, Día 1, 1.º=120', 'Low neto, Día 1, 2.º=80', 'Low neto, Día 2, 1.º=120', 'Low neto, Día 2, 2.º=80'])
    expect(st.prizes.find((p) => p.label === 'Low neto, Día 2, 1.º')!.playerId).toBe('p4')
    expect(st.money.banker.balanced).toBe(true)
  })

  it('overall gross ties share the places they occupy; a pick-up counts as net double bogey', () => {
    const g: GameConfig = { id: 'low', type: 'lowScore', label: 'Low gross', enabled: true, rounds: 'all', entrants: 'all', options: { basis: 'gross', scope: 'overall' }, money: money({ source: 'main', amount: 1000, split: [70, 30] }) }
    const snap = setup([g], { players: 3 })
    card(snap, 'r1', 'p1', { 1: -1 })
    card(snap, 'r1', 'p2', { 2: -1 })
    card(snap, 'r1', 'p3')
    // J3 picks up the 5th: counts par 4 + 0 + 2 = 6 (+2).
    snap.scores.find((s) => s.playerId === 'p3' && s.hole === 5)!.pickedUp = true
    finish(snap)
    const st = run(snap)
    const rows = (st.games.low!.state as { tables: Array<{ rows: Array<{ playerId: string; label: string; value: number }> }> }).tables[0]!.rows
    expect(rows.map((r) => [r.playerId, r.label, r.value])).toEqual([['p1', 'T1', -1], ['p2', 'T1', -1], ['p3', '3', 2]])
    // Tied 1st share 70% + 30% of $1,000 = $500 each.
    expect(st.prizes.map((p) => p.amount)).toEqual([500, 500])
  })
})

describe('event pots', () => {
  it('birdie pot from the main pot: $300 over 3 birdies → J1 2 = $200, J2 1 = $100', () => {
    const g: GameConfig = { id: 'birdies', type: 'eventPot', label: 'Birdies', enabled: true, rounds: 'all', entrants: 'all', options: { event: 'birdie', basis: 'gross' }, money: money({ source: 'main', amount: 300 }) }
    const snap = setup([g])
    card(snap, 'r1', 'p1', { 1: -1, 9: -2 }) // an eagle is also a birdie or better
    card(snap, 'r1', 'p2', { 4: -1 })
    card(snap, 'r1', 'p3')
    finish(snap)
    const st = run(snap)
    expect(Object.fromEntries(st.prizes.map((p) => [p.playerId, p.amount]))).toEqual({ p1: 200, p2: 100 })
  })

  it('three-putts are fines: $5 to each other player per three-putt', () => {
    const g: GameConfig = { id: 'tp', type: 'eventPot', label: 'Tres putts', enabled: true, rounds: 'all', entrants: 'all', options: { event: 'threePutt', basis: 'gross' }, money: money({ source: 'direct', stake: 5 }) }
    const snap = setup([g])
    card(snap, 'r1', 'p1', {}, { putts: { 3: 3, 7: 3 } })
    card(snap, 'r1', 'p2', {}, { putts: { 10: 4 } })
    card(snap, 'r1', 'p3')
    finish(snap)
    const bets = run(snap).money.flows.filter((f) => f.kind === 'bet').map((f) => `${f.from}>${f.to}:${f.amount}`).sort()
    // J1: 2 × $5 to J2 and to J3; J2: 1 × $5 to J1 and to J3. J1↔J2 nets to $5.
    expect(bets).toEqual(['p1>p2:5', 'p1>p3:10', 'p2>p3:5'])
  })
})

describe('match play / Nassau', () => {
  const nassau = (over: Partial<Extract<GameConfig, { type: 'match' }>['options']> = {}): GameConfig => ({
    id: 'nassau',
    type: 'match',
    label: 'Nassau',
    enabled: true,
    rounds: 'all',
    entrants: 'all',
    options: { format: 'nassau', basis: 'gross', pairScoring: 'bestBall', pressAt: 2, maxPresses: 1, matches: [{ id: 'm1', a: ['p1'], b: ['p2'] }], ...over },
    money: money({ source: 'direct', stake: 100 }),
  })

  it('J2 wins the 1st and 2nd, J1 goes 2 down → press from the 3rd (front and total); J1 wins the 3rd, J2 the 4th', () => {
    const snap = setup([nassau()], { players: 2 })
    card(snap, 'r1', 'p1', { 1: 1, 2: 1, 3: -1, 4: 1 })
    card(snap, 'r1', 'p2')
    finish(snap)
    const st = run(snap)
    const [front, back, total] = (st.games.nassau!.state as MatchState).rounds[0]!.segments
    // Front original: −1 −1 +1 −1 = J2 2 up. Press from the 3rd: +1 −1 = halved.
    expect(front!.bets.map((b) => [b.press, b.fromHole, b.up])).toEqual([[0, 1, -2], [1, 3, 0]])
    expect(back!.bets.map((b) => b.up)).toEqual([0])
    // The 18 presses the same way.
    expect(total!.bets.map((b) => [b.press, b.fromHole, b.up])).toEqual([[0, 1, -2], [1, 3, 0]])
    // Money: front J2 $100, total J2 $100, presses and back halved → J1 pays J2 $200.
    const bets = st.money.flows.filter((f) => f.kind === 'bet')
    expect(bets.map((f) => `${f.from}>${f.to}:${f.amount}`)).toEqual(['p1>p2:200'])
    expect(st.money.netSum).toBe(0)
    expect(st.prizes[0]!.why.steps).toEqual(['Ida: J2 2 arriba, $100', 'Total: J2 2 arriba, $100'])
  })

  it('start hole 10: the back nine is played first, but presses still follow the order played', () => {
    const snap = setup([nassau({ pressAt: 2 })], { players: 2 })
    snap.groups = [makeGroup('r1', 1, ['p1', 'p2'], 10)]
    // J1 loses the 10th and 11th (the first two holes played) → press on the back from the 12th.
    card(snap, 'r1', 'p1', { 10: 1, 11: 1 })
    card(snap, 'r1', 'p2')
    finish(snap)
    const back = (run(snap).games.nassau!.state as MatchState).rounds[0]!.segments[1]!
    expect(back.results.slice(0, 3).map((r) => r.hole)).toEqual([10, 11, 12])
    expect(back.bets.map((b) => [b.fromHole, b.up])).toEqual([[10, -2], [12, 0]])
  })

  it('closes out early: 5 up with 4 to play is "Gana 5 y 4"; later holes do not matter', () => {
    const snap = setup([nassau({ format: 'match', pressAt: 0 })], { players: 2 })
    card(snap, 'r1', 'p1', { 10: -1, 11: -1, 12: -1, 13: -1, 14: -1, 17: 3, 18: 3 })
    card(snap, 'r1', 'p2')
    const st = run(snap)
    const total = (st.games.nassau!.state as MatchState).rounds[0]!.segments[0]!
    expect(total.bets[0]).toMatchObject({ up: 5, decided: true })
    expect(st.games.nassau!.board.sections[0]!.rows[0]!.figure).toBe('Gana 5 y 4')
  })

  it('pairs, best ball: the better ball of each pair decides the hole; each loser pays his opposite', () => {
    const snap = setup([nassau({ format: 'match', pressAt: 0, matches: [{ id: 'm1', a: ['p1', 'p2'], b: ['p3', 'p4'] }] })], { players: 4 })
    card(snap, 'r1', 'p1', { 1: -1 })
    card(snap, 'r1', 'p2', { 1: 2, 2: 2 })
    card(snap, 'r1', 'p3', { 2: 1 })
    card(snap, 'r1', 'p4', { 1: 1 })
    finish(snap)
    const st = run(snap)
    // Hole 1: A best 3 vs B 4 → A. Hole 2: A best par (J1) vs B par (J4) → halved. Rest halved. A 1 up.
    expect((st.games.nassau!.state as MatchState).rounds[0]!.segments[0]!.bets[0]!.up).toBe(1)
    const bets = st.money.flows.filter((f) => f.kind === 'bet').map((f) => `${f.from}>${f.to}:${f.amount}`).sort()
    expect(bets).toEqual(['p3>p1:100', 'p4>p2:100'])
  })

  it('9-hole round: one bet over the nine', () => {
    const snap = setup([nassau()], { players: 2, holes: 9 })
    card(snap, 'r1', 'p1', {}, { holes: 9 })
    card(snap, 'r1', 'p2', {}, { holes: 9 })
    finish(snap)
    expect((run(snap).games.nassau!.state as MatchState).rounds[0]!.segments.map((s) => s.label)).toEqual(['9 hoyos'])
  })

  it('a match naming a player outside the game is ignored and flagged', () => {
    const g = nassau()
    const snap = setup([{ ...g, entrants: 'list' }], { players: 3 })
    snap.gameEntries = [{ gameId: 'nassau', playerId: 'p1' }]
    const st = run(snap)
    expect((st.games.nassau!.state as MatchState).invalid).toEqual(['m1'])
    expect(st.flags.warnings.some((w) => w.startsWith('Nassau:'))).toBe(true)
  })
})

describe('setup presets and catalog', () => {
  it('every preset is valid and its main pot balances for its suggested field', async () => {
    const { PRESETS } = await import('./presets')
    const { safeParseSettings } = await import('../settings/schema')
    const { checkPrizePool } = await import('../settings/prizeCheck')
    for (const p of PRESETS) {
      const parsed = safeParseSettings(p.build())
      expect(parsed.success ? 'ok' : JSON.stringify(parsed.error.issues), p.id).toBe('ok')
      if (parsed.success) expect(checkPrizePool(parsed.data, { players: p.players }).balanced, p.id).toBe(true)
    }
  })

  it('every catalog entry creates a valid game, and ids stay unique', async () => {
    const { GAME_ENTRIES, newGameId } = await import('./catalog')
    const { safeParseSettings } = await import('../settings/schema')
    const games: GameConfig[] = []
    for (const e of GAME_ENTRIES) for (let i = 0; i < 2; i++) games.push(e.create(newGameId(games, e.key)))
    const parsed = safeParseSettings({ ...DEFAULT_SETTINGS, games })
    expect(parsed.success ? 'ok' : JSON.stringify(parsed.error.issues)).toBe('ok')
    expect(new Set(games.map((g) => g.id)).size).toBe(games.length)
  })
})
