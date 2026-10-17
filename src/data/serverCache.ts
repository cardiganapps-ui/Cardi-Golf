/**
 * The seam between the code every screen loads (the shell, sign-out) and the
 * server-state cache (`query.ts`, TanStack Query), which only the screens
 * outside a tournament load (ARCH-18). Importing Query here would put it in
 * the first load of every route, a player's link included; instead `query.ts`
 * registers itself when a screen first brings it, and until then there is no
 * cache to clear or read again.
 */

/** A key as the screens name it, without the account `query.ts` puts in front: `['crews']`, `['friends', handle]`. */
export type ServerKey = readonly unknown[]

interface Cache {
  /** Everything the cache holds goes (sign-out, another account). */
  clear(): void
  /** Every query under these keys is read again (its answer is stale now). */
  invalidate(keys: readonly ServerKey[]): Promise<void>
}

let cache: Cache | null = null

/** `query.ts` only. */
export function registerServerCache(c: Cache) {
  cache = c
}

/** What one person read from the server is not the next one's to see: called from the sign-out cleanup (`forgetSignedOut`). */
export function forgetServerState() {
  cache?.clear()
}

/** Read these keys again, wherever they are on screen; nothing when no screen has read through the cache yet. */
export function invalidateServer(keys: readonly ServerKey[]): Promise<void> {
  return cache && keys.length ? cache.invalidate(keys) : Promise.resolve()
}
