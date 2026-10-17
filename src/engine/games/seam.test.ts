/**
 * ARCH-15: one game seam. Both kinds of game (the singletons in
 * `settings.modules`, the instance games in `settings.games`) implement one
 * contract, go through one runner, and are registered by id and type, so
 * their states read without a cast. What every game shares (ranking and its
 * tie policy, finality, whole-peso splits) is one set of rules in
 * core/ranking.ts, each game picking its option.
 */
import { describe, expect, it } from 'vitest'
import { computeTournament } from '../computeTournament'
import { isFinal, rankField, splitEven, splitWhole } from '../core/ranking'
import { ALL_MODULES, type ModuleStateMap } from '../modules'
import { FIRST_TOURNAMENT_SETTINGS } from '../settings/presets'
import { GAME_TYPES, type GameConfig } from '../settings/games'
import { MODULE_IDS } from '../settings/schema'
import { fillRound, makeFirstTournament } from '../testing/fixtures'
import { ALL_GAMES, contestStateOf, isGameOf, type GameResultState } from '.'
import { words } from '../testing/words'

const pts = (arr: number[]) => new Map(arr.map((p, i) => [i + 1, p]))

describe('rankField: one ranking rule, a tie policy per game', () => {
  const field = [
    { id: 'a', holes: 18, putts: 30 },
    { id: 'b', holes: 18, putts: 28 },
    { id: 'c', holes: 17, putts: 20 },
    { id: 'd', holes: 18, putts: 28 },
  ]

  it('compares the keys in turn, more ahead (fewer putts negated), and the tied share a place', () => {
    const groups = rankField(field, {
      keys: [(x) => x.holes, (x) => -x.putts],
      ties: 'share',
      order: (x, y) => x.id.localeCompare(y.id),
    })
    expect(groups.map((g) => [g.position, g.members.map((m) => m.id)])).toEqual([
      [1, ['b', 'd']],
      [3, ['a']],
      [4, ['c']],
    ])
  })

  it('a countback breaks what the keys leave tied, on the last holes', () => {
    const cards = {
      x: { pointsByHole: pts(Array(18).fill(2)), holes: 18 },
      y: { pointsByHole: pts([3, ...Array(16).fill(2), 1]), holes: 18 },
    }
    const ids = ['y', 'x'] as const
    const shared = rankField([...ids], { keys: [() => 36], ties: 'share' })
    expect(shared.map((g) => g.members)).toEqual([['y', 'x']])
    const counted = rankField([...ids], { keys: [() => 36], ties: { countback: (id) => cards[id] } })
    expect(counted.map((g) => [g.position, g.members])).toEqual([
      [1, ['x']],
      [2, ['y']],
    ])
  })

  it('reads each figure once per entrant, not once per comparison', () => {
    let reads = 0
    const many = Array.from({ length: 60 }, (_, i) => ({ v: i % 7 }))
    rankField(many, { keys: [(x) => (reads++, x.v)], ties: 'share' })
    expect(reads).toBe(60)
  })

  it('an empty card ranks last whichever way the figure counts', () => {
    const v: Record<string, number> = { a: 70, b: Number.POSITIVE_INFINITY, c: 68 }
    const strokes = rankField(['a', 'b', 'c'], { keys: [(id) => -v[id]!], ties: 'share' })
    expect(strokes.map((g) => g.members[0])).toEqual(['c', 'a', 'b'])
  })
})

describe('isFinal: when a game stops being «si terminara ahora»', () => {
  const ctx = { tournamentFinal: false, roundFinal: { r1: true, r2: false } }
  const over = { ...ctx, tournamentFinal: true }

  it('tournament: only the tournament says so', () => {
    expect(isFinal(ctx, 'tournament', ['r1'])).toBe(false)
    expect(isFinal(over, 'tournament')).toBe(true)
  })

  it('rounds: every one of its rounds finished, whatever the tournament', () => {
    expect(isFinal(ctx, 'rounds', ['r1'])).toBe(true)
    expect(isFinal(ctx, 'rounds', ['r1', 'r2'])).toBe(false)
    expect(isFinal(over, 'rounds', ['r2'])).toBe(false)
    expect(isFinal(ctx, 'rounds', ['gone'])).toBe(false)
  })

  it('roundsOrTournament: either; no rounds at all reads as `none`', () => {
    expect(isFinal(over, 'roundsOrTournament', ['r2'])).toBe(true)
    expect(isFinal(ctx, 'roundsOrTournament', ['r1'])).toBe(true)
    expect(isFinal(ctx, 'roundsOrTournament', [])).toBe(false)
    expect(isFinal(ctx, 'roundsOrTournament', [], true)).toBe(true)
  })
})

