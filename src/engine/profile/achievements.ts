/**
 * Badges, personal records and the year in review, from a profile's published
 * rounds and tournaments (migrations 0015+). Pure: the profile page computes
 * them on read, nothing is stored. Practice (the Ensayo) never counts, and
 * nothing here ever carries money.
 *
 * A badge's unlock date is the date of the first round (or tournament) that
 * earned it, in play order.
 */

/** Hole detail: [hole, par, stroke index, strokes, putts, picked up]. */
export type HoleDetail = [number, number, number, number | null, number | null, boolean]

export interface AchRound {
  roundId: string
  tournament: string
  slug: string
  course: string | null
  playedOn: string | null
  holes: number
  complete: boolean
  practice: boolean
  gross: number | null
  differential: number | null
  putts: number | null
  eagles: number
  birdies: number
  detail: HoleDetail[]
}

export interface AchTournament {
  tournamentId: string
  slug: string
  name: string
  practice: boolean
  status: string
  rank: number | null
  field: number | null
  startsOn: string | null
}

export const BADGES = [
  'firstRound',
  'rounds10',
  'rounds25',
  'rounds50',
  'firstBirdie',
  'birdies3',
  'eagle',
  'ace',
  'break100',
  'break90',
  'break80',
  'break70',
  'parStreak5',
  'noDoubles',
  'noThreePutts',
  'putts28',
  'tournaments5',
  'podium',
  'firstWin',
  'wins3',
] as const
export type BadgeId = (typeof BADGES)[number]

export interface Badge {
  id: BadgeId
  /** yyyy-mm-dd when earned; null when not yet (or earned on an undated round: '' ). */
  unlockedAt: string | null
  earned: boolean
  /** Where it was earned, to link to. */
  roundId?: string
  slug?: string
}

export type RecordId = 'bestGross' | 'bestDifferential' | 'mostBirdies' | 'fewestPutts' | 'longestParStreak' | 'bestFinish'

export interface PersonalRecord {
  id: RecordId
  value: number
  /** For bestFinish: the field size. */
  of?: number | null
  roundId?: string
  slug?: string
  where: string
  date: string | null
}

const full18 = (r: AchRound) => r.complete && r.holes === 18
const played = (h: HoleDetail) => !h[5] && h[3] != null

/** Longest run of consecutive holes at par or better, in hole order (no pick-ups). */
export function parStreak(detail: HoleDetail[]): number {
  let best = 0
  let run = 0
  for (const h of [...detail].sort((a, b) => a[0] - b[0])) {
    if (played(h) && h[3]! <= h[1]) best = Math.max(best, ++run)
    else run = 0
  }
  return best
}

/** Every hole at bogey or better, none picked up. */
export const noDoubles = (detail: HoleDetail[]) => detail.length > 0 && detail.every((h) => played(h) && h[3]! <= h[1] + 1)
/** Putts recorded on every hole, none over two. */
export const noThreePutts = (detail: HoleDetail[]) => detail.length > 0 && detail.every((h) => h[4] != null && h[4] <= 2)
export const hasAce = (detail: HoleDetail[]) => detail.some((h) => played(h) && h[3] === 1)

const byDate = <T>(list: T[], date: (x: T) => string | null) => [...list].sort((a, b) => (date(a) ?? '9999').localeCompare(date(b) ?? '9999'))

function counting(rounds: AchRound[]) {
  return byDate(
    rounds.filter((r) => !r.practice),
    (r) => r.playedOn,
  )
}

export function badges(rounds: AchRound[], tournaments: AchTournament[]): Badge[] {
  const rs = counting(rounds)
  const complete = rs.filter((r) => r.complete)
  const ts = byDate(
    tournaments.filter((t) => !t.practice && t.status === 'finished'),
    (t) => t.startsOn,
  )
  const out = new Map<BadgeId, Badge>()
  const fromRound = (id: BadgeId, r: AchRound | undefined) => out.set(id, r ? { id, earned: true, unlockedAt: r.playedOn ?? '', roundId: r.roundId, slug: r.slug } : { id, earned: false, unlockedAt: null })
  const fromTournament = (id: BadgeId, t: AchTournament | undefined) => out.set(id, t ? { id, earned: true, unlockedAt: t.startsOn ?? '', slug: t.slug } : { id, earned: false, unlockedAt: null })

  fromRound('firstRound', complete[0])
  fromRound('rounds10', complete[9])
  fromRound('rounds25', complete[24])
  fromRound('rounds50', complete[49])
  fromRound(
    'firstBirdie',
    rs.find((r) => r.birdies + r.eagles > 0),
  )
  fromRound(
    'birdies3',
    rs.find((r) => r.birdies + r.eagles >= 3),
  )
  fromRound(
    'eagle',
    rs.find((r) => r.eagles > 0),
  )
  fromRound(
    'ace',
    rs.find((r) => hasAce(r.detail)),
  )
  for (const [id, under] of [
    ['break100', 100],
    ['break90', 90],
    ['break80', 80],
    ['break70', 70],
  ] as const) {
    fromRound(
      id,
      rs.find((r) => full18(r) && r.gross != null && r.gross < under),
    )
  }
  fromRound(
    'parStreak5',
    rs.find((r) => parStreak(r.detail) >= 5),
  )
  fromRound(
    'noDoubles',
    rs.find((r) => full18(r) && noDoubles(r.detail)),
  )
  fromRound(
    'noThreePutts',
    rs.find((r) => full18(r) && noThreePutts(r.detail)),
  )
  fromRound(
    'putts28',
    rs.find((r) => full18(r) && r.putts != null && noThreePutts(r.detail) && r.putts <= 28),
  )
  fromTournament('tournaments5', ts[4])
  fromTournament(
    'podium',
    ts.find((t) => t.rank != null && t.rank <= 3),
  )
  const wins = ts.filter((t) => t.rank === 1)
  fromTournament('firstWin', wins[0])
  fromTournament('wins3', wins[2])
  return BADGES.map((id) => out.get(id)!)
}

