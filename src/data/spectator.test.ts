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
import { LEGACY_SETTINGS_ALIASES, normalizeLegacySettings, parseSettings, TournamentSettingsSchema } from '../engine/settings/schema'
import { FIXTURE_NAMES } from '../dev/fixtures'
import { readdirSync, readFileSync } from 'node:fs'
import { getFixture } from '../dev/fixtures'
import { readSettings } from '../engine/settings/read'
import { SPECTATOR_MONEY_COLUMNS, spectatorAnswer } from './testing/spectatorAnswer'

const rpc = vi.fn()
vi.mock('../lib/supabase', () => ({ supabase: () => ({ rpc: () => { throw new Error('a link asks nothing with the app’s client') }, from: () => { throw new Error('a link to watch reads no table') } }), supabaseConfigured: true }))
// The boards are asked as anon with no session; `rpc` answers as the server would.
vi.mock('./anonRpc', async () => {
  const { ApiError } = await import('./api')
  return {
    anonRpc: async (name: string, args: Record<string, unknown>) => {
      const res = await rpc(name, args)
      if (res.error) throw ApiError.from(res.error)
      return res.data
    },
  }
})

const { forSpectators, nextPoll, pickBySpec, POLL, snapshotFromBoard, SPECTATOR_SETTINGS_SPEC, spectatorBoard, spectatorSettings, spectatorStoreId, TOKEN_SHAPE } = await import('./spectator')
const { dataFromSnapshot } = await import('./tournamentStore')
type Spec = typeof SPECTATOR_SETTINGS_SPEC
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

describe('settings without money (0053 spectator_settings)', () => {
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

  it('a weekend of side games: every one for fun, each still the game it was, and a side pot left out (who is in one paid into it)', () => {
    const fx = getFixture('friends8')!
    const s = parseSettings(withoutMoney(fx.snapshot.tournament.settings))
    const games = parseSettings(fx.snapshot.tournament.settings).games
    expect(games.filter((g) => g.money.source === 'side').map((g) => g.id)).toEqual(['skins', 'low', 'cerca'])
    expect(s.games.map((g) => [g.id, g.type, g.label])).toEqual(games.filter((g) => g.money.source !== 'side').map((g) => [g.id, g.type, g.label]))
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
        parseSettings(raw)
          .games.filter((g) => money || g.money.source !== 'side')
          .map(({ options: _o, money: m, ...g }) => ({ ...g, ...(money ? { m } : {}) })),
      )
    }
    // Settings with no custom bet go through «Con dinero» as they are.
    expect(spectatorSettings(FIRST_TOURNAMENT_SETTINGS, true)).toEqual(FIRST_TOURNAMENT_SETTINGS)
  })
})

describe('a newer build’s settings on a link (ARCH-04)', () => {
  const fx = getFixture('friends8')!
  const friends = fx.snapshot.tournament.settings as Record<string, unknown>

  it('a key this build doesn’t know: nothing of the settings, so the page says to update instead of computing without it', () => {
    const newer = { ...friends, modules: { ...(friends.modules as object), wolf: { enabled: true, label: 'Wolf' } } }
    for (const money of [false, true]) expect(spectatorSettings(newer, money)).toBeNull()
    const snap = forSpectators({ ...fx.snapshot, tournament: { ...fx.snapshot.tournament, settings: newer } }, true, spectatorStoreId(TOKEN))
    expect(dataFromSnapshot(snap).settingsError).not.toBeNull()
  })

  it('a side game it doesn’t know goes on by its name alone, for the page to set aside; without money for fun, a side pot left out', () => {
    const wolf = { id: 'wolf-1', type: 'wolf', label: 'Wolf', enabled: true, money: { source: 'direct', stake: 50 }, options: { note: 'secreto del Comité' } }
    const pot = { ...wolf, id: 'wolf-2', label: 'Lobo', money: { source: 'side', buyIn: 100 } }
    const raw = { ...friends, games: [...(friends.games as unknown[]), wolf, pot] }
    const read = (v: unknown) => {
      const r = readSettings(v)
      if (!r.ok) throw new Error(r.detail.join('; '))
      return r
    }
    const shown = spectatorSettings(raw, true)
    expect(JSON.stringify(shown)).not.toContain('secreto')
    expect(read(shown).unknownGames).toEqual([
      { id: 'wolf-1', label: 'Wolf', type: 'wolf', enabled: true, money: true },
      { id: 'wolf-2', label: 'Lobo', type: 'wolf', enabled: true, money: true },
    ])
    expect(read(shown).settings).toEqual(read(spectatorSettings(friends, true)).settings)
    const none = read(spectatorSettings(raw, false))
    expect(none.unknownGames).toEqual([{ id: 'wolf-1', label: 'Wolf', type: 'wolf', enabled: true, money: false }])
    expect(none.settings).toEqual(read(spectatorSettings(friends, false)).settings)
  })
})

