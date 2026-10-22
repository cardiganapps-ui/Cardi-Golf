/**
 * Which version of the notice and the terms this person accepted (TRUST-05,
 * migration 0038). Every place that takes data shows the consent line before
 * the action; once the action goes through (a PIN, an account's code, an
 * organizer's sign-in, a Ronda rápida), the versions on screen are recorded
 * for whoever is signed in. A phone without an account records them under its
 * anonymous user, which is who entered with the PIN.
 *
 * The acceptance waits on the phone (`localStorage`), tied to that user,
 * until the server takes it (no signal, a server without 0038), with the
 * time it was given. When a version changes, or an account has no record
 * yet, `legalUpdate()` says which, and the shell shows it until «Entendido»
 * (LegalUpdate).
 *
 * An account's sign-up also says the person is 18 or older (TRUST-13): the
 * check under the consent line marks it on the phone (`sayAdult`, kept an
 * hour, so a Google round trip keeps it), and the acceptance that follows
 * carries it to the server as a record of its own (`confirm_adult`, 0070).
 */
import { supabase } from '../lib/supabase'
import { t } from '../i18n/es-MX'
import { hasStoredSession, useAuth } from './auth'

export type LegalContext = 'pin' | 'account' | 'organizer' | 'quick' | 'update'
export interface LegalVersions {
  privacy: string
  terms: string
}
type Accepted = { version: string; acceptedAt: string } | null
export interface MyAcceptances {
  privacy: Accepted
  terms: Accepted
}

const KEY = 'cardi-golf:legal'
/** An acceptance nobody could send in a week is dropped: the next consent point records it again. */
const PENDING_MS = 7 * 24 * 60 * 60 * 1000
/** The age check counts for the sign-in that follows it: an hour covers a code from the email or a Google round trip. */
const ADULT_MS = 60 * 60 * 1000

interface Stored {
  /** Accepted on this phone by `uid`, not yet on the server: it goes only under that user. `adult`: he also said he is 18 or older. */
  pending?: { uid: string; context: LegalContext; versions: LegalVersions; at: number; adult?: boolean }
  /** «Confirmo que tengo 18 años o más», checked on this phone before a sign-in that has not happened yet. */
  adult?: { at: number }
  /**
   * What the server holds for this user, as last read: spares a request on
   * every open. `claimed`: for an anonymous user with no record, whether it
   * holds a PIN claim (it entered a tournament: asked) or not (it only
   * opened a link: not asked).
   */
  seen?: { uid: string; privacy: string | null; terms: string | null; claimed?: boolean }
}

/** Which documents to show again; `first`: an account with no record at all, shown both. */
export interface LegalChange {
  privacy: boolean
  terms: boolean
  first?: boolean
}

export function currentVersions(): LegalVersions {
  return { privacy: t.legal.privacy.version, terms: t.legal.terms.version }
}

/**
 * Orders two versions: by date, then by the «.N» after it, so «2026-10-12.10»
 * comes after «.9» (the server orders them the same way).
 */
export function compareVersions(a: string, b: string): number {
  const [da = '', na = '0'] = a.split('.')
  const [db = '', nb = '0'] = b.split('.')
  if (da !== db) return da < db ? -1 : 1
  return Number(na) - Number(nb)
}

function read(): Stored {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as Stored) : {}
  } catch {
    return {}
  }
}

/** False when the browser keeps nothing (private mode, storage full). */
function write(v: Stored): boolean {
  try {
    if (v.pending || v.seen || v.adult) localStorage.setItem(KEY, JSON.stringify(v))
    else localStorage.removeItem(KEY)
    return true
  } catch {
    return false
  }
}

/** Who a call made now goes out as: the session supabase-js holds, which may be ahead of the shell's state right after a sign-in. */
async function signedIn(): Promise<{ uid: string; anonymous: boolean } | null> {
  if (!useAuth.getState().user && !hasStoredSession()) return null
  try {
    const { data } = await supabase().auth.getSession()
    const user = data.session?.user
    return user ? { uid: user.id, anonymous: user.is_anonymous === true } : null
  } catch {
    return null
  }
}

