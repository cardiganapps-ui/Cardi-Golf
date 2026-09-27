import type { ModuleId } from '../settings/schema'
import type { GameModule } from './module'
import { individualModule } from './individual'
import { bestRoundModule } from './bestRound'
import { pairsModule } from './pairs'
import { snakeModule } from './snake'
import { fewestPuttsModule } from './fewestPutts'
import { auctionModule } from './auction'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyModule = GameModule<any>

/** Every module the platform ships. A tournament enables a subset in settings. */
export const ALL_MODULES: Record<ModuleId, AnyModule> = {
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
