/**
 * «Por asignar» (MONEY-05, COPY-09): money the rules leave with the bank for
 * the Comité to decide, listed by where it comes from, and the Comité's
 * decisions on it (`money_adjustments`, 0027).
 *
 * One bucket per pot line, the way the prize check budgets it: each module
 * on the entries (individual, pairs, best round, snake, fewest putts), each
 * instance game on the entries or on its own side pot, the Calcutta pot, and
 * the entries no prize claims. A bucket is what its line budgets minus what
 * its prizes pay, once play is over (every round finished or cancelled). Its
 * key is the line's id, so it stays the same whatever moved inside it: a
 * cancelled day, a place nobody fills, a pot nobody won, a tiebreak nobody
 * answered all land in the bucket of the pot that holds their money, named
 * in its explanation. When the cause goes away (a score corrected fills a
 * place), the bucket shrinks or goes, and an assignment it no longer covers
 * is flagged instead of paid.
 *
 * Snake money held by an unanswered tiebreak is not a bucket: it belongs to
 * that group's survivors as soon as someone answers «¿Quién embocó al
 * último?», and the gate blocks until then. It is listed apart (`held`), with
 * that answer as the only way out, so the Comité never assigns money the
 * snake will pay itself (round 2 of PR 104: two causes on one key paid twice).
 *
 * Each assignment (the rows one call wrote) is checked against what its
 * bucket still holds, oldest first: one that fits is paid (a prize to each
 * player, or the house); one that does not, or whose bucket is gone, moves
 * nothing and is flagged until the Comité voids it. Integer pesos throughout.
 */
import { t } from '../../i18n/es-MX'
import type { TournamentSettings } from '../settings/schema'
import type { PrizeCheck } from '../settings/prizeCheck'
import type { Explanation, Id, MoneyAdjustment, Snapshot } from '../types'
import type { PrizeAward } from '../modules/module'
import type { AuctionState } from '../modules/auction'
import type { SnakeState } from '../modules/snake'
import type { GameResultState } from '../games/game'
import { fmt } from '../games/payout'

const U = t.unassigned

/** Who put money into a pot, and how much: what a pro-rata refund splits by. */
export interface Contributor {
  playerId: Id
  amount: number
}

export interface UnassignedBucket {
  /** Stable: a module id (`individual`, `bestRound`...), `game:<id>`, `calcutta`, or `pool` (entries no prize claims). */
  key: string
  label: string
  /** The pot the money sits in: `main`, `calcutta`, or a side game's id. */
  potId: string
  /** What the rules left unassigned, before the Comité's decisions. */
  amount: number
  /** What the assignments that fit took from it. */
  assigned: number
  /** amount − assigned: what is still «por asignar». */
  remaining: number
  why: Explanation
  /** Who paid into the pot, when known: a refund goes back to them pro rata. */
  contributors?: Contributor[]
}

/** Money the rules will pay as soon as someone answers a question: not the Comité's to assign. */
export interface HeldMoney {
  /** `snake:<round>:<group>`. */
  key: string
  label: string
  amount: number
  /** What to answer, and where. */
  note: string
  why: Explanation
}

/** The rows one call wrote: one decision. */
export interface Assignment {
  /** The id of its first row: what «Anular» sends (the server voids the whole call). */
  id: Id
  /** The call that wrote it (`money_adjustments.call_id`). */
  callId: Id
  sourceKey: string
  /** The bucket's label, or the key when the bucket is gone. */
  label: string
  rows: MoneyAdjustment[]
  total: number
  reason: string
  createdAt: string
  /** `applied`: paid; `over`: more than the bucket holds; `orphan`: the bucket is gone; `waiting`: play is not over, nothing is listed yet. */
  status: 'applied' | 'over' | 'orphan' | 'waiting'
}

/** The planned days that keep play from being over: still open (scheduled or live), or never created. */
export interface OpenDays {
  open: number[]
  missing: number[]
}

