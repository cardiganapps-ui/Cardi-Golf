/**
 * STRAT-05: a link to watch reads the settings exactly as the members do. For
 * every fixture's settings, the first tournament's, and each key older rows
 * stored under another name (`LEGACY_SETTINGS_ALIASES`: `prizes.matrimonios`
 * read as `prizes.pairs`), what the link shows parses to the members' parsed
 * settings, «Con dinero» as they are (but for a custom bet's description, the
 * Comité's free text) and «Sin dinero» without what it removes. A link that
 * dropped the old key before reading it as the new one fell back to the
 * default settings: no Dinero, $0 everywhere, handicaps at 100%.
 *
 * The same cases, with what the phone shows of each, are written out for the
 * database (supabase/tests/harness/spectator_settings_cases.sql), where
 * supabase/tests/spectator_link.sql holds 0053's `spectator_settings` to them
 * row for row. After changing the cases or the rules, write the file again:
 * `POLO_WRITE_CASES=1 npx vitest run src/data/spectatorSettings.cases.test.ts`.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { FIXTURE_NAMES, getFixture } from '../dev/fixtures'
import { FIRST_TOURNAMENT_SETTINGS } from '../engine/settings/presets'
import { LEGACY_SETTINGS_ALIASES, safeParseSettings, type TournamentSettings } from '../engine/settings/schema'

vi.mock('../lib/supabase', () => ({ supabase: () => ({}), supabaseConfigured: true }))
const { spectatorSettings } = await import('./spectator')

const CASES_FILE = 'supabase/tests/harness/spectator_settings_cases.sql'
type Json = Record<string, unknown>

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T
const getAt = (v: unknown, path: readonly string[]) => path.reduce<unknown>((o, k) => (o as Json)[k], v)
function setAt(v: unknown, path: readonly string[], value: unknown): unknown {
  if (!path.length) return value
  const [head, ...tail] = path
  return { ...(v as Json), [head!]: setAt((v as Json)[head!], tail, value) }
}

/** Every case, once: [name, the settings as stored]. */
function cases(): Array<[string, unknown]> {
  const out: Array<[string, unknown]> = []
  const seen = new Set<string>()
  const add = (name: string, input: unknown) => {
    const key = JSON.stringify(input)
    if (seen.has(key)) return
    seen.add(key)
    out.push([name, clone(input)])
  }
  for (const n of FIXTURE_NAMES) add(`fixture ${n}`, getFixture(n)!.snapshot.tournament.settings)
  add('first tournament', FIRST_TOURNAMENT_SETTINGS)
  const bases: Array<[string, unknown]> = [
    ['first tournament', FIRST_TOURNAMENT_SETTINGS],
    ['friends8', getFixture('friends8')!.snapshot.tournament.settings],
  ]
  for (const a of LEGACY_SETTINGS_ALIASES) {
    const where = [...a.path, a.from].join('.')
    for (const [name, base] of bases) {
      const at = getAt(base, a.path) as Json
      const { [a.to]: value, ...rest } = at
      // An older row: the old key only, the members read it as the new one.
      add(`${name}: ${where} instead of ${a.to}`, setAt(base, a.path, { ...rest, [a.from]: value }))
      // Both: the new one is read, the old one ignored.
      add(`${name}: ${where} beside ${a.to}`, setAt(base, a.path, { ...at, [a.from]: [9999, 1] }))
      // The old key with a value of the wrong kind: the members' parse refuses it, and so does the link's.
      add(`${name}: ${where} of the wrong kind`, setAt(base, a.path, { ...rest, [a.from]: 'texto' }))
      // The old key null: read as the new one, null, which neither parse takes.
      add(`${name}: ${where} null`, setAt(base, a.path, { ...rest, [a.from]: null }))
    }
  }
  return out
}

