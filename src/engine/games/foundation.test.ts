/**
 * The instance-game foundation: settings v2, side pots with entrant lists,
 * direct bets, the house cut and the percent split of the main pot. Games
 * here are test doubles; each real game type has its own tests.
 */
import { describe, expect, it } from 'vitest'
import { computeTournament } from '../computeTournament'
import { DEFAULT_SETTINGS, FIRST_TOURNAMENT_SETTINGS } from '../settings/presets'
import { checkPrizePool, fieldShape } from '../settings/prizeCheck'
import { parseSettings, safeParseSettings, type TournamentSettings } from '../settings/schema'
import type { GameConfig } from '../settings/games'
import { fillRound, makeSnapshot } from '../testing/fixtures'
import type { Snapshot } from '../types'
import type { GameImpl } from './game'
import { directUnits, payUnits } from './payout'

/** A fake "most points" game: one unit per point over 25, paid by units. */
const unitsGame: GameImpl<Map<string, number>> = {
  type: 'custom',
  defaultLabel: 'Prueba',
  compute(ctx) {
    const units = new Map<string, number>()
    for (const id of ctx.entrants) units.set(id, Math.max(0, (ctx.core.totals[id]?.points ?? 0) - 25))
    return units
  },
  prizes(units, ctx) {
    const name = (id: string) => id
    return ctx.config.money.source === 'direct' ? directUnits(ctx, units, 'reward', ['punto', 'puntos'], name) : payUnits(ctx, units, ['punto', 'puntos'], name)
  },
  board: () => ({ sections: [], notes: [] }),
}

function game(over: Partial<GameConfig> & { money: GameConfig['money'] }): GameConfig {
  return { id: 'g1', type: 'custom', label: 'Apuesta', enabled: true, rounds: 'all', entrants: 'all', options: { description: '' }, ...over } as GameConfig
}

function finished(settings: TournamentSettings): Snapshot {
  const snap = makeSnapshot({ settings, players: 8, rounds: 1 })
  fillRound(snap, 'r1', 7)
  snap.rounds[0]!.status = 'finished'
  snap.tournament.status = 'finished'
  return snap
}

describe('settings v2', () => {
  it('a tournament saved before games existed parses with the new defaults', () => {
    const raw = structuredClone(FIRST_TOURNAMENT_SETTINGS) as Record<string, unknown>
    delete raw.games
    delete raw.houseCut
    delete (raw.prizes as Record<string, unknown>).stablefordMode
    const s = parseSettings(raw)
    expect(s.games).toEqual([])
    expect(s.houseCut).toBe(0)
    expect(s.prizes.stablefordMode).toBe('amount')
  })

  it('rejects a places split that does not add up to 100%', () => {
    const s = structuredClone(DEFAULT_SETTINGS)
    s.games = [{ id: 'low', type: 'lowScore', label: 'Low neto', enabled: true, rounds: 'all', entrants: 'all', options: { basis: 'net', scope: 'overall' }, money: { source: 'side', buyIn: 100, amount: 0, stake: 0, split: [60, 30] } }]
    expect(safeParseSettings(s).success).toBe(false)
    s.games[0]!.money.split = [60, 30, 10]
    expect(safeParseSettings(s).success).toBe(true)
  })

  it('rejects three-putt fines through a pot, duplicate ids and a percent individual split off 100%', () => {
    const s = structuredClone(DEFAULT_SETTINGS)
    s.games = [{ id: 'tp', type: 'eventPot', label: 'Tres putts', enabled: true, rounds: 'all', entrants: 'all', options: { event: 'threePutt', basis: 'gross' }, money: { source: 'side', buyIn: 100, amount: 0, stake: 0, split: [100] } }]
    expect(safeParseSettings(s).success).toBe(false)
    s.games[0]!.money.source = 'direct'
    expect(safeParseSettings(s).success).toBe(true)
    s.games.push({ ...s.games[0]! })
    expect(safeParseSettings(s).success).toBe(false)
    const p = structuredClone(DEFAULT_SETTINGS)
    p.prizes.stablefordMode = 'percent'
    p.prizes.stableford = [50, 30]
    expect(safeParseSettings(p).success).toBe(false)
  })
})

