// @vitest-environment happy-dom
/**
 * Signing out, and changing account, on a shared phone (the verifiers of #87):
 * - The boards saved on the phone and «Tu último torneo» go with the session,
 *   and only once the session is really gone: with no signal and an expired
 *   token auth-js keeps it, and sign-out said it worked and wiped the boards
 *   of a person still signed in.
 * - Never while a write is still on the phone, for any tournament; the
 *   account switches counted only the tournament open on screen. The refusal
 *   names the tournament and says whether signal or the PIN sends the writes.
 */
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const auth = vi.hoisted(() => ({
  signOuts: 0,
  /** What auth-js's signOut does: by default it removes the stored session. */
  signOut: async (): Promise<{ error: unknown }> => ({ error: null }),
  anonymous: true,
  oauth: 0,
  otp: 0,
}))
vi.mock('../lib/supabase', () => ({
  supabaseConfigured: true,
  authSettings: async () => null,
  supabase: () => ({
    auth: {
      signOut: async () => {
        auth.signOuts++
        return auth.signOut()
      },
      getSession: async () => ({ data: { session: { user: { id: 'uid-a', is_anonymous: auth.anonymous } } } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
      // The address already has an account: the device signs in to it instead of converting.
      updateUser: async () => ({ error: Object.assign(new Error('already registered'), { code: 'email_exists' }) }),
      signInWithOtp: async () => {
        auth.otp++
        return { error: null }
      },
      signInWithOAuth: async () => {
        auth.oauth++
        return { error: null }
      },
      linkIdentity: async () => {
        auth.oauth++
        return { error: null }
      },
    },
  }),
}))
vi.mock('./tournamentStore', () => ({
  registerOverlay: () => undefined,
  useTournament: { getState: () => ({ tournamentId: 't-open', patch: () => undefined, reload: async () => undefined }) },
}))

const { continueWithGoogle, sendProfileCode, signInWithGoogleInstead, signOutSafely, useLateSignOut } = await import('./account')
const { useAuth } = await import('./auth')
const { useMyProfile } = await import('./profiles')
const { t } = await import('../i18n/es-MX')
const { _outboxTest } = await import('./outbox')
const { getLastTournament, setLastTournament } = await import('./session')
const { clearAllCached, readCached, saveEntry, saveSnapshot } = await import('./snapshotCache')
const { getFixture } = await import('../dev/fixtures')

const fx = getFixture('minimal4-live')!
const { slug, id, name } = fx.snapshot.tournament

beforeEach(async () => {
  auth.signOuts = 0
  auth.oauth = 0
  auth.otp = 0
  auth.anonymous = true
  auth.signOut = async () => {
    localStorage.removeItem('cardi-golf-auth')
    return { error: null }
  }
  localStorage.setItem('cardi-golf-auth', '{"access_token":"t"}')
  useAuth.setState({ user: { id: 'uid-a' } as never })
  _outboxTest.reset()
  await _outboxTest.clearStored()
  _outboxTest.setPush(async () => {
    throw new Error('TypeError: Failed to fetch')
  })
  await saveEntry({ slug, tournamentId: id, lookup: fx.lookup, me: fx.me })
  await saveSnapshot(id, fx.snapshot)
  setLastTournament({ slug, name })
})

describe('signing out of a shared phone', () => {
  it('takes the boards saved on the phone and «Tu último torneo» with the session', async () => {
    expect(await signOutSafely()).toEqual({ done: true })
    expect(auth.signOuts).toBe(1)
    expect(await readCached(slug)).toBeNull()
    expect(getLastTournament()).toBeNull()
  })

  it('never while a write is still on the phone, for any tournament, and then nothing goes', async () => {
    // A hole of another tournament than the one open on screen, still waiting for signal.
    await _outboxTest.enqueue({
      key: 'score:r9:p1:4',
      kind: 'score',
      tournamentId: 't-otro',
      payload: { round_id: 'r9', player_id: 'p1', hole: 4, strokes: 4, putts: 2, picked_up: false, entered_by: 'p1', client_ts: 'x' },
      attempts: 0,
      createdAt: 1,
    })
    expect(await signOutSafely()).toEqual({ done: false, reason: t.account.unsentSignal(null, 'signOut') })
    expect(auth.signOuts).toBe(0)
    expect(await readCached(slug)).not.toBeNull()
    expect(getLastTournament()).toEqual({ slug, name })
  })
})

/** A hole of the saved tournament (not the one open on screen), still on the phone. */
function holeOfSaved() {
  return _outboxTest.enqueue({
    key: 'score:r1:p1:4',
    kind: 'score',
    tournamentId: id,
    payload: { round_id: 'r1', player_id: 'p1', hole: 4, strokes: 4, putts: 2, picked_up: false, entered_by: 'p1', client_ts: 'x' },
    attempts: 0,
    createdAt: 1,
  })
}

describe('what the refusal says', () => {
  it('names the tournament, and says signal sends them', async () => {
    await holeOfSaved()
    expect(await signOutSafely()).toEqual({ done: false, reason: t.account.unsentSignal(name, 'signOut') })
    expect(t.account.unsentSignal(name, 'signOut')).toContain(name)
  })

  it('says the PIN, not signal, when the phone is someone else now', async () => {
    await holeOfSaved()
    useAuth.setState({ user: { id: 'uid-b' } as never })
    expect(await signOutSafely()).toEqual({ done: false, reason: t.account.unsentPin(name, 'signOut') })
  })

  it('names the tournament from its writes once the boards saved on the phone are gone (Entrar and «no existe» clear them)', async () => {
    await clearAllCached()
    await _outboxTest.enqueue({
      key: 'score:r1:p1:4',
      kind: 'score',
      tournamentId: id,
      tournamentName: name,
      actingUid: 'uid-viejo',
      payload: { round_id: 'r1', player_id: 'p1', hole: 4, strokes: 4, putts: 2, picked_up: false, entered_by: 'p1', client_ts: 'x' },
      attempts: 0,
      createdAt: 1,
    })
    expect(await signOutSafely()).toEqual({ done: false, reason: t.account.unsentPin(name, 'signOut') })
  })
})

describe('signing out with no signal and an expired token', () => {
  it('auth-js keeps the session: not done, and the saved boards and «Tu último torneo» stay', async () => {
    auth.signOut = async () => ({ error: Object.assign(new Error('Failed to fetch'), { name: 'AuthRetryableFetchError' }) })
    expect(await signOutSafely()).toEqual({ done: false, reason: t.account.signOutNeedsSignal })
    expect(auth.signOuts).toBe(1)
    expect(await readCached(slug)).not.toBeNull()
    expect(getLastTournament()).toEqual({ slug, name })
  })
})

/**
 * Lie-fi or a slow server (the verifier of #87, round 3): the sign-out said
 * «Sigues dentro», then auth-js ended the session anyway, and the previous
 * person's profile, «Tu último torneo» and boards stayed for the next one.
 */
describe('a sign-out that ends after its screen stopped waiting', () => {
  it('finishes the cleanup then, and says so', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      useMyProfile.setState({ profile: { id: 'uid-a', handle: 'ivanj' } as never })
      auth.signOut = () =>
        new Promise((resolve) =>
          setTimeout(() => {
            localStorage.removeItem('cardi-golf-auth')
            resolve({ error: null })
          }, 40_000),
        )
      const result = signOutSafely()
      await vi.advanceTimersByTimeAsync(20_000)
      // Told the truth of that moment: still signed in, nothing cleared yet.
      expect((await result).done).toBe(false)
      expect(await readCached(slug)).not.toBeNull()
      expect(getLastTournament()).toEqual({ slug, name })
      await vi.advanceTimersByTimeAsync(20_000)
      await vi.waitFor(async () => expect(await readCached(slug)).toBeNull())
      expect(getLastTournament()).toBeNull()
      expect(useMyProfile.getState().profile).toBeNull()
      expect(useLateSignOut.getState().at).not.toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('changing account with a write of another tournament on the phone', () => {
  it('a code to an address that has an account is refused, and says why', async () => {
    await holeOfSaved()
    await expect(sendProfileCode('otro@example.com')).rejects.toThrow(t.account.unsentSignal(name, 'switch'))
    expect(auth.otp).toBe(0)
  })

  it('so is Google, both ways', async () => {
    await holeOfSaved()
    await expect(signInWithGoogleInstead('/')).rejects.toThrow(t.account.unsentSignal(name, 'switch'))
    await expect(continueWithGoogle('/')).rejects.toThrow(t.account.unsentSignal(name, 'switch'))
    expect(auth.oauth).toBe(0)
  })
})