export function records(rounds: AchRound[], tournaments: AchTournament[]): PersonalRecord[] {
  const rs = counting(rounds)
  const out: PersonalRecord[] = []
  const where = (r: AchRound) => r.course ?? r.tournament
  // Earliest wins a tie: a record stands until it's beaten.
  const best = (list: AchRound[], value: (r: AchRound) => number | null, lower: boolean) => {
    let pick: AchRound | null = null
    let v = 0
    for (const r of list) {
      const x = value(r)
      if (x == null) continue
      if (pick == null || (lower ? x < v : x > v)) {
        pick = r
        v = x
      }
    }
    return pick ? { r: pick, v } : null
  }
  const push = (id: RecordId, hit: { r: AchRound; v: number } | null) => hit && out.push({ id, value: hit.v, roundId: hit.r.roundId, slug: hit.r.slug, where: where(hit.r), date: hit.r.playedOn })

  const f18 = rs.filter(full18)
  push(
    'bestGross',
    best(f18, (r) => r.gross, true),
  )
  push(
    'bestDifferential',
    best(rs, (r) => r.differential, true),
  )
  push(
    'mostBirdies',
    best(rs, (r) => (r.birdies + r.eagles > 0 ? r.birdies + r.eagles : null), false),
  )
  push(
    'fewestPutts',
    best(
      f18.filter((r) => r.detail.every((h) => h[4] != null)),
      (r) => r.putts,
      true,
    ),
  )
  push(
    'longestParStreak',
    best(rs, (r) => parStreak(r.detail) || null, false),
  )
  const finishes = byDate(
    tournaments.filter((t) => !t.practice && t.status === 'finished' && t.rank != null),
    (t) => t.startsOn,
  )
  let top: AchTournament | null = null
  for (const t of finishes) if (!top || t.rank! < top.rank!) top = t
  if (top) out.push({ id: 'bestFinish', value: top.rank!, of: top.field, slug: top.slug, where: top.name, date: top.startsOn })
  return out
}

export interface YearRecap {
  year: number
  rounds: number
  tournaments: number
  wins: number
  podiums: number
  birdies: number
  eagles: number
  bestGross: number | null
  avgGross: number | null
  bestDifferential: number | null
  courses: number
  favoriteCourse: string | null
  badges: BadgeId[]
}

/** Years with counting rounds or finished tournaments, newest first. */
export function recapYears(rounds: AchRound[], tournaments: AchTournament[]): number[] {
  const ys = new Set<number>()
  for (const r of rounds) if (!r.practice && r.complete && r.playedOn) ys.add(Number(r.playedOn.slice(0, 4)))
  for (const t of tournaments) if (!t.practice && t.status === 'finished' && t.startsOn) ys.add(Number(t.startsOn.slice(0, 4)))
  return [...ys].sort((a, b) => b - a)
}

export function yearRecap(rounds: AchRound[], tournaments: AchTournament[], year: number): YearRecap {
  const inYear = (d: string | null) => !!d && Number(d.slice(0, 4)) === year
  const rs = counting(rounds).filter((r) => r.complete && inYear(r.playedOn))
  const ts = tournaments.filter((t) => !t.practice && t.status === 'finished' && inYear(t.startsOn))
  const grosses = rs.filter(full18).map((r) => r.gross).filter((g): g is number => g != null)
  const diffs = rs.map((r) => r.differential).filter((d): d is number => d != null)
  const courseCount = new Map<string, number>()
  for (const r of rs) if (r.course) courseCount.set(r.course, (courseCount.get(r.course) ?? 0) + 1)
  // The favorite is the course played more than any other; a tie at the top has none.
  const counts = [...courseCount.entries()].sort((a, b) => b[1] - a[1])
  const favorite = counts.length > 0 && counts[0]![1] > 1 && (counts.length === 1 || counts[0]![1] > counts[1]![1]) ? counts[0]![0] : null
  return {
    year,
    rounds: rs.length,
    tournaments: ts.length,
    wins: ts.filter((t) => t.rank === 1).length,
    podiums: ts.filter((t) => t.rank != null && t.rank <= 3).length,
    birdies: rs.reduce((s, r) => s + r.birdies, 0),
    eagles: rs.reduce((s, r) => s + r.eagles, 0),
    bestGross: grosses.length ? Math.min(...grosses) : null,
    // One decimal, from integer sums.
    avgGross: grosses.length ? Math.round((grosses.reduce((s, g) => s + g, 0) * 10) / grosses.length) / 10 : null,
    bestDifferential: diffs.length ? Math.min(...diffs) : null,
    courses: courseCount.size,
    favoriteCourse: favorite,
    badges: badges(rounds, tournaments)
      .filter((b) => b.earned && inYear(b.unlockedAt))
      .map((b) => b.id),
  }
}
