import type { ModuleId } from '../settings/schema'
import type { GameModule } from './module'
import { individualModule, type IndividualState } from './individual'
import { bestRoundModule, type BestRoundState } from './bestRound'
import { pairsModule, type PairsState } from './pairs'
import { snakeModule, type SnakeState } from './snake'
import { fewestPuttsModule, type FewestPuttsState } from './fewestPutts'
import { auctionModule, type AuctionState } from './auction'

/** Each singleton's state, by id (ARCH-15). */
export interface ModuleStateMap {
  individual: IndividualState
  bestRound: BestRoundState
  pairs: PairsState
  snake: SnakeState
  fewestPutts: FewestPuttsState
  auction: AuctionState
}

/** One implementation per id, under its own id, each computing its own state. */
export type ModuleRegistry = { [K in ModuleId]: GameModule<ModuleStateMap[K], K> }

/** What `state.modules` holds: only the enabled ones appear. */
export type ModuleStates = { [K in ModuleId]?: ModuleStateMap[K] }

/** Every module the platform ships. A tournament enables a subset in settings. */
export const ALL_MODULES: ModuleRegistry = {
  individual: individualModule,
  bestRound: bestRoundModule,
  pairs: pairsModule,
  snake: snakeModule,
  fewestPutts: fewestPuttsModule,
  auction: auctionModule,
}

export { individualModule, bestRoundModule, pairsModule, snakeModule, fewestPuttsModule, auctionModule }
export type { IndividualState, IndividualRow } from './individual'
export type { BestRoundState, BestRoundDay } from './bestRound'
export type { PairsState, PairRow } from './pairs'
export type { SnakeState, SnakeGroupState, SnakePass } from './snake'
export type { FewestPuttsState, PuttsRow } from './fewestPutts'
export type { AuctionState, LotState, SlotResult, OwnerPayout, OwnerPortfolio, Ownership } from './auction'