/** What of a zod schema's definition `specOf` reads. */
interface ZodDef {
  type: string
  innerType?: unknown
  shape?: Record<string, unknown>
  element?: unknown
  items?: unknown[]
  options?: unknown[]
  discriminator?: string
  values?: unknown[]
}
const defOf = (z: unknown) => (z as { _zod: { def: ZodDef } })._zod.def

/** The settings schema's own shape, from zod's definitions: what `SPECTATOR_SETTINGS_SPEC` must be. */
function specOf(z: unknown): Spec {
  const def = defOf(z)
  switch (def.type) {
    case 'default':
    case 'optional':
    case 'nullable':
    case 'catch':
      return specOf(def.innerType)
    case 'string':
    case 'number':
    case 'boolean':
    case 'enum':
    case 'literal':
      return 's'
    case 'object':
      return { o: Object.fromEntries(Object.entries(def.shape!).map(([k, v]) => [k, specOf(v)])) }
    case 'array':
      return { a: specOf(def.element) }
    case 'tuple': {
      // A tuple of one kind (two tiers, three weights) is a list of it to the link.
      const items = def.items!.map(specOf)
      expect(items.every((i) => JSON.stringify(i) === JSON.stringify(items[0]))).toBe(true)
      return { a: items[0]! }
    }
    case 'union': {
      const d = def.discriminator
      if (d) return { d, by: Object.fromEntries(def.options!.map((o) => [String(defOf(defOf(o).shape![d]).values![0]), specOf(o)])) }
      return { u: def.options!.map(specOf) }
    }
    default:
      throw new Error(`a settings type the link's list doesn't know: ${def.type}`)
  }
}

/** `v` with a key nobody knows (and a secret value) in every object the spec walks into, at every depth. */
function withJunk(v: unknown, spec: Spec, n = { i: 0 }): unknown {
  if (spec === 's' || v === null || typeof v !== 'object') return v
  if ('a' in spec) return Array.isArray(v) ? v.map((e) => withJunk(e, spec.a, n)) : v
  if ('u' in spec) return Array.isArray(v) ? withJunk(v, spec.u.find((o) => o !== 's' && 'a' in o) ?? 's', n) : v
  const obj = v as Record<string, unknown>
  const shape = 'o' in spec ? spec.o : (spec.by[obj[spec.d] as string] as { o: Record<string, Spec> }).o
  const out: Record<string, unknown> = { junk: `secreto${n.i++}` }
  for (const [k, x] of Object.entries(obj)) out[k] = shape[k] ? withJunk(x, shape[k]!, n) : x
  return out
}

