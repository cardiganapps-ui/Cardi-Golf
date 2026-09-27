import type { Explanation, Id } from '../types'

/** Per player, per round, per hole (§6). */
export interface HoleResult {
  hole: number
  par: number
  strokeIndex: number
  strokesReceived: number
  gross: number | null
  net: number | null
  points: number
  putts: number | null
  pickedUp: boolean
  /** Entered (strokes or pick-up present). */
  played: boolean
}

export interface PlayerRound {
  roundId: Id
  roundNumber: number
  playerId: Id
  playingHcp: number
  playingHcpWhy: Explanation
  holes: HoleResult[]
  points: number
  putts: number
  /** Holes completed. */
  thru: number
  complete: boolean
}

export interface CoreState {
  /** roundId → playerId → PlayerRound */
  rounds: Record<Id, Record<Id, PlayerRound>>
  /** playerId → total points over all rounds. */
  totals: Record<Id, { points: number; putts: number; thru: number }>
}
