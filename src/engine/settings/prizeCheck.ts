/**
 * Prize-pool check (CLAUDE.md §5.8, §18), per pot.
 *
 * Main pot: `entryFee × players` must equal the enabled modules' prizes, the
 * instance games funded from it (`money.source = 'main'`) and the house cut.
 * With `prizes.stablefordMode = 'percent'` the individual game takes whatever
 * is left, so the main pot balances by construction (unless it goes negative).
 *
 * Side pots (`money.source = 'side'`) are buy-in × entrants and pay out
 * what they collect; they are listed so the organizer sees every peso.
 * Direct bets never touch the bank.
 *
 * Balanced is not enough (MONEY-09): a place nobody can occupy (a 4th prize
 * with three players, a 2nd pair prize with one pair, a low score paying
 * three places to two entrants) leaves its money with the bank. Those are
 * `unreachable`, and `ok` needs both.
 */
import { t } from '../../i18n/es-MX'
import type { TournamentSettings } from './schema'
import type { GameConfig } from './games'
import type { Snapshot } from '../types'

export interface PrizeLine {
  /** A module id, `house`, or `game:<id>` for an instance game on the main pot. */
  moduleId: 'individual' | 'bestRound' | 'pairs' | 'snake' | 'fewestPutts' | 'house' | `game:${string}`
  label: string
  amount: number
  /** Plain-Spanish explanation of the amount, e.g. "3 grupos × 2 días × $600". */
  detail: string
}

export interface SidePotLine {
  gameId: string
  label: string
  entrants: number
  buyIn: number
  pot: number
  detail: string
}

export interface BetLine {
  gameId: string
  label: string
  stake: number
  detail: string
}

/** Paid places beyond who can fill them (MONEY-09). */
export interface UnreachableLine {
  /** `individual`, `pairs`, or `game:<id>`. */
  id: string
  label: string
  /** Places with a prize. */
  places: number
  /** Entrants who can occupy one: players, teams or pairs. */
  reachable: number
  /** The pesos of the places past the last entrant. */
  amount: number
  /** e.g. "4 lugares con premio y 3 jugadores". */
  detail: string
}

export interface PrizeCheck {
  entryPot: number
  lines: PrizeLine[]
  prizesTotal: number
  /** entryPot − prizesTotal; 0 when balanced. */
  difference: number
  balanced: boolean
  /** Places nobody can occupy, main pot and side pots alike. */
  unreachable: UnreachableLine[]
  /** Balanced, and every paid place can be won: what creating or saving needs. */
  ok: boolean
  /** Side pots: each pays exactly what its entrants put in. */
  sidePots: SidePotLine[]
  /** Direct bets between players (no pot). */
  bets: BetLine[]
}

export interface FieldShape {
  /** Number of players in the tournament. */
  players: number
  /** Groups per round. Defaults to ceil(players / groupSize). */
  groupsPerRound?: number
  /** Actual group sizes per round (roundId → sizes), once groups exist: a group of 3 pays two survivors, not three. */
  groupSizes?: number[][]
  /** Entrants per game id for games with a list; defaults to every player. */
  entrants?: Record<string, number>
  /** Teams drawn for a team format (teams, else the pairs); until then, at most one per two players. */
  teams?: number
  /** Pairs drawn for the pairs game; until then, one per two players. */
  pairs?: number
  /**
   * Rounds that exist and are not cancelled. A round added beyond the plan
   * pays its best round and snake too, so the check counts whichever is more
   * (MONEY-06); planned rounds not created yet still count.
   */
  rounds?: number
}

/** "$10,000" without Intl (the engine stays locale-free). */
function fmt(n: number): string {
  return `$${Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`
}

export function snakePotPerGroup(settings: TournamentSettings): number {
  // A group of N: the N−1 survivors get `snakePerSurvivor` each; with no
  // three-putt at all the N players split the same pot.
  return settings.prizes.snakePerSurvivor * (settings.groupSize - 1)
}

