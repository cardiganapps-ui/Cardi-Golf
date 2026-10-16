/**
 * The singletons' side of the game seam (games/game.ts, ARCH-15): each one is
 * a `GameModule`, a game a tournament turns on or off and parameterizes under
 * `settings.modules[id]`. `computeTournament` runs the enabled ones and keeps
 * each state under `state.modules[id]`; a disabled one contributes nothing
 * (no state, no money).
 */
export type { GameModule, ModuleContext, PrizeAward } from '../games/game'
