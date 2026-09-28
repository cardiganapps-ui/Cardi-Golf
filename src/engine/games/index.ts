import type { GameType } from '../settings/games'
import type { GameImpl } from './game'
import { skinsGame } from './skins'
import { lowScoreGame } from './lowScore'
import { eventPotGame } from './eventPot'
import { matchGame } from './match'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyGame = GameImpl<any, any>

/** Implementations of every instance-game type the platform ships. */
export const ALL_GAMES: Partial<Record<GameType, AnyGame>> = {
  skins: skinsGame,
  lowScore: lowScoreGame,
  eventPot: eventPotGame,
  match: matchGame,
}

export * from './game'
export { gamePot, potIdOf, placeAmounts, payPlaces, payUnits, directUnits, netBets } from './payout'
export { skinsGame, lowScoreGame, eventPotGame, matchGame }
export type { SkinsState, SkinsHole } from './skins'
export type { LowScoreState, LowScoreTable } from './lowScore'
export type { EventPotState } from './eventPot'
export type { MatchState, MatchRound, MatchSegment, MatchBet } from './match'
export { describeGame } from './describe'
