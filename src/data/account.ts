/**
 * Player accounts: "Guarda tu perfil" and "Entrar a mi perfil" (CLAUDE.md §7,
 * migration 0013). Codes first: every email carries a 6-digit code, so the
 * whole flow stays inside the installed app.
 *
 * - An anonymous device converts in place (`updateUser({ email })`, then the
 *   `email_change` code): same uid, so its PIN claim and outbox stay valid.
 * - An address that already has an account signs in with a code instead; the
 *   device's PIN claim travels in a one-use link token (profiles.ts).
 * - Google: an anonymous device adds the identity (`linkIdentity`); otherwise
 *   it is a plain OAuth sign-in. Hidden in the iOS home-screen app, where the
 *   OAuth return lands in Safari instead of the app.
 */
import type { AuthError } from '@supabase/supabase-js'
import { t } from '../i18n/es-MX'
import { humanError, UserError } from '../lib/humanError'
import { authSettings, supabase } from '../lib/supabase'
import { useOutbox } from './outbox'
import { signOut } from './auth'
import { claimNameHint, ensureMyProfile, linkMyProfile, myDeviceClaim, redeemStashedToken, stashLinkToken, stashedNameHint, useMyProfile, type LinkResult } from './profiles'

/** Only same-app paths are followed after signing in. */
export function safeNext(raw: string | null): string {
  return raw && raw.startsWith('/') && !raw.startsWith('//') ? raw : '/'
}

/** `convert`: the anonymous device becomes the account; `signin`: a code for an existing (or brand-new) account. */
export type CodeMode = 'convert' | 'signin'

const back = () => `${window.location.origin}/entrar`

function emailTaken(e: AuthError): boolean {
  return e.code === 'email_exists' || /already (been )?registered/i.test(e.message)
}

/** Step 1: sends the code and says which kind it was. */
export async function sendProfileCode(email: string): Promise<CodeMode> {
  const sb = supabase()
  const { data } = await sb.auth.getSession()
  if (data.session?.user?.is_anonymous) {
    const { error } = await sb.auth.updateUser({ email }, { emailRedirectTo: back() })
    if (!error) return 'convert'
    if (!emailTaken(error)) throw error
    // The address has an account already: sign in to it and bring this device's player along.
    if (useOutbox.getState().pending > 0) throw new UserError(t.account.syncFirst)
    await stashLinkToken()
  }
  const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: true, emailRedirectTo: back() } })
  if (error) throw error
  return 'signin'
}

export async function resendProfileCode(email: string, mode: CodeMode) {
  const sb = supabase()
  const { error } =
    mode === 'convert'
      ? await sb.auth.updateUser({ email }, { emailRedirectTo: back() })
      : await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: true, emailRedirectTo: back() } })
  if (error) throw error
}

/** Step 2: the code from the email. */
export async function confirmProfileCode(email: string, code: string, mode: CodeMode) {
  const { error } = await supabase().auth.verifyOtp({ email, token: code.trim(), type: mode === 'convert' ? 'email_change' : 'email' })
  if (error) throw error
}

/**
 * After any sign-in: the profile (created the first time), then the player
 * this device played as (a stashed token, or the device's own PIN claim when
 * it converted in place) saved into the profile.
 */
export async function finishProfileSignIn(): Promise<{ firstTime: boolean; link: LinkResult | null }> {
  // A new profile starts with the names of the player it is saved from (the stashed one, or this device's).
  const claim = await myDeviceClaim()
  const hint = stashedNameHint() ?? (claim ? await claimNameHint(claim.playerId) : null)
  // "First time" = never edited: the shell may have created the profile a moment ago, on the session change.
  const profile = await ensureMyProfile(hint)
  let link = await redeemStashedToken()
  if (!link && claim) link = await linkMyProfile(claim.playerId)
  await useMyProfile.getState().load()
  return { firstTime: profile.updatedAt === profile.createdAt, link }
}

/**
 * Readable Spanish for the auth errors a person can hit here. humanError knows
 * the auth codes; in this flow a refused credential is the emailed code, and
 * any rate limit is the one on sending codes.
 */
export function accountError(e: unknown): string {
  const status = (e as Partial<AuthError> | undefined)?.status
  if (status === 429) return t.account.tooFast
  // In these flows a refusal with no code is the emailed code, expired or wrong.
  if (status === 403 && !(e as Partial<AuthError>).code) return t.auth.badCode
  return humanError(e, { invalid_credentials: t.auth.badCode })
}

// ---------------------------------------------------------------------------
// Google
// ---------------------------------------------------------------------------
/** The iOS home-screen app: OAuth would come back in Safari, not here. */
export function isIosStandalone(): boolean {
  return typeof navigator !== 'undefined' && (navigator as Navigator & { standalone?: boolean }).standalone === true
}

export async function googleAvailable(): Promise<boolean> {
  if (isIosStandalone()) return false
  const s = await authSettings()
  return s?.external?.google === true
}

const oauthReturn = (next: string) => `${window.location.origin}/perfil/vuelta?next=${encodeURIComponent(next)}`

/** Adds Google to this device's anonymous session, or signs in with it. */
export async function continueWithGoogle(next: string) {
  const sb = supabase()
  const { data } = await sb.auth.getSession()
  if (data.session?.user?.is_anonymous) {
    if (useOutbox.getState().pending > 0) throw new UserError(t.account.syncFirst)
    const { error } = await sb.auth.linkIdentity({ provider: 'google', options: { redirectTo: oauthReturn(next) } })
    if (error) throw error
    return
  }
  const { error } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: oauthReturn(next) } })
  if (error) throw error
}

/** The Google account already belongs to another Polo account: sign in to that one, bringing this device's player. */
export async function signInWithGoogleInstead(next: string) {
  if (useOutbox.getState().pending > 0) throw new UserError(t.account.syncFirst)
  await stashLinkToken()
  const { error } = await supabase().auth.signInWithOAuth({ provider: 'google', options: { redirectTo: oauthReturn(next) } })
  if (error) throw error
}

/** Signing out drops this device's session; not while it still holds unsent scores. */
export async function signOutSafely(): Promise<boolean> {
  if (useOutbox.getState().pending > 0) return false
  await signOut()
  useMyProfile.getState().clear()
  return true
}
