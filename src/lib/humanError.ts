/**
 * What a person reads when something fails (COPY-04).
 *
 * Raw error text never reaches a screen: not "TypeError: Failed to fetch"
 * under the PIN, not PostgREST's «new row violates row-level security
 * policy…». Every toast, ErrorBox and inline error shows `humanError(e)`;
 * the console keeps the raw error. The rules, in order:
 *
 * 1. Copy written for people passes through: a `UserError` thrown by the
 *    client, and the Spanish sentences our SQL functions raise (`raise
 *    exception '…' using errcode = '42501' | '22023' | '23505' | 'P0001'`).
 *    Postgres's own messages for those codes are lowercase English
 *    («permission denied for…», «duplicate key value…»), so a message that
 *    starts like a sentence and reads like one is ours. humanError.test.ts
 *    runs every raise in supabase/migrations through this.
 * 2. The caller's copy for a code (`overrides`, e.g. a 23505 on a form).
 * 3. No signal, a timeout, an expired session, the auth codes, the Postgres
 *    codes, the HTTP status.
 * 4. Anything else: the generic line with a short reference for support (a
 *    code, a status or the error's class), never the message itself.
 *
 * A string is copy already (state that holds `humanError(e)`, or a line from
 * `t`), so it passes unless it is plainly technical text. That makes
 * `humanError(humanError(e)) === humanError(e)`.
 */
import { t } from '../i18n/es-MX'

const E = t.errors

/** An error whose message is already copy for people: humanError shows it as is. */
export class UserError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UserError'
  }
}

/** Copy for one context, keyed by error code: a SQLSTATE such as '23505', or an auth code. */
export type ErrorOverrides = Readonly<Record<string, string>>

interface Parts {
  name: string
  message: string
  code: string
  /** HTTP status when the error carries one; 0 means the request never got an answer. */
  status: number | null
}

function parts(e: unknown): Parts {
  if (typeof e === 'string') return { name: '', message: e, code: '', status: null }
  if (!e || typeof e !== 'object') return { name: '', message: '', code: '', status: null }
  const o = e as Record<string, unknown>
  const status = typeof o.status === 'number' ? o.status : Number(o.statusCode) || null
  return {
    name: typeof o.name === 'string' ? o.name : '',
    message: typeof o.message === 'string' ? o.message : '',
    // DOMException's numeric `code` is legacy noise; only string codes mean something here.
    code: typeof o.code === 'string' ? o.code : '',
    status,
  }
}

/** Short codes the server raises (or the client throws) instead of a sentence. */
const KNOWN = new Map<string, string>([
  ['Sin sesión', E.session],
  ['wrong-tournament', t.admin.data.wrongTournament],
])

/** The SQLSTATEs our own `raise exception … using errcode` use (P0001 is a bare raise). */
const RAISED = new Set(['42501', '22023', '23505', 'P0001'])

/** Text no person should read: English from Postgres, PostgREST, the browser or JavaScript. */
const TECHNICAL =
  /row-level security|permission denied|violates|duplicate key|null value|invalid input|\bsyntax\b|schema cache|\bconstraint\b|\brelation\b|\bcolumn\b|\bfunction\b|JWT|JWS|PGRST|Failed to fetch|Load failed|NetworkError|\bundefined\b|\bnull\b|\bCannot |\bUnexpected\b|\b[A-Z][A-Za-z]*Error\b|^Error\b|[a-z]+_[a-z]+/

/** The reference `unknownRef` adds (a class name or a code): not the technical part of a line. */
const REF = /\(ref\. [^)]*\)/

function isServerCopy(p: Parts): boolean {
  return RAISED.has(p.code) && /^[A-ZÁÉÍÓÚÑ¿¡«]/.test(p.message) && !TECHNICAL.test(p.message)
}

const NETWORK = /Failed to fetch|Load failed|NetworkError|Network request failed|network error|ERR_INTERNET_DISCONNECTED|ERR_NETWORK|^FetchError\b/i

