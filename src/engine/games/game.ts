/**
 * The game seam (CLAUDE.md §4, ARCH-15): one contract for every side game.
 *
 * A game derives its state from the tournament, awards prizes from that
 * state, and may say what the Comité should know about its money. A
 * singleton (`settings.modules`: the main event, best round, pairs, the
 * snake, fewest putts, the Calcutta) is a game a tournament has at most once,
 * configured under its id; an instance game (`settings.games[]`: skins,
 * matches, contests...) is one it may have many times, each with its own
 * config, entrants, rounds and pot, and it also draws a `GameBoard`: a plain
 * table any screen (Juegos, TV, Ceremonia) can render without knowing the
 * game. The main event's format (formats/) is not a game: it is how the
 * individual game ranks.
 *
 * What every game shares, ranking with its tie policy, when a result is
 * final and how pesos split, lives in core/ranking.ts. The registries
 * (modules/index.ts, games/index.ts) are typed by id and type, so
 * `state.modules.snake`, and `state.games[id]` once `isGameOf` names its
 * type, read each game's own state with no cast.
 */
import type { GameConfig, GameOf, GameType } from '../settings/games'
import type { ModuleId, TournamentSettings } from '../settings/schema'
import { msg, named, type Msg } from '../messages'
import type { Explanation, Id, Snapshot } from '../types'
import type { CoreState } from '../core/types'
import type { GameStateMap } from '.'

/** What every game receives: the raw facts plus the core (handicaps, per-hole scoring). */
export interface ModuleContext {
  snapshot: Snapshot
  settings: TournamentSettings
  core: CoreState
  /** Everything finished: tournament status `finished` or every counted round `finished`. */
  tournamentFinal: boolean
  /** roundId → the round is `finished`. */
  roundFinal: Record<Id, boolean>
}

/** A single prize a game awards (live "si terminara ahora" or final). */
export interface PrizeAward {
  /** `adjustment`: the Comité's assignment of unassigned money (MONEY-05). */
  moduleId: ModuleId | GameType | 'adjustment'
  /**
   * Which pot pays it: `main` (the entries), `calcutta`, or a game id for a
   * side pot. Omitted = `main`.
   */
  potId?: string
  /** Set for a direct bet: this player pays the winner (no bank involved). */
  payerId?: Id
  /** The instance game that awarded it (`settings.games[].id`). */
  gameId?: string
  /** What the money screens call it, e.g. «Individual, 1.º» or «La Víbora, día 1, grupo 2» (`prizeLabel`). */
  label: Msg
  /** What in its game paid it («1.º», «día 1, grupo 2»), when the label says more than the game's: Dinero lists it under the game. */
  part?: Msg
  playerId: Id
  amount: number
  /** True once the underlying round(s) are finished, false while provisional. */
  final: boolean
  why: Explanation
  /** An assignment's row (`money_adjustments.id`), and the bucket it came from. */
  adjustmentId?: Id
  sourceKey?: string
}

/** A prize's label: its game (a label, or a message) and what in it paid. */
export function prizeLabel(game: string | Msg, part: Msg | null = null): Pick<PrizeAward, 'label' | 'part'> {
  return part ? { label: msg('prize.label', { game: named(game), part }), part } : { label: msg('prize.label', { game: named(game), part: null }) }
}

/** The contract: a state from the context, prizes and warnings from the state. */
export interface Game<S, Ctx extends ModuleContext> {
  /** Default label, renamable per tournament. */
  defaultLabel: string
  /** Derive this game's state. Only called when the game is enabled. */
  compute(ctx: Ctx): S
  /** Prizes this game awards for the given state (empty when it moves no money). */
  prizes(state: S, ctx: Ctx): PrizeAward[]
  /** What the Comité should know about its money (a place nobody fills, a hole in dispute...). */
  warnings?(state: S, ctx: Ctx): Msg[]
}

/** A singleton: at most one per tournament, its options under `settings.modules[id]`. */
export interface GameModule<S, K extends ModuleId = ModuleId> extends Game<S, ModuleContext> {
  id: K
}

/** What an instance game receives on top: its own config, entrants, rounds and pot. */
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
  /** Main text instead of the names (e.g. a segment «Ida»); the names then go under it. */
  title?: Msg
  /** "1", "T2", or null when position means nothing (a hole-by-hole log). */
  pos: string | null
  /** Short text beside the names («Hoyo 7», «2 arriba»), optional. */
  label?: Msg
  /** The big figure («3 skins», «71», «$450»). */
  figure: Msg
  sub?: Msg
  /** Pesos this row wins (+) or pays (−) if it ended now. */
  money?: number
}

export interface BoardSection {
  title?: Msg
  rows: BoardRow[]
}

export interface GameBoard {
  sections: BoardSection[]
  /** Notes shown under the table («Se acumulan 2 skins al 9»). */
  notes: Msg[]
}

/** An instance game of one type. */
export interface GameImpl<S = unknown, C extends GameConfig = GameConfig> extends Game<S, GameContext<C>> {
  type: C['type']
  board(state: S, ctx: GameContext<C>): GameBoard
}

/** An enabled instance game of type `K` as the tournament state holds it: its config and its state are that type's. */
export interface GameResultOf<K extends GameType> {
  config: GameOf<K>
  entrants: Id[]
  pot: number
  final: boolean
  state: GameStateMap[K]
  board: GameBoard
}

/** An enabled instance game of one of the types in `K`. */
export type GameResultFor<K extends GameType> = { [P in K]: GameResultOf<P> }[K]

/** Any enabled instance game: one `GameResultOf` per type, told apart by `config.type` (`isGameOf`). */
export type GameResultState = GameResultFor<GameType>

/** A config of one of the types in `K`, written so that its type and its implementation line up (TS's correlated unions). */
export type GameConfigFor<K extends GameType> = { [P in K]: GameOf<P> }[K]

/** The game is of `type`: its config and its state are that type's, with no cast. */
export function isGameOf<K extends GameType>(g: GameResultState, type: K): g is Extract<GameResultState, { config: { type: K } }> {
  return g.config.type === type
}
