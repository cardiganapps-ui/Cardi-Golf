import type { GameType } from '../settings/games'
import type { GameImpl } from './game'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyGame = GameImpl<any, any>

/** Implementations of every instance-game type the platform ships. */
export const ALL_GAMES: Partial<Record<GameType, AnyGame>> = {}

export * from './game'
export { gamePot, potIdOf, placeAmounts, payPlaces, payUnits, directUnits, netBets } from './payout'
