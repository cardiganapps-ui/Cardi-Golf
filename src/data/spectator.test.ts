/**
 * STRAT-05: what a link to watch shows of a tournament, on the phone's side.
 * The server sends only what the boards need (supabase/tests/spectator_link.sql
 * pins that); here, that the phone builds the boards from that answer as a
 * member's fetch builds them, applies the same rules again to whatever it
 * shows (the design fixtures go through them too), computes no money from a
 * link «Sin dinero», and polls as the boards move without hammering anyone.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { computeTournament } from '../engine/computeTournament'
import { checkPrizePool, fieldShape } from '../engine/settings/prizeCheck'
import { FIRST_TOURNAMENT_SETTINGS } from '../engine/settings/presets'
import { parseSettings } from '../engine/settings/schema'
import { getFixture } from '../dev/fixtures'
import { SPECTATOR_MONEY_COLUMNS, spectatorAnswer } from './testing/spectatorAnswer'

const rpc = vi.fn()
vi.mock('../lib/supabase', () => ({ supabase: () => ({ rpc, from: () => { throw new Error('a link to watch reads no table') } }), supabaseConfigured: true }))

const { forSpectators, nextPoll, POLL, snapshotFromBoard, spectatorBoard, spectatorSettings, spectatorStoreId, TOKEN_SHAPE } = await import('./spectator')
const withoutMoney = (raw: unknown) => spectatorSettings(raw, false)

const TOKEN = 'sSjvTXmU1SDUNaaBFsFGLc7N'
beforeEach(() => rpc.mockReset())

/** Every string anywhere in a value: the words a screen could show from it. */
function strings(v: unknown, out: string[] = []): string[] {
  if (typeof v === 'string') out.push(v)
  else if (Array.isArray(v)) for (const x of v) strings(x, out)
  else if (v && typeof v === 'object') for (const x of Object.values(v)) strings(x, out)
  return out
}

describe('settings without money (0052 spectator_settings)', () => {
  it('every peso at zero, the Calcutta off, each side game for fun, and they still parse', () => {
    const s = parseSettings(withoutMoney(FIRST_TOURNAMENT_SETTINGS))
    expect(s.entryFee).toBe(0)
    expect(s.houseCut).toBe(0)
    expect(s.prizes).toEqual({ stableford: [], stablefordMode: 'amount', pairs: [], bestRoundPerDay: 0, snakePerSurvivor: 0, fewestPutts: 0 })
    expect(s.modules.auction.enabled).toBe(false)
    // The rest is the Comité's as it set it: the games, their labels, the handicap rules.
    expect(s.modules.pairs).toEqual(FIRST_TOURNAMENT_SETTINGS.modules.pairs)
    expect(s.labels).toEqual(FIRST_TOURNAMENT_SETTINGS.labels)
    expect(s.handicap).toEqual(FIRST_TOURNAMENT_SETTINGS.handicap)
    // Nothing to balance: the pot is empty and pays nothing.
    const fx = getFixture('full12-live')!
    expect(checkPrizePool(s, fieldShape(fx.snapshot, s)).balanced).toBe(true)
  })

  it('a weekend of side games: every one for fun, each still the game it was', () => {
    const fx = getFixture('friends8')!
    const s = parseSettings(withoutMoney(fx.snapshot.tournament.settings))
    expect(s.games.map((g) => [g.id, g.type, g.label])).toEqual(parseSettings(fx.snapshot.tournament.settings).games.map((g) => [g.id, g.type, g.label]))
    expect(s.games.every((g) => g.money.source === 'none' && g.money.buyIn === 0 && g.money.stake === 0 && g.money.amount === 0)).toBe(true)
  })

  it('a legacy prize key (prizes.matrimonios) does not slip through', () => {
    const legacy = { ...FIRST_TOURNAMENT_SETTINGS, prizes: { ...FIRST_TOURNAMENT_SETTINGS.prizes, pairs: undefined, matrimonios: [2000, 1000] } }
    expect(JSON.stringify(withoutMoney(legacy))).not.toContain('2000')
  })

  it('a custom bet’s description is the Comité’s free text: a link never carries it, with money or without', () => {
    const raw = getFixture('friends8')!.snapshot.tournament.settings as { games: Array<{ id: string; type: string; options: Record<string, unknown> }> }
    const bet = raw.games.find((g) => g.type === 'custom')!
    expect(bet.options.description).toBeTruthy()
    for (const money of [false, true]) {
      const shown = spectatorSettings(raw, money)
      expect(JSON.stringify(shown), `money ${money}`).not.toContain(String(bet.options.description))
      const s = parseSettings(shown)
      const game = s.games.find((g) => g.id === bet.id)!
      expect(game.type === 'custom' && game.options.description).toBe('')
      // Everything else of every game is the Comité's as it set it (with money, its money too).
      expect(s.games.map(({ options: _o, money: m, ...g }) => ({ ...g, ...(money ? { m } : {}) }))).toEqual(
        parseSettings(raw).games.map(({ options: _o, money: m, ...g }) => ({ ...g, ...(money ? { m } : {}) })),
      )
    }
    // Settings with no custom bet go through «Con dinero» as they are.
    expect(spectatorSettings(FIRST_TOURNAMENT_SETTINGS, true)).toEqual(FIRST_TOURNAMENT_SETTINGS)
  })
})

