/**
 * Prize-pool check (CLAUDE.md §5.8, §18): `entryFee × players` must equal the
 * sum of the enabled modules' prizes. The engine asserts it when settings load
 * and the admin shows the breakdown when it does not balance.
 */
import type { TournamentSettings } from './schema'

export interface PrizeLine {
  moduleId: 'individual' | 'bestRound' | 'pairs' | 'snake' | 'fewestPutts'
  label: string
  amount: number
  /** Plain-Spanish explanation of the amount, e.g. "3 grupos × 2 días × $600". */
  detail: string
}

export interface PrizeCheck {
  entryPot: number
  lines: PrizeLine[]
  prizesTotal: number
  /** entryPot − prizesTotal; 0 when balanced. */
  difference: number
  balanced: boolean
}

export interface FieldShape {
  /** Number of players in the tournament. */
  players: number
  /** Groups per round. Defaults to ceil(players / groupSize). */
  groupsPerRound?: number
  /** Actual group sizes per round (roundId → sizes), once groups exist: a group of 3 pays two survivors, not three. */
  groupSizes?: number[][]
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
  const { modules, prizes, rounds } = settings
  const groups = field.groupsPerRound ?? Math.ceil(field.players / settings.groupSize)
  const lines: PrizeLine[] = []

  if (modules.individual.enabled) {
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
        detail: `${real.map((r) => r.map((n) => `${n}`).join('+')).join(' y ')} jugadores por grupo${missing ? `, ${missing} ${missing === 1 ? 'día' : 'días'} por armar` : ''}`,
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

  const entryPot = settings.entryFee * field.players
  const prizesTotal = lines.reduce((s, l) => s + l.amount, 0)
  const difference = entryPot - prizesTotal
  return { entryPot, lines, prizesTotal, difference, balanced: difference === 0 }
}

export class PrizePoolError extends Error {
  readonly check: PrizeCheck
  constructor(check: PrizeCheck) {
    super(
      `Prize pool does not balance: entries $${check.entryPot} vs prizes $${check.prizesTotal} (difference $${check.difference}).`,
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