describe('only the keys the settings schema knows (0053 spectator_settings_spec)', () => {
  it('the list is the schema itself, and the migration carries the same one', () => {
    expect(SPECTATOR_SETTINGS_SPEC).toEqual(specOf(TournamentSettingsSchema))
    // The latest migration that defines it (0053 made it; a migration adding a settings key redefines it).
    const dir = new URL('../../supabase/migrations/', import.meta.url)
    const head = 'create or replace function public.spectator_settings_spec()'
    const migration = readdirSync(dir)
      .filter((f) => f.endsWith('.sql'))
      .sort()
      .map((f) => readFileSync(new URL(f, dir), 'utf8'))
      .filter((sql) => sql.includes(head))
      .at(-1)!
    const body = migration.slice(migration.lastIndexOf(head)).split('\n$$;')[0]!
    expect(JSON.parse(/select '(\{.*\})'::jsonb/.exec(body)![1]!)).toEqual(SPECTATOR_SETTINGS_SPEC)
  })

  it('knows the keys older rows stored under another name: read as today’s first, in the same list on the server', () => {
    // Each alias lands on a key the list keeps, and its old name is not one: it is renamed before the list applies.
    const objectAt = (path: readonly string[]) =>
      path.reduce<Spec>((s, k) => {
        expect(s !== 's' && 'o' in s && s.o[k], k).toBeTruthy()
        return (s as { o: Record<string, Spec> }).o[k]!
      }, SPECTATOR_SETTINGS_SPEC) as { o: Record<string, Spec> }
    expect(LEGACY_SETTINGS_ALIASES.length).toBeGreaterThan(0)
    for (const a of LEGACY_SETTINGS_ALIASES) {
      expect(objectAt(a.path).o, a.to).toHaveProperty(a.to)
      expect(objectAt(a.path).o, a.from).not.toHaveProperty(a.from)
    }
    const migration = readFileSync(new URL('../../supabase/migrations/0053_spectator_link.sql', import.meta.url), 'utf8')
    const body = migration.slice(migration.indexOf('create or replace function public.spectator_settings_legacy(')).split('\n$$;')[0]!
    expect(JSON.parse(/jsonb_array_elements\('(\[.*\])'::jsonb\)/.exec(body)![1]!)).toEqual(LEGACY_SETTINGS_ALIASES)
    expect(migration).toContain('public.spectator_pick(public.spectator_settings_legacy(p_settings), public.spectator_settings_spec())')
    // And the schema's own parse renames exactly these: nothing else in it reads a key under another name.
    const schema = readFileSync(new URL('../engine/settings/schema.ts', import.meta.url), 'utf8')
    expect(schema.match(/normalizeLegacySettings\(raw\)/g)).toHaveLength(2)
    expect(schema).not.toMatch(/z\.preprocess|\.transform\(/)
  })

  it('every fixture parses through it exactly as before, with money', () => {
    for (const fx of FIXTURE_NAMES.map((n) => getFixture(n)!)) {
      const raw = fx.snapshot.tournament.settings
      const before = TournamentSettingsSchema.safeParse(raw)
      const after = TournamentSettingsSchema.safeParse(spectatorSettings(raw, true))
      expect(after.success, fx.name).toBe(before.success)
      // Only a custom bet's description differs, as it always did.
      const blank = (s: typeof before.data) => s && { ...s, games: s.games.map((g) => (g.type === 'custom' ? { ...g, options: { description: '' } } : g)) }
      expect(blank(after.data), fx.name).toEqual(blank(before.data))
    }
  })

  it('a key the schema doesn’t know never comes through, at any depth, with money or without', () => {
    const fx = getFixture('friends8')!
    const raw = {
      ...(withJunk(parseSettings(fx.snapshot.tournament.settings), SPECTATOR_SETTINGS_SPEC) as Record<string, unknown>),
      secretoArriba: { nota: 'secretoA' },
    } as Record<string, unknown>
    raw.modules = { ...(raw.modules as object), nuevo: { enabled: true, label: 'secretoB' } }
    raw.games = [...(raw.games as unknown[]), { id: 'raro', type: 'nuevo', label: 'secretoC' }]
    raw.tiers = ['A', { nota: 'secretoD' }]
    expect(JSON.stringify(raw).match(/secreto/g)!.length).toBeGreaterThan(40)
    for (const money of [true, false]) {
      const shown = spectatorSettings(raw, money)
      expect(JSON.stringify(shown), `money ${money}`).not.toContain('secreto')
      expect(JSON.stringify(shown)).not.toMatch(/"(junk|nota|nuevo|secretoArriba)"/)
    }
    // Keys the schema doesn't know are a newer build's to this one (ARCH-04): nothing of such a row comes through,
    // and the page says to update instead of computing without them.
    for (const money of [true, false]) expect(spectatorSettings(raw, money)).toBeNull()
    // The pick itself, as 0053's spectator_pick: what the schema knows stays as it was; the game and the tier of a
    // kind it doesn't know are empty, so the settings fail to parse.
    const shown = pickBySpec(normalizeLegacySettings(raw), SPECTATOR_SETTINGS_SPEC) as { games: unknown[]; tiers: unknown[] }
    expect(JSON.stringify(shown)).not.toContain('secreto')
    expect(shown.games.at(-1)).toEqual({})
    expect(shown.tiers).toEqual(['A', null])
    expect(TournamentSettingsSchema.safeParse(raw).success).toBe(false)
    expect(TournamentSettingsSchema.safeParse(shown).success).toBe(false)
    const clean = { ...shown, games: shown.games.slice(0, -1), tiers: ['A'] }
    expect(parseSettings(clean)).toEqual(parseSettings({ ...parseSettings(fx.snapshot.tournament.settings), tiers: ['A'] }))
  })

  it('a value of another kind than the schema’s is null, and settings that are not an object are null', () => {
    expect(pickBySpec('texto', SPECTATOR_SETTINGS_SPEC)).toBeNull()
    expect(spectatorSettings(['a'], true)).toBeNull()
    expect(pickBySpec({ rounds: { secreto: 1 }, labels: 'x', entryFee: [1] }, SPECTATOR_SETTINGS_SPEC)).toEqual({ rounds: null, labels: null, entryFee: null })
    expect(pickBySpec({ games: [{ type: 'skins', rounds: [1, { x: 1 }] }, { type: { x: 'skins' } }, null] }, SPECTATOR_SETTINGS_SPEC)).toEqual({ games: [{ type: 'skins', rounds: [1, null] }, {}, null] })
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

  it('«Sin dinero»: a side pot is not on the link, nor who is in it, its claims or its results; a bet for fun is', () => {
    const friends = getFixture('friends8')!
    const s = forSpectators(structuredClone(friends.snapshot), false, 'spectator:x')
    expect(friends.snapshot.gameEntries.map((e) => e.gameId)).toContain('low')
    expect(friends.snapshot.holeAwards.map((e) => e.gameId)).toContain('cerca')
    expect(s.gameEntries).toEqual([])
    expect(s.holeAwards).toEqual([])
    expect(s.gameResults).toEqual(friends.snapshot.gameResults)
    const state = computeTournament(s, parseSettings(s.tournament.settings))
    expect(Object.keys(state.games).sort()).toEqual(['birdies', 'drive', 'nassau', 'tacos', 'tres-putts'])
    // With money, everything as the members see it.
    const m = forSpectators(structuredClone(friends.snapshot), true, 'spectator:x')
    expect([m.gameEntries, m.holeAwards, m.gameResults]).toEqual([friends.snapshot.gameEntries, friends.snapshot.holeAwards, friends.snapshot.gameResults])
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