export function checkPrizePool(settings: TournamentSettings, field: FieldShape): PrizeCheck {
  const { modules, prizes } = settings
  const rounds = Math.max(settings.rounds, field.rounds ?? 0)
  const groups = field.groupsPerRound ?? Math.ceil(field.players / settings.groupSize)
  const lines: PrizeLine[] = []

  const percentIndividual = modules.individual.enabled && prizes.stablefordMode === 'percent'
  if (modules.individual.enabled && !percentIndividual) {
    const amount = prizes.stableford.reduce((s, x) => s + x, 0)
    lines.push({
      moduleId: 'individual',
      label: modules.individual.label,
      amount,
      detail: prizes.stableford.map((p) => fmt(p)).join(' + ') || 'sin premios',
    })
  }
  if (modules.pairs.enabled) {
    const amount = prizes.pairs.reduce((s, x) => s + x, 0)
    lines.push({
      moduleId: 'pairs',
      label: modules.pairs.label,
      amount,
      detail: prizes.pairs.map((p) => fmt(p)).join(' + ') || 'sin premios',
    })
  }
  if (modules.bestRound.enabled) {
    lines.push({
      moduleId: 'bestRound',
      label: modules.bestRound.label,
      amount: prizes.bestRoundPerDay * rounds,
      detail: `${rounds} ${rounds === 1 ? 'día' : 'días'} × ${fmt(prizes.bestRoundPerDay)}`,
    })
  }
  if (modules.snake.enabled) {
    const perGroup = snakePotPerGroup(settings)
    const real = field.groupSizes?.filter((r) => r.length > 0)
    if (real && real.length) {
      // Real groups: each group pays (size − 1) survivors; rounds without groups yet count as planned.
      const known = real.reduce((s, r) => s + r.reduce((x, n) => x + prizes.snakePerSurvivor * Math.max(0, n - 1), 0), 0)
      const missing = Math.max(0, rounds - real.length)
      lines.push({
        moduleId: 'snake',
        label: modules.snake.label,
        amount: known + perGroup * groups * missing,
        detail: `${t.common.andList(real.map((r) => r.map((n) => `${n}`).join('+')))} jugadores por grupo${missing ? `, ${missing} ${missing === 1 ? 'día' : 'días'} por armar` : ''}`,
      })
    } else {
      lines.push({
        moduleId: 'snake',
        label: modules.snake.label,
        amount: perGroup * groups * rounds,
        detail: `${groups} ${groups === 1 ? 'grupo' : 'grupos'} × ${rounds} ${rounds === 1 ? 'día' : 'días'} × ${fmt(perGroup)}`,
      })
    }
  }
  if (modules.fewestPutts.enabled) {
    lines.push({
      moduleId: 'fewestPutts',
      label: modules.fewestPutts.label,
      amount: prizes.fewestPutts,
      detail: fmt(prizes.fewestPutts),
    })
  }

  const sidePots: SidePotLine[] = []
  const bets: BetLine[] = []
  for (const g of settings.games) {
    if (!g.enabled) continue
    const n = field.entrants?.[g.id] ?? field.players
    if (g.money.source === 'main') {
      lines.push({ moduleId: `game:${g.id}`, label: g.label, amount: g.money.amount, detail: fmt(g.money.amount) })
    } else if (g.money.source === 'side') {
      sidePots.push({ gameId: g.id, label: g.label, entrants: n, buyIn: g.money.buyIn, pot: g.money.buyIn * n, detail: `${n} × ${fmt(g.money.buyIn)} = ${fmt(g.money.buyIn * n)}, ${payoutText(g)}` })
    } else if (g.money.source === 'direct') {
      bets.push({ gameId: g.id, label: g.label, stake: g.money.stake, detail: `${fmt(g.money.stake)} ${stakeUnit(g)}` })
    }
  }
  const entryPot = settings.entryFee * field.players
  const houseCut = entryPot > 0 ? settings.houseCut : 0
  if (houseCut > 0) lines.push({ moduleId: 'house', label: 'Para la casa', amount: houseCut, detail: fmt(houseCut) })

  if (percentIndividual) {
    // The individual game takes what is left, split by percentages.
    const left = entryPot - lines.reduce((s, l) => s + l.amount, 0)
    const amounts = percentPlaces(Math.max(0, left), prizes.stableford)
    lines.unshift({
      moduleId: 'individual',
      label: modules.individual.label,
      amount: Math.max(0, left),
      detail: `lo que queda: ${prizes.stableford.map((p, i) => `${p}% ${fmt(amounts[i] ?? 0)}`).join(' / ')}`,
    })
  }
  const prizesTotal = lines.reduce((s, l) => s + l.amount, 0)
  const difference = entryPot - prizesTotal
  const unreachable = unreachablePlaces(settings, field, lines, rounds)
  const balanced = difference === 0
  return { entryPot, lines, prizesTotal, difference, balanced, unreachable, ok: balanced && unreachable.length === 0, sidePots, bets }
}

