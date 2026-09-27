import type { Explanation, Id, Tee } from '../types'

/** Per player, per round, per hole (§6). */
export interface HoleResult {
  hole: number
  par: number
  strokeIndex: number
  yards: number | null
  strokesReceived: number
  gross: number | null
  net: number | null
  points: number
  putts: number | null
  pickedUp: boolean
  /** Strokes or a pick-up were entered. */
  played: boolean
  disputed: boolean
  why: Explanation
}

export interface PlayerRound {
  roundId: Id
  roundNumber: number
  playerId: Id
  /** The tee this player plays in this round (null when no course is loaded). */
  tee: Tee | null
  /** WHS course handicap for that tee (or the manual number unchanged). */
  courseHcp: number
  /** Playing handicap after allowance, cap, cut and any override. */
  playingHcp: number
  playingHcpWhy: Explanation
  /** Strokes cut by the anti-sandbag rule (0 in round 1). */
  cut: number
  overridden: boolean
  holes: HoleResult[]
  points: number
  /** Total putts entered (picked-up holes use the setting only in the fewest-putts module). */
  putts: number
  /** Holes completed. */
  thru: number
  complete: boolean
  /** Gross total when every hole has strokes. */
  gross: number | null
}

export interface PlayerTotals {
  points: number
  putts: number
  thru: number
  /** Rounds with at least one hole entered. */
  roundsPlayed: number
}

export interface CoreState {
  /** Rounds that count (not cancelled), in order. */
  roundIds: Id[]
  /** roundId → playerId → PlayerRound */
  rounds: Record<Id, Record<Id, PlayerRound>>
  totals: Record<Id, PlayerTotals>
  /** Per player: where the base handicap comes from and its explanation. */
  handicaps: Record<
    Id,
    {
      source: 'index' | 'estimate' | 'manual'
      base: number
      estimated: boolean
      why: Explanation
    }
  >
  warnings: string[]
}
