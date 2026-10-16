import type { GameOf, GameType } from '../settings/games'
import type { GameImpl } from './game'
import { skinsGame, type SkinsState } from './skins'
import { lowScoreGame, type LowScoreState } from './lowScore'
import { eventPotGame, type EventPotState } from './eventPot'
import { matchGame, type MatchState } from './match'
import { contestGame, type ContestState } from './contest'
import { customGame, type CustomState } from './custom'

/** Each instance-game type's state, by type (ARCH-15). */
export interface GameStateMap {
  skins: SkinsState
  lowScore: LowScoreState
  eventPot: EventPotState
  match: MatchState
  contest: ContestState
  custom: CustomState
}

/** One implementation per type, of that type, each computing its own state from its own config. */
export type GameRegistry = { [K in GameType]: GameImpl<GameStateMap[K], GameOf<K>> }

/** Implementations of every instance-game type the platform ships. */
export const ALL_GAMES: GameRegistry = {
  skins: skinsGame,
  lowScore: lowScoreGame,
  eventPot: eventPotGame,
  match: matchGame,
  contest: contestGame,
  custom: customGame,
}

export * from './game'
export { gamePot, potIdOf, placeAmounts, payPlaces, payUnits, directUnits, netBets } from './payout'
export { skinsGame, lowScoreGame, eventPotGame, matchGame, contestGame, customGame }
export type { ContestState, ContestHole } from './contest'
export { CONTEST_SINGLE, contestHoles, contestStateOf } from './contest'
export type { CustomState } from './custom'
export type { SkinsState, SkinsHole } from './skins'
export type { LowScoreState, LowScoreTable } from './lowScore'
export type { EventPotState } from './eventPot'
export type { MatchState, MatchRound, MatchSegment, MatchBet } from './match'
export { describeGame } from './describe'
