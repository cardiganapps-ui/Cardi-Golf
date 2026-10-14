/**
 * The field e2e/stack/seed.sql puts in every e2e tournament, and the
 * Stableford arithmetic of §5.2–5.3, written out here on its own: the
 * expected boards come from this, never from the app's engine, so a wrong
 * engine cannot agree with itself. global-setup.ts checks this mirror against
 * the seeded rows before any test runs.
 */

export const PIN = '1234'
/** settings-minimal.json: 80% of the course handicap, capped at 54, rounded half up. */
export const ALLOWANCE = 0.8
export const CAP = 54

/** One tournament per spec, so no spec sees another's scores. */
export const SLUGS = {
  smoke: 'e2e-humo',
  twoPhones: 'e2e-dos-telefonos',
  offline: 'e2e-sin-senal',
  session: 'e2e-sesion',
  sameCard: 'e2e-misma-tarjeta',
  conflict: 'e2e-conflicto',
  fourG: 'e2e-cuatro-g',
  /** DB-05: the phone's tournament, and another one whose changes must never reach it. */
  own: 'e2e-propio',
  other: 'e2e-ajeno',
  /** TRUST-24: the phones that hold a PIN, each claim's kind read from the request. */
  phones: 'e2e-telefonos',
  /** STRAT-05: the link to watch, opened with no session. */
  spectator: 'e2e-espectador',
  /** QA-17: four phones saving at once, one per group, in four twosomes. */
  fourPhones: 'e2e-cuatro-telefonos',
  /** QA-17: holes corrected while the outbox is sending them. */
  drain: 'e2e-vaciado',
} as const

/** The tournaments seeded as four twosomes (in sort order: Ana and Beto, Caro and Dani, …) instead of two foursomes. */
export const TWOSOMES: ReadonlySet<string> = new Set([SLUGS.fourPhones])

export interface FieldPlayer {
  name: string
  fullName: string
  /** The typed handicap (`manual`): used as the course handicap unchanged. */
  base: number
  group: 1 | 2
}

/** In sort order. Group 1 is the card the phones in these tests keep. */
export const PLAYERS: FieldPlayer[] = [
  { name: 'Ana', fullName: 'Ana Alfa', base: 0, group: 1 },
  { name: 'Beto', fullName: 'Beto Bravo', base: 20, group: 1 },
  { name: 'Caro', fullName: 'Caro Cruz', base: 10, group: 1 },
  { name: 'Dani', fullName: 'Dani Díaz', base: 30, group: 1 },
  { name: 'Eli', fullName: 'Eli Estrada', base: 5, group: 2 },
  { name: 'Fede', fullName: 'Fede Fuentes', base: 15, group: 2 },
  { name: 'Gabi', fullName: 'Gabi Gómez', base: 25, group: 2 },
  { name: 'Hugo', fullName: 'Hugo Huerta', base: 35, group: 2 },
]
export const GROUP_1 = PLAYERS.filter((p) => p.group === 1).map((p) => p.name)

/** The group a player plays in, in the tournament `slug`. */
export function groupOf(slug: string, name: string): number {
  const i = PLAYERS.findIndex((p) => p.name === name)
  if (i < 0) throw new Error(`not in the field: ${name}`)
  return TWOSOMES.has(slug) ? Math.floor(i / 2) + 1 : PLAYERS[i]!.group
}
/** The players of group `group` in `slug`, in sort order. */
export const groupNames = (slug: string, group: number) => PLAYERS.filter((p) => groupOf(slug, p.name) === group).map((p) => p.name)

/** «Campo E2E»: [par, stroke index] for holes 1 to 18 (par 72). */
export const CARD: Array<[par: number, si: number]> = [
  [4, 7], [4, 11], [3, 17], [5, 3], [4, 1], [4, 13], [3, 15], [4, 9], [5, 5],
  [4, 8], [3, 18], [4, 2], [5, 12], [4, 4], [4, 10], [3, 16], [4, 6], [5, 14],
]
export const par = (hole: number) => CARD[hole - 1]![0]
export const strokeIndex = (hole: number) => CARD[hole - 1]![1]

/** §5.2: round half up of 80% of min(handicap, 54). Ana 0 → 0, Beto 20 → 16, Caro 10 → 8, Dani 30 → 24. */
export function playingHcp(name: string): number {
  const p = PLAYERS.find((x) => x.name === name)
  if (!p) throw new Error(`not in the field: ${name}`)
  return Math.floor(ALLOWANCE * Math.min(p.base, CAP) + 0.5)
}

/** §5.2: floor(PH / 18) + 1 more where the stroke index is at most PH mod 18. */
export function strokesReceived(name: string, hole: number): number {
  const ph = playingHcp(name)
  return Math.floor(ph / 18) + (strokeIndex(hole) <= ph % 18 ? 1 : 0)
}

/** §5.3: max(0, par + strokes received − gross + 2). */
export function points(name: string, hole: number, strokes: number): number {
  return Math.max(0, par(hole) + strokesReceived(name, hole) - strokes + 2)
}

