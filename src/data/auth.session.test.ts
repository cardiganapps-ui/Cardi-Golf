/**
 * REL-16: when a phone's token lapsed in a dead zone, getSession() returned
 * nothing until the refresh succeeded, and ensureSession() signed in as a new
 * anonymous user. The phone lost its player claim and the server refused every
 * hole it had queued. A stored session must never be replaced that way.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

let session: unknown = null
let anonCalls = 0
const storage = new Map<string, string>()

vi.stubGlobal('localStorage', {
  getItem: (k: string) => storage.get(k) ?? null,
  setItem: (k: string, v: string) => void storage.set(k, v),
  removeItem: (k: string) => void storage.delete(k),
})

vi.mock('../lib/supabase', () => ({
  supabaseConfigured: true,
  supabase: () => ({
    auth: {
      getSession: async () => ({ data: { session } }),
      signInAnonymously: async () => {
        anonCalls++
        return { data: { session: { user: { id: 'new-anon' } } }, error: null }
      },
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
    },
  }),
}))

const { ensureSession, SessionUnavailableError } = await import('./auth')

describe('ensureSession', () => {
  beforeEach(() => {
    session = null
    anonCalls = 0
    storage.clear()
  })

  it('returns the current session', async () => {
    session = { user: { id: 'me' } }
    await expect(ensureSession()).resolves.toBe(session)
    expect(anonCalls).toBe(0)
  })

  it('waits for a stored session it cannot confirm instead of starting a new anonymous one', async () => {
    // auth-js keeps the session in storage while its refresh fails for lack of signal.
    storage.set('cardi-golf-auth', JSON.stringify({ access_token: 'expired', refresh_token: 'r' }))
    await expect(ensureSession()).rejects.toBeInstanceOf(SessionUnavailableError)
    expect(anonCalls).toBe(0)
  })

  it('starts an anonymous session on a device with none', async () => {
    await expect(ensureSession()).resolves.toEqual({ user: { id: 'new-anon' } })
    expect(anonCalls).toBe(1)
  })

  it('two callers at once (a retry and the PIN) start one anonymous session, not two', async () => {
    const [a, b] = await Promise.all([ensureSession(), ensureSession()])
    expect(anonCalls).toBe(1)
    expect(a).toBe(b)
    // Once it is settled, the next caller asks again.
    session = a
    await expect(ensureSession()).resolves.toBe(a)
    expect(anonCalls).toBe(1)
  })
})
