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
import { t } from '../../i18n/es-MX'
import { pesos } from '../core/pesos'
import { PLATFORM_CURRENCY } from '../../lib/money'
import { mainEntrants, type FieldShape } from './prizeCheck'
import type { TournamentSettings } from './schema'

export type SenseKey = 'cap' | 'placeTwice' | 'placeUnreachable' | 'tierTwice' | 'lastTwice' | 'buyback' | 'houseCut' | 'currency' | 'cutMax' | 'timezone' | 'signingPairs'

export interface SenseIssue {
  key: SenseKey
  /** What is wrong, in the Comité's words. */
  text: string
}

/**
 * The currencies a tournament may use. Every screen formats the tournament's own (`useCurrency`, ARCH-06), but the
 * engine's «¿Cómo se calculó?» writes amounts as pesos («$2,500», `pesos()`): a second currency needs those to
 * take it before it goes on this list.
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
  const S = t.admin.sense
  const out: SenseIssue[] = []
  const known = !!field && field.players >= 2

  if (s.handicap.cap < 1) out.push({ key: 'cap', text: S.cap })
  if (s.rounds > 1 && s.day2Cut.maxStrokes > CUT_MAX_STROKES) out.push({ key: 'cutMax', text: S.cutMax(CUT_MAX_STROKES) })

  const pot = known ? s.entryFee * field.players : 0
  if (known && s.houseCut > 0 && s.houseCut > pot) out.push({ key: 'houseCut', text: S.houseCut(pesos(s.houseCut), pesos(pot)) })

  if (s.modules.auction.enabled) {
    const places = new Set<number>()
    const tiers = new Set<string>()
    let last = 0
    const entrants = known ? mainEntrants(s, field) : null
    for (const slot of s.auction.payout) {
      if (slot.slot === 'place') {
        if (places.has(slot.place)) out.push({ key: 'placeTwice', text: S.placeTwice(t.rules.slotName('place', slot.place, undefined, s.labels.lastPlace)) })
        places.add(slot.place)
        if (entrants && slot.place > entrants.count) {
          const who = `${entrants.count} ${entrants.count === 1 ? entrants.unit[0] : entrants.unit[1]}`
          out.push({ key: 'placeUnreachable', text: S.placeUnreachable(`${slot.place}.º`, who) })
        }
      } else if (slot.slot === 'bestOfTier') {
        if (tiers.has(slot.tier)) out.push({ key: 'tierTwice', text: S.tierTwice(slot.tier) })
        tiers.add(slot.tier)
      } else if (++last === 2) out.push({ key: 'lastTwice', text: S.lastTwice(s.labels.lastPlace) })
    }
    if (s.auction.buybackMaxPct > BUYBACK_MAX_PCT) out.push({ key: 'buyback', text: S.buyback(BUYBACK_MAX_PCT) })
  }

  // The pairs sign each other's cards only where there are pairs: without the game nobody would sign (UX-23).
  if (s.cardSigning === 'pairs' && !s.modules.pairs.enabled) out.push({ key: 'signingPairs', text: S.signingPairs(s.modules.pairs.label) })

  if (!(CURRENCIES as readonly string[]).includes(s.currency)) out.push({ key: 'currency', text: S.currency(s.currency) })
  if (!validTimeZone(s.timezone)) out.push({ key: 'timezone', text: S.timezone(s.timezone) })
  return out
}