/** The pesos of `amounts` past the first `reachable` places. */
function beyond(amounts: number[], reachable: number): number {
  return amounts.slice(Math.max(0, reachable)).reduce((s, x) => s + x, 0)
}

/** How many entrants the main standings rank: players, or teams in a team format. */
export function mainEntrants(settings: TournamentSettings, field: FieldShape): { count: number; unit: [string, string] } {
  const ind = settings.modules.individual
  const teams = ind.format === 'team' || (ind.format === 'matchPlay' && ind.formatOptions.matchMode === 'fourball')
  if (!teams) return { count: field.players, unit: ['jugador', 'jugadores'] }
  // Before the draw a team has two players at least, so half the field is the most there can be.
  return { count: field.teams ?? Math.floor(field.players / 2), unit: ['equipo', 'equipos'] }
}

function placesText(places: number, reachable: number, unit: [string, string]): string {
  return `${places} ${places === 1 ? 'lugar' : 'lugares'} con premio y ${reachable === 1 ? `1 ${unit[0]}` : `${reachable} ${unit[1]}`}`
}

/**
 * Places with a prize that more places than entrants leave empty (MONEY-09).
 * Only games that pay by place can have one: the individual standings, the
 * pairs game, and low score. With no players yet there is nothing to check.
 */
function unreachablePlaces(settings: TournamentSettings, field: FieldShape, lines: PrizeLine[], rounds: number): UnreachableLine[] {
  if (field.players <= 0) return []
  const out: UnreachableLine[] = []
  const { modules, prizes } = settings
  const paid = (amounts: number[]) => amounts.filter((x) => x > 0).length
  if (modules.individual.enabled) {
    const { count, unit } = mainEntrants(settings, field)
    const total = lines.find((l) => l.moduleId === 'individual')?.amount ?? 0
    const amounts = prizes.stablefordMode === 'percent' ? percentPlaces(total, prizes.stableford) : prizes.stableford
    const places = paid(amounts)
    if (places > count) out.push({ id: 'individual', label: modules.individual.label, places, reachable: count, amount: beyond(amounts, count), detail: placesText(places, count, unit) })
  }
  if (modules.pairs.enabled) {
    const count = field.pairs ?? Math.floor(field.players / 2)
    const places = paid(prizes.pairs)
    if (places > count) out.push({ id: 'pairs', label: modules.pairs.label, places, reachable: count, amount: beyond(prizes.pairs, count), detail: placesText(places, count, ['pareja', 'parejas']) })
  }
  for (const g of settings.games) {
    if (!g.enabled || g.type !== 'lowScore' || (g.money.source !== 'main' && g.money.source !== 'side')) continue
    const n = g.entrants === 'list' ? (field.entrants?.[g.id] ?? 0) : field.players
    const places = g.money.split.filter((p) => p > 0).length
    if (places <= n) continue
    // The pot as the game splits it: per day, the first day takes the odd pesos.
    const pot = g.money.source === 'main' ? g.money.amount : g.money.buyIn * n
    const days = g.options.scope === 'perRound' ? Math.max(1, rounds) : 1
    const base = Math.floor(pot / days)
    let amount = 0
    for (let d = 0; d < days; d++) amount += beyond(percentPlaces(base + (d === 0 ? pot - base * days : 0), g.money.split), n)
    out.push({ id: `game:${g.id}`, label: g.label, places, reachable: n, amount, detail: placesText(places, n, ['jugador', 'jugadores']) })
  }
  return out
}

