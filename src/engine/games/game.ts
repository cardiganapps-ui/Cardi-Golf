/**
 * The instance-game seam: one `GameImpl` per `GameType`. `computeTournament`
 * runs every enabled `settings.games[]` entry through its implementation and
 * keeps the result under `state.games[config.id]`.
 *
 * Every game also returns a `GameBoard`: a plain table any screen (Juegos,
 * TV, Ceremonia) can render without knowing the game.
 */
import type { GameConfig, GameType } from '../settings/games'
import type { Id } from '../types'
import type { ModuleContext, PrizeAward } from '../modules/module'

export interface GameContext<C extends GameConfig = GameConfig> extends ModuleContext {
  config: C
  /** Players in this game (everyone, or the `game_entries` list), in roster order. */
  entrants: Id[]
  /** Counted rounds this game covers, in order. */
  roundIds: Id[]
  /** The pot in pesos (`main` amount or buy-in × entrants); 0 for `none` and `direct`. */
  pot: number
  /** Every covered round is finished (or the tournament is). */
  final: boolean
}

export interface BoardRow {
  /** One player, or two for a pair / side. */
  playerIds: Id[]
  /** "1", "T2", or null when position means nothing (a hole-by-hole log). */
  pos: string | null
  /** Short text beside the names ("Hoyo 7", "2 arriba"), optional. */
  label?: string
  /** The big figure ("3 skins", "71", "$450"). */
  figure: string
  sub?: string
  /** Pesos this row wins (+) or pays (−) if it ended now. */
  money?: number
}

export interface BoardSection {
  title?: string
  rows: BoardRow[]
}

export interface GameBoard {
  sections: BoardSection[]
  /** Plain-Spanish notes shown under the table ("Se acumulan 2 skins al 9"). */
  notes: string[]
}

export interface GameImpl<S = unknown, C extends GameConfig = GameConfig> {
  type: GameType
  defaultLabel: string
  compute(ctx: GameContext<C>): S
  prizes(state: S, ctx: GameContext<C>): PrizeAward[]
  board(state: S, ctx: GameContext<C>): GameBoard
  warnings?(state: S, ctx: GameContext<C>): string[]
}

export interface GameResultState {
  config: GameConfig
  entrants: Id[]
  pot: number
  final: boolean
  state: unknown
  board: GameBoard
}