describe('what the phone shows of a snapshot (forSpectators)', () => {
  const fx = getFixture('full12-live')!

  it('short names only, and none of the Comité’s notes about people', () => {
    const s = forSpectators(structuredClone(fx.snapshot), true, 'spectator:x')
    for (const p of s.players) {
      expect(p.fullName).toBe(p.displayName)
      expect([p.avatarUrl, p.formGuide, p.handicapNote, p.isAdmin]).toEqual([null, null, null, false])
    }
    expect(s.scores.every((x) => x.enteredBy === null && !x.disputed && !x.previous && x.id === undefined)).toBe(true)
    expect(s.handicapOverrides.every((x) => x.reason === '' && x.by === null)).toBe(true)
    expect(s.payments.every((x) => x.note === null)).toBe(true)
    expect((s.moneyAdjustments ?? []).every((x) => x.reason === '' && x.createdBy === null && x.voidReason === null)).toBe(true)
    expect(s.tournament).toMatchObject({ id: 'spectator:x', slug: '', joinCode: '' })
    expect(s.tournament).not.toHaveProperty('crewId')
  })

  it('«Sin dinero»: no payment, decision, lot, bid, buyback or banker, and the engine computes no peso', () => {
    const s = forSpectators(structuredClone(fx.snapshot), false, 'spectator:x')
    expect([s.payments, s.moneyAdjustments, s.calcuttaLots, s.calcuttaBids, s.calcuttaBuybacks]).toEqual([[], [], [], [], []])
    expect(s.tournament.bankerPlayerId).toBeNull()
    const settings = parseSettings(s.tournament.settings)
    const state = computeTournament(s, settings)
    expect(state.prizes).toEqual([])
    expect(state.modules.auction).toBeUndefined()
    expect(Object.values(state.money.people).every((p) => p.paid === 0 && p.receives === 0 && p.net === 0)).toBe(true)
    // What the boards are made of, every word: no peso in any of it. Three statements of money are left aside, and no
    // screen a link «Sin dinero» opens shows them (SpectatorGate.test.tsx reads every word those screens show): the
    // money itself, the pot's check (the Comité's and Dinero's) and what each snake survivor cashes ($0 each).
    const { money: _money, flags, modules, ...rest } = state
    const { pool: _pool, ...flagsShown } = flags
    const snake = modules.snake ? { ...modules.snake, groups: modules.snake.groups.map(({ payouts: _payouts, ...g }) => g) } : undefined
    expect(strings({ ...rest, flags: flagsShown, modules: { ...modules, snake } }).filter((x) => x.includes('$'))).toEqual([])
  })

  it('«Con dinero»: the money as the members see it', () => {
    const s = forSpectators(structuredClone(fx.snapshot), true, 'spectator:x')
    expect(s.calcuttaLots).toHaveLength(fx.snapshot.calcuttaLots.length)
    expect(s.payments.map((p) => p.amount)).toEqual(fx.snapshot.payments.map((p) => p.amount))
    expect(s.tournament.bankerPlayerId).toBe(fx.snapshot.tournament.bankerPlayerId)
    expect(s.tournament.settings).toEqual(fx.snapshot.tournament.settings)
  })

  it('applied twice it changes nothing more: the server’s answer and a fixture end the same', () => {
    const once = forSpectators(structuredClone(fx.snapshot), false, 'spectator:x')
    expect(forSpectators(structuredClone(once), false, 'spectator:x')).toEqual(once)
  })
})

