/**
 * The rules every game shares (§5.3, §5.4, §5.5; ARCH-15): how a field is
 * ranked and its ties broken, when a game's result is final, and how pesos
 * split into whole shares. Each game picks its option here (a countback or a
 * shared place, which rounds make it final, where the rounding pesos go)
 * instead of writing its own.
 */
import { msg, type Msg } from '../messages'
import type { Explanation, Id } from '../types'

export interface Ranked<T> {
  item: T
  /** 1-based position; tied players share the same position. */
  position: number
  tied: boolean
  /** "3" or "T3". */
  label: string
}

/** Members of one position (ties grouped). */
export interface RankGroup<T> {
  position: number
  members: T[]
}

/**
 * Sort by `compare` (negative = a ahead of b) and group ties.
 * `order` breaks nothing: it only makes tied output deterministic.
 */
export function rankBy<T>(items: T[], compare: (a: T, b: T) => number, order?: (a: T, b: T) => number): RankGroup<T>[] {
  const sorted = [...items].sort((a, b) => compare(a, b) || (order ? order(a, b) : 0))
  const groups: RankGroup<T>[] = []
  let position = 1
  for (let i = 0; i < sorted.length; i++) {
    const cur = sorted[i]!
    const last = groups[groups.length - 1]
    if (last && compare(last.members[0]!, cur) === 0) {
      last.members.push(cur)
    } else {
      position = i + 1
      groups.push({ position, members: [cur] })
    }
  }
  return groups
}

/**
 * How a game orders its field: the figures that decide, compared in turn, and
 * what breaks a tie on all of them.
 */
export interface RankPolicy<T> {
  /** Each a number where more is ahead: negate a figure where fewer is better (strokes, putts). */
  keys: ReadonlyArray<(item: T) => number>
  /**
   * `share`: the tied share the places they occupy. A countback compares each
   * one's card (`countback`): the individual game, best round.
   */
  ties: 'share' | { countback: (item: T) => CountbackInput }
  /** Order inside a tie, for display only. */
  order?: (a: T, b: T) => number
}

/** Rank `items` by a game's policy: tie groups, best first. Each figure is read once per item. */
export function rankField<T>(items: T[], policy: RankPolicy<T>): RankGroup<T>[] {
  const keys = new Map(items.map((item) => [item, policy.keys.map((key) => key(item))]))
  const ties = policy.ties
  const cards = ties === 'share' ? null : new Map(items.map((item) => [item, ties.countback(item)]))
  const compare = (a: T, b: T) => {
    const ka = keys.get(a)!
    const kb = keys.get(b)!
    for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return kb[i]! - ka[i]!
    return cards ? countback(cards.get(a)!, cards.get(b)!).result : 0
  }
  return rankBy(items, compare, policy.order)
}

export function flattenRanks<T>(groups: RankGroup<T>[]): Ranked<T>[] {
  const out: Ranked<T>[] = []
  for (const g of groups) {
    const tied = g.members.length > 1
    for (const item of g.members) {
      out.push({ item, position: g.position, tied, label: `${tied ? 'T' : ''}${g.position}` })
    }
  }
  return out
}

/** Countback windows for an N-hole round: 18 → [10–18, 13–18, 16–18, 18]; 9 → [5–9, 7–9, 9]. */
export function countbackWindows(holes: number): Array<[number, number]> {
  if (holes === 9) {
    return [
      [5, 9],
      [7, 9],
      [9, 9],
    ]
  }
  return [
    [10, 18],
    [13, 18],
    [16, 18],
    [18, 18],
  ]
}

export interface CountbackInput {
  /** Points per hole of the round used for the countback, indexed by hole number (1-based keys). */
  pointsByHole: Map<number, number>
  holes: number
}

/** The holes a countback step compares: the whole round (`total`), or holes `from`–`to`. */
export interface CountbackWindow {
  from: number
  to: number
  total: boolean
}

export interface CountbackStep extends CountbackWindow {
  a: number
  b: number
}

/**
 * Countback within one round (the last round for the individual game, the
 * day itself for best round): round total, then the windows. Returns
 * negative when `a` is ahead, positive when `b` is, 0 when still tied, plus
 * the steps compared for the explanation.
 */
export function countback(a: CountbackInput, b: CountbackInput): { result: number; steps: CountbackStep[] } {
  const steps: CountbackStep[] = []
  const sum = (m: Map<number, number>, from: number, to: number) => {
    let s = 0
    for (let h = from; h <= to; h++) s += m.get(h) ?? 0
    return s
  }
  const holes = Math.max(a.holes, b.holes)
  const windows: CountbackWindow[] = [{ from: 1, to: holes, total: true }, ...countbackWindows(holes).map(([from, to]) => ({ from, to, total: false }))]
  for (const { from, to, total } of windows) {
    const sa = sum(a.pointsByHole, from, to)
    const sb = sum(b.pointsByHole, from, to)
    steps.push({ from, to, total, a: sa, b: sb })
    if (sa !== sb) return { result: sb - sa, steps }
  }
  return { result: 0, steps }
}

/**
 * When a game's result stops being «si terminara ahora»:
 * - `tournament`: once the tournament is final (the main event, fewest putts, pairs, the Calcutta);
 * - `rounds`: once each of its rounds is finished, whatever the tournament (a day's best round, a group's snake);
 * - `roundsOrTournament`: either (the instance games, a skins or match round).
 * `none` is what no rounds at all reads as.
 */
