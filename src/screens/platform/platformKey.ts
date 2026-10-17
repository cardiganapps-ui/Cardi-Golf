import { usePlatformApi, type PlatformApi } from '../../data/platform'
import type { ServerKey } from '../../data/query'

/** Each PlatformApi (the server's, a design fixture's, a test's) is its own cache: a fixture's rows never show for the server's. */
const scopes = new WeakMap<PlatformApi, number>()
let next = 0

/** The panel's keys: `['platform', <which api>, ...key]`; a write anywhere in the panel reads `['platform']` again. */
export function usePlatformKey(...key: unknown[]): ServerKey {
  const api = usePlatformApi()
  let scope = scopes.get(api)
  if (scope === undefined) scopes.set(api, (scope = next++))
  return ['platform', scope, ...key]
}