describe('side pots', () => {
  it('5 of 8 players enter: only they pay the buy-in and only they can win', () => {
    const settings: TournamentSettings = { ...DEFAULT_SETTINGS, games: [game({ entrants: 'list', money: { source: 'side', buyIn: 200, amount: 0, stake: 0, split: [100] } })] }
    const snap = finished(settings)
    snap.gameEntries = ['p1', 'p2', 'p3', 'p4', 'p5'].map((playerId) => ({ gameId: 'g1', playerId }))
    const st = computeTournament(snap, settings, { games: { custom: unitsGame } })
    const g = st.games.g1!
    // 5 × $200 = $1,000 in the pot.
    expect(g.entrants).toEqual(['p1', 'p2', 'p3', 'p4', 'p5'])
    expect(g.pot).toBe(1000)
    const buyIns = st.money.flows.filter((f) => f.kind === 'side')
    expect(buyIns.map((f) => f.from)).toEqual(['p1', 'p2', 'p3', 'p4', 'p5'])
    const paidOut = st.prizes.filter((p) => p.gameId === 'g1')
    expect(paidOut.reduce((s, p) => s + p.amount, 0)).toBe(1000)
    expect(paidOut.every((p) => ['p1', 'p2', 'p3', 'p4', 'p5'].includes(p.playerId))).toBe(true)
    expect(paidOut.every((p) => p.potId === 'g1')).toBe(true)
    expect(st.money.banker.balanced).toBe(true)
    expect(st.money.netSum).toBe(0)
    expect(st.money.people.p6!.sidePots).toBe(0)
    expect(st.money.people.p1!.sidePots).toBe(200)
    // The prize check lists the pot: 5 × $200.
    const check = checkPrizePool(settings, fieldShape(snap, settings))
    expect(check.sidePots).toEqual([expect.objectContaining({ gameId: 'g1', entrants: 5, pot: 1000 })])
    expect(check.balanced).toBe(true)
  })

  it('a pot with no winner is not paid and the bank shows the difference', () => {
    const noUnits: GameImpl<Map<string, number>> = { ...unitsGame, compute: () => new Map() }
    const settings: TournamentSettings = { ...DEFAULT_SETTINGS, games: [game({ money: { source: 'side', buyIn: 100, amount: 0, stake: 0, split: [100] } })] }
    const st = computeTournament(finished(settings), settings, { games: { custom: noUnits } })
    expect(st.money.banker.difference).toBe(800)
    expect(st.money.banker.balanced).toBe(false)
  })
})

describe('direct bets', () => {
  it('each loser pays the winner per unit, netted pairwise, outside the bank', () => {
    // The point totals below depend on how many strokes the field receives, so
    // this test pins the allowance rather than riding on whatever the platform
    // default happens to be.
    const settings: TournamentSettings = {
      ...DEFAULT_SETTINGS,
      handicap: { ...DEFAULT_SETTINGS.handicap, allowance: 0.8 },
      games: [game({ entrants: 'list', money: { source: 'direct', buyIn: 0, amount: 0, stake: 10, split: [100] } })],
    }
    const snap = finished(settings)
    snap.gameEntries = ['p2', 'p3', 'p4'].map((playerId) => ({ gameId: 'g1', playerId }))
    const st = computeTournament(snap, settings, { games: { custom: unitsGame } })
    const units = (id: string) => Math.max(0, st.core.totals[id]!.points - 25)
    const bets = st.money.flows.filter((f) => f.kind === 'bet')
    expect(bets.length).toBeGreaterThan(0)
    // p1 vs p2: whoever has more units receives 10 × the difference.
    // Fixture: p2 29 pts (4 units), p3 27 (2), p4 31 (6). p4 vs p2: (6 − 4) × $10 = $20 to p4.
    expect([units('p2'), units('p3'), units('p4')]).toEqual([4, 2, 6])
    const p2p4 = bets.find((f) => f.from === 'p2' && f.to === 'p4')!
    expect(p2p4.amount).toBe(20)
    expect(bets.find((f) => f.from === 'p3' && f.to === 'p4')!.amount).toBe(40)
    expect(bets.find((f) => f.from === 'p3' && f.to === 'p2')!.amount).toBe(20)
    // Bets never touch the bank and net to zero.
    expect(st.money.banker.receives).toBe(0)
    expect(st.money.netSum).toBe(0)
    const sum = ['p2', 'p3', 'p4'].reduce((s, id) => s + st.money.people[id]!.betsReceived - st.money.people[id]!.betsPaid, 0)
    expect(sum).toBe(0)
    // "Vía banco" settles bets player to player.
    const direct = st.money.viaBank.filter((t) => t.from && t.to)
    expect(direct.reduce((s, t) => s + t.amount, 0)).toBe(bets.reduce((s, f) => s + f.amount, 0))
  })
})