let flushing: Promise<boolean> | null = null

/**
 * The person went ahead under the consent line: record the versions shown,
 * for the user signed in now (every caller acts with a session), at once or
 * as soon as the server can take it.
 */
export async function acceptLegal(context: LegalContext): Promise<boolean> {
  try {
    return await accept(context)
  } catch {
    // Callers don't wait on it: a record, never a failure of the step it follows.
    return false
  }
}

/**
 * The person checked «Confirmo que tengo 18 años o más» before signing in or
 * up (TRUST-13): the acceptance that follows the sign-in carries it.
 */
export function sayAdult() {
  write({ ...read(), adult: { at: Date.now() } })
}

async function accept(context: LegalContext): Promise<boolean> {
  const me = await signedIn()
  if (!me) return false
  const stored = read()
  const adult = !me.anonymous && !!stored.adult && Date.now() - stored.adult.at < ADULT_MS
  const pending = {
    uid: me.uid,
    context,
    versions: currentVersions(),
    at: Date.now(),
    ...(adult ? { adult: true } : {}),
  }
  // Said once, for this sign-in: the next one asks again.
  if (stored.adult) write({ ...stored, adult: undefined })
  // A browser that keeps nothing: send it now, once, rather than lose it.
  if (!write({ ...read(), pending })) return send(pending)
  return flushLegal()
}

/** One call for `p`, under its own user (the server refuses another): what the server holds after it, or why not. */
async function call(p: NonNullable<Stored['pending']>): Promise<{ mine: MyAcceptances } | { refused: boolean }> {
  try {
    const res = await supabase().rpc('accept_legal', {
      p_privacy: p.versions.privacy,
      p_terms: p.versions.terms,
      p_context: p.context,
      p_age_seconds: Math.max(0, Math.round((Date.now() - p.at) / 1000)),
      p_user: p.uid,
    })
    // Refused for what it is (a malformed version, another user's, no session): sending it again changes nothing.
    if (res.error) return { refused: res.error.code === '22023' || res.error.code === '42501' }
    const mine = res.data as MyAcceptances | null
    // An answer this app can't read: try again later.
    if (!mine || typeof mine !== 'object') return { refused: false }
    // The age, as a record of its own. A server without 0070 has nowhere to keep it: the acceptance still stands.
    if (p.adult) {
      try {
        await supabase().rpc('confirm_adult', {
          p_terms: p.versions.terms,
          p_context: p.context,
          p_age_seconds: Math.max(0, Math.round((Date.now() - p.at) / 1000)),
          p_user: p.uid,
        })
      } catch {
        // No signal now: the acceptance went, and the age was said on the phone; the record waits for none.
      }
    }
    return { mine }
  } catch {
    return { refused: false }
  }
}

async function send(p: NonNullable<Stored['pending']>): Promise<boolean> {
  const r = await call(p)
  return 'mine' in r
}

/**
 * Sends what waits, if anything, under the user who accepted it; a waiting
 * acceptance of another user is dropped (the phone changed hands, or its
 * session was replaced). True when nothing waits any more. Never throws: an
 * acceptance is a record, not a step the person must wait on.
 */
export function flushLegal(): Promise<boolean> {
  // One at a time: a call made meanwhile runs after it, for what is left to send.
  if (flushing) return flushing.then(() => flushLegal())
  const run = sendPending().finally(() => {
    if (flushing === run) flushing = null
  })
  flushing = run
  return run
}

/** Drops the waiting acceptance `p`, unless a newer one took its place meanwhile. */
function dropPending(p: NonNullable<Stored['pending']>, seen?: Stored['seen']) {
  const now = read()
  const pending = now.pending && now.pending.at !== p.at ? now.pending : undefined
  write({ pending, seen: seen ?? now.seen, adult: now.adult })
  return !pending
}

