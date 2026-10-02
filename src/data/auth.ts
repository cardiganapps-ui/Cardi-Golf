/**
 * Auth (CLAUDE.md §7): organizers sign in with email; players get an
 * anonymous session and claim a player with a PIN.
 */
import type { Session, User } from '@supabase/supabase-js'
import { create } from 'zustand'
import { supabase, supabaseConfigured } from '../lib/supabase'
import { REQUEST_TIMEOUT_MS } from '../lib/fetchWithTimeout'
import { withTimeout } from '../lib/timeout'
import { t } from '../i18n/es-MX'
import { UserError } from '../lib/humanError'

/** How long startup waits for the stored session before showing a way out. */
export const SESSION_TIMEOUT_MS = 8000
/**
 * How long a sign-out waits for auth-js: past its own logout request's
 * deadline. With a valid token auth-js ends the session even when that request
 * fails, so on lie-fi the session went at 12 s, 4 s after a sign-out that gave
 * up at 8 s had said «Sigues dentro».
 */
export const SIGN_OUT_TIMEOUT_MS = REQUEST_TIMEOUT_MS + 3000

interface AuthState {
  ready: boolean
  session: Session | null
  user: User | null
  isAnonymous: boolean
  /**
   * Why startup could not confirm the session. `ready` is true either way,
   * so no screen can wait on it forever — this used to be a permanent blank
   * page when the token refresh stalled on a phone's 4G.
   */
  bootError: 'timeout' | 'error' | null
  init(): Promise<void>
}

let inited = false
let unsubscribe: (() => void) | null = null

const fromSession = (session: Session | null) => ({ session, user: session?.user ?? null, isAnonymous: !!session?.user?.is_anonymous })

export const useAuth = create<AuthState>((set) => ({
  ready: !supabaseConfigured,
  session: null,
  user: null,
  isAnonymous: false,
  bootError: null,
  async init() {
    if (inited || !supabaseConfigured) return
    inited = true
    const sb = supabase()
    // Listen FIRST: if getSession below gives up but the refresh finishes a
    // moment later, the session still lands and the error clears itself.
    unsubscribe?.()
    const { data: sub } = sb.auth.onAuthStateChange((evt, session) => {
      // Only a real sign-in ends a sign-out the person asked for: a new
      // session (a tournament link opened afterwards, another account). Not a
      // token refresh, nor auth-js confirming the account it is signing out:
      // a refresh that landed mid-sign-out ended it, and the gate started an
      // anonymous user behind the person.
      if (evt === 'SIGNED_IN' && session && session.user?.id !== leaving) signingOut = false
      set({ ...fromSession(session), ready: true, bootError: null })
    })
    unsubscribe = () => sub.subscription.unsubscribe()
    try {
      const { data } = await withTimeout(sb.auth.getSession(), SESSION_TIMEOUT_MS, 'sesión')
      set({ ...fromSession(data.session), bootError: null })
    } catch (e) {
      set({ bootError: e instanceof Error && e.name === 'TimeoutError' ? 'timeout' : 'error' })
    } finally {
      set({ ready: true })
    }
  },
}))

/** Try startup again, from BootProblem's «Reintentar». */
export async function retryAuth() {
  inited = false
  useAuth.setState({ ready: false, bootError: null })
  await useAuth.getState().init()
}

/** Whether this device holds a stored session, even if it could not be confirmed. */
export function hasStoredSession(): boolean {
  try {
    // The storage key set in lib/supabase.ts.
    return localStorage.getItem('cardi-golf-auth') != null
  } catch {
    return false
  }
}

/**
 * The stored session could not be confirmed yet (no signal, or the token
 * refresh is cooling down after a failure). Retry later; the cached boards
 * stay up meanwhile.
 */
export class SessionUnavailableError extends UserError {
  constructor() {
    super('No se pudo confirmar la sesión guardada; se reintenta al volver la señal.')
    this.name = 'SessionUnavailable'
  }
}

/** The `ensureSession` in flight, which every caller meanwhile shares. */
let starting: Promise<Session> | null = null

/**
 * A session of any kind (anonymous if none). Used when opening a tournament link.
 *
 * Never replaces a stored session with a new anonymous user (REL-16): when a
 * phone's token lapses in a dead zone, getSession() returns nothing until the
 * refresh succeeds, and signing in anonymously then gave the phone a new
 * identity, so the server refused every hole it had queued. auth-js deletes
 * the stored session itself when its refresh token is really dead; only then
 * does the device start over (and its queued holes wait for the PIN, see
 * outbox `adoptQueuedWrites`).
 *
 * One at a time: two callers at once (the gate's retry and the PIN) used to
 * start two anonymous users on a device with none.
 */
export function ensureSession(): Promise<Session> {
  starting ??= startSession().finally(() => {
    starting = null
  })
  return starting
}
async function startSession(): Promise<Session> {
  const sb = supabase()
  const { data } = await withTimeout(sb.auth.getSession(), SESSION_TIMEOUT_MS, 'sesión')
  if (data.session) return data.session
  if (hasStoredSession()) throw new SessionUnavailableError()
  const { data: anon, error } = await sb.auth.signInAnonymously()
  if (error || !anon.session) throw error ?? new UserError(t.errors.sessionStart)
  return anon.session
}

