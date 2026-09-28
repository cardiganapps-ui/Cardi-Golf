/**
 * Auth (CLAUDE.md §7): organizers sign in with email; players get an
 * anonymous session and claim a player with a PIN.
 */
import type { Session, User } from '@supabase/supabase-js'
import { create } from 'zustand'
import { supabase, supabaseConfigured } from '../lib/supabase'

interface AuthState {
  ready: boolean
  session: Session | null
  user: User | null
  isAnonymous: boolean
  init(): Promise<void>
}

let inited = false

export const useAuth = create<AuthState>((set) => ({
  ready: !supabaseConfigured,
  session: null,
  user: null,
  isAnonymous: false,
  async init() {
    if (inited || !supabaseConfigured) return
    inited = true
    const sb = supabase()
    const { data } = await sb.auth.getSession()
    set({ ready: true, session: data.session, user: data.session?.user ?? null, isAnonymous: !!data.session?.user?.is_anonymous })
    sb.auth.onAuthStateChange((_evt, session) => {
      set({ session, user: session?.user ?? null, isAnonymous: !!session?.user?.is_anonymous })
    })
  },
}))

/** A session of any kind (anonymous if none). Used when opening a tournament link. */
export async function ensureSession(): Promise<Session> {
  const sb = supabase()
  const { data } = await sb.auth.getSession()
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
