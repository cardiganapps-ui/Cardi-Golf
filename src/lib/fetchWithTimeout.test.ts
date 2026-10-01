/**
 * REL-14: a request the network swallows must end, so the outbox can retry
 * instead of freezing every queued score behind it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchWithTimeout, REQUEST_TIMEOUT_MS, RequestTimeoutError, timeoutFor, UPLOAD_TIMEOUT_MS } from './fetchWithTimeout'

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
