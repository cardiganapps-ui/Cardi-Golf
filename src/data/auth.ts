/**
 * Auth (CLAUDE.md §7): organizers sign in with email; players get an
 * anonymous session and claim a player with a PIN.
 */
import type { Session, User } from '@supabase/supabase-js'
import { create } from 'zustand'
import { supabase, supabaseConfigured } from '../lib/supabase'
import { withTimeout } from '../lib/timeout'

/** How long startup waits for the stored session before showing a way out. */
export const SESSION_TIMEOUT_MS = 8000

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
    const { data: sub } = sb.auth.onAuthStateChange((_evt, session) => {
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

/** A session of any kind (anonymous if none). Used when opening a tournament link. */
export async function ensureSession(): Promise<Session> {
  const sb = supabase()
  const { data } = await withTimeout(sb.auth.getSession(), SESSION_TIMEOUT_MS, 'sesión')
  if (data.session) return data.session
  const { data: anon, error } = await sb.auth.signInAnonymously()
  if (error || !anon.session) throw error ?? new Error('No se pudo iniciar sesión anónima')
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

export async function signOut() {
  await supabase().auth.signOut()
}
