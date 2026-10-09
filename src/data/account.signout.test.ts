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
  /** `none`: getSession gives no session (none stored, or one auth-js could not refresh: lie-fi, its retry cooldown). */
  session: 'anon' as 'anon' | 'none',
  oauth: 0,
  otp: 0,
  verifies: 0,
  /** What updateUser({ email }) answers: by default the address has an account already. */
  updateUser: async (): Promise<{ error: unknown }> => ({ error: Object.assign(new Error('already registered'), { code: 'email_exists' }) }),
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
      getSession: async () => ({ data: { session: auth.session === 'none' ? null : { user: { id: 'uid-a', is_anonymous: auth.anonymous } } } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
      // By default the address already has an account: the device signs in to it instead of converting.
      updateUser: () => auth.updateUser(),
      signInWithOtp: async () => {
        auth.otp++
        return { error: null }
      },
      verifyOtp: async () => {
        auth.verifies++
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
  serverReadSince: () => null,
  registerOverlay: () => undefined,
  liveSeq: () => 0,
  liveClock: () => Date.now(),
  useTournament: { getState: () => ({ tournamentId: 't-open', patch: () => undefined, refresh: () => undefined, landChanges: () => undefined, pushesDone: () => undefined, reload: async () => undefined }) },
}))

const { confirmProfileCode, continueWithGoogle, sendProfileCode, signInWithGoogleInstead, signOutSafely, useLateSignOut } = await import('./account')
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
  auth.verifies = 0
  auth.anonymous = true
  auth.session = 'anon'
  auth.updateUser = async () => ({ error: Object.assign(new Error('already registered'), { code: 'email_exists' }) })
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
  it('takes the boards saved on the phone, «Tu último torneo» and the profile in memory with the session', async () => {
    useMyProfile.setState({ profile: { id: 'uid-a', handle: 'ivanj' } as never, links: [{ playerId: 'p1' }] as never })
    expect(await signOutSafely()).toEqual({ done: true })
    expect(auth.signOuts).toBe(1)
    expect(await readCached(slug)).toBeNull()
    expect(getLastTournament()).toBeNull()
    // The next person on the phone must not see the previous one's profile, even for a moment.
    expect(useMyProfile.getState().profile).toBeNull()
    expect(useMyProfile.getState().links).toEqual([])
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
    expect(await signOutSafely()).toEqual({ done: false, reason: t.account.signOutUnconfirmed })
    expect(auth.signOuts).toBe(1)
    expect(await readCached(slug)).not.toBeNull()
    expect(getLastTournament()).toEqual({ slug, name })
  })

  /**
   * The same refusal comes, with the signal back, inside auth-js's 60 s retry
   * cooldown after a failed refresh: no request is even sent (the verifier of
   * #87, round 3, in 2 of 3 runs). It used to say «hace falta señal».
   */
  it('says what is true either way: the session could not be confirmed, not that there is no signal', () => {
    expect(t.account.signOutUnconfirmed).not.toMatch(/hace falta señal|sin señal|no hay señal/i)
    expect(t.account.signOutUnconfirmed).toMatch(/Intenta de nuevo en un minuto/)
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
      // Told the truth of that moment: still signed in for now, the server has not answered, nothing cleared yet.
      expect(await result).toEqual({ done: false, reason: t.account.signOutPending })
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

  /**
   * With no session to convert or add Google to (none, or one auth-js could
   * not confirm: lie-fi, or the signal just back inside its retry cooldown),
   * the code and Google sign this phone in as the account. Both skipped the
   * check, and the phone's holes were left waiting for a PIN.
   */
  it('with no session auth-js could confirm, the email code and Google are refused too', async () => {
    await holeOfSaved()
    auth.session = 'none'
    await expect(sendProfileCode('otro@example.com')).rejects.toThrow(t.account.unsentSignal(name, 'switch'))
    await expect(continueWithGoogle('/')).rejects.toThrow(t.account.unsentSignal(name, 'switch'))
    expect(auth.otp + auth.oauth).toBe(0)
  })

  it('so is Google from an account: it signs this phone in as the Google one', async () => {
    await holeOfSaved()
    auth.anonymous = false
    await expect(continueWithGoogle('/')).rejects.toThrow(t.account.unsentSignal(name, 'switch'))
    expect(auth.oauth).toBe(0)
  })

  it('the sign-in code is checked again when it is typed: a hole saved since it was sent refuses it', async () => {
    auth.session = 'none'
    expect(await sendProfileCode('otro@example.com')).toBe('signin')
    expect(auth.otp).toBe(1)
    await holeOfSaved()
    await expect(confirmProfileCode('otro@example.com', '123456', 'signin')).rejects.toThrow(t.account.unsentSignal(name, 'switch'))
    expect(auth.verifies).toBe(0)
    // Converting in place keeps the uid: its code goes ahead.
    await confirmProfileCode('nuevo@example.com', '123456', 'convert')
    expect(auth.verifies).toBe(1)
  })
})

/**
 * Converting this anonymous device in place (`updateUser({ email })`, then the
 * `email_change` code) keeps its uid: its PIN claim and its queued writes stay
 * valid, and go out as before. So it is not refused while writes wait, unlike
 * the switches to another account (the verifier of #87, round 3, mutant V6:
 * nothing pinned which way it should go).
 */
describe('saving the profile on this same device', () => {
  it('goes ahead with writes still on the phone: same uid, so nothing is stranded', async () => {
    await holeOfSaved()
    auth.updateUser = async () => ({ error: null })
    expect(await sendProfileCode('nuevo@example.com')).toBe('convert')
    expect(auth.otp).toBe(0)
    expect(_outboxTest.queue().map((x) => [x.key, x.actingUid])).toEqual([['score:r1:p1:4', 'uid-a']])
  })
})