export interface UnassignedState {
  /** Play is over (every planned day exists and is finished or cancelled): buckets are listed only then. */
  closing: boolean
  /**
   * Terminado while a planned day is still open or was never created (an
   * older bundle, a direct update, a restored backup): the Comité's earlier
   * decisions keep applying, nothing new is listed, and Dinero says which
   * day to finish or cancel. Null otherwise.
   */
  openDays: OpenDays | null
  buckets: UnassignedBucket[]
  /** Σ remaining: what is still «por asignar». */
  total: number
  /** Snake money an unanswered tiebreak holds: paid by the snake once answered, never assigned. */
  held: HeldMoney[]
  /** Σ held. */
  heldTotal: number
  /** Every assignment not voided, oldest first. */
  assignments: Assignment[]
  /** The prizes the assignments that fit pay (bank → player). */
  awards: PrizeAward[]
  /** What the assignments that fit leave to the house. */
  toHouse: number
  /** «Asignación de más», «Asignación sin pozo». */
  warnings: string[]
}

export const NO_UNASSIGNED: UnassignedState = { closing: false, openDays: null, buckets: [], total: 0, held: [], heldTotal: 0, assignments: [], awards: [], toHouse: 0, warnings: [] }

export interface UnassignedInput {
  snapshot: Snapshot
  settings: TournamentSettings
  /** The modules' and games' prizes, before any assignment. */
  prizes: PrizeAward[]
  pool: PrizeCheck
  auction?: AuctionState
  snake?: SnakeState
  games: Record<string, GameResultState>
  /** Every warning so far: the ones a bucket's label opens («Skins: nadie ganó…») explain it. */
  warnings: string[]
  closing: boolean
}

/** A prize of a module's line: the module's own, or the Comité's assignment from that line's «por asignar». */
export function fromLine(pr: PrizeAward, moduleId: string): boolean {
  return pr.moduleId === moduleId || (pr.moduleId === 'adjustment' && pr.sourceKey === moduleId)
}

/** The pot line a prize is paid from; null for a direct bet (no bank). */
function lineOf(pr: PrizeAward): string | null {
  if (pr.payerId) return null
  if (pr.gameId) return `game:${pr.gameId}`
  if (pr.potId === 'calcutta') return 'calcutta'
  return pr.moduleId
}

/** Snake money an unanswered tiebreak holds, by group: once play is over only. */
export function heldMoney(input: Pick<UnassignedInput, 'settings' | 'snake' | 'closing'>): HeldMoney[] {
  if (!input.closing || !input.snake) return []
  const label = input.settings.modules.snake.label
  return input.snake.groups
    .filter((g) => g.pendingHole != null && g.pot > 0)
    .map((g) => ({
      key: `snake:${g.roundId}:${g.groupId}`,
      label: U.heldLabel(label, g.roundNumber, g.groupNumber),
      amount: g.pot,
      note: U.heldNote(g.pendingHole!),
      why: { title: U.heldTitle(fmt(g.pot)), steps: [U.pendingTiebreak(g.roundNumber, g.groupNumber, g.pendingHole!), U.heldWhy(fmt(g.pot))] },
    }))
}