export async function signInWithPassword(email: string, password: string) {
  const { error } = await supabase().auth.signInWithPassword({ email, password })
  if (error) throw error
}

export async function signUpWithPassword(email: string, password: string, displayName: string) {
  const { data, error } = await supabase().auth.signUp({
    email,
    password,
    options: { data: { display_name: displayName }, emailRedirectTo: `${window.location.origin}/organizer` },
  })
  if (error) throw error
  // Accounts confirm their email (autoconfirm is off): no session until the code is typed.
  return { needsConfirmation: !data.session }
}

export async function signInWithMagicLink(email: string) {
  const { error } = await supabase().auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${window.location.origin}/organizer` },
  })
  if (error) throw error
}

/**
 * Every Polo email carries a 6-digit code as well as a link: the code keeps
 * the flow inside the installed app (on iOS a link from Mail opens Safari).
 * `signup` confirms a new account, `email` signs in with a magic-link code.
 */
export async function verifyEmailCode(email: string, token: string, type: 'signup' | 'email') {
  const { error } = await supabase().auth.verifyOtp({ email, token: token.trim(), type })
  if (error) throw error
}

/** Sends the code again: the sign-up confirmation, or a fresh sign-in code. */
export async function resendEmailCode(email: string, type: 'signup' | 'email') {
  if (type === 'email') return signInWithMagicLink(email)
  const { error } = await supabase().auth.resend({ type: 'signup', email, options: { emailRedirectTo: `${window.location.origin}/organizer` } })
  if (error) throw error
}
export async function requestPasswordReset(email: string) {
  const { error } = await supabase().auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/organizer/reset`,
  })
  if (error) throw error
}

export async function updatePassword(password: string) {
  const { error } = await supabase().auth.updateUser({ password })
  if (error) throw error
}

/** The person asked to sign out (until the next real sign-in): the identity going away is no lost session. */
let signingOut = false
/** Whom auth-js is still signing out: a session of theirs meanwhile (a refresh, a confirmation) is no new sign-in. */
let leaving: string | null = null
/** Each sign-out's number: an older one's late answer leaves a newer one's flag and outcome alone. */
let signOutSeq = 0

/** For tests: no sign-out asked for, and none still running (a later answer of one changes nothing). */
export const _authTest = {
  resetSignOut() {
    signingOut = false
    leaving = null
    signOutSeq++
  },
}

/** The user of the session stored on this device, if any (the auth store may not have it yet). */
function storedUid(): string | null {
  try {
    const raw = localStorage.getItem('cardi-golf-auth')
    return raw ? ((JSON.parse(raw) as { user?: { id?: string } }).user?.id ?? null) : null
  } catch {
    return null
  }
}

/**
 * Whether this device has no session because its person signed out on
 * purpose. The tournament gate asks the server again when the identity goes
 * away mid-round (REL-16), which signs the phone in anonymously; after a
 * sign-out the person asked for, that left a new anonymous user behind every
 * time.
 */
export function signedOutOnPurpose(): boolean {
  return signingOut
}

/**
 * Signs this device out. True once the stored session is gone; false while
 * it is still there. With no signal and an expired token auth-js cannot load
 * the session to end it, returns an error and keeps it: that used to read as
 * done, and the caller wiped the boards saved on the phone of a person who
 * was still signed in.
 *
 * It waits past auth-js's own logout request (SIGN_OUT_TIMEOUT_MS), so lie-fi
 * and a slow server get the real outcome. auth-js can still end the session
 * after that (an expired token whose refresh is still retrying): the flag
 * stays up until auth-js is done, so the gate never starts an anonymous user
 * for it, and `whenLate` does what the caller did not get to do (clear what
 * the phone kept of that person, and say so).
 */
export function signOut(whenLate?: () => void | Promise<void>): Promise<boolean> {
  const seq = ++signOutSeq
  // Before auth-js starts: it announces the session going away (and may refresh it first) inside its own signOut.
  signingOut = true
  leaving = useAuth.getState().user?.id ?? storedUid()
  return new Promise<boolean>((resolve) => {
    /** What the caller was told, once it was: the session gone, or still there. */
    let told: boolean | null = null
    const tell = (gone: boolean) => {
      told = gone
      resolve(gone)
    }
    const timer = setTimeout(() => tell(!hasStoredSession()), SIGN_OUT_TIMEOUT_MS)
    const settle = async () => {
      clearTimeout(timer)
      const gone = !hasStoredSession()
      // The caller stopped waiting and said the session was still there.
      const late = told === false
      if (told === null) tell(gone)
      // A newer sign-out owns the flag and what comes after.
      if (seq !== signOutSeq) return
      // auth-js is done: from here on any session is a new sign-in, the same account's too.
      leaving = null
      if (!gone) signingOut = false
      else if (late) {
        try {
          await whenLate?.()
        } catch {
          // Best effort, like the cleanup it stands for.
        }
      }
    }
    let ending: Promise<unknown>
    try {
      ending = supabase().auth.signOut()
    } catch (e) {
      ending = Promise.reject(e)
    }
    // Judged by what is left on the device, either way.
    void ending.then(settle, settle)
  })
}