async function sendPending(): Promise<boolean> {
  const p = read().pending
  if (!p) return true
  // Too old to send, or not something this app wrote.
  if (!Number.isFinite(p.at) || typeof p.uid !== 'string' || !p.versions || Date.now() - p.at > PENDING_MS)
    return dropPending(p)
  const me = await signedIn()
  if (!me) return false
  if (me.uid !== p.uid) return dropPending(p)
  const r = await call(p)
  if (!('mine' in r)) {
    if (r.refused) dropPending(p)
    return false
  }
  // Signed out (or another user) while it was out: what came back is not the phone's to keep.
  if ((await signedIn())?.uid !== p.uid) return dropPending(p, read().seen)
  return dropPending(p, { uid: p.uid, privacy: r.mine.privacy?.version ?? null, terms: r.mine.terms?.version ?? null })
}

/** Whether this phone entered a tournament with a PIN (its claim, if any; RLS shows only its own). */
async function holdsClaim(): Promise<boolean | null> {
  try {
    const { data, error } = await supabase().from('device_sessions').select('player_id').maybeSingle()
    return error ? null : data != null
  } catch {
    return null
  }
}

/**
 * Which documents to show this user again: those whose newest accepted
 * version is older than the one the app shows. With no record at all, both,
 * for an account (signed in from an email link, or before 0038) and for a
 * phone that entered with a PIN (before 0038, or its acceptance never got
 * through); not for an anonymous user that only sent a PIN that did not take
 * (or, on a bundle before 0040, only opened a link): its first consent point
 * that goes through (the PIN) records it. Null when it can't tell (no session, no
 * signal, a server without 0038).
 */
export async function legalUpdate(): Promise<LegalChange | null> {
  const me = await signedIn()
  if (!me) return null
  const cur = currentVersions()
  const stored = read()
  const none = { privacy: false, terms: false }
  const judge = (seen: { privacy: string | null; terms: string | null; claimed?: boolean }): LegalChange => {
    if (seen.privacy == null && seen.terms == null)
      return me.anonymous && !seen.claimed ? none : { privacy: true, terms: true, first: true }
    return {
      privacy: seen.privacy == null || compareVersions(seen.privacy, cur.privacy) < 0,
      terms: seen.terms == null || compareVersions(seen.terms, cur.terms) < 0,
    }
  }
  // What waits to be sent for this user already says yes to what is on screen.
  if (
    stored.pending?.uid === me.uid &&
    stored.pending.versions.privacy === cur.privacy &&
    stored.pending.versions.terms === cur.terms
  )
    return none
  // What the server said last time, when it can't have changed: up to date, or an anonymous phone that never accepted.
  if (stored.seen?.uid === me.uid) {
    const up = stored.seen.privacy === cur.privacy && stored.seen.terms === cur.terms
    if (
      up ||
      (me.anonymous && stored.seen.privacy == null && stored.seen.terms == null && stored.seen.claimed === false)
    )
      return judge(stored.seen)
  }
  try {
    const res = await supabase().rpc('my_legal_acceptances')
    if (res.error) return null
    const mine = res.data as MyAcceptances | null
    if (!mine || typeof mine !== 'object') return null
    const seen: NonNullable<Stored['seen']> = {
      uid: me.uid,
      privacy: mine.privacy?.version ?? null,
      terms: mine.terms?.version ?? null,
    }
    if (me.anonymous && seen.privacy == null && seen.terms == null) {
      const claimed = await holdsClaim()
      if (claimed == null) return null
      seen.claimed = claimed
    }
    write({ ...read(), seen })
    return judge(seen)
  } catch {
    return null
  }
}

/**
 * Signing out forgets the person here: what the phone read of them, and an
 * acceptance still waiting (it would be dropped anyway under another user).
 */
export function forgetLegal() {
  write({})
}
