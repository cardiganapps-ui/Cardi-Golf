/**
 * MONEY-13: settings the schema accepts but that make no sense. The review
 * saved a cap of 0 (a 30-handicap played scratch, «Hándicap 30, tope 0, 80%
 * de 0 = 0», with no warning), two first-place Calcutta slots, a 40th-place
 * slot in a 12-player field, a 100% buyback, a house cut of $100,000 on a
 * $30,000 pot, a currency no screen shows and a time zone on Mars; the check
 * showed green. Each is now named and refuses the save, and none of them
 * stops a stored tournament from loading (the schema still parses them: a
 * parse failure is computed on DEFAULT_SETTINGS).
 */
import { describe, expect, it } from 'vitest'
import { FIRST_TOURNAMENT_SETTINGS, DEFAULT_SETTINGS } from './presets'
import { safeParseSettings, type TournamentSettings } from './schema'
import { BUYBACK_MAX_PCT, CUT_MAX_STROKES, settingsSense, validTimeZone } from './sense'
import { t } from '../../i18n/es-MX'

const S = t.admin.sense
const FIELD = { players: 12 }
const first = (edit: (s: TournamentSettings) => void = () => undefined): TournamentSettings => {
  const s = structuredClone(FIRST_TOURNAMENT_SETTINGS)
  edit(s)
  return s
}
const keys = (s: TournamentSettings, field: { players: number } | null = FIELD) => settingsSense(s, field).map((x) => x.key)

describe('settingsSense (MONEY-13)', () => {
  it('the first tournament and the platform default make sense', () => {
    expect(settingsSense(first(), FIELD)).toEqual([])
    expect(settingsSense(structuredClone(DEFAULT_SETTINGS), { players: 8 })).toEqual([])
  })

  it('a cap of 0 is refused: the way to play scratch is 0 %, said where it is typed', () => {
    expect(settingsSense(first((s) => (s.handicap.cap = 0)), FIELD)).toEqual([{ key: 'cap', text: S.cap }])
    expect(keys(first((s) => (s.handicap.cap = 0.5)))).toEqual(['cap'])
    // 0 % is a scratch event on purpose, not a mistake: nothing refuses it.
    expect(keys(first((s) => (s.handicap.allowance = 0)))).toEqual([])
  })

  it('the Calcutta pays each place once, and only places someone can take', () => {
    const twoFirsts = first((s) => (s.auction.payout = [{ slot: 'place', place: 1, share: 0.5 }, { slot: 'place', place: 1, share: 0.5 }]))
    expect(settingsSense(twoFirsts, FIELD)).toEqual([{ key: 'placeTwice', text: S.placeTwice('Campeón') }])
    const fortieth = first((s) => (s.auction.payout = [{ slot: 'place', place: 40, share: 1 }]))
    expect(settingsSense(fortieth, FIELD)).toEqual([{ key: 'placeUnreachable', text: S.placeUnreachable('40.º', '12 jugadores') }])
    // With no field yet there is nobody to count: only the field-free checks run.
    expect(keys(fortieth, null)).toEqual([])
    const tierTwice = first((s) => s.auction.payout.push({ slot: 'bestOfTier', tier: 'C', share: 0 }))
    expect(keys(tierTwice)).toEqual(['tierTwice'])
    const lastTwice = first((s) => s.auction.payout.push({ slot: 'lastPlace', share: 0 }))
    expect(settingsSense(lastTwice, FIELD)).toEqual([{ key: 'lastTwice', text: S.lastTwice('La Cuchara de Palo') }])
  })

  it('under a team format the Calcutta’s places are the teams’', () => {
    const teams = first((s) => {
      s.modules.individual.format = 'team'
      s.auction.payout = [{ slot: 'place', place: 1, share: 0.7 }, { slot: 'place', place: 7, share: 0.3 }]
    })
    // Twelve players are six teams at most before the draw, so a 7th place is nobody's.
    expect(settingsSense(teams, FIELD)).toEqual([{ key: 'placeUnreachable', text: S.placeUnreachable('7.º', '6 equipos') }])
  })

  it('a buyback past half is refused; the Calcutta’s rules are checked only while it is on', () => {
    expect(settingsSense(first((s) => (s.auction.buybackMaxPct = 100)), FIELD)).toEqual([{ key: 'buyback', text: S.buyback(BUYBACK_MAX_PCT) }])
    expect(keys(first((s) => (s.auction.buybackMaxPct = BUYBACK_MAX_PCT)))).toEqual([])
    expect(keys(first((s) => ((s.modules.auction.enabled = false), (s.auction.buybackMaxPct = 100))))).toEqual([])
  })

  it('a house cut bigger than the entries is named', () => {
    expect(settingsSense(first((s) => (s.houseCut = 100000)), FIELD)).toEqual([{ key: 'houseCut', text: S.houseCut('$100,000', '$30,000') }])
    expect(keys(first((s) => (s.houseCut = 30000)))).toEqual([])
  })

  it('a day’s cut past 18 strokes is refused, only when there is a next day', () => {
    expect(settingsSense(first((s) => (s.day2Cut.maxStrokes = 54)), FIELD)).toEqual([{ key: 'cutMax', text: S.cutMax(CUT_MAX_STROKES) }])
    expect(keys(first((s) => ((s.rounds = 1), (s.day2Cut.maxStrokes = 54))))).toEqual([])
  })

  it('a currency no screen shows, and a time zone that does not exist', () => {
    expect(settingsSense(first((s) => (s.currency = 'XYZ')), FIELD)).toEqual([{ key: 'currency', text: S.currency('XYZ') }])
    expect(settingsSense(first((s) => (s.timezone = 'Mars/Olympus')), FIELD)).toEqual([{ key: 'timezone', text: S.timezone('Mars/Olympus') }])
    expect(validTimeZone('America/Mazatlan')).toBe(true)
    expect(validTimeZone('America/Mexico_City')).toBe(true)
  })

  it('none of them stops a stored tournament from loading: the schema still parses each', () => {
    const odd = first((s) => {
      s.handicap.cap = 0
      s.auction.payout = [{ slot: 'place', place: 1, share: 0.5 }, { slot: 'place', place: 40, share: 0.5 }]
      s.auction.buybackMaxPct = 100
      s.houseCut = 100000
      s.day2Cut.maxStrokes = 54
      s.currency = 'XYZ'
      s.timezone = 'Mars/Olympus'
    })
    expect(safeParseSettings(odd).success).toBe(true)
    expect(keys(odd)).toEqual(['cap', 'cutMax', 'houseCut', 'placeUnreachable', 'buyback', 'currency', 'timezone'])
  })
})
