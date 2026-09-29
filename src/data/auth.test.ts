/**
 * The blank page: startup used to await getSession() with no timeout, and
 * the home screen rendered nothing until it returned. These pin the fix —
 * whatever the session does, `ready` ends up true.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Listener = (evt: string, session: unknown) => void
let getSession: () => Promise<unknown>
let listener: Listener | null = null

vi.mock('../lib/supabase', () => ({
  supabaseConfigured: true,
  supabase: () => ({
    auth: {
      getSession: () => getSession(),
      onAuthStateChange: (cb: Listener) => {
        listener = cb
        return { data: { subscription: { unsubscribe: () => (listener = null) } } }
      },
    },
  }),
}))

async function freshAuth() {
  vi.resetModules()
  return import('./auth')
}

beforeEach(() => {
  listener = null
})
afterEach(() => vi.useRealTimers())

describe('auth startup', () => {
  it('a session that never comes back still ends in ready, with a timeout error', async () => {
    vi.useFakeTimers()
    getSession = () => new Promise(() => {})
    const { useAuth, SESSION_TIMEOUT_MS } = await freshAuth()
    const done = useAuth.getState().init()
    expect(useAuth.getState().ready).toBe(false)
    await vi.advanceTimersByTimeAsync(SESSION_TIMEOUT_MS)
    await done
    expect(useAuth.getState().ready).toBe(true)
    expect(useAuth.getState().bootError).toBe('timeout')
  })

  it('a session call that throws ends in ready, with an error', async () => {
    getSession = () => Promise.reject(new Error('storage'))
    const { useAuth } = await freshAuth()
    await useAuth.getState().init()
    expect(useAuth.getState().ready).toBe(true)
    expect(useAuth.getState().bootError).toBe('error')
  })

  it('a session that arrives late clears the error', async () => {
    getSession = () => Promise.reject(new Error('slow'))
    const { useAuth } = await freshAuth()
    await useAuth.getState().init()
    expect(useAuth.getState().bootError).toBe('error')
    listener?.('TOKEN_REFRESHED', { user: { id: 'u1', is_anonymous: false } })
    expect(useAuth.getState().bootError).toBeNull()
    expect(useAuth.getState().user?.id).toBe('u1')
  })

  it('the normal case is unchanged', async () => {
    getSession = () => Promise.resolve({ data: { session: { user: { id: 'u2', is_anonymous: true } } } })
    const { useAuth } = await freshAuth()
    await useAuth.getState().init()
    expect(useAuth.getState()).toMatchObject({ ready: true, bootError: null, isAnonymous: true })
  })

  it('retryAuth runs startup again', async () => {
    getSession = () => Promise.reject(new Error('x'))
    const { useAuth, retryAuth } = await freshAuth()
    await useAuth.getState().init()
    getSession = () => Promise.resolve({ data: { session: null } })
    await retryAuth()
    expect(useAuth.getState()).toMatchObject({ ready: true, bootError: null })
  })
})
