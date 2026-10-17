/**
 * ARCH-04: a settings row a newer build wrote. One side game of a type this
 * build didn't know failed the whole parse, and the store computed the
 * tournament on DEFAULT_SETTINGS (100% handicap, no side games, $0 in prizes)
 * without a word: the panel's probe, the first tournament plus one `wolf`
 * game, read 100% instead of 80%, one module on instead of six, $0 in prizes
 * instead of $25,800, and no warning. A newer build's key was dropped by the
 * parse, and whatever it changed computed without it.
 */
import { describe, expect, it } from 'vitest'
import { FIXTURE_NAMES, getFixture } from '../../dev/fixtures'
import { t } from '../../i18n/es-MX'
import { computeTournament } from '../computeTournament'
import { FIRST_TOURNAMENT_SETTINGS } from './presets'
import { parseSettings } from './schema'
import { readSettings, unknownSettingsKeys } from './read'
import { words } from '../testing/words'

type Raw = Record<string, unknown>
const WOLF = { id: 'wolf-1', type: 'wolf', label: 'Wolf', enabled: true, rounds: 'all', entrants: 'all', money: { source: 'main', amount: 1000 }, options: { rotation: 'fixed' } }
const withGame = (raw: unknown, g: Raw): Raw => ({ ...(raw as Raw), games: [...(((raw as Raw).games as unknown[]) ?? []), g] })
const at = (raw: unknown, path: string[], key: string, value: unknown): Raw => {
  const out = structuredClone(raw) as Raw
  const parent = path.reduce<Raw>((o, k) => o[k] as Raw, out)
  parent[key] = value
  return out
}
const read = (raw: unknown) => {
  const r = readSettings(raw)
  if (!r.ok) throw new Error(`not read: ${r.detail.join('; ')}`)
  return r
}

describe('a side game of a type this build doesn’t know is set aside', () => {
  it('the first tournament keeps its rules and its prizes (the panel’s probe)', () => {
    const r = read(withGame(FIRST_TOURNAMENT_SETTINGS, WOLF))
    expect(r.settings).toEqual(parseSettings(FIRST_TOURNAMENT_SETTINGS))
    expect(r.settings.handicap.allowance).toBe(0.8)
    expect(Object.values(r.settings.modules).filter((m) => m.enabled)).toHaveLength(6)
    expect(r.unknownGames).toEqual([{ id: 'wolf-1', label: 'Wolf', type: 'wolf', enabled: true, money: true }])
  })

  it('the engine computes the rest exactly, names the game, and says the money can’t be counted', () => {
    const snap = structuredClone(getFixture('full12-live')!.snapshot)
    const plain = computeTournament(snap, parseSettings(snap.tournament.settings))
    snap.tournament.settings = withGame(snap.tournament.settings, WOLF)
    const st = computeTournament(snap, read(snap.tournament.settings).settings)
    expect(st.modules).toEqual(plain.modules)
    expect(st.prizes).toEqual(plain.prizes)
    expect(st.flags.missingGames).toEqual(['wolf-1'])
    expect(words(st.flags.warnings)).toContain(t.outdated.game('Wolf'))
    expect(st.flags.moneyUnknown).toEqual(['Wolf'])
    expect(plain.flags.moneyUnknown).toEqual([])
  })

  it('a game that says it is for fun is named, and the money still counts', () => {
    const snap = structuredClone(getFixture('full12-live')!.snapshot)
    snap.tournament.settings = withGame(snap.tournament.settings, { ...WOLF, money: { source: 'none' } })
    const st = computeTournament(snap, read(snap.tournament.settings).settings)
    expect(st.flags.missingGames).toEqual(['wolf-1'])
    expect(st.flags.moneyUnknown).toEqual([])
  })

  it('one that doesn’t say counts as money; one switched off says nothing', () => {
    const snap = structuredClone(getFixture('full12-live')!.snapshot)
    const { money: _m, ...bare } = WOLF
    snap.tournament.settings = withGame(withGame(snap.tournament.settings, { ...bare, id: 'wolf-2', label: 'Lobo' }), { ...WOLF, enabled: false })
    const st = computeTournament(snap, read(snap.tournament.settings).settings)
    expect(st.flags.missingGames).toEqual(['wolf-2'])
    expect(st.flags.moneyUnknown).toEqual(['Lobo'])
  })

  it('a game of a known type that the schema refuses is no newer build’s: the row is not read', () => {
    const r = readSettings(withGame(FIRST_TOURNAMENT_SETTINGS, { ...WOLF, type: 'skins', options: { basis: 'stroke' } }))
    expect(r.ok).toBe(false)
  })
})

describe('a key this build doesn’t know: the row is not read', () => {
  const friends = getFixture('friends8')!.snapshot.tournament.settings as Raw
  const cases: Array<[string, Raw]> = [
    ['scoringV2', { ...friends, scoringV2: { rounds: 2 } }],
    ['modules.wolf', at(friends, ['modules'], 'wolf', { enabled: true, label: 'Wolf' })],
    ['modules.snake.passOnPickUp', at(friends, ['modules', 'snake'], 'passOnPickUp', true)],
    ['handicap.slopeMode', at(friends, ['handicap'], 'slopeMode', 'whs')],
    ['games.0.options.press', at(friends, ['games', '0', 'options'], 'press', 2)],
    ['auction.payout.0.minPlayers', at(FIRST_TOURNAMENT_SETTINGS, ['auction', 'payout', '0'], 'minPlayers', 8)],
  ]
  it.each(cases)('%s', (path, raw) => {
    const r = readSettings(raw)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.detail).toEqual([path])
  })

  it('a key holding nothing is no newer build’s', () => {
    expect(readSettings({ ...friends, scoringV2: null }).ok).toBe(true)
  })

  it('a legacy key reads as today’s name, alone or left beside it', () => {
    const { pairs, ...prizes } = FIRST_TOURNAMENT_SETTINGS.prizes
    expect(read({ ...FIRST_TOURNAMENT_SETTINGS, prizes: { ...prizes, matrimonios: pairs } }).settings.prizes.pairs).toEqual(pairs)
    expect(read({ ...FIRST_TOURNAMENT_SETTINGS, prizes: { ...prizes, pairs, matrimonios: [1, 2] } }).settings.prizes.pairs).toEqual(pairs)
  })
})

describe('a value the schema refuses: not read, and never the defaults', () => {
  it('what it refused, in the schema’s own words, not a JSON dump', () => {
    const r = readSettings(at(FIRST_TOURNAMENT_SETTINGS, ['handicap'], 'allowance', 2))
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.detail.length).toBeGreaterThan(0)
      expect(r.detail.join(' ')).not.toMatch(/^\[|"code"/)
    }
    expect(readSettings(at(FIRST_TOURNAMENT_SETTINGS, ['modules', 'individual'], 'format', 'wolfPlay')).ok).toBe(false)
    expect(readSettings(null).ok).toBe(false)
  })
})

describe('what every build writes reads whole', () => {
  it.each(FIXTURE_NAMES)('%s', (name) => {
    const raw = getFixture(name)!.snapshot.tournament.settings
    expect(unknownSettingsKeys(raw)).toEqual([])
    expect(read(raw).unknownGames).toEqual([])
  })
})
