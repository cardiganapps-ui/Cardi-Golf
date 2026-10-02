/**
 * REL-14: a request the network swallows must end, so the outbox can retry
 * instead of freezing every queued score behind it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchWithTimeout, REQUEST_TIMEOUT_MS, RequestTimeoutError, serverAnsweredWithin, timeoutFor, UPLOAD_TIMEOUT_MS } from './fetchWithTimeout'

/** A fetch that never answers, but rejects with the abort reason like browsers do. */
function hangingFetch() {
  return vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal!.reason))
    })
  })
}

describe('fetchWithTimeout', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('gives up on a stalled REST call with a retryable timeout', async () => {
    vi.stubGlobal('fetch', hangingFetch())
    const p = fetchWithTimeout('https://x.supabase.co/rest/v1/scores', { method: 'POST' })
    const result = expect(p).rejects.toBeInstanceOf(RequestTimeoutError)
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS)
    await result
  })

  it('lets storage uploads take longer', async () => {
    expect(timeoutFor('https://x.supabase.co/storage/v1/object/tournament-assets/t/logo.png', 'POST')).toBe(UPLOAD_TIMEOUT_MS)
    expect(timeoutFor('https://x.supabase.co/storage/v1/object/public/tournament-assets/t/logo.png', 'GET')).toBe(REQUEST_TIMEOUT_MS)
    expect(timeoutFor('https://x.supabase.co/rest/v1/rpc/claim_player', 'POST')).toBe(REQUEST_TIMEOUT_MS)
  })

  it('passes a normal answer through and clears its timer', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('[]', { status: 200 })))
    const res = await fetchWithTimeout('https://x.supabase.co/rest/v1/scores')
    expect(res.status).toBe(200)
    expect(vi.getTimerCount()).toBe(0)
  })

  it("still honours the caller's own abort", async () => {
    vi.stubGlobal('fetch', hangingFetch())
    const ctrl = new AbortController()
    const p = fetchWithTimeout('https://x.supabase.co/rest/v1/scores', { signal: ctrl.signal })
    const result = expect(p).rejects.toBe('stop')
    ctrl.abort('stop')
    await result
  })
})

/**
 * Whether the server is answering, for the Tarjeta's line while a write waits
 * for its session (the verifier of #87, round 3): «Confirmando tu sesión…»
 * showed on lie-fi and with no route at all once the token had expired, for
 * 40 s after the network was back.
 */
describe('serverAnsweredWithin', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('any answer below 500 means the server was reachable then, a refusal too', async () => {
    vi.advanceTimersByTime(60_000)
    expect(serverAnsweredWithin(30_000)).toBe(false)
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"message":"JWT expired"}', { status: 401 })))
    await fetchWithTimeout('https://x.supabase.co/rest/v1/rpc/lookup_tournament', { method: 'POST' })
    expect(serverAnsweredWithin(30_000)).toBe(true)
    vi.advanceTimersByTime(31_000)
    expect(serverAnsweredWithin(30_000)).toBe(false)
  })

  it('a 5xx, a network error or a request the network swallows is no answer', async () => {
    // Well past the answer of the test before.
    vi.advanceTimersByTime(120_000)
    expect(serverAnsweredWithin(30_000)).toBe(false)
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 503 })))
    await fetchWithTimeout('https://x.supabase.co/auth/v1/token', { method: 'POST' })
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))))
    await expect(fetchWithTimeout('https://x.supabase.co/rest/v1/scores')).rejects.toThrow('Failed to fetch')
    vi.stubGlobal('fetch', hangingFetch())
    const stalled = expect(fetchWithTimeout('https://x.supabase.co/rest/v1/scores')).rejects.toBeInstanceOf(RequestTimeoutError)
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS)
    await stalled
    expect(serverAnsweredWithin(30_000)).toBe(false)
  })
})
