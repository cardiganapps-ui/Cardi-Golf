import type { ModuleId } from '../settings/schema'
import type { GameModule } from './module'

/**
 * Registry of game modules. M1 fills it with the real modules; M0 ships the
 * seam so later milestones plug in without touching `computeTournament`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const registry = new Map<ModuleId, GameModule<any>>()

export function registerModule<S>(module: GameModule<S>): void {
  registry.set(module.id, module)
}

export function getModule(id: ModuleId): GameModule<unknown> | undefined {
  return registry.get(id)
}

export function registeredModuleIds(): ModuleId[] {
  return [...registry.keys()]
}

/** Test helper. */
export function clearModules(): void {
  registry.clear()
}