/** What a phone types for one player on one hole. */
export interface Entry {
  strokes: number
  putts: number
}
/** One hole for the four of group 1, by name. */
export type HoleEntry = Record<string, Entry>

const e = (strokes: number, putts = 2): Entry => ({ strokes, putts })
const four = (ana: Entry, beto: Entry, caro: Entry, dani: Entry): HoleEntry => ({ Ana: ana, Beto: beto, Caro: caro, Dani: dani })

/**
 * Hole 1 as the smoke test plays it, worked out by hand (par 4, stroke index 7):
 *   Ana  PH 0,  no stroke:  3 → net birdie, 3 pts
 *   Beto PH 16, 1 stroke:   5 → net par,    2 pts
 *   Caro PH 8,  1 stroke:   4 → net birdie, 3 pts
 *   Dani PH 24, 1 stroke (2 only on SI 1–6): 7 → net double bogey, 0 pts
 */
export const HOLE_1 = four(e(3, 1), e(5), e(4, 1), e(7, 3))

/**
 * The round the two phones play, hole by hole: every hole changes at least
 * one value from par and 2 putts, so a save is never a run of untouched
 * defaults (the Tarjeta would rightly ask whether all four made par).
 */
export const ROUND: HoleEntry[] = [
  HOLE_1,
  four(e(5), e(5), e(5), e(5)),
  four(e(3, 1), e(3, 1), e(3, 1), e(3, 1)),
  four(e(5), e(4), e(5), e(6)),
  four(e(5), e(4), e(4), e(4)),
  four(e(4), e(4), e(5), e(4)),
  four(e(2, 1), e(3), e(3), e(4)),
  four(e(4), e(6), e(4), e(4)),
  four(e(5), e(5), e(4), e(5)),
  four(e(5), e(4), e(4), e(3)),
  four(e(3), e(3), e(3), e(5)),
  four(e(4), e(5), e(4), e(4)),
  four(e(4), e(5), e(5), e(5)),
  four(e(4), e(4), e(5), e(5)),
  four(e(4), e(3), e(4), e(4)),
  four(e(4), e(3), e(3), e(3)),
  four(e(4), e(4), e(3), e(5)),
  four(e(6), e(5), e(5), e(5)),
]

/**
 * Holes 1 to 9 for all eight, for the four twosomes (QA-17): Ana and Beto,
 * Caro and Dani, Eli and Fede, Gabi and Hugo. Every twosome changes at least
 * one value from par and 2 putts on every hole, so no save is two untouched
 * defaults (the Tarjeta would rightly ask whether both made par). ROUND can't
 * be reused: on its holes 5, 6, 8 and 9 one of these twosomes made par twice.
 */
export const FRONT_NINE_ALL: HoleEntry[] = [
  { Ana: e(3, 1), Beto: e(5), Caro: e(4, 1), Dani: e(7, 3), Eli: e(4, 1), Fede: e(5), Gabi: e(6), Hugo: e(5) },
  { Ana: e(5), Beto: e(5), Caro: e(5), Dani: e(5), Eli: e(5), Fede: e(4), Gabi: e(5), Hugo: e(6, 3) },
  { Ana: e(3, 1), Beto: e(3, 1), Caro: e(3, 1), Dani: e(3, 1), Eli: e(3, 1), Fede: e(4), Gabi: e(4), Hugo: e(5) },
  { Ana: e(5), Beto: e(4), Caro: e(5), Dani: e(6), Eli: e(5, 1), Fede: e(6), Gabi: e(6), Hugo: e(7) },
  { Ana: e(5), Beto: e(4), Caro: e(4, 1), Dani: e(4), Eli: e(4), Fede: e(5), Gabi: e(5), Hugo: e(6) },
  { Ana: e(4, 1), Beto: e(4), Caro: e(5), Dani: e(4), Eli: e(3, 1), Fede: e(4, 1), Gabi: e(5), Hugo: e(4) },
  { Ana: e(2, 1), Beto: e(3), Caro: e(3), Dani: e(4), Eli: e(3), Fede: e(4), Gabi: e(4, 3), Hugo: e(3, 1) },
  { Ana: e(4), Beto: e(6), Caro: e(4), Dani: e(5), Eli: e(5), Fede: e(5), Gabi: e(6), Hugo: e(5) },
  { Ana: e(5), Beto: e(6), Caro: e(4), Dani: e(5), Eli: e(5), Fede: e(6), Gabi: e(6), Hugo: e(6) },
]

/** Total points per player over the holes given (a hole missing for a player scores nothing). */
export function totals(card: Map<number, HoleEntry>, names: string[] = GROUP_1): Record<string, number> {
  const out: Record<string, number> = {}
  for (const name of names) {
    out[name] = 0
    for (const [hole, entry] of card) if (entry[name]) out[name] += points(name, hole, entry[name]!.strokes)
  }
  return out
}
