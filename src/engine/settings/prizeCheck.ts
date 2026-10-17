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
import type { TournamentSettings } from './schema'
import type { GameConfig } from './games'
import type { Snapshot } from '../types'
import { label, msg, say, type Msg, type StakeUnit } from '../messages'
import { splitEven, splitWhole } from '../core/ranking'

export interface PrizeLine {
  /** A module id, `house`, or `game:<id>` for an instance game on the main pot. */
  moduleId: 'individual' | 'bestRound' | 'pairs' | 'snake' | 'fewestPutts' | 'house' | `game:${string}`
  /** The game's label as the settings name it, or the house's. */
  label: Msg
  amount: number
  /** What the amount is made of, e.g. «3 grupos × 2 días × $600». */
  detail: Msg
}

export interface SidePotLine {
  gameId: string
  label: string
  entrants: number
  buyIn: number
  pot: number
  detail: Msg
}

export interface BetLine {
  gameId: string
  label: string
  stake: number
  detail: Msg
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
  /** e.g. «4 lugares con premio y 3 jugadores». */
  detail: Msg
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
      label: label(modules.individual.label),
      amount,
      detail: msg('pool.amounts', { amounts: prizes.stableford }),
    })
  }
  if (modules.pairs.enabled) {
    const amount = prizes.pairs.reduce((s, x) => s + x, 0)
    lines.push({
      moduleId: 'pairs',
      label: label(modules.pairs.label),
      amount,
      detail: msg('pool.amounts', { amounts: prizes.pairs }),
    })
  }
  if (modules.bestRound.enabled) {
    lines.push({
      moduleId: 'bestRound',
      label: label(modules.bestRound.label),
      amount: prizes.bestRoundPerDay * rounds,
      detail: msg('pool.perDay', { days: rounds, amount: prizes.bestRoundPerDay }),
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
        label: label(modules.snake.label),
        amount: known + perGroup * groups * missing,
        detail: msg('pool.snakeGroups', { sizes: real, missing }),
      })
    } else {
      lines.push({
        moduleId: 'snake',
        label: label(modules.snake.label),
        amount: perGroup * groups * rounds,
        detail: msg('pool.snakePlanned', { groups, days: rounds, perGroup }),
      })
    }
  }
  if (modules.fewestPutts.enabled) {
    lines.push({
      moduleId: 'fewestPutts',
      label: label(modules.fewestPutts.label),
      amount: prizes.fewestPutts,
      detail: msg('amount', { amount: prizes.fewestPutts }),
    })
  }

  const sidePots: SidePotLine[] = []
  const bets: BetLine[] = []
  for (const g of settings.games) {
    if (!g.enabled) continue
    const n = field.entrants?.[g.id] ?? field.players
    if (g.money.source === 'main') {
      lines.push({ moduleId: `game:${g.id}`, label: label(g.label), amount: g.money.amount, detail: msg('amount', { amount: g.money.amount }) })
    } else if (g.money.source === 'side') {
      sidePots.push({ gameId: g.id, label: g.label, entrants: n, buyIn: g.money.buyIn, pot: g.money.buyIn * n, detail: msg('pool.side', { n, buyIn: g.money.buyIn, pot: g.money.buyIn * n, type: g.type, split: g.money.split }) })
    } else if (g.money.source === 'direct') {
      bets.push({ gameId: g.id, label: g.label, stake: g.money.stake, detail: msg('pool.bet', { stake: g.money.stake, per: stakeUnit(g) }) })
    }
  }
  const entryPot = settings.entryFee * field.players
  const houseCut = entryPot > 0 ? settings.houseCut : 0
  if (houseCut > 0) lines.push({ moduleId: 'house', label: say('pool.house'), amount: houseCut, detail: msg('amount', { amount: houseCut }) })

  if (percentIndividual) {
    // The individual game takes what is left, split by percentages.
    const left = entryPot - lines.reduce((s, l) => s + l.amount, 0)
    const amounts = percentPlaces(Math.max(0, left), prizes.stableford)
    lines.unshift({
      moduleId: 'individual',
      label: label(modules.individual.label),
      amount: Math.max(0, left),
      detail: msg('pool.rest', { split: prizes.stableford.map((pct, i) => ({ pct, amount: amounts[i] ?? 0 })) }),
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
export function mainEntrants(settings: TournamentSettings, field: FieldShape): { count: number; unit: 'player' | 'team' } {
  const ind = settings.modules.individual
  const teams = ind.format === 'team' || (ind.format === 'matchPlay' && ind.formatOptions.matchMode === 'fourball')
  if (!teams) return { count: field.players, unit: 'player' }
  // Before the draw a team has two players at least, so half the field is the most there can be.
  return { count: field.teams ?? Math.floor(field.players / 2), unit: 'team' }
}

const placesText = (places: number, reachable: number, unit: 'player' | 'team' | 'pair'): Msg => msg('pool.places', { places, reachable, unit })

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
    if (places > count) out.push({ id: 'pairs', label: modules.pairs.label, places, reachable: count, amount: beyond(prizes.pairs, count), detail: placesText(places, count, 'pair') })
  }
  for (const g of settings.games) {
    if (!g.enabled || g.type !== 'lowScore' || (g.money.source !== 'main' && g.money.source !== 'side')) continue
    const n = g.entrants === 'list' ? (field.entrants?.[g.id] ?? 0) : field.players
    const places = g.money.split.filter((p) => p > 0).length
    if (places <= n) continue
    // The pot as the game splits it: per day, the first day takes the odd pesos.
    const pot = g.money.source === 'main' ? g.money.amount : g.money.buyIn * n
    const days = g.options.scope === 'perRound' ? Math.max(1, rounds) : 1
    let amount = 0
    for (const day of splitEven(pot, days, 'first')) amount += beyond(percentPlaces(day.amount, g.money.split), n)
    out.push({ id: `game:${g.id}`, label: g.label, places, reachable: n, amount, detail: placesText(places, n, 'player') })
  }
  return out
}

/** Whole-peso amounts for percent places: floor each, remainder to 1st. */
export function percentPlaces(pot: number, split: number[]): number[] {
  return splitWhole(pot, split, { of: 100, rest: 'first' }).map((s) => s.amount)
}

/** The individual game's prizes in pesos for a field, whichever mode it uses. */
export function individualPrizeAmounts(settings: TournamentSettings, field: FieldShape): number[] {
  if (settings.prizes.stablefordMode !== 'percent') return settings.prizes.stableford
  const line = checkPrizePool(settings, field).lines.find((l) => l.moduleId === 'individual')
  return percentPlaces(line?.amount ?? 0, settings.prizes.stableford)
}

/** What a direct bet's stake is per. */
function stakeUnit(g: GameConfig): StakeUnit {
  if (g.type === 'match') return g.options.format === 'nassau' ? 'segment' : 'match'
  if (g.type === 'skins') return 'skin'
  if (g.type === 'eventPot') return g.options.event === 'threePutt' ? 'threePutt' : 'each'
  if (g.type === 'contest') return 'holeWon'
  return 'loser'
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