export function unassignedBuckets(input: UnassignedInput): UnassignedBucket[] {
  const { snapshot, settings, prizes, pool, auction, games, warnings } = input
  if (!input.closing) return []
  const paid = new Map<string, number>()
  for (const pr of prizes) {
    const line = lineOf(pr)
    if (line && pr.amount > 0) paid.set(line, (paid.get(line) ?? 0) + pr.amount)
  }
  const players = [...snapshot.players].sort((a, b) => a.sortOrder - b.sortOrder)
  const entries: Contributor[] | undefined = settings.entryFee > 0 ? players.map((p) => ({ playerId: p.id, amount: settings.entryFee })) : undefined
  // The snake's groups waiting on a tiebreak: their money is the snake's, not a bucket.
  const held = heldMoney(input).reduce((s, h) => s + h.amount, 0)
  // Days whose money the line budgets but nobody played.
  const lostDays = () => {
    const out: string[] = []
    for (let n = 1; n <= settings.rounds; n++) {
      const r = snapshot.rounds.find((x) => x.number === n)
      if (!r) out.push(U.unplayedRound(n))
      else if (r.status === 'cancelled') out.push(U.cancelledRound(n))
    }
    return out
  }

  const out: UnassignedBucket[] = []
  const add = (key: string, label: string, potId: string, budget: number, notes: string[], contributors?: Contributor[], waiting = 0) => {
    const given = paid.get(key) ?? 0
    const amount = budget - given - waiting
    if (amount <= 0) return
    // The engine's own word on it («Skins: nadie ganó un skin…»), without its «El Comité decide», said once below.
    const own = warnings.filter((w) => w.startsWith(`${label}:`)).map((w) => w.replace(/\s*El Comité decide\.$/, ''))
    const steps = [U.budget(label, fmt(budget)), U.paid(fmt(given)), ...(waiting > 0 ? [U.heldApart(fmt(waiting))] : []), ...notes, ...own, U.left(fmt(amount)), U.decides]
    out.push({ key, label, potId, amount, assigned: 0, remaining: amount, why: { title: U.title(fmt(amount)), steps }, contributors })
  }

  // The entries: each module's and main-pot game's line, as the prize check budgets it.
  for (const line of pool.lines) {
    if (line.moduleId === 'house') continue
    const notes: string[] = []
    if (line.moduleId === 'bestRound' || line.moduleId === 'snake') notes.push(...lostDays())
    add(line.moduleId, line.label, 'main', line.amount, notes, entries, line.moduleId === 'snake' ? held : 0)
  }
  // Entries no prize claims (the prize check warns while play goes on).
  if (pool.difference > 0) {
    out.push({
      key: 'pool',
      label: U.poolLabel,
      potId: 'main',
      amount: pool.difference,
      assigned: 0,
      remaining: pool.difference,
      why: { title: U.title(fmt(pool.difference)), steps: [U.poolSurplus(fmt(pool.entryPot), fmt(pool.prizesTotal)), U.left(fmt(pool.difference)), U.decides] },
      contributors: entries,
    })
  }
  // Side pots: what the entrants put in.
  for (const g of Object.values(games)) {
    if (g.config.money.source !== 'side' || g.pot <= 0) continue
    const buyIn = g.config.money.buyIn
    add(`game:${g.config.id}`, g.config.label, g.config.id, g.pot, [], g.entrants.map((playerId) => ({ playerId, amount: buyIn })))
  }
  // The Calcutta pot: what the owners paid for their lots.
  if (auction && auction.pot > 0) {
    const owners = new Map<Id, number>()
    for (const lot of auction.lots) if (lot.status === 'sold' && lot.ownerId) owners.set(lot.ownerId, (owners.get(lot.ownerId) ?? 0) + lot.price)
    const order = new Map(players.map((p, i) => [p.id, i]))
    const contributors = [...owners].map(([playerId, amount]) => ({ playerId, amount })).sort((a, b) => (order.get(a.playerId) ?? 0) - (order.get(b.playerId) ?? 0))
    add('calcutta', settings.modules.auction.label, 'calcutta', auction.pot, [], contributors)
  }
  return out
}

/**
 * `amount` split by what each contributor put in: floor each exact share,
 * then the pesos left one at a time to the largest fractions left over (the
 * bigger contributor, then the list's order, breaks a tie). Sums to `amount`
 * exactly, and each gets his exact share rounded down or up, never more.
 */
export function proRata(amount: number, contributors: readonly Contributor[]): Contributor[] {
  const list = contributors.filter((c) => c.amount > 0)
  const total = list.reduce((s, c) => s + c.amount, 0)
  if (amount <= 0 || total <= 0) return []
  // Integer arithmetic: the fraction left over is (amount × c) mod total.
  const shares = list.map((c) => ({ playerId: c.playerId, amount: Math.floor((amount * c.amount) / total), left: (amount * c.amount) % total, weight: c.amount }))
  let rest = amount - shares.reduce((s, c) => s + c.amount, 0)
  const order = shares.map((s, i) => ({ s, i })).sort((a, b) => b.s.left - a.s.left || b.s.weight - a.s.weight || a.i - b.i)
  // Fewer pesos left than contributors: each takes at most one.
  for (let k = 0; rest > 0; k++, rest--) order[k]!.s.amount++
  return shares.filter((s) => s.amount > 0).map(({ playerId, amount: a }) => ({ playerId, amount: a }))
}

