/**
 * The six built-in games, explained in plain Spanish from a tournament's own
 * settings — the same lines the Reglamento prints.
 *
 * The strings lived inline in the Reglamento, which meant an organizer
 * choosing games in Comité had no way to read what any of them does: the
 * explanation existed and was simply unreachable from where the decision is
 * made. This is the shared source, so the catalog's info icons and the
 * Reglamento can never drift apart.
 */
import { t } from '../../i18n/es-MX'
import { formatMoney } from '../../lib/money'
import { formatFor } from '../formats'
import { DEFAULT_SETTINGS } from './presets'
import type { ModuleId } from './schema'
import type { TournamentSettings } from './schema'
import { individualPrizeAmounts, snakePotPerGroup, type FieldShape } from './prizeCheck'

const R = t.rules

/** One module's rules, as the Reglamento writes them. */
export function moduleRules(id: ModuleId, settings: TournamentSettings, field: FieldShape, honoreeName?: string | null): string[] {
  const m = settings.modules
  switch (id) {
    case 'individual':
      return R.individual(
        individualPrizeAmounts(settings, field).map((x, i) => (settings.prizes.stablefordMode === 'percent' ? `${formatMoney(x)} (${settings.prizes.stableford[i]}%)` : formatMoney(x))),
        // The platform's generic label is no trophy: only a name the organizer gave it is.
        settings.labels.lastPlace.trim() && settings.labels.lastPlace !== DEFAULT_SETTINGS.labels.lastPlace ? settings.labels.lastPlace : null,
        formatFor(settings).describe(settings).steps,
        settings.modules.individual.format === 'matchPlay',
      )
    case 'bestRound':
      return R.bestRound(formatMoney(settings.prizes.bestRoundPerDay))
    case 'pairs':
      return R.pairs(
        t.common.andList(m.pairs.pairing.map(([a, b]) => `${a} con ${b}`)),
        settings.prizes.pairs.map((x) => formatMoney(x)),
        m.pairs.honoreePicks ? (honoreeName ?? settings.labels.honoree) : null,
      )
    case 'snake':
      return R.snake(m.snake.puttsThreshold, formatMoney(settings.prizes.snakePerSurvivor), formatMoney(snakePotPerGroup(settings)))
    case 'fewestPutts':
      return R.fewestPutts(formatMoney(settings.prizes.fewestPutts), settings.pickupPuttsForFewestPutts)
    case 'auction':
      return R.auction(
        formatMoney(settings.auction.openingBid),
        formatMoney(settings.auction.increment),
        settings.auction.maxPlayersPerOwner,
        settings.auction.buybackMaxPct,
        settings.auction.payout.map((s) => R.slot(s.slot, 'place' in s ? s.place : undefined, 'tier' in s ? s.tier : undefined, s.share, settings.labels.lastPlace)),
      )
  }
}