export type FinalWhen = 'tournament' | 'rounds' | 'roundsOrTournament'

export interface Finality {
  tournamentFinal: boolean
  roundFinal: Record<Id, boolean>
}

export function isFinal(ctx: Finality, when: FinalWhen, roundIds: readonly Id[] = [], none = false): boolean {
  if (when === 'tournament') return ctx.tournamentFinal
  if (when === 'roundsOrTournament' && ctx.tournamentFinal) return true
  return roundIds.length ? roundIds.every((rid) => ctx.roundFinal[rid]) : none
}

/** One whole-peso share and the rounding pesos it took on top of its floor. */
export interface WholeShare {
  amount: number
  rounding: number
}

/**
 * Split `total` pesos by `weights` in whole pesos: each share is its floor of
 * `total × weight ÷ of` (`of` defaults to the weights' sum), and the pesos the
 * floors leave go one each to the first shares (`spread`) or all to the first
 * (`first`). Equal parts are weights of 1.
 */
export function splitWhole(total: number, weights: readonly number[], opts: { of?: number; rest?: 'spread' | 'first' } = {}): WholeShare[] {
  const of = opts.of ?? weights.reduce((s, w) => s + w, 0)
  const out = weights.map((w) => ({ amount: Math.floor((total * w) / of), rounding: 0 }))
  let rest = total - out.reduce((s, x) => s + x.amount, 0)
  if (opts.rest === 'first') {
    if (out.length && rest > 0) {
      out[0]!.amount += rest
      out[0]!.rounding = rest
    }
    return out
  }
  for (const share of out) {
    const extra = rest > 0 ? 1 : 0
    rest -= extra
    share.amount += extra
    share.rounding = extra
  }
  return out
}

/** `n` equal whole-peso parts of `total`. */
export function splitEven(total: number, n: number, rest: 'spread' | 'first' = 'spread'): WholeShare[] {
  return splitWhole(total, Array.from({ length: n }, () => 1), { of: n, rest })
}

export interface PrizeShare<T> {
  item: T
  amount: number
  why: Explanation
}

/**
 * The groups without the entrants who have no result, places renumbered
 * (MONEY-09): one who never played a hole takes no paid place. The board
 * still lists them, last.
 */
export function onlyWithResult<T>(groups: RankGroup<T>[], has: (t: T) => boolean): RankGroup<T>[] {
  const out: RankGroup<T>[] = []
  let position = 1
  for (const g of groups) {
    const members = g.members.filter(has)
    if (!members.length) continue
    out.push({ position, members })
    position += members.length
  }
  return out
}


/**
 * Once a game is over, the warning for its places with a prize that nobody
 * filled (MONEY-09): `count` entrants had a result, in `unit` (singular,
 * plural). The money stays with the bank until the Comité decides.
 */
export function unfilledWarning(label: string, unfilled: { places: number[]; amount: number }, count: number, unit: 'player' | 'team' | 'pair', day: number | null = null): Msg[] {
  if (!unfilled.places.length) return []
  return [msg('rank.unfilled', { label, day, places: unfilled.places, count, unit, amount: unfilled.amount })]
}

/** The places with a prize that `groups` leave empty, and their pesos (MONEY-09). */
export function unfilledPlaces(groups: RankGroup<unknown>[], prizes: number[]): { places: number[]; amount: number } {
  const filled = groups.reduce((n, g) => n + g.members.length, 0)
  const places: number[] = []
  let amount = 0
  prizes.forEach((p, i) => {
    if (i < filled || p <= 0) return
    places.push(i + 1)
    amount += p
  })
  return { places, amount }
}

/**
 * Pay `prizes` (index 0 = 1st place) to ranked groups. A tie shares the sum
 * of the prizes for the places it occupies, split evenly in whole pesos;
 * any remainder pesos go one each to the first members in group order.
 */
export function splitPrizes<T>(groups: RankGroup<T>[], prizes: number[], name: (t: T) => string): PrizeShare<T>[] {
  const out: PrizeShare<T>[] = []
  for (const g of groups) {
    const n = g.members.length
    const places: number[] = []
    let total = 0
    for (let k = 0; k < n; k++) {
      const p = g.position + k
      const prize = prizes[p - 1] ?? 0
      if (prize > 0) places.push(p)
      total += prize
    }
    if (total === 0) continue
    const shares = splitEven(total, n)
    g.members.forEach((m, i) => {
      const { amount, rounding: extra } = shares[i]!
      const base = amount - extra
      const steps: Msg[] = []
      // COPY-19: the place and what it pays, in a sentence; a tie says whose prizes it joins and how it splits them.
      if (n === 1) steps.push(msg('prize.place', { place: g.position, amount: total }))
      else {
        steps.push(msg('prize.tie', { n, place: g.position, places, total }))
        steps.push(msg('prize.tieSplit', { total, n, each: base, rounding: extra }))
        steps.push(msg('prize.tied', { names: g.members.map(name) }))
      }
      out.push({ item: m, amount, why: { title: msg('amount', { amount }), steps } })
    })
  }
  return out
}
