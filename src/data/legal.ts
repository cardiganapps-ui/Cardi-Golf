/**
 * Which version of the notice and the terms this person accepted (TRUST-05,
 * migration 0038). Every place that takes data shows the consent line before
 * the action; once the action goes through (a PIN, an account's code, an
 * organizer's sign-in, a Ronda rápida), the versions on screen are recorded
 * for whoever is signed in. A phone without an account records them under its
 * anonymous user, which is who entered with the PIN.
 *
 * The acceptance waits on the phone (`localStorage`) until the server takes
 * it: no signal, no session yet (an account whose email code is still to be
 * typed), or a server without 0038. When a version changes, `legalUpdate()`
 * says which, and the shell shows it once (LegalUpdate).
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
/** An acceptance nobody could send in a week is dropped: every sign-in passes a consent line of its own. */
const PENDING_MS = 7 * 24 * 60 * 60 * 1000

interface Stored {
  /** Accepted on this phone, not yet on the server. */
  pending?: { context: LegalContext; versions: LegalVersions; at: number }
  /** What the server holds for this user, as last read: spares a request on every open. */
  seen?: { uid: string; privacy: string | null; terms: string | null }
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
async function signedInUid(): Promise<string | null> {
  if (!useAuth.getState().user && !hasStoredSession()) return null
  try {
    const { data } = await supabase().auth.getSession()
    return data.session?.user.id ?? null
  } catch {
    return null
  }
}

let flushing: Promise<boolean> | null = null

/** The person went ahead under the consent line: record the versions shown, now or as soon as the server can take them. */
export function acceptLegal(context: LegalContext): Promise<boolean> {
  write({ ...read(), pending: { context, versions: currentVersions(), at: Date.now() } })
  return flushLegal()
}

/**
 * Sends what waits, if anything and if someone is signed in. True when
 * nothing waits any more. Never throws: an acceptance is a record, not a
 * step the person must wait on.
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

async function sendPending(): Promise<boolean> {
  const stored = read()
  const p = stored.pending
  if (!p) return true
  if (Date.now() - p.at > PENDING_MS) {
    write({ ...stored, pending: undefined })
    return true
  }
  const uid = await signedInUid()
  if (!uid) return false
  try {
    const res = await supabase().rpc('accept_legal', { p_privacy: p.versions.privacy, p_terms: p.versions.terms, p_context: p.context })
    if (res.error) {
      // Refused for what it is (a malformed version, no session): sending it again changes nothing.
      if (res.error.code === '22023' || res.error.code === '42501') write({ ...read(), pending: undefined })
      return false
    }
    const mine = res.data as MyAcceptances
    const now = read()
    // A newer acceptance made while this one was out stays to be sent.
    const pending = now.pending && now.pending.at !== p.at ? now.pending : undefined
    write({ pending, seen: { uid, privacy: mine.privacy?.version ?? null, terms: mine.terms?.version ?? null } })
    return !pending
  } catch {
    return false
  }
}

/**
 * Which documents changed since this user last accepted them: those whose
 * newest accepted version is older than the one the app shows. Nothing for a
 * user who never accepted anything (a link opened, no PIN yet): the consent
 * line comes first, at the step where they give their data. Null when it
 * can't tell (no session, no signal, a server without 0038).
 */
export async function legalUpdate(): Promise<{ privacy: boolean; terms: boolean } | null> {
  const uid = await signedInUid()
  if (!uid) return null
  const cur = currentVersions()
  const stored = read()
  const outdated = (seen: { privacy: string | null; terms: string | null }) => ({
    privacy: seen.privacy != null && compareVersions(seen.privacy, cur.privacy) < 0,
    terms: seen.terms != null && compareVersions(seen.terms, cur.terms) < 0,
  })
  // What waits to be sent already says yes to what is on screen.
  if (stored.pending && stored.pending.versions.privacy === cur.privacy && stored.pending.versions.terms === cur.terms) return { privacy: false, terms: false }
  if (stored.seen?.uid === uid && stored.seen.privacy === cur.privacy && stored.seen.terms === cur.terms) return { privacy: false, terms: false }
  try {
    const res = await supabase().rpc('my_legal_acceptances')
    if (res.error) return null
    const mine = res.data as MyAcceptances
    const seen = { uid, privacy: mine.privacy?.version ?? null, terms: mine.terms?.version ?? null }
    write({ ...read(), seen })
    return outdated(seen)
  } catch {
    return null
  }
}

/**
 * Signing out forgets the person here: what the phone read of them, and an
 * acceptance still waiting, which must not be sent under whoever signs in
 * next (their own consent line records theirs).
 */
export function forgetLegal() {
  write({})
}
