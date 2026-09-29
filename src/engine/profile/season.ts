/**
 * A crew's season table (migration 0018): points by finish in each finished
 * outing of the year, plus one for playing. Ties share the average of the
 * places they occupy. Order: points, then wins, then best finish; players
 * equal on all three share the position ("T2").
 */

export const SEASON_POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1]
export const PLAY_BONUS = 1

export interface SeasonResult {
  tournamentId: string
  /** yyyy-mm-dd: the outing's first round. */
  date: string
  handle: string
  /** 1-based finish; tied players share the first place of the tie. Null without a finish. */
  rank: number | null
  rankLabel: string | null
  field: number
  /** How many players of the whole field share this place (members or not). Counted among the results when absent. */
  tied?: number
}

export interface SeasonRow {
  handle: string
  points: number
  events: number
  wins: number
  best: number | null
  position: number
  label: string
}

/** Years with results, newest first. */
export function seasons(results: SeasonResult[]): number[] {
  return [...new Set(results.map((r) => Number(r.date.slice(0, 4))))].sort((a, b) => b - a)
}

/** Points for a finish shared by `tied` players: the average of the places they occupy, plus playing. */
export function placePoints(rank: number | null, tied: number, table = SEASON_POINTS, bonus = PLAY_BONUS): number {
  if (rank == null) return bonus
  let sum = 0
  for (let i = 0; i < tied; i++) sum += table[rank - 1 + i] ?? 0
  return sum / tied + bonus
}

export function seasonTable(results: SeasonResult[], year: number, table = SEASON_POINTS, bonus = PLAY_BONUS): SeasonRow[] {
  const inYear = results.filter((r) => Number(r.date.slice(0, 4)) === year)
  const tiedAt = new Map<string, number>()
  for (const r of inYear) if (r.rank != null) tiedAt.set(`${r.tournamentId}:${r.rank}`, (tiedAt.get(`${r.tournamentId}:${r.rank}`) ?? 0) + 1)

  const by = new Map<string, Omit<SeasonRow, 'position' | 'label'>>()
  for (const r of inYear) {
    const row = by.get(r.handle) ?? { handle: r.handle, points: 0, events: 0, wins: 0, best: null }
    row.points += placePoints(r.rank, r.rank == null ? 1 : (r.tied ?? tiedAt.get(`${r.tournamentId}:${r.rank}`)!), table, bonus)
    row.events += 1
    if (r.rank === 1) row.wins += 1
    if (r.rank != null) row.best = row.best == null ? r.rank : Math.min(row.best, r.rank)
    by.set(r.handle, row)
  }
  // Half points are the only fractions (a two-way tie); compare in tenths to stay exact.
  const key = (r: Omit<SeasonRow, 'position' | 'label'>) => [Math.round(r.points * 10), r.wins, -(r.best ?? Infinity)] as const
  const cmp = (a: Omit<SeasonRow, 'position' | 'label'>, b: Omit<SeasonRow, 'position' | 'label'>) => {
    const ka = key(a)
    const kb = key(b)
    for (let i = 0; i < 3; i++) if (ka[i] !== kb[i]) return kb[i]! - ka[i]!
    return 0
  }
  const sorted = [...by.values()].sort((a, b) => cmp(a, b) || a.handle.localeCompare(b.handle))
  return sorted.map((r, i) => {
    let first = i
    while (first > 0 && cmp(sorted[first - 1]!, r) === 0) first--
    const tied = (i > 0 && cmp(sorted[i - 1]!, r) === 0) || (i < sorted.length - 1 && cmp(sorted[i + 1]!, r) === 0)
    return { ...r, position: first + 1, label: `${tied ? 'T' : ''}${first + 1}` }
  })
}
