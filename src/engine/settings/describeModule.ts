/**
 * The six built-in games, explained in plain Spanish from a tournament's own
 * settings — the same lines the Reglamento prints.
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
import { t } from '../../i18n/es-MX'
import { formatMoney } from '../../lib/money'
import { formatFor } from '../formats'
import { countbackWindows } from '../core/ranking'
import { DEFAULT_SETTINGS } from './presets'
import type { ModuleId } from './schema'
import type { TournamentSettings } from './schema'
import { individualPrizeAmounts, snakePotPerGroup, type FieldShape } from './prizeCheck'

const R = t.rules

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

/** «del 10 al 18, del 13 al 18, del 16 al 18 y el 18», for the last day's holes. */
function lastHoles(ctx: RulesContext): string {
  return R.lastHoles(countbackWindows(ctx.holes.at(-1) ?? 18))
}

const money = (n: number) => (n > 0 ? formatMoney(n) : null)

/** One module's rules, as the Reglamento writes them. */
export function moduleRules(id: ModuleId, settings: TournamentSettings, field: FieldShape, honoreeName?: string | null, context?: RulesContext): string[] {
  const m = settings.modules
  const ctx = context ?? rulesContext(settings)
  switch (id) {
    case 'individual': {
      const amounts = individualPrizeAmounts(settings, field)
      const prizes = amounts.some((x) => x > 0) ? amounts.map((x, i) => (settings.prizes.stablefordMode === 'percent' ? `${formatMoney(x)} (${settings.prizes.stableford[i]}%)` : formatMoney(x))) : []
      return R.individual(
        prizes,
        // The platform's generic label is no trophy: only a name the organizer gave it is.
        settings.labels.lastPlace.trim() && settings.labels.lastPlace !== DEFAULT_SETTINGS.labels.lastPlace ? settings.labels.lastPlace : null,
        formatFor(settings).describe(settings).steps,
        settings.modules.individual.format === 'matchPlay' ? R.matchTiebreak(ctx.days, prizes.length > 0) : R.tiebreak(lastHoles(ctx), ctx.days, prizes.length > 0),
      )
    }
    case 'bestRound':
      return R.bestRound(money(settings.prizes.bestRoundPerDay), ctx.days, cutApplies(settings, ctx.days), lastHoles(ctx))
    case 'pairs':
      return R.pairs(
        t.common.andList(m.pairs.pairing.map(([a, b]) => `${a} con ${b}`)),
        settings.prizes.pairs.some((x) => x > 0) ? settings.prizes.pairs.map((x) => formatMoney(x)) : [],
        m.pairs.honoreePicks ? (honoreeName ?? settings.labels.honoree) : null,
        { auction: m.auction.enabled ? m.auction.label : null, days: ctx.days },
      )
    case 'snake': {
      const paid = settings.prizes.snakePerSurvivor > 0
      return R.snake(m.snake.puttsThreshold, paid ? formatMoney(settings.prizes.snakePerSurvivor) : null, paid ? formatMoney(snakePotPerGroup(settings)) : null, m.snake.label)
    }
    case 'fewestPutts':
      return R.fewestPutts(money(settings.prizes.fewestPutts), settings.pickupPuttsForFewestPutts)
    case 'auction': {
      const tiers = settings.auction.payout.flatMap((s) => (s.slot === 'bestOfTier' ? [s.tier] : []))
      return R.auction(
        formatMoney(settings.auction.openingBid),
        formatMoney(settings.auction.increment),
        settings.auction.maxPlayersPerOwner,
        settings.auction.buybackMaxPct,
        settings.auction.payout.map((s) => R.slot(s.slot, 'place' in s ? s.place : undefined, 'tier' in s ? s.tier : undefined, s.share, settings.labels.lastPlace)),
        { game: m.auction.label, tiers, selfCounts: settings.auction.selfOwnedCountsTowardMax },
      )
    }
  }
}