/** RequestTimeout: fetchWithTimeout (supabase.ts); TimeoutError: withTimeout; AbortError: an abort without a reason. */
const TIMEOUT_NAMES = new Set(['RequestTimeout', 'TimeoutError', 'AbortError'])
const TIMEOUT = /^(RequestTimeout|TimeoutError|AbortError)\b|signal is aborted|aborted a request|operation was aborted|timed? ?out|statement timeout/i

const SESSION_NAMES = new Set(['AuthSessionMissingError', 'AuthInvalidJwtError', 'AuthInvalidTokenResponseError'])
const SESSION_CODES = new Set([
  'PGRST301',
  'PGRST302',
  'PGRST303',
  'session_not_found',
  'session_expired',
  'refresh_token_not_found',
  'refresh_token_already_used',
  'bad_jwt',
  'invalid_jwt',
  'no_authorization',
])
const SESSION = /JWT|JWS|Auth session missing|not authenticated|unauthenticated/i

/** Supabase Auth's error codes a person can hit (sign-in, codes, passwords). */
const AUTH = new Map<string, string>([
  ['invalid_credentials', E.wrongPassword],
  ['email_not_confirmed', E.emailNotConfirmed],
  ['user_already_exists', E.emailTaken],
  ['email_exists', E.emailTaken],
  ['weak_password', E.weakPassword],
  ['same_password', E.samePassword],
  ['otp_expired', t.auth.badCode],
  ['over_email_send_rate_limit', t.account.tooFast],
  ['over_request_rate_limit', E.tooMany],
  ['email_address_invalid', t.account.badEmail],
  ['validation_failed', t.account.badEmail],
  ['identity_already_exists', t.account.googleTaken],
  ['user_banned', E.banned],
])

const INVALID_CODES = new Set(['22023', '22P02', '22001', '22003', '22007', '22008', '23502', '23514'])

function fromCode(p: Parts): string | null {
  const { code, message } = p
  if (code === '42501' || /row-level security|permission denied/i.test(message)) return E.permission
  if (code === '23505' || /duplicate key/i.test(message)) return E.duplicate
  if (code === '23503' || /foreign key/i.test(message)) return E.linked
  if (INVALID_CODES.has(code) || /invalid input|check constraint|null value in column|value too long|out of range/i.test(message)) return E.invalid
  return null
}

function offline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}

function generic(p: Parts): string {
  const raw = p.code || (p.status ? `HTTP ${p.status}` : '') || (p.name && p.name !== 'Error' && p.name !== 'UserError' ? p.name : '')
  const ref = raw.replace(/[^\w. -]/g, '').slice(0, 40).trim()
  return ref ? E.unknownRef(ref) : E.unknown
}

/** Spanish copy for any error: show this, log the error itself. */
export function humanError(e: unknown, overrides: ErrorOverrides = {}): string {
  if (e instanceof UserError) return e.message
  const p = parts(e)
  const isString = typeof e === 'string'
  const known = KNOWN.get(p.message.trim())
  if (known) return known
  if (!isString && isServerCopy(p)) return p.message
  const own = p.code && Object.hasOwn(overrides, p.code) ? overrides[p.code] : undefined
  if (own) return own
  // A server answer (a code or a status) proves the phone has signal.
  const answered = !!p.code || (p.status ?? 0) > 0
  if (NETWORK.test(p.message) || (p.name === 'AuthRetryableFetchError' && !answered) || (!isString && !answered && offline())) return E.network
  if (TIMEOUT_NAMES.has(p.name) || TIMEOUT.test(p.message) || p.code === '57014' || p.status === 408 || p.status === 504) return E.timeout
  if (SESSION_NAMES.has(p.name) || SESSION_CODES.has(p.code) || SESSION.test(p.message) || p.status === 401) return E.session
  const auth = AUTH.get(p.code)
  if (auth) return auth
  const coded = fromCode(p)
  if (coded) return coded
  if (p.status === 403) return E.permission
  if (p.status === 429) return E.tooMany
  if (p.status != null && p.status >= 500) return E.server
  if (isString && p.message.trim() && !TECHNICAL.test(p.message.replace(REF, ''))) return p.message
  return generic(p)
}
