/**
 * Server state outside a tournament (ARCH-18): the profile's lists, friends,
 * notices, crews, the organizer's tournaments, the Admin de Polo, the course
 * library. Each screen used to fetch in an effect, with its own loading and
 * error state (some guarded against a late answer, most didn't, none had a
 * deadline of its own), and every mutation had a copied `run()` with a busy
 * flag. TanStack Query does both, one way:
 *
 * - `useServerQuery(key, fn)`: keyed, deduped and cached (a screen opened
 *   again shows what it read and reads again behind it, after 30 s), with a
 *   deadline (`QUERY_TIMEOUT_MS`, the client's own request deadline, REL-14:
 *   what holds a query up before its request goes out, auth-js waiting on a
 *   token, has none), and tried again with backoff only when the failure may
 *   pass by itself (`isTransient`). An older answer never lands over a newer
 *   one: each key has one fetch at a time and its latest wins.
 * - `useServerMutation()` (components/useServerMutation.ts, since it toasts): one `run(job)` for every write: busy while it runs,
 *   the error said once in Spanish (`humanError`, as a toast or inline), the
 *   keys it changed read again, and the screen's own «Listo» toast.
 *
 * The tournament's boards and the outbox stay in their own store (§8): their
 * live channel, overlay and offline copy are not a request cache. Nothing in
 * the first load imports this file (only screens outside a tournament), so a
 * player's link never downloads Query; the shell reaches the cache through
 * `serverCache.ts`. Every key starts with the account it was read for, and an
 * account change (sign-out, another sign-in: `auth.ts`) empties the cache.
 *
 * There is no QueryClientProvider: every hook here passes `queryClient`
 * itself, so a screen needs nothing around it (the design fixtures, tests).
 */
import { QueryClient, keepPreviousData, partialMatchKey, useInfiniteQuery, useQuery, type QueryKey } from '@tanstack/react-query'
import { REQUEST_TIMEOUT_MS } from '../lib/fetchWithTimeout'
import { TimeoutError } from '../lib/timeout'
import { isTransient } from '../lib/humanError'
import { useAuth } from './auth'
import { registerServerCache, type ServerKey } from './serverCache'

export type { ServerKey } from './serverCache'

/** A query's whole deadline: the client's per-request one (REL-14). */
export const QUERY_TIMEOUT_MS = REQUEST_TIMEOUT_MS
/** A screen opened again within this long shows what it read without asking again. */
export const QUERY_STALE_MS = 30_000
/** Tries after the first, for a failure that may pass by itself. */
export const QUERY_RETRIES = 2

/**
 * `job` with a deadline and Query's own cancellation (the screen went): the
 * signal it gets aborts at either, and the answer it would give then is
 * dropped. A request that takes the signal stops; one that doesn't still
 * ends at the client's deadline, but nobody waits for it.
 */
export function withDeadline<T>(job: (signal: AbortSignal) => Promise<T>, outer: AbortSignal | undefined, ms: number, label: string): Promise<T> {
  const ctrl = new AbortController()
  const onAbort = () => ctrl.abort(outer?.reason)
  if (outer?.aborted) ctrl.abort(outer.reason)
  else outer?.addEventListener('abort', onAbort, { once: true })
  const timer = setTimeout(() => ctrl.abort(new TimeoutError(label, ms)), ms)
  return new Promise<T>((resolve, reject) => {
    if (ctrl.signal.aborted) { reject(ctrl.signal.reason); return; }
    ctrl.signal.addEventListener('abort', () => reject(ctrl.signal.reason), { once: true })
    job(ctrl.signal).then(resolve, reject)
  }).finally(() => {
    clearTimeout(timer)
    outer?.removeEventListener('abort', onAbort)
  })
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Ask with or without the browser's word that it is online: a request with no signal fails and says so (the
      // screens' «Sin señal»), as it did; Query's default would hold it «paused» with a spinner for as long as it lasts.
      networkMode: 'always',
      staleTime: QUERY_STALE_MS,
      retry: (count, e) => count < QUERY_RETRIES && isTransient(e),
      retryDelay: (n) => Math.min(1000 * 2 ** n, 8000),
      // Coming back to the app reads nothing by itself (it never did); signal coming back reads what failed or aged.
      refetchOnWindowFocus: false,
    },
    mutations: { networkMode: 'always', retry: false },
  },
})
// Without a provider nobody mounts the client: this is what reads again when signal returns.
queryClient.mount()

/** A screen's key under the account it is read for. */
function accountKey(uid: string | null, key: ServerKey): QueryKey {
  return [uid ?? 'nobody', ...key]
}

/** Every query under any of `keys`, whichever account it was read for, is read again (an inactive one when next shown). */
export function invalidate(keys: readonly ServerKey[]): Promise<void> {
  if (!keys.length) return Promise.resolve()
  return queryClient.invalidateQueries({ predicate: (q) => keys.some((k) => partialMatchKey(q.queryKey.slice(1), k)) })
}

registerServerCache({ clear: () => queryClient.clear(), invalidate })

export interface ServerQueryOptions {
  /** False: nothing is asked (no account yet, a design fixture). */
  enabled?: boolean
  /** Its own deadline, for a query of several requests one after another. */
  timeoutMs?: number
  /** How long an answer is fresh enough to show without asking again; 0 asks on every visit (what can change any moment: the notices). */
  staleMs?: number
  /** While a new key is read (a search typed further), keep showing the last key's answer. */
  keepPrevious?: boolean
}

/** What a screen reads from the server outside a tournament. `fn` gets the signal to pass on when it can. */
export function useServerQuery<T>(key: ServerKey, fn: (signal: AbortSignal) => Promise<T>, opts: ServerQueryOptions = {}) {
  const uid = useAuth((s) => s.user?.id ?? null)
  const ms = opts.timeoutMs ?? QUERY_TIMEOUT_MS
  const label = typeof key[0] === 'string' ? key[0] : 'consulta'
  return useQuery<T>(
    {
      queryKey: accountKey(uid, key),
      queryFn: ({ signal }) => withDeadline(fn, signal, ms, label),
      enabled: opts.enabled ?? true,
      staleTime: opts.staleMs ?? QUERY_STALE_MS,
      placeholderData: opts.keepPrevious ? keepPreviousData : undefined,
    },
    queryClient,
  )
}

/** A list read a page at a time (the panel's searches): `fetch(offset)` answers its rows and the total. */
export function useServerPages<T>(key: ServerKey, fetch: (offset: number, signal: AbortSignal) => Promise<{ total: number; rows: T[] }>, opts: { enabled?: boolean } = {}) {
  const uid = useAuth((s) => s.user?.id ?? null)
  const label = typeof key[0] === 'string' ? key[0] : 'consulta'
  const q = useInfiniteQuery(
    {
      queryKey: accountKey(uid, key),
      queryFn: ({ pageParam, signal }) => withDeadline((s) => fetch(pageParam, s), signal, QUERY_TIMEOUT_MS, label),
      initialPageParam: 0,
      getNextPageParam: (last, pages) => {
        const read = pages.reduce((n, p) => n + p.rows.length, 0)
        return read < last.total && last.rows.length > 0 ? read : undefined
      },
      enabled: opts.enabled ?? true,
    },
    queryClient,
  )
  const pages = q.data?.pages
  return {
    rows: pages ? pages.flatMap((p) => p.rows) : null,
    total: pages?.[pages.length - 1]?.total ?? 0,
    error: q.error && !q.isFetchingNextPage ? q.error : null,
    loadingMore: q.isFetchingNextPage,
    more: () => void q.fetchNextPage(),
    reload: () => void q.refetch(),
  }
}
