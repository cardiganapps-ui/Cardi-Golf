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
import { create } from 'zustand'
import { t } from '../i18n/es-MX'
import { humanError, UserError } from '../lib/humanError'
import { authSettings, supabase } from '../lib/supabase'
import { unsentWrites } from './outbox'
import { signOut } from './auth'
import { setLastTournament } from './session'
import { cachedTournamentName, clearAllCached } from './snapshotCache'
import { useTournament } from './tournamentStore'
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
    await refuseWithUnsent('switch')
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
    await refuseWithUnsent('switch')
    const { error } = await sb.auth.linkIdentity({ provider: 'google', options: { redirectTo: oauthReturn(next) } })
    if (error) throw error
    return
  }
  const { error } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: oauthReturn(next) } })
  if (error) throw error
}

/** The Google account already belongs to another Polo account: sign in to that one, bringing this device's player. */
export async function signInWithGoogleInstead(next: string) {
  await refuseWithUnsent('switch')
  await stashLinkToken()
  const { error } = await supabase().auth.signInWithOAuth({ provider: 'google', options: { redirectTo: oauthReturn(next) } })
  if (error) throw error
}

/**
 * The name of the tournament with id `tid`: the one open, else the boards
 * saved on the phone, else the name its writes were queued under (Entrar and
 * «no existe» clear the saved boards, and the refusal said «un torneo»).
 */
async function tournamentName(tid: string, queuedAs: string | null): Promise<string | null> {
  const open = useTournament.getState()
  if (open.tournamentId === tid && open.data) return open.data.snapshot.tournament.name
  return (await cachedTournamentName(tid)) ?? queuedAs
}

/**
 * Why this device may not change who it is yet, in words: which tournament
 * still has writes on the phone, and whether they wait for signal or for the
 * PIN. Null: nothing in the way. Counts every tournament (the account checks
 * counted only the one open on screen, and a hole of another tournament went
 * on to wait for a PIN), and said «espera a tener señal» even when no signal
 * would ever send them.
 */
export async function unsentReason(action: 'signOut' | 'switch'): Promise<string | null> {
  const u = unsentWrites()
  if (!u) return null
  const name = await tournamentName(u.tournamentId, u.name)
  return u.waitsFor === 'pin' ? t.account.unsentPin(name, action) : t.account.unsentSignal(name, action)
}
async function refuseWithUnsent(action: 'switch') {
  const reason = await unsentReason(action)
  if (reason) throw new UserError(reason)
}

/** `done`: signed out; otherwise why not, ready to show. */
export type SignOutResult = { done: true } | { done: false; reason: string }

/**
 * A sign-out that ended after its screen had stopped waiting and said the
 * person was still signed in: what the phone kept of them is cleared by then,
 * and the shell takes the phone home and says so (AppShell).
 */
export const useLateSignOut = create<{ at: number | null }>(() => ({ at: null }))

/** What a signed-out person leaves on the phone goes with them: the profile in memory, «Tu último torneo», the saved boards. */
async function forgetSignedOut() {
  useMyProfile.getState().clear()
  setLastTournament(null)
  await clearAllCached()
}

/**
 * Signing out drops this device's session; not while it still holds unsent
 * writes, for any tournament. The boards saved on the phone and «Tu último
 * torneo» go with it: on a shared phone the next person saw the previous
 * one's boards and role until the server answered, and for good with no
 * signal. Only once the session is really gone: with no signal and an
 * expired token it stays, and this used to say it worked and wipe the boards
 * of a person who was still signed in. When it goes only after this said it
 * was still there (lie-fi, an expired token still refreshing), they go then.
 */
export async function signOutSafely(): Promise<SignOutResult> {
  const unsent = await unsentReason('signOut')
  if (unsent) return { done: false, reason: unsent }
  const late = async () => {
    await forgetSignedOut()
    useLateSignOut.setState({ at: Date.now() })
  }
  if (!(await signOut(late))) return { done: false, reason: t.account.signOutNeedsSignal }
  await forgetSignedOut()
  return { done: true }
}
