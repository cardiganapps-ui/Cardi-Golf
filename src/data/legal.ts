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

interface Stored {
  /** Accepted on this phone by `uid`, not yet on the server: it goes only under that user. */
  pending?: { uid: string; context: LegalContext; versions: LegalVersions; at: number }
  /** What the server holds for this user, as last read: spares a request on every open. */
  seen?: { uid: string; privacy: string | null; terms: string | null }
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

function write(v: Stored) {
  try {
    if (v.pending || v.seen) localStorage.setItem(KEY, JSON.stringify(v))
    else localStorage.removeItem(KEY)
  } catch {
    /* private mode: the next consent point records it again */
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
  const me = await signedIn()
  if (!me) return false
  write({ ...read(), pending: { uid: me.uid, context, versions: currentVersions(), at: Date.now() } })
  return flushLegal()
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
  write({ pending, seen: seen ?? now.seen })
  return !pending
}

async function sendPending(): Promise<boolean> {
  const p = read().pending
  if (!p) return true
  if (Date.now() - p.at > PENDING_MS) return dropPending(p)
  const me = await signedIn()
  if (!me) return false
  if (me.uid !== p.uid) return dropPending(p)
  try {
    const res = await supabase().rpc('accept_legal', {
      p_privacy: p.versions.privacy,
      p_terms: p.versions.terms,
      p_context: p.context,
      p_accepted_at: new Date(p.at).toISOString(),
    })
    if (res.error) {
      // Refused for what it is (a malformed version, no session): sending it again changes nothing.
      if (res.error.code === '22023' || res.error.code === '42501') dropPending(p)
      return false
    }
    // Signed out (or another user) while it was out: what came back is not the phone's to keep.
    if ((await signedIn())?.uid !== p.uid) return dropPending(p, read().seen)
    const mine = res.data as MyAcceptances
    return dropPending(p, { uid: p.uid, privacy: mine.privacy?.version ?? null, terms: mine.terms?.version ?? null })
  } catch {
    return false
  }
}

/**
 * Which documents to show this user again: those whose newest accepted
 * version is older than the one the app shows. An account with no record
 * (signed in from an email link, or before 0038) is shown both, once; an
 * anonymous user with none has only opened a link, and its first consent
 * point (the PIN) records it. Null when it can't tell (no session, no signal,
 * a server without 0038).
 */
export async function legalUpdate(): Promise<LegalChange | null> {
  const me = await signedIn()
  if (!me) return null
  const cur = currentVersions()
  const stored = read()
  const none = { privacy: false, terms: false }
  const judge = (seen: { privacy: string | null; terms: string | null }): LegalChange => {
    if (seen.privacy == null && seen.terms == null) return me.anonymous ? none : { privacy: true, terms: true, first: true }
    return {
      privacy: seen.privacy == null || compareVersions(seen.privacy, cur.privacy) < 0,
      terms: seen.terms == null || compareVersions(seen.terms, cur.terms) < 0,
    }
  }
  // What waits to be sent for this user already says yes to what is on screen.
  if (stored.pending?.uid === me.uid && stored.pending.versions.privacy === cur.privacy && stored.pending.versions.terms === cur.terms) return none
  // What the server said last time, when it can't have changed: up to date, or an anonymous phone that never accepted.
  if (stored.seen?.uid === me.uid) {
    const up = stored.seen.privacy === cur.privacy && stored.seen.terms === cur.terms
    if (up || (me.anonymous && stored.seen.privacy == null && stored.seen.terms == null)) return judge(stored.seen)
  }
  try {
    const res = await supabase().rpc('my_legal_acceptances')
    if (res.error) return null
    const mine = res.data as MyAcceptances
    const seen = { uid: me.uid, privacy: mine.privacy?.version ?? null, terms: mine.terms?.version ?? null }
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
