/**
 * Signing out (the verifier of #87, round 2):
 * - With no signal and an expired token, auth-js cannot load the session to
 *   end it: it returns an error and keeps it. signOut() read that as done, so
 *   the caller said it worked and wiped the boards saved on the phone of a
 *   person who was still signed in. It reports what is left on the device.
 * - A sign-out the person asked for is no lost session: the tournament gate
 *   must not answer it by signing the phone in anonymously.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const storage = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (k: string) => storage.get(k) ?? null,
  setItem: (k: string, v: string) => void storage.set(k, v),
  removeItem: (k: string) => void storage.delete(k),
})

const sb = vi.hoisted(() => ({
  /** What auth-js's signOut does this time. */
  signOut: async (): Promise<{ error: unknown }> => ({ error: null }),
  listener: null as null | ((evt: string, session: unknown) => void),
}))
vi.mock('../lib/supabase', () => ({
  supabaseConfigured: true,
  supabase: () => ({
    auth: {
      getSession: async () => ({ data: { session: null } }),
      signOut: () => sb.signOut(),
      onAuthStateChange: (cb: (evt: string, session: unknown) => void) => {
        sb.listener = cb
        return { data: { subscription: { unsubscribe: () => undefined } } }
      },
    },
  }),
}))

const { signOut, signedOutOnPurpose, useAuth } = await import('./auth')
await useAuth.getState().init()

const KEY = 'cardi-golf-auth'
beforeEach(() => {
  storage.clear()
  storage.set(KEY, JSON.stringify({ access_token: 'expired', refresh_token: 'r' }))
})

describe('signOut', () => {
  it('is done once auth-js removed the stored session, and the identity going away was asked for', async () => {
    sb.signOut = async () => {
      storage.delete(KEY)
      sb.listener?.('SIGNED_OUT', null)
      return { error: null }
    }
    expect(await signOut()).toBe(true)
    expect(signedOutOnPurpose()).toBe(true)
  })

  it('a valid token with no signal: auth-js still drops the session on the device, so it is done', async () => {
    sb.signOut = async () => {
      storage.delete(KEY)
      return { error: new Error('Failed to fetch') }
    }
    expect(await signOut()).toBe(true)
  })

  it('no signal and an expired token: auth-js keeps the session, so it is not done and nothing reads as a deliberate sign-out', async () => {
    sb.signOut = async () => ({ error: Object.assign(new Error('Failed to fetch'), { name: 'AuthRetryableFetchError' }) })
    expect(await signOut()).toBe(false)
    expect(storage.has(KEY)).toBe(true)
    expect(signedOutOnPurpose()).toBe(false)
  })

  it('a sign-out that never answers is not done either', async () => {
    vi.useFakeTimers()
    sb.signOut = () => new Promise(() => undefined)
    const done = signOut()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(await done).toBe(false)
    vi.useRealTimers()
  })

  it('the next session (a tournament link opened afterwards) ends the deliberate sign-out', async () => {
    sb.signOut = async () => {
      storage.delete(KEY)
      return { error: null }
    }
    await signOut()
    expect(signedOutOnPurpose()).toBe(true)
    sb.listener?.('SIGNED_IN', { user: { id: 'anon-nuevo' } })
    expect(signedOutOnPurpose()).toBe(false)
  })
})