describe('the answer, as the boards', () => {
  for (const money of [false, true]) {
    it(`builds the same boards as a member's fetch, ${money ? 'with' : 'without'} money`, () => {
      const fx = getFixture('full12-live')!
      const s = snapshotFromBoard(spectatorAnswer(fx.snapshot, money), 'spectator:x')
      const want = forSpectators(structuredClone(fx.snapshot), money, 'spectator:x')
      // The same players, days, groups, cards and games: the engine reads one tournament.
      expect(s.players.map((p) => [p.id, p.displayName, p.tier, p.baseHcp, p.isHonoree])).toEqual(want.players.map((p) => [p.id, p.displayName, p.tier, p.baseHcp, p.isHonoree]))
      expect(s.rounds.map((r) => r.id)).toEqual(want.rounds.map((r) => r.id))
      const groups = (x: typeof s) => x.groups.map((g) => [g.id, [...g.playerIds].sort()]).sort((p, q) => String(p[0]).localeCompare(String(q[0])))
      expect(groups(s)).toEqual(groups(want))
      expect(s.courses[0]?.tees[0]?.holes).toHaveLength(18)
      expect(s.scores).toHaveLength(want.scores.length)
      const a = computeTournament(s, parseSettings(s.tournament.settings))
      const b = computeTournament(want, parseSettings(want.tournament.settings))
      expect(a.modules.individual!.rows.map((r) => [r.playerId, r.label, r.figure.text])).toEqual(b.modules.individual!.rows.map((r) => [r.playerId, r.label, r.figure.text]))
      expect(a.money.people).toEqual(b.money.people)
      if (!money) for (const table of Object.keys(SPECTATOR_MONEY_COLUMNS)) expect(spectatorAnswer(fx.snapshot, money)).not.toHaveProperty(table)
    })
  }
})

describe('spectatorBoard: the one request a link makes', () => {
  it('a token that is not one is never sent', async () => {
    for (const bad of ['', 'corto', `${TOKEN}x`, `${TOKEN.slice(0, 23)} `, '../../rest/v1/players']) expect(await spectatorBoard(bad, null)).toBeNull()
    expect(rpc).not.toHaveBeenCalled()
    expect(TOKEN_SHAPE.test(TOKEN)).toBe(true)
  })

  it('a link that does not work answers null; nothing changed answers the version alone; else the boards under the link’s id', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: null })
    expect(await spectatorBoard(TOKEN, null)).toBeNull()
    rpc.mockResolvedValueOnce({ data: { version: 'v1', same: true }, error: null })
    expect(await spectatorBoard(TOKEN, 'v1')).toEqual({ same: true, version: 'v1' })
    const fx = getFixture('full12-live')!
    rpc.mockResolvedValueOnce({ data: spectatorAnswer(fx.snapshot, false, 'v2'), error: null })
    const a = await spectatorBoard(TOKEN, 'v1')
    expect(a).toMatchObject({ same: false, version: 'v2', money: false })
    if (a && !a.same) expect(a.snapshot.tournament.id).toBe(spectatorStoreId(TOKEN))
    expect(rpc.mock.calls.map((c) => c[0])).toEqual(['spectator_board', 'spectator_board', 'spectator_board'])
    expect(rpc.mock.calls[1]![1]).toEqual({ p_token: TOKEN, p_seen: 'v1' })
  })

  it('an error is thrown as an error, for the page to say and try again', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'timeout', code: '57014' } })
    await expect(spectatorBoard(TOKEN, null)).rejects.toMatchObject({ code: '57014' })
  })

  it('the store keeps each link apart, under an id that is not the token', () => {
    expect(spectatorStoreId(TOKEN)).toMatch(/^spectator:[0-9a-z]+$/)
    expect(spectatorStoreId(TOKEN)).not.toContain(TOKEN)
    expect(spectatorStoreId(TOKEN)).not.toBe(spectatorStoreId(`${TOKEN.slice(0, 23)}x`))
  })
})

describe('how often it asks (nextPoll)', () => {
  const at = (status: string | null, anyRoundLive: boolean, quietMs = 0, failures = 0) => nextPoll({ status, anyRoundLive, quietMs, failures })
  it('as the boards move: every bid on Calcutta night, a day in play, nothing in play', () => {
    expect(at('auction', false)).toBe(POLL.auction)
    expect(at('live', true)).toBe(POLL.live)
    expect(POLL.live).toBe(20_000)
    expect(at('live', false)).toBe(POLL.quiet)
    expect(at('finished', false)).toBe(POLL.quiet)
    expect(at(null, false)).toBe(POLL.quiet)
  })
  it('slower once nothing has moved for a while, and longer after each failure, never past five minutes', () => {
    expect(at('live', true, POLL.idleAfter)).toBe(POLL.quiet)
    expect(at('auction', false, POLL.idleAfter)).toBe(POLL.quiet)
    expect(at('live', true, 0, 1)).toBe(40_000)
    expect(at('live', true, 0, 3)).toBe(160_000)
    expect(at('live', true, 0, 10)).toBe(POLL.maxBackoff)
    expect(at('auction', false, 0, 2)).toBe(20_000)
  })
})