describe('main pot: house cut and percent split', () => {
  it('8 × $500 = $4,000; $1,000 for the house; the individual game splits $3,000 as 50/30/20', () => {
    const settings: TournamentSettings = {
      ...DEFAULT_SETTINGS,
      entryFee: 500,
      houseCut: 1000,
      prizes: { ...DEFAULT_SETTINGS.prizes, stableford: [50, 30, 20], stablefordMode: 'percent' },
    }
    const snap = finished(settings)
    const check = checkPrizePool(settings, fieldShape(snap, settings))
    // $4,000 − $1,000 = $3,000 → $1,500 / $900 / $600.
    expect(check.lines.find((l) => l.moduleId === 'individual')!.amount).toBe(3000)
    expect(check.balanced).toBe(true)
    const st = computeTournament(snap, settings)
    const paid = st.prizes.filter((p) => p.moduleId === 'individual').map((p) => p.amount).sort((a, b) => b - a)
    expect(paid.reduce((s, x) => s + x, 0)).toBe(3000)
    if (st.modules.individual!.groups.slice(0, 3).every((g) => g.members.length === 1)) expect(paid).toEqual([1500, 900, 600])
    expect(st.money.banker.houseCut).toBe(1000)
    expect(st.money.banker.difference).toBe(0)
    expect(st.money.banker.balanced).toBe(true)
    expect(st.money.netSum).toBe(0)
  })

  it('a game funded from the main pot counts against it', () => {
    const settings: TournamentSettings = {
      ...DEFAULT_SETTINGS,
      entryFee: 500,
      prizes: { ...DEFAULT_SETTINGS.prizes, stableford: [3000] },
      games: [game({ money: { source: 'main', buyIn: 0, amount: 1000, stake: 0, split: [100] } })],
    }
    expect(checkPrizePool(settings, { players: 8 }).balanced).toBe(true)
    const st = computeTournament(finished(settings), settings, { games: { custom: unitsGame } })
    const fromGame = st.prizes.filter((p) => p.gameId === 'g1')
    if (fromGame.length) expect(fromGame.reduce((s, p) => s + p.amount, 0)).toBe(1000)
    expect(fromGame.every((p) => p.potId === 'main')).toBe(true)
  })
})

describe('registry', () => {
  it('a game type this build does not know is flagged, not crashed on', () => {
    const settings: TournamentSettings = { ...DEFAULT_SETTINGS, games: [game({ money: { source: 'none', buyIn: 0, amount: 0, stake: 0, split: [100] } })] }
    const st = computeTournament(finished(settings), settings, { games: { custom: undefined } })
    expect(st.flags.missingGames).toEqual(['g1'])
    expect(st.flags.warnings.some((w) => w.includes('Apuesta'))).toBe(true)
  })

  it('a disabled game contributes nothing', () => {
    const settings: TournamentSettings = { ...DEFAULT_SETTINGS, games: [game({ enabled: false, money: { source: 'side', buyIn: 100, amount: 0, stake: 0, split: [100] } })] }
    const st = computeTournament(finished(settings), settings, { games: { custom: unitsGame } })
    expect(st.games).toEqual({})
    expect(st.money.flows.some((f) => f.kind === 'side')).toBe(false)
  })
})
