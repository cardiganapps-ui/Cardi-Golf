/**
 * The Reglamento as data (§9.8, COPY-11, COPY-12): which sections a
 * tournament gets and their lines, from its settings and the days it has.
 * The screen only lays them out; the tests read the same thing.
 *
 * It used to print the first tournament's sheet whatever the settings said:
 * a Calcutta dinner without a Calcutta, a day-2 cut in a one-day event, «los
 * dos días», C and D tiers, «se reparte entre los cuatro». Now each section
 * is there only when its game is on, and every number is the setting's.
 *
 * It opens with «En corto», the money in a few sentences (what you pay, what
 * can be won and from which pile, who holds it), and ends with the golf words
 * it used, in plain Spanish, for whoever reads it without playing golf.
 */
import { t } from '../../i18n/es-MX'
import { formatMoney } from '../../lib/money'
import { cardSigningMode } from '../core/cardSigning'
import { mainScoring } from '../formats'
import { describeGame } from '../games/describe'
import type { Snapshot } from '../types'
import { cutApplies, moduleRules, rulesContext } from './describeModule'
import { checkPrizePool, fieldShape } from './prizeCheck'
import type { ModuleId, TournamentSettings } from './schema'

const R = t.rules

export interface RulesSection {
  /** `summary`, `field`, `handicaps`, a module id, `game-<id>`, `cards`, `governance` or `glossary`. */
  id: string
  title: string
  lines: string[]
}

const MODULES: ModuleId[] = ['individual', 'bestRound', 'pairs', 'snake', 'fewestPutts', 'auction']

/** The Reglamento of one tournament, section by section, in reading order. */
export function reglamento(snapshot: Snapshot, settings: TournamentSettings): RulesSection[] {
  const m = settings.modules
  const field = fieldShape(snapshot, settings)
  const n = field.players
  const holes = [...snapshot.rounds]
    .filter((r) => r.status !== 'cancelled')
    .sort((a, b) => a.number - b.number)
    .map((r) => r.holes)
  const ctx = rulesContext(settings, holes)
  const honoree = snapshot.players.find((p) => p.isHonoree)?.displayName ?? null
  const banker = snapshot.players.find((p) => p.id === snapshot.tournament.bankerPlayerId)?.displayName ?? null
  const points = mainScoring(settings) === 'points'
  const handicaps = settings.handicap.allowance > 0

  const sections: RulesSection[] = [
    { id: 'summary', title: R.sections.summary, lines: summary(settings, field.players, banker, checkPrizePool(settings, field)) },
    { id: 'field', title: R.sections.field, lines: R.field(n, ctx.days, holes.length ? holes : null, settings.groupSize, t.common.andList(settings.tiers)) },
    {
      id: 'handicaps',
      title: R.sections.handicaps,
      lines: R.handicaps(Math.round(settings.handicap.allowance * 100), settings.handicap.cap, R.rounding[settings.handicap.rounding], settings.day2Cut, { rounds: ctx.days, points, nine: holes.includes(9) }),
    },
    ...MODULES.filter((id) => m[id].enabled).map((id) => ({ id, title: m[id].label, lines: moduleRules(id, settings, field, honoree, ctx) })),
    ...settings.games.filter((g) => g.enabled).map((g) => ({ id: `game-${g.id}`, title: g.label, lines: describeGame(g) })),
    { id: 'cards', title: R.sections.cards, lines: [R.cards.enter, R.cards[cardSigningMode(settings)]] },
    { id: 'governance', title: R.sections.governance, lines: [...R.governance] },
  ]

  // The golf words these rules use, each once.
  const G = R.glossary
  const putting = m.snake.enabled || m.fewestPutts.enabled || settings.games.some((g) => g.enabled && g.type === 'eventPot' && g.options.event === 'threePutt')
  const stableford = points || m.bestRound.enabled || m.pairs.enabled || cutApplies(settings, ctx.days)
  const glossary = [
    G.par,
    ...(handicaps ? [G.handicap, G.strokeIndex, G.net, G.tee] : []),
    ...(stableford ? [G.stableford] : []),
    G.pickUp,
    ...(putting ? [G.putts] : []),
    ...(m.individual.format !== 'matchPlay' || m.bestRound.enabled ? [G.tiebreak] : []),
    ...(m.auction.enabled ? [G.auction(m.auction.label), ...(settings.auction.buybackMaxPct > 0 ? [G.buyback] : [])] : []),
  ]
  sections.push({ id: 'glossary', title: R.sections.glossary, lines: glossary })
  return sections
}

/** «En corto»: what you pay, what can be won and from which pile, who holds the money (COPY-12). */
function summary(settings: TournamentSettings, players: number, banker: string | null, pool: ReturnType<typeof checkPrizePool>): string[] {
  const S = R.summary
  // ARCH-06: amounts in the tournament's own currency.
  const cur = settings.currency
  const fee = settings.entryFee > 0
  const auction = settings.modules.auction.enabled
  const sidePots = pool.sidePots.map((p) => p.label)
  const bets = pool.bets.map((b) => b.label)
  if (!fee && !auction && !sidePots.length && !bets.length) return [S.noMoney]
  const prizes = pool.lines.filter((l) => l.moduleId !== 'house' && l.amount > 0)
  const kept = pool.lines.find((l) => l.moduleId === 'house')
  const bank = fee || auction
  return [
    fee ? S.fee(formatMoney(settings.entryFee, cur), players, formatMoney(pool.entryPot, cur)) : S.noFee,
    ...(fee && prizes.length ? [S.prizes(prizes.map((l) => S.prize(l.label, formatMoney(l.amount, cur))))] : []),
    ...(kept ? [S.kept(formatMoney(kept.amount, cur))] : []),
    ...(auction ? [S.auction(settings.modules.auction.label)] : []),
    ...(sidePots.length ? [S.sidePots(sidePots)] : []),
    ...(bets.length ? [S.bets(bets)] : []),
    ...(bank ? [banker ? S.banker(banker) : S.noBanker] : []),
    S.settle,
  ]
}
