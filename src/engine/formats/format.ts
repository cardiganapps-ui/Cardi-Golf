/**
 * The main event's format.
 *
 * Until now Stableford was not a choice, it was the engine's only currency:
 * `computeCore` scored every hole into `points` and the main standings ranked
 * on nothing else. A tournament that plays stroke play, match play or a
 * scramble had no way to say so.
 *
 * A format answers three questions and nothing else:
 *   who competes (a player, or a team of them),
 *   what each competitor's figure is for a round and for the tournament,
 *   and which direction is better.
 *
 * Everything downstream — ranking, countback, ties, prize splitting, the
 * board, the money — is shared, so adding a format never touches them. The
 * core still scores Stableford points on every hole regardless of format:
 * they are cheap, and the side games (best round, pairs, the snake) are
 * separate bets that keep their own meaning whatever the main event is.
 */
import type { CountbackInput } from '../core/ranking'
import type { CoreState } from '../core/types'
import type { TournamentSettings } from '../settings/schema'
import type { Explanation, Id, Snapshot } from '../types'

export const FORMAT_IDS = ['stableford', 'strokePlay', 'matchPlay', 'team'] as const
export type FormatId = (typeof FORMAT_IDS)[number]

/** One competitor in the main standings: one player, or a team of them. */
export interface Entrant {
  /** A player id, or a synthetic team id. */
  id: Id
  /** Who it covers. One player for an individual format. */
  playerIds: Id[]
  name: string
  /** A team's members are shown under its name; a single player's are not. */
  isTeam: boolean
}

/** A number the standings rank on, plus how to show it. */
export interface Figure {
  /** The total itself (points, strokes): what exports and published results carry. */
  value: number
  /**
   * What the ranking compares, when that is not `value`: strokes to par over
   * the holes played, so a player through 4 holes is not ahead of one through
   * 12 just for having fewer strokes (MONEY-02).
   */
  rank?: number
  /** What the board shows: "31", "74", "+2", "2–1–0". */
  text: string
  /** Colour the figure carries, for scores relative to par. */
  tone?: 'under' | 'over'
  /** No card yet: the board shows a dash instead of a zero. */
  empty?: boolean
  /**
   * A decided match, from this side: «8&6» reads the same for both sides, so
   * the board needs to know who won it (STRAT-03).
   */
  result?: 'won' | 'lost' | 'halved'
}

export interface FormatContext {
  snapshot: Snapshot
  settings: TournamentSettings
  core: CoreState
  tournamentFinal: boolean
  roundFinal: Record<Id, boolean>
}

export interface FormatStandings {
  entrants: Entrant[]
  /** entrantId → the tournament figure. */
  totals: Record<Id, Figure>
  /** entrantId → roundId → that round's figure. */
  perRound: Record<Id, Record<Id, Figure>>
  /** entrantId → holes completed across the tournament. */
  thru: Record<Id, number>
  /**
   * entrantId → the last round's hole-by-hole values for the countback, always
   * oriented so that more is better (stroke play negates its strokes), because
   * `countback` compares sums and does not know the format.
   */
  countback: Record<Id, CountbackInput>
  /** Anything the organizer should know, e.g. a match format with no matches set. */
  warnings: string[]
}

export interface MainFormat {
  id: FormatId
  /** Default name, renamable per tournament. */
  defaultLabel: string
  /** Header of the headline column: "Puntos", "Gross", "Neto", "Partidos". */
  figureLabel(settings: TournamentSettings): string
  /**
   * True when a bigger figure wins (points, matches won), false for strokes.
   * A function because team play flips it: the same format counts strokes down
   * or Stableford points up depending on how the tournament set it.
   */
  higherIsBetter(settings: TournamentSettings): boolean
  /** How the format explains itself, for the info sheet and the Reglamento. */
  describe(settings: TournamentSettings): Explanation
  standings(ctx: FormatContext): FormatStandings
}

/** The blank figure, for a competitor with no card yet. */
export const NO_FIGURE: Figure = { value: 0, text: '—', empty: true }

/**
 * A whole number as copy: «−2», «0», «3». A true minus sign, never a hyphen:
 * these sit next to tabular numerals and en dashes (DESIGN_DIRECTION.md).
 */
export function withTrueMinus(n: number): string {
  return n < 0 ? `−${Math.abs(n)}` : String(n)
}

/** «+2», «E», «−1»: strokes relative to par. */
export function toParText(d: number): string {
  return d === 0 ? 'E' : d > 0 ? `+${d}` : withTrueMinus(d)
}

/** "+2", "E", "−1" — a gross or net total relative to par. */
export function toParFigure(strokes: number, par: number): Figure {
  const d = strokes - par
  if (d === 0) return { value: strokes, rank: 0, text: 'E' }
  return { value: strokes, rank: d, text: toParText(d), tone: d > 0 ? 'over' : 'under' }
}
