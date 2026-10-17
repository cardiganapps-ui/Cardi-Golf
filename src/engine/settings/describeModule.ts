/**
 * The six built-in games, explained from a tournament's own settings: the
 * same lines the Reglamento prints, as codes its words are written from
 * («rules.*» in `explain`, ARCH-05).
 *
 * The strings lived inline in the Reglamento, which meant an organizer
 * choosing games in Comité had no way to read what any of them does: the
 * explanation existed and was simply unreachable from where the decision is
 * made. This is the shared source, so the catalog's info icons and the
 * Reglamento can never drift apart.
 *
 * Every sentence reads the settings (COPY-11): the draw happens on the
 * Calcutta's night only when there is one, the day-2 handicap only where a
 * cut exists, the tiebreak's holes are the last day's, a game for no money
 * says so instead of «Premios: .».
 */
import { formatFor } from '../formats'
import { countbackWindows } from '../core/ranking'
import { msg, say, type Msg } from '../messages'
import { DEFAULT_SETTINGS } from './presets'
import type { ModuleId } from './schema'
import type { TournamentSettings } from './schema'
import { individualPrizeAmounts, snakePotPerGroup, type FieldShape } from './prizeCheck'

/** What the rules read beyond the settings: the days the tournament has. */
export interface RulesContext {
  /** Days it plays: the settings' rounds, or more when more exist. */
  days: number
  /** Holes of each day that exists and is not cancelled, in order; empty before any day exists. */
  holes: number[]
}

/** The rules' context from the settings and the days that exist: before a day exists every day is 18 holes. */
export function rulesContext(settings: TournamentSettings, holes: number[] = []): RulesContext {
  return { days: Math.max(settings.rounds, holes.length), holes }
}

/** A day-to-day handicap cut can happen: more than one day, a maximum above zero and handicaps at all. */
export function cutApplies(settings: TournamentSettings, days = settings.rounds): boolean {
  return days > 1 && settings.day2Cut.maxStrokes > 0 && settings.handicap.allowance > 0
}

/** The last day's holes a tiebreak looks at: «del 10 al 18, del 13 al 18, del 16 al 18 y el 18». */
function lastHoles(ctx: RulesContext): Array<[number, number]> {
  return countbackWindows(ctx.holes.at(-1) ?? 18)
}

/** A Calcutta slot's name: a place, the best of a tier, or last place. */
export function slotName(slot: { slot: 'place' | 'bestOfTier' | 'lastPlace'; place?: number; tier?: string }, lastPlace: string): Msg {
  return msg('rules.slot', { slot: slot.slot, place: slot.place ?? null, tier: slot.tier ?? null, lastPlace })
}

/** One module's rules, as the Reglamento writes them (codes, ARCH-05). */
export function moduleRules(id: ModuleId, settings: TournamentSettings, field: FieldShape, honoreeName?: string | null, context?: RulesContext): Msg[] {
  const amount = (n: number) => (n > 0 ? n : null)
  const m = settings.modules
  const ctx = context ?? rulesContext(settings)
  switch (id) {
    case 'individual': {
      const amounts = individualPrizeAmounts(settings, field)
      const paid = amounts.some((x) => x > 0)
      const percent = settings.prizes.stablefordMode === 'percent'
      // The platform's generic label is no trophy: only a name the organizer gave it is.
      const lastPlace = settings.labels.lastPlace.trim() && settings.labels.lastPlace !== DEFAULT_SETTINGS.labels.lastPlace ? settings.labels.lastPlace : null
      return [
        ...formatFor(settings).describe(settings).steps,
        paid ? msg('rules.places', { prizes: amounts.map((x, i) => ({ amount: x, pct: percent ? (settings.prizes.stableford[i] ?? null) : null })) }) : say('rules.noPrize'),
        // Match play breaks a tie on its own countback (holes up in the last day's match), not on the last holes.
        settings.modules.individual.format === 'matchPlay' ? msg('rules.matchTiebreak', { days: ctx.days, prizes: paid }) : msg('rules.tiebreak', { windows: lastHoles(ctx), days: ctx.days, prizes: paid }),
        ...(lastPlace ? [msg('rules.lastPlace', { label: lastPlace })] : []),
      ]
    }
    case 'bestRound':
      return [
        msg('rules.bestRound', { prize: amount(settings.prizes.bestRoundPerDay), days: ctx.days }),
        ...(cutApplies(settings, ctx.days) ? [say('rules.bestRoundCut')] : []),
        msg('rules.bestRoundTie', { windows: lastHoles(ctx) }),
      ]
    case 'pairs':
      return [
        msg('rules.pairs', { pairing: m.pairs.pairing, auction: m.auction.enabled ? m.auction.label : null, honoree: m.pairs.honoreePicks ? (honoreeName ?? settings.labels.honoree) : null }),
        say('rules.pairsPoints'),
        settings.prizes.pairs.some((x) => x > 0) ? msg('rules.pairsPrizes', { prizes: settings.prizes.pairs, days: ctx.days }) : say('rules.noPrize'),
        msg('rules.pairsTogether', { days: ctx.days }),
      ]
    case 'snake': {
      const threshold = m.snake.puttsThreshold
      const game = m.snake.label
      return [
        msg('rules.snake', { threshold, game }),
        settings.prizes.snakePerSurvivor > 0 ? msg('rules.snakePaid', { per: settings.prizes.snakePerSurvivor, pot: snakePotPerGroup(settings), threshold, game }) : msg('rules.snakeFree', { game }),
      ]
    }
    case 'fewestPutts':
      return [msg('rules.fewestPutts', { prize: amount(settings.prizes.fewestPutts), pickup: settings.pickupPuttsForFewestPutts })]
    case 'auction': {
      const a = settings.auction
      return [
        msg('rules.auction', { game: m.auction.label }),
        msg('rules.auctionBids', { opening: a.openingBid, increment: a.increment, max: a.maxPlayersPerOwner, selfCounts: a.selfOwnedCountsTowardMax }),
        ...(a.buybackMaxPct > 0 ? [msg('rules.buyback', { pct: a.buybackMaxPct })] : []),
        msg('rules.auctionPot', { slots: a.payout.map((s) => ({ slot: slotName(s, settings.labels.lastPlace), share: s.share })) }),
        msg('rules.auctionOne', { tiers: a.payout.flatMap((s) => (s.slot === 'bestOfTier' ? [s.tier] : [])) }),
        say('rules.auctionOwed'),
      ]
    }
  }
}
