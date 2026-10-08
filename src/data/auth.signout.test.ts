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

const { _authTest, signOut, signOutRunning, signOutsAsked, signedOutOnPurpose, useAuth } = await import('./auth')
await useAuth.getState().init()

const KEY = 'cardi-golf-auth'
beforeEach(() => {
  storage.clear()
  storage.set(KEY, JSON.stringify({ access_token: 'expired', refresh_token: 'r' }))
  // Each test starts with no sign-out asked for and nobody in the auth store.
  _authTest.resetSignOut()
  useAuth.setState({ user: null, session: null })
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
    await vi.advanceTimersByTimeAsync(20_000)
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

/**
 * Only a real sign-in ends a sign-out the person asked for (the verifier of
 * #87, round 3): auth-js refreshing the token of the account being signed out
 * (it does every 30 s near the end of a token's life) ended it midway, the
 * gate read the session going away as lost and signed the phone in
 * anonymously 22 ms after the logout.
 */
/** The tournament gate stops its retries when a sign-out was asked for while it was open (TournamentGate.race.test). */
describe('the sign-outs asked for', () => {
  it('count up by one with each, whatever its outcome', async () => {
    const before = signOutsAsked()
    sb.signOut = async () => ({ error: Object.assign(new Error('Failed to fetch'), { name: 'AuthRetryableFetchError' }) })
    expect(await signOut()).toBe(false)
    expect(signOutsAsked()).toBe(before + 1)
    sb.signOut = async () => {
      storage.delete(KEY)
      return { error: null }
    }
    expect(await signOut()).toBe(true)
    expect(signOutsAsked()).toBe(before + 2)
  })
})

describe('what ends a deliberate sign-out', () => {
  /** auth-js's signOut, with `before` happening inside it, then the session going; what the gate would read at that moment. */
  function signsOutAfter(before: () => void) {
    const seen = { onPurpose: null as boolean | null }
    sb.signOut = async () => {
      before()
      storage.delete(KEY)
      sb.listener?.('SIGNED_OUT', null)
      seen.onPurpose = signedOutOnPurpose()
      return { error: null }
    }
    return seen
  }
  const account = { user: { id: 'uid-cuenta' }, access_token: 'nuevo' }
  beforeEach(() => storage.set(KEY, JSON.stringify({ access_token: 'a', refresh_token: 'r', user: { id: 'uid-cuenta' } })))

  it('a token refresh, then the sign-out, inside signOut: the identity going away is still on purpose', async () => {
    const seen = signsOutAfter(() => sb.listener?.('TOKEN_REFRESHED', account))
    expect(await signOut()).toBe(true)
    expect(seen.onPurpose).toBe(true)
    expect(signedOutOnPurpose()).toBe(true)
  })

  it('nor does auth-js confirming the same account again on its way out', async () => {
    const seen = signsOutAfter(() => sb.listener?.('SIGNED_IN', account))
    expect(await signOut()).toBe(true)
    expect(seen.onPurpose).toBe(true)
  })

  it('the same account signing in again afterwards is a real sign-in, and ends it', async () => {
    signsOutAfter(() => undefined)
    await signOut()
    expect(signedOutOnPurpose()).toBe(true)
    sb.listener?.('TOKEN_REFRESHED', account)
    expect(signedOutOnPurpose()).toBe(true)
    sb.listener?.('SIGNED_IN', account)
    expect(signedOutOnPurpose()).toBe(false)
  })
})

/**
 * Lie-fi or a slow server (the verifier of #87, round 3): signOut gave up at
 * 8 s while auth-js's own logout request lives 12 s, said «Sigues dentro»,
 * and dropped the deliberate flag; auth-js then removed the session anyway
 * (a network error from the logout ends a valid session), the gate saw a lost
 * session and started an anonymous user, and the previous person's boards
 * and «Tu último torneo» stayed for the next one.
 */
describe('a sign-out that takes a while', () => {
  /** auth-js's signOut, answering after `ms`; `ends`: it removed the session by then. */
  function answersAfter(ms: number, ends: boolean, seen?: { onPurpose: boolean | null }) {
    sb.signOut = () =>
      new Promise((resolve) =>
        setTimeout(() => {
          if (ends) {
            storage.delete(KEY)
            sb.listener?.('SIGNED_OUT', null)
            if (seen) seen.onPurpose = signedOutOnPurpose()
          }
          resolve({ error: ends ? null : Object.assign(new Error('Failed to fetch'), { name: 'AuthRetryableFetchError' }) })
        }, ms),
      )
  }
  const fake = () => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })

  it('is waited for past the logout request\'s own deadline: on lie-fi auth-js ends a valid session at 12 s, and the sign-out is done', async () => {
    fake()
    try {
      answersAfter(12_000, true)
      const done = signOut()
      await vi.advanceTimersByTimeAsync(12_500)
      expect(await done).toBe(true)
      expect(signedOutOnPurpose()).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  it('a session that ends after the wait gave up: still no lost session to the gate, and what the caller would have done is done then', async () => {
    fake()
    try {
      const seen = { onPurpose: null as boolean | null }
      answersAfter(40_000, true, seen)
      const late = vi.fn()
      const done = signOut(late)
      await vi.advanceTimersByTimeAsync(20_000)
      // The person is told the truth of that moment: the session is still there, and auth-js still on it.
      expect(await done).toBe(false)
      expect(storage.has(KEY)).toBe(true)
      expect(signOutRunning()).toBe(true)
      expect(late).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(20_000)
      expect(seen.onPurpose).toBe(true)
      expect(late).toHaveBeenCalledTimes(1)
      expect(signedOutOnPurpose()).toBe(true)
      expect(signOutRunning()).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('a second tap while auth-js still works on the first: the first one\'s late answer leaves the second alone', async () => {
    fake()
    try {
      const answers: Array<(r: { error: unknown }) => void> = []
      sb.signOut = () => new Promise((resolve) => answers.push(resolve))
      const first = signOut()
      await vi.advanceTimersByTimeAsync(16_000)
      expect(await first).toBe(false)
      const second = signOut()
      // auth-js answers the first: it kept the session (its refresh failed)...
      answers[0]!({ error: Object.assign(new Error('Failed to fetch'), { name: 'AuthRetryableFetchError' }) })
      await vi.advanceTimersByTimeAsync(0)
      expect(signedOutOnPurpose()).toBe(true)
      // ...then ends it for the second: still a sign-out the person asked for.
      storage.delete(KEY)
      sb.listener?.('SIGNED_OUT', null)
      expect(signedOutOnPurpose()).toBe(true)
      answers[1]!({ error: null })
      expect(await second).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  it('a late answer that keeps the session changes nothing, and the identity going away later is no longer on purpose', async () => {
    fake()
    try {
      answersAfter(40_000, false)
      const late = vi.fn()
      const done = signOut(late)
      await vi.advanceTimersByTimeAsync(20_000)
      expect(await done).toBe(false)
      await vi.advanceTimersByTimeAsync(20_000)
      expect(late).not.toHaveBeenCalled()
      expect(storage.has(KEY)).toBe(true)
      expect(signedOutOnPurpose()).toBe(false)
      expect(signOutRunning()).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })
})
