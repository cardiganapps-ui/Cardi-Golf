/**
 * Settings that pass the schema but make no sense (MONEY-13): a cap of 0
 * that quietly makes a handicap event scratch, a Calcutta that pays the same
 * place twice or a place no entrant can take, a buyback past half, a house
 * cut bigger than what the entries bring, a currency no screen shows, a
 * day's cut past 18 strokes, a time zone that does not exist, cards the pairs
 * sign in a tournament with no pairs game.
 *
 * Not in the schema on purpose. A stored tournament whose settings fail to
 * parse is computed with DEFAULT_SETTINGS (tournamentStore's `compute`), so a
 * stricter schema could quietly change a real tournament's money the day it
 * shipped. These refuse a new save instead, in the wizard and in Comité ›
 * Torneo, and the Comité sees them on what is stored.
 */
import { msg, say, type Msg } from '../messages'
import { PLATFORM_CURRENCY } from '../../lib/money'
import { mainEntrants, type FieldShape } from './prizeCheck'
import type { TournamentSettings } from './schema'

export type SenseKey =
  | 'cap'
  | 'placeTwice'
  | 'placeUnreachable'
  | 'tierTwice'
  | 'lastTwice'
  | 'buyback'
  | 'houseCut'
  | 'currency'
  | 'cutMax'
  | 'timezone'
  | 'signingPairs'

export interface SenseIssue {
  key: SenseKey
  /** What is wrong, in the Comité's words (`explain`'s «sense.*», ARCH-05). */
  says: Msg
}

/**
 * The currencies a tournament may use. Every screen and every «¿Cómo se calculó?» formats the tournament's own
 * (`useCurrency`, ARCH-06; `explain`, ARCH-05); a second currency goes on this list once the copy says it.
 */
export const CURRENCIES = [PLATFORM_CURRENCY] as const
/** §5.9: the player buys back up to half of himself. */
export const BUYBACK_MAX_PCT = 50
/** A day's cut never takes more than a full stroke per hole. */
export const CUT_MAX_STROKES = 18

/** An IANA zone the runtime knows (`Intl` refuses an unknown one). */
export function validTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone })
    return true
  } catch {
    return false
  }
}

/**
 * What in these settings makes no sense, in the order the editor shows its
 * sections. `field` is the field the prize check uses; without one (no roster
 * and no planned size) the checks that need it are left out.
 */
export function settingsSense(s: TournamentSettings, field: FieldShape | null): SenseIssue[] {
  const out: SenseIssue[] = []
  const known = !!field && field.players >= 2

  if (s.handicap.cap < 1) out.push({ key: 'cap', says: say('sense.cap') })
  if (s.rounds > 1 && s.day2Cut.maxStrokes > CUT_MAX_STROKES)
    out.push({ key: 'cutMax', says: msg('sense.cutMax', { max: CUT_MAX_STROKES }) })

  const pot = known ? s.entryFee * field.players : 0
  if (known && s.houseCut > 0 && s.houseCut > pot)
    out.push({ key: 'houseCut', says: msg('sense.houseCut', { cut: s.houseCut, pot }) })

  if (s.modules.auction.enabled) {
    const places = new Set<number>()
    const tiers = new Set<string>()
    let last = 0
    const entrants = known ? mainEntrants(s, field) : null
    for (const slot of s.auction.payout) {
      if (slot.slot === 'place') {
        if (places.has(slot.place))
          out.push({
            key: 'placeTwice',
            says: msg('sense.placeTwice', { place: slot.place, lastPlace: s.labels.lastPlace }),
          })
        places.add(slot.place)
        if (entrants && slot.place > entrants.count)
          out.push({
            key: 'placeUnreachable',
            says: msg('sense.placeUnreachable', { place: slot.place, count: entrants.count, unit: entrants.unit }),
          })
      } else if (slot.slot === 'bestOfTier') {
        if (tiers.has(slot.tier)) out.push({ key: 'tierTwice', says: msg('sense.tierTwice', { tier: slot.tier }) })
        tiers.add(slot.tier)
      } else if (++last === 2)
        out.push({ key: 'lastTwice', says: msg('sense.lastTwice', { label: s.labels.lastPlace }) })
    }
    if (s.auction.buybackMaxPct > BUYBACK_MAX_PCT)
      out.push({ key: 'buyback', says: msg('sense.buyback', { max: BUYBACK_MAX_PCT }) })
  }

  // The pairs sign each other's cards only where there are pairs: without the game nobody would sign (UX-23).
  if (s.cardSigning === 'pairs' && !s.modules.pairs.enabled)
    out.push({ key: 'signingPairs', says: msg('sense.signingPairs', { game: s.modules.pairs.label }) })

  if (!(CURRENCIES as readonly string[]).includes(s.currency))
    out.push({ key: 'currency', says: msg('sense.currency', { currency: s.currency }) })
  if (!validTimeZone(s.timezone)) out.push({ key: 'timezone', says: msg('sense.timezone', { zone: s.timezone }) })
  return out
}
