/**
 * Entry point of the engine (CLAUDE.md §6). Pure: no I/O, no React.
 * `computeTournament(snapshot, settings)` runs the core, then every enabled
 * module, and merges the result. M0 ships the skeleton; M1 fills the core and
 * the modules.
 */
import { MODULE_IDS, type ModuleId, type TournamentSettings } from './settings/schema'
import type { Snapshot } from './types'
import type { CoreState } from './core/types'
import { getModule } from './modules/registry'
import type { ModuleContext, PrizeAward } from './modules/module'

export interface TournamentState {
  core: CoreState
  /** Only the enabled modules appear here. */
  modules: Partial<Record<ModuleId, unknown>>
  /** Every prize any enabled module awards, live and final. */
  prizes: PrizeAward[]
  /** Which modules were enabled but have no registered implementation. */
  missingModules: ModuleId[]
}

export function computeTournament(snapshot: Snapshot, settings: TournamentSettings): TournamentState {
  const core = computeCore(snapshot, settings)
  const ctx: ModuleContext = { snapshot, settings, core }
  const modules: Partial<Record<ModuleId, unknown>> = {}
  const prizes: PrizeAward[] = []
  const missingModules: ModuleId[] = []

  for (const id of MODULE_IDS) {
    if (!settings.modules[id].enabled) continue
    const mod = getModule(id)
    if (!mod) {
      missingModules.push(id)
      continue
    }
    const state = mod.compute(ctx)
    modules[id] = state
    prizes.push(...mod.prizes(state, ctx))
  }

  return { core, modules, prizes, missingModules }
}

/** Placeholder until M1: no rounds computed yet. */
function computeCore(snapshot: Snapshot, _settings: TournamentSettings): CoreState {
  const totals: CoreState['totals'] = {}
  for (const p of snapshot.players) totals[p.id] = { points: 0, putts: 0, thru: 0 }
  return { rounds: {}, totals }
}
