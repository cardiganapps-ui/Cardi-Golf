// @vitest-environment happy-dom
/**
 * STRAT-05, round 2: a link to watch asks as anon with no session. With a
 * Polo session kept in this browser (an expired one too), its asks carried
 * that person's token and auth-js refreshed it and wrote it back. `anonRpc`
 * sends the publishable key alone, reads and writes no storage and makes no
 * auth request; errors come back as supabase-js gives them.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.stubEnv('VITE_SUPABASE_URL', 'https://polo.example.supabase.co')
vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key')
const { anonRpc } = await import('./anonRpc')
const { humanError, isTransient } = await import('../lib/humanError')

const fetchMock = vi.fn<typeof fetch>()
const SESSION = JSON.stringify({ access_token: 'the-user-jwt', refresh_token: 'r', expires_at: 1, user: { id: 'u1' } })
beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  localStorage.clear()
  // Someone entered Polo in this browser once: their session, expired, is kept.
  localStorage.setItem('cardi-golf-auth', SESSION)
})
afterEach(() => {
  vi.unstubAllGlobals()
  fetchMock.mockReset()
  vi.restoreAllMocks()
})

describe('anonRpc: a public function as anon, with no session (STRAT-05)', () => {
  it('sends the publishable key alone, never the session kept here, and touches no storage', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ version: 'v1', same: true }), { status: 200 }))
    const reads = vi.spyOn(Storage.prototype, 'getItem')
    const writes = vi.spyOn(Storage.prototype, 'setItem')
    expect(await anonRpc('spectator_board', { p_token: 'x', p_seen: null })).toEqual({ version: 'v1', same: true })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://polo.example.supabase.co/rest/v1/rpc/spectator_board')
    expect(init?.method).toBe('POST')
    expect(init?.headers).toEqual({ apikey: 'anon-key', Authorization: 'Bearer anon-key', 'Content-Type': 'application/json', Accept: 'application/json' })
    expect(JSON.parse(String(init?.body))).toEqual({ p_token: 'x', p_seen: null })
    expect(JSON.stringify(fetchMock.mock.calls)).not.toContain('the-user-jwt')
    expect([reads.mock.calls.length, writes.mock.calls.length]).toEqual([0, 0])
    expect(localStorage.getItem('cardi-golf-auth')).toBe(SESSION)
  })

  it('a null answer is null (a link that does not work)', async () => {
    fetchMock.mockResolvedValue(new Response('null', { status: 200 }))
    expect(await anonRpc('spectator_board', { p_token: 'x' })).toBeNull()
  })

  it('a refusal keeps its code and status, so the page says it as it says any other', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ code: 'PGRST202', message: 'Could not find the function' }), { status: 404 }))
    await expect(anonRpc('spectator_board')).rejects.toMatchObject({ code: 'PGRST202', status: 404, message: 'Could not find the function' })
    fetchMock.mockResolvedValue(new Response('<html>Bad gateway</html>', { status: 502, statusText: 'Bad Gateway' }))
    const e = await anonRpc('spectator_board').catch((x: unknown) => x)
    expect(e).toMatchObject({ status: 502 })
    expect(isTransient(e)).toBe(true)
  })

  it('no signal is a network error, as the app’s client reports it', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    const e = await anonRpc('spectator_board').catch((x: unknown) => x)
    expect(isTransient(e)).toBe(true)
    expect(humanError(e)).toBe(humanError(new TypeError('Failed to fetch')))
  })
})
