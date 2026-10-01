/**
 * Ranking with ties, countback and prize splitting (§5.3, §5.4, §5.5).
 */
import { ordinal, t } from '../../i18n/es-MX'
import type { Explanation } from '../types'

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

export interface CountbackStep {
  label: string
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
  const windows: Array<[string, number, number]> = [
    ['Total', 1, holes],
    ...countbackWindows(holes).map(([f, t]): [string, number, number] => [f === t ? `Hoyo ${t}` : `Hoyos ${f}–${t}`, f, t]),
  ]
  for (const [label, from, to] of windows) {
    const sa = sum(a.pointsByHole, from, to)
    const sb = sum(b.pointsByHole, from, to)
    steps.push({ label, a: sa, b: sb })
    if (sa !== sb) return { result: sb - sa, steps }
  }
  return { result: 0, steps }
}

export interface PrizeShare<T> {
  item: T
  amount: number
  why: Explanation
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
    const base = Math.floor(total / n)
    let remainder = total - base * n
    g.members.forEach((m, i) => {
      const extra = remainder > 0 ? 1 : 0
      remainder -= extra
      const amount = base + extra
      const steps: string[] = []
      if (n === 1) steps.push(`${ordinal(String(g.position))} lugar: $${total}`)
      else {
        steps.push(
          `Empate a ${n} en el ${ordinal(String(g.position))}: se reparten los premios del ${t.common.andList(places.map((p) => ordinal(String(p))))} ($${total})`,
        )
        steps.push(`$${total} ÷ ${n} = $${base}${extra ? ' (+$1 de redondeo)' : ''}`)
        steps.push(`Empatados: ${g.members.map(name).join(', ')}`)
      }
      out.push({ item: m, amount, why: { title: `$${amount}`, steps } })
      void i
    })
  }
  return out
}
