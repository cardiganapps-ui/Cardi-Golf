/**
 * fetch with a deadline, for the Supabase client (REL-14).
 *
 * Without one, a request that the network swallows (connected, but nothing
 * answers) never settles: the outbox pushes one item at a time, so a single
 * stalled push froze every queued score for minutes. A timeout turns the stall
 * into an ordinary network error, which the outbox already retries.
 */

/** REST, RPC and auth calls: a healthy 4G answer takes well under a second. */
export const REQUEST_TIMEOUT_MS = 12_000
/** Storage uploads (logos, scorecard photos) can take a while on 4G. */
export const UPLOAD_TIMEOUT_MS = 120_000

export class RequestTimeoutError extends Error {
  constructor(ms: number) {
    super(`Sin respuesta del servidor en ${Math.round(ms / 1000)} s`)
    this.name = 'RequestTimeout'
  }
}

export function timeoutFor(url: string, method: string): number {
  return /\/storage\/v1\/object\//.test(url) && method !== 'GET' && method !== 'HEAD' ? UPLOAD_TIMEOUT_MS : REQUEST_TIMEOUT_MS
}

export function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  const method = (init.method ?? (typeof input === 'object' && 'method' in input ? input.method : 'GET')).toUpperCase()
  const ms = timeoutFor(url, method)
  const ctrl = new AbortController()
  // Keep honouring the caller's own abort.
  const outer = init.signal
  if (outer) {
    if (outer.aborted) ctrl.abort(outer.reason)
    else outer.addEventListener('abort', () => ctrl.abort(outer.reason), { once: true })
  }
  const timer = setTimeout(() => ctrl.abort(new RequestTimeoutError(ms)), ms)
  return fetch(input, { ...init, signal: ctrl.signal }).finally(() => clearTimeout(timer))
}