/** What «Sin dinero» takes out of the members' parsed settings: the same rules as `spectatorSettings`. */
function withoutMoney(s: TournamentSettings): TournamentSettings {
  return {
    ...s,
    entryFee: 0,
    houseCut: 0,
    prizes: {
      stableford: [],
      stablefordMode: 'amount',
      pairs: [],
      bestRoundPerDay: 0,
      snakePerSurvivor: 0,
      fewestPutts: 0,
    },
    auction: {
      openingBid: 1,
      increment: 1,
      maxPlayersPerOwner: 1,
      selfOwnedCountsTowardMax: true,
      guestsCanBid: false,
      buybackMaxPct: 0,
      payout: [{ slot: 'place', place: 1, share: 1 }],
    },
    modules: { ...s.modules, auction: { ...s.modules.auction, enabled: false } },
    games: s.games
      .filter((g) => g.money.source !== 'side')
      .map(
        (g) =>
          ({
            ...g,
            money: { source: 'none', buyIn: 0, amount: 0, stake: 0, split: [100] },
            ...(g.type === 'custom' ? { options: { description: '' } } : {}),
          }) as typeof g,
      ),
  }
}
/** The members' parsed settings «Con dinero»: all of it, but for a custom bet's description. */
const withMoney = (s: TournamentSettings): TournamentSettings => ({
  ...s,
  games: s.games.map((g) => (g.type === 'custom' ? { ...g, options: { description: '' } } : g)),
})

/** A refusal in what «Sin dinero» replaces (prizes, fees, the Calcutta, a game's money): the link has none of it to refuse. */
const inMoney = (path: PropertyKey[]) =>
  ['entryFee', 'houseCut', 'prizes', 'auction'].includes(String(path[0])) ||
  (path[0] === 'games' && path[2] === 'money') ||
  (path[0] === 'modules' && path[1] === 'auction')

describe('a link reads the settings as the members do (0053 spectator_settings)', () => {
  const all = cases()

  it('has the cases: every fixture, the first tournament, and four for each legacy key on two tournaments', () => {
    expect(all.length).toBeGreaterThanOrEqual(FIXTURE_NAMES.length / 2)
    expect(all.filter(([n]) => n.includes(' instead of ')).length).toBe(LEGACY_SETTINGS_ALIASES.length * 2)
  })

  for (const [name, input] of all) {
    it(name, () => {
      const member = safeParseSettings(input)
      // «Con dinero»: exactly what the members read, success or failure.
      const money = safeParseSettings(spectatorSettings(input, true))
      expect(money.success).toBe(member.success)
      if (member.success) expect(money.data).toEqual(withMoney(member.data))
      // «Sin dinero»: what the members read without its money. When the members' parse refuses the settings only
      // for something «Sin dinero» replaces, the link has nothing left to refuse; for anything else it refuses too.
      const none = safeParseSettings(spectatorSettings(input, false))
      if (member.success) {
        expect(none.success).toBe(true)
        expect(none.data).toEqual(withoutMoney(member.data))
      } else if (member.error.issues.some((i) => !inMoney(i.path))) expect(none.success).toBe(false)
    })
  }

  it('the old key with a value: the link shows its money as the members see it', () => {
    const [, input] = all.find(([n]) => n === 'first tournament: prizes.matrimonios instead of pairs')!
    expect((input as { prizes: Json }).prizes).not.toHaveProperty('pairs')
    expect(safeParseSettings(spectatorSettings(input, true)).data?.prizes.pairs).toEqual([2000, 1000])
  })

  it('the database holds the same cases, with what the phone shows of each', () => {
    const lines = all.flatMap(([name, input]) =>
      [true, false].map(
        (money) =>
          `  (${sqlText(name)}, ${money}, $j$${JSON.stringify(input)}$j$, $j$${JSON.stringify(spectatorSettings(input, money))}$j$)`,
      ),
    )
    const text = [
      '-- Generated by src/data/spectatorSettings.cases.test.ts; do not edit by hand. Write it again with',
      '-- POLO_WRITE_CASES=1 npx vitest run src/data/spectatorSettings.cases.test.ts',
      '-- Every case: its name, the money choice, the settings as stored, and what the phone shows of them',
      '-- (src/data/spectator.ts spectatorSettings). supabase/tests/spectator_link.sql holds spectator_settings to it.',
      'create temp table spectator_settings_cases (name text, money boolean, input jsonb, expected jsonb);',
      'insert into spectator_settings_cases (name, money, input, expected) values',
      lines.join(',\n') + ';',
      '',
    ].join('\n')
    const path = join(process.cwd(), CASES_FILE)
    if (process.env.POLO_WRITE_CASES === '1') writeFileSync(path, text)
    expect(readFileSync(path, 'utf8'), `${CASES_FILE} is out of date: write it again (see the top of this file)`).toBe(
      text,
    )
  })
})

const sqlText = (s: string) => `'${s.replace(/'/g, "''")}'`