/** A bucket's label from its key, for an assignment whose bucket is gone. */
export function bucketLabel(key: string, settings: TournamentSettings): string {
  if (key === 'pool') return U.poolLabel
  if (key === 'calcutta') return settings.modules.auction.label
  if (key.startsWith('game:')) return settings.games.find((g) => g.id === key.slice(5))?.label ?? key.slice(5)
  return settings.modules[key as keyof TournamentSettings['modules']]?.label ?? key
}

const cmp = (x: string, y: string) => (x < y ? -1 : x > y ? 1 : 0)

/**
 * The Comité's assignments against the buckets: each call (`callId`) is one
 * decision, oldest first (by when it was written, then by its id, never by a
 * row's id alone); one that fits is paid, one that does not is flagged and
 * moves nothing. Updates the buckets' `assigned` and `remaining`.
 */
export function applyAdjustments(
  buckets: UnassignedBucket[],
  adjustments: readonly MoneyAdjustment[],
  closing: boolean,
  labelOf: (key: string) => string = (k) => k,
  held: HeldMoney[] = [],
): UnassignedState {
  const calls = new Map<string, MoneyAdjustment[]>()
  for (const a of [...adjustments].filter((x) => !x.voidedAt).sort((x, y) => cmp(x.createdAt, y.createdAt) || cmp(x.callId, y.callId) || cmp(x.id, y.id))) {
    const list = calls.get(a.callId) ?? []
    list.push(a)
    calls.set(a.callId, list)
  }
  const byKey = new Map(buckets.map((b) => [b.key, b]))
  const assignments: Assignment[] = []
  const awards: PrizeAward[] = []
  const warnings: string[] = []
  let toHouse = 0
  for (const rows of calls.values()) {
    const first = rows[0]!
    const bucket = byKey.get(first.sourceKey)
    const total = rows.reduce((s, r) => s + r.amount, 0)
    const base = { id: first.id, callId: first.callId, sourceKey: first.sourceKey, label: bucket?.label ?? labelOf(first.sourceKey), rows, total, reason: first.reason, createdAt: first.createdAt }
    if (!closing) {
      assignments.push({ ...base, status: 'waiting' })
      continue
    }
    if (!bucket) {
      assignments.push({ ...base, status: 'orphan' })
      warnings.push(U.orphan(base.label, fmt(total)))
      continue
    }
    if (total > bucket.remaining) {
      assignments.push({ ...base, status: 'over' })
      warnings.push(U.over(bucket.label, fmt(total), fmt(bucket.remaining)))
      continue
    }
    bucket.assigned += total
    bucket.remaining -= total
    assignments.push({ ...base, status: 'applied' })
    for (const r of rows) {
      if (r.kind === 'house' || !r.toPlayerId) {
        toHouse += r.amount
        continue
      }
      awards.push({
        moduleId: 'adjustment',
        potId: bucket.potId,
        label: r.kind === 'refund' ? U.refundLabel(bucket.label) : U.awardLabel(bucket.label),
        playerId: r.toPlayerId,
        amount: r.amount,
        final: true,
        why: { title: fmt(r.amount), steps: U.adjustmentWhy(bucket.label, fmt(bucket.amount), r.reason) },
        adjustmentId: r.id,
        sourceKey: r.sourceKey,
      })
    }
  }
  const listed = buckets.filter((b) => b.remaining > 0)
  return { closing, openDays: null, buckets: listed, total: listed.reduce((s, b) => s + b.remaining, 0), held, heldTotal: held.reduce((s, h) => s + h.amount, 0), assignments, awards, toHouse, warnings }
}

/** The planned days still open or never created (none: play is over, when at least one day exists). */
export function openDays(rounds: ReadonlyArray<{ number: number; status: string }>, planned: number): OpenDays {
  const made = new Set(rounds.map((r) => r.number))
  const missing: number[] = []
  // Days the settings plan that nobody created, as many as the count falls short.
  for (let n = 1; n <= planned && rounds.length + missing.length < planned; n++) if (!made.has(n)) missing.push(n)
  const open = rounds
    .filter((r) => r.status === 'live' || r.status === 'scheduled')
    .map((r) => r.number)
    .sort((a, b) => a - b)
  return { open, missing }
}