describe('splitWhole: whole pesos, the rounding where the game says', () => {
  it('equal parts: one peso each to the first (`spread`), or all to the first (`first`)', () => {
    expect(splitEven(1001, 3)).toEqual([
      { amount: 334, rounding: 1 },
      { amount: 334, rounding: 1 },
      { amount: 333, rounding: 0 },
    ])
    expect(splitEven(1001, 3, 'first').map((s) => s.amount)).toEqual([335, 333, 333])
  })

  it('weights: each its floor of total × weight ÷ of, and always the whole total', () => {
    expect(splitWhole(1000, [50, 30, 20], { of: 100, rest: 'first' }).map((s) => s.amount)).toEqual([500, 300, 200])
    expect(splitWhole(1001, [60, 40], { of: 100, rest: 'first' }).map((s) => s.amount)).toEqual([601, 400])
    const byUnits = splitWhole(1000, [3, 2, 2])
    expect(byUnits.map((s) => s.amount)).toEqual([429, 286, 285])
    expect(byUnits.reduce((s, x) => s + x.amount, 0)).toBe(1000)
  })

  it('nothing to split into is nothing', () => {
    expect(splitEven(500, 0)).toEqual([])
  })
})

describe('the registries are typed by id and type', () => {
  it('every module id has its module, under that id', () => {
    expect(Object.keys(ALL_MODULES).sort()).toEqual([...MODULE_IDS].sort())
    for (const id of MODULE_IDS) expect(ALL_MODULES[id].id).toBe(id)
  })

  it('every game type has its implementation, of that type', () => {
    expect(Object.keys(ALL_GAMES).sort()).toEqual([...GAME_TYPES].sort())
    for (const type of GAME_TYPES) expect(ALL_GAMES[type].type).toBe(type)
  })

  const contest: GameConfig = {
    id: 'cerca',
    type: 'contest',
    label: 'Más cerca',
    enabled: true,
    rounds: 'all',
    entrants: 'all',
    options: { kind: 'closest', holes: 'par3' },
    money: { source: 'side', buyIn: 100, amount: 0, stake: 0, split: [100] },
  }
  const skins: GameConfig = {
    id: 'skins',
    type: 'skins',
    label: 'Skins',
    enabled: true,
    rounds: 'all',
    entrants: 'all',
    options: { basis: 'net', carryOver: true },
    money: { source: 'none', buyIn: 0, amount: 0, stake: 0, split: [100] },
  }
  const snap = makeFirstTournament()
  fillRound(snap, 'r1', 3)
  snap.holeAwards = [{ roundId: 'r1', groupId: snap.groups[0]!.id, hole: 3, gameId: 'cerca', playerId: 'p1' }]
  const state = computeTournament(snap, { ...FIRST_TOURNAMENT_SETTINGS, games: [contest, skins] })

  it('a game narrows to its type by `isGameOf`, its config and its state together, with no cast', () => {
    const g: GameResultState = state.games.cerca!
    expect(isGameOf(g, 'contest')).toBe(true)
    if (!isGameOf(g, 'contest')) throw new Error('not a contest')
    expect(g.config.options.kind).toBe('closest')
    expect(g.state.units.p1).toBe(1)
    const s: GameResultState = state.games.skins!
    if (isGameOf(s, 'skins')) {
      expect(s.state.holes.length).toBeGreaterThan(0)
      // @ts-expect-error: a skins game has no contest's units by hole
      expect(s.state.claims).toBeUndefined()
    }
    expect(isGameOf(s, 'contest')).toBe(false)
  })

  it('contestStateOf reads a contest, and nothing else', () => {
    expect(contestStateOf(state.games.cerca)?.holes.find((h) => h.hole === 3)?.winners).toEqual(['p1'])
    expect(contestStateOf(state.games.skins)).toBeUndefined()
    expect(contestStateOf(undefined)).toBeUndefined()
  })

  it('a module state is its own type', () => {
    const snake: ModuleStateMap['snake'] | undefined = state.modules.snake
    expect(snake?.groups.length).toBe(6)
    expect(state.modules.auction?.pot).toBe(0)
  })
})

describe('a game says its own warnings', () => {
  it('the Calcutta names a lot left unsold once play starts, through the contract (MONEY-11)', () => {
    const snap = makeFirstTournament()
    fillRound(snap, 'r1', 2)
    snap.calcuttaLots = snap.players.map((p, i) => ({
      id: `lot${i}`,
      playerId: p.id,
      lotNumber: i + 1,
      status: i === 0 ? 'pending' : 'sold',
      price: i === 0 ? null : 500,
      ownerId: i === 0 ? null : p.id,
      soldAt: null,
    }))
    const state = computeTournament(snap, FIRST_TOURNAMENT_SETTINGS)
    const own = words(
      ALL_MODULES.auction.warnings!(state.modules.auction!, {
        snapshot: snap,
        settings: FIRST_TOURNAMENT_SETTINGS,
        core: state.core,
        tournamentFinal: state.tournamentFinal,
        roundFinal: { r1: false, r2: false },
      }),
    )
    expect(own).toEqual([expect.stringContaining('1 lote sin vender')])
    expect(words(state.flags.warnings)).toEqual(expect.arrayContaining(own))
  })
})
