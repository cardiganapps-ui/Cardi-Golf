/**
 * REL-14: a request the network swallows must end, so the outbox can retry
 * instead of freezing every queued score behind it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchWithTimeout, REQUEST_TIMEOUT_MS, RequestTimeoutError, serverAnswering, timeoutFor, UPLOAD_TIMEOUT_MS } from './fetchWithTimeout'

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
 * Whether the app's requests get through, for the Tarjeta's line while a
 * write waits for its session (the verifier of #87, round 3): «Confirmando tu
 * sesión…» showed on lie-fi and with no route at all once the token had
 * expired. The latest outcome decides: an answer of any status, or a request
 * lost.
 */
describe('serverAnswering', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })
  const answers = (status: number) => vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status })))
  const lost = () => vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))))

  it('an answer of any status is the server answering: a refusal, or a 500 from an auth server that is down', async () => {
    for (const status of [401, 500]) {
      lost()
      await expect(fetchWithTimeout('https://x.supabase.co/rest/v1/scores')).rejects.toThrow('Failed to fetch')
      expect(serverAnswering()).toBe(false)
      answers(status)
      await fetchWithTimeout('https://x.supabase.co/auth/v1/token', { method: 'POST' })
      expect(serverAnswering(), `after a ${status}`).toBe(true)
    }
  })

  it('a request lost (no route) or swallowed (past its deadline) is not, until the next answer', async () => {
    answers(200)
    await fetchWithTimeout('https://x.supabase.co/rest/v1/scores')
    vi.stubGlobal('fetch', hangingFetch())
    const stalled = expect(fetchWithTimeout('https://x.supabase.co/rest/v1/scores')).rejects.toBeInstanceOf(RequestTimeoutError)
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS)
    await stalled
    expect(serverAnswering()).toBe(false)
    answers(200)
    await fetchWithTimeout('https://x.supabase.co/rest/v1/scores')
    expect(serverAnswering()).toBe(true)
  })

  it("the caller's own abort says nothing about the network", async () => {
    answers(200)
    await fetchWithTimeout('https://x.supabase.co/rest/v1/scores')
    vi.stubGlobal('fetch', hangingFetch())
    const ctrl = new AbortController()
    const p = expect(fetchWithTimeout('https://x.supabase.co/rest/v1/scores', { signal: ctrl.signal })).rejects.toBe('stop')
    ctrl.abort('stop')
    await p
    expect(serverAnswering()).toBe(true)
  })
})
