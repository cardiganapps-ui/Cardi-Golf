/**
 * The Reglamento as data (§9.8, COPY-11, COPY-12): which sections a
 * tournament gets and their lines, from its settings and the days it has.
 * Each line is a code (ARCH-05), written in words by `explain` («rules.*»);
 * the screen lays them out, and the tests read the same thing.
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
import { cardSigningMode } from '../core/cardSigning'
import { mainScoring } from '../formats'
import { describeGame } from '../games/describe'
import { label, msg, say, type GlossaryWord, type Msg } from '../messages'
import type { Snapshot } from '../types'
import { cutApplies, moduleRules, rulesContext } from './describeModule'
import { checkPrizePool, fieldShape } from './prizeCheck'
import type { ModuleId, TournamentSettings } from './schema'

export interface RulesSection {
  /** `summary`, `field`, `handicaps`, a module id, `game-<id>`, `cards`, `governance` or `glossary`. */
  id: string
  title: Msg
  lines: Msg[]
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
  const section = (id: 'summary' | 'field' | 'handicaps' | 'cards' | 'governance' | 'glossary', lines: Msg[]): RulesSection => ({ id, title: msg('rules.section', { id }), lines })

  const sections: RulesSection[] = [
    section('summary', summary(settings, field.players, banker, checkPrizePool(settings, field))),
    section('field', [msg('rules.field', { n, days: ctx.days, holes: holes.length ? holes : null, groupSize: settings.groupSize }), ...(settings.tiers.length ? [msg('rules.tiers', { tiers: settings.tiers })] : [])]),
    section('handicaps', handicapLines(settings, { rounds: ctx.days, points, nine: holes.includes(9) })),
    ...MODULES.filter((id) => m[id].enabled).map((id) => ({ id, title: label(m[id].label), lines: moduleRules(id, settings, field, honoree, ctx) })),
    ...settings.games.filter((g) => g.enabled).map((g) => ({ id: `game-${g.id}`, title: label(g.label), lines: describeGame(g) })),
    section('cards', [say('rules.cardsEnter'), msg('rules.cards', { mode: cardSigningMode(settings) })]),
    section('governance', [say('rules.governance'), say('rules.governancePage')]),
  ]

  // The golf words these rules use, each once.
  const putting = m.snake.enabled || m.fewestPutts.enabled || settings.games.some((g) => g.enabled && g.type === 'eventPot' && g.options.event === 'threePutt')
  const stableford = points || m.bestRound.enabled || m.pairs.enabled || cutApplies(settings, ctx.days)
  const word = (w: GlossaryWord) => msg('rules.glossary', { word: w })
  const glossary = [
    word('par'),
    ...(handicaps ? (['handicap', 'strokeIndex', 'net', 'tee'] as const).map(word) : []),
    ...(stableford ? [word('stableford')] : []),
    word('pickUp'),
    ...(putting ? [word('putts')] : []),
    ...(m.individual.format !== 'matchPlay' || m.bestRound.enabled ? [word('tiebreak')] : []),
    ...(m.auction.enabled ? [msg('rules.glossaryAuction', { game: m.auction.label }), ...(settings.auction.buybackMaxPct > 0 ? [word('buyback')] : [])] : []),
  ]
  sections.push(section('glossary', glossary))
  return sections
}

/**
 * «Hándicaps»: the allowance, the cap and the rounding, how strokes are given, and the cut line only where a cut
 * can happen (more than one day and a maximum above zero, STRAT-03).
 */
function handicapLines(settings: TournamentSettings, event: { rounds: number; points: boolean; nine: boolean }): Msg[] {
  const pct = Math.round(settings.handicap.allowance * 100)
  if (pct <= 0) return [say('rules.scratch')]
  const cut = settings.day2Cut
  const cutLine = event.rounds <= 1 || cut.maxStrokes <= 0 ? (event.rounds > 1 ? [say('rules.noCut')] : []) : [msg('rules.cut', { days: event.rounds, threshold: cut.threshold, per: cut.pointsPerStroke, max: cut.maxStrokes, cumulative: cut.mode === 'cumulative', points: event.points })]
  return [
    say('rules.hcpWhat'),
    say('rules.hcpBase'),
    msg('rules.hcpPlaying', { pct, cap: settings.handicap.cap, rounding: settings.handicap.rounding }),
    say('rules.hcpStrokes'),
    ...(event.nine ? [say('rules.hcpNine')] : []),
    ...cutLine,
    say('rules.hcpOverride'),
  ]
}

/** «En corto»: what you pay, what can be won and from which pile, who holds the money (COPY-12). */
function summary(settings: TournamentSettings, players: number, banker: string | null, pool: ReturnType<typeof checkPrizePool>): Msg[] {
  const fee = settings.entryFee > 0
  const auction = settings.modules.auction.enabled
  const sidePots = pool.sidePots.map((p) => p.label)
  const bets = pool.bets.map((b) => b.label)
  if (!fee && !auction && !sidePots.length && !bets.length) return [say('rules.noMoney')]
  const prizes = pool.lines.filter((l) => l.moduleId !== 'house' && l.amount > 0)
  const kept = pool.lines.find((l) => l.moduleId === 'house')
  const bank = fee || auction
  return [
    fee ? msg('rules.fee', { fee: settings.entryFee, n: players, pot: pool.entryPot }) : say('rules.noFee'),
    ...(fee && prizes.length ? [msg('rules.prizes', { prizes: prizes.map((l) => ({ label: l.label, amount: l.amount })) })] : []),
    ...(kept ? [msg('rules.kept', { amount: kept.amount })] : []),
    ...(auction ? [msg('rules.auctionApart', { game: settings.modules.auction.label })] : []),
    ...(sidePots.length ? [msg('rules.sidePots', { games: sidePots })] : []),
    ...(bets.length ? [msg('rules.bets', { games: bets })] : []),
    ...(bank ? [banker ? msg('rules.banker', { name: banker }) : say('rules.noBanker')] : []),
    say('rules.settle'),
  ]
}
