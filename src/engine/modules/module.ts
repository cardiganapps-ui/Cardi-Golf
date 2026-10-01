/**
 * The module seam (CLAUDE.md §0.5, §4). Each side game is a `GameModule`:
 * a tournament turns it on or off and parameterizes it through settings.
 * `computeTournament` runs the enabled modules and merges their state under
 * `state.modules[id]`; a disabled module contributes nothing (no state, no
 * money).
 */
import type { ModuleId, TournamentSettings } from '../settings/schema'
import type { GameType } from '../settings/games'
import type { Explanation, Id, Snapshot } from '../types'
import type { CoreState } from '../core/types'

/** What every module receives: the raw facts plus the core (handicaps, per-hole scoring). */
export interface ModuleContext {
  snapshot: Snapshot
  settings: TournamentSettings
  core: CoreState
  /** Everything finished: tournament status `finished` or every counted round `finished`. */
  tournamentFinal: boolean
  /** roundId → the round is `finished`. */
  roundFinal: Record<Id, boolean>
}

/** A single prize a module awards (live "si terminara ahora" or final). */
export interface PrizeAward {
  moduleId: ModuleId | GameType
  /**
   * Which pot pays it: `main` (the entries), `calcutta`, or a game id for a
   * side pot. Omitted = `main`.
   */
  potId?: string
  /** Set for a direct bet: this player pays the winner (no bank involved). */
  payerId?: Id
  /** The instance game that awarded it (`settings.games[].id`). */
  gameId?: string
  /** Copy for the money screens, e.g. «Individual, 1.º» or «La Víbora, día 1, grupo 2». */
  label: string
  playerId: Id
  amount: number
  /** True once the underlying round(s) are finished, false while provisional. */
  final: boolean
  why: Explanation
}

export interface GameModule<State> {
  id: ModuleId
  /** Default label, renamable per tournament. */
  defaultLabel: string
  /** Derive this module's state. Only called when the module is enabled. */
  compute(ctx: ModuleContext): State
  /** Prizes this module awards for the given state (empty when it moves no money). */
  prizes(state: State, ctx: ModuleContext): PrizeAward[]
}
