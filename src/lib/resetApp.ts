/**
 * «Reiniciar la app»: the way out of a device stuck on a broken or stale
 * bundle. It drops the service worker and its caches — which is where an old
 * app version lives — and reloads.
 *
 * It must never touch localStorage (the session is there) or IndexedDB (the
 * outbox of scores not yet sent). Losing either would cost the player a
 * sign-in or, worse, a hole they already entered.
 */
export interface ResetDeps {
  serviceWorker?: { getRegistrations(): Promise<ReadonlyArray<{ unregister(): Promise<boolean> }>> }
  caches?: { keys(): Promise<string[]>; delete(key: string): Promise<boolean> }
  replace(url: string): void
  now(): number
}

export async function resetApp(deps: ResetDeps = browserDeps()): Promise<void> {
  try {
    const regs = (await deps.serviceWorker?.getRegistrations()) ?? []
    await Promise.all(regs.map((r) => r.unregister()))
  } catch {
    /* keep going: a reload still helps */
  }
  try {
    const keys = (await deps.caches?.keys()) ?? []
    await Promise.all(keys.map((k) => deps.caches!.delete(k)))
  } catch {
    /* same */
  }
  deps.replace(`/?r=${deps.now()}`)
}

function browserDeps(): ResetDeps {
  return {
    serviceWorker: typeof navigator !== 'undefined' && 'serviceWorker' in navigator ? navigator.serviceWorker : undefined,
    caches: typeof caches !== 'undefined' ? caches : undefined,
    replace: (url) => window.location.replace(url),
    now: () => Date.now(),
  }
}