/** Whole-peso amounts for percent places: floor each, remainder to 1st. */
export function percentPlaces(pot: number, split: number[]): number[] {
  const out = split.map((pct) => Math.floor((pot * pct) / 100))
  const rest = pot - out.reduce((s, x) => s + x, 0)
  if (out.length && rest > 0) out[0]! += rest
  return out
}

/** The individual game's prizes in pesos for a field, whichever mode it uses. */
export function individualPrizeAmounts(settings: TournamentSettings, field: FieldShape): number[] {
  if (settings.prizes.stablefordMode !== 'percent') return settings.prizes.stableford
  const line = checkPrizePool(settings, field).lines.find((l) => l.moduleId === 'individual')
  return percentPlaces(line?.amount ?? 0, settings.prizes.stableford)
}

function payoutText(g: GameConfig): string {
  if (g.type === 'lowScore') return `reparte ${g.money.split.map((p) => `${p}%`).join(' / ')}`
  if (g.type === 'skins') return 'se reparte por skin'
  if (g.type === 'contest') return 'se reparte por hoyo ganado'
  if (g.type === 'eventPot') return 'se reparte por cada uno'
  return 'se reparte entre los ganadores'
}

function stakeUnit(g: GameConfig): string {
  if (g.type === 'match') return g.options.format === 'nassau' ? 'por vuelta (ida, vuelta y total)' : 'por partido'
  if (g.type === 'skins') return 'por skin, de cada jugador'
  if (g.type === 'eventPot') return g.options.event === 'threePutt' ? 'a cada jugador por cada tres putts' : 'de cada jugador, por cada uno'
  if (g.type === 'contest') return 'de cada jugador, por hoyo ganado'
  return 'de cada perdedor'
}

export class PrizePoolError extends Error {
  readonly check: PrizeCheck
  constructor(check: PrizeCheck) {
    super(
      `La bolsa no cuadra: entran $${check.entryPot} y se reparten $${check.prizesTotal}.`,
    )
    this.name = 'PrizePoolError'
    this.check = check
  }
}

/** Throws when the pool does not balance. Use at load time. */
export function assertPrizePool(settings: TournamentSettings, field: FieldShape): PrizeCheck {
  const check = checkPrizePool(settings, field)
  if (!check.balanced) throw new PrizePoolError(check)
  return check
}

/** The field of a live tournament: players, real group sizes, and game entrants. */
export function fieldShape(snapshot: Snapshot, settings: TournamentSettings): FieldShape {
  const groupSizes = snapshot.rounds
    .filter((r) => r.status !== 'cancelled')
    .map((r) => snapshot.groups.filter((g) => g.roundId === r.id).map((g) => g.playerIds.length))
  const ids = new Set(snapshot.players.map((p) => p.id))
  const entrants: Record<string, number> = {}
  for (const g of settings.games) {
    if (g.entrants === 'list') entrants[g.id] = (snapshot.gameEntries ?? []).filter((e) => e.gameId === g.id && ids.has(e.playerId)).length
  }
  // Drawn teams and pairs, once there are any (a team format falls back to the pairs, as its standings do).
  const pairs = snapshot.pairs.length || undefined
  const teams = snapshot.teams.length || pairs
  return { players: snapshot.players.length, groupSizes, entrants, rounds: groupSizes.length, teams, pairs }
}
