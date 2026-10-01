/**
 * COPY-04: what a person reads when something fails. The inputs are the real
 * strings and shapes the app meets: the browsers' fetch failures, supabase-js
 * errors as PostgREST and Auth return them, `ApiError` as api.ts builds it,
 * the client's own timeouts, and every sentence our SQL functions raise.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { AuthApiError, AuthRetryableFetchError, AuthSessionMissingError, AuthWeakPasswordError, PostgrestError } from '@supabase/supabase-js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../data/api'
import { t } from '../i18n/es-MX'
import { RouteError } from './courseApi'
import { RequestTimeoutError } from './fetchWithTimeout'
import { humanError, UserError } from './humanError'
import { TimeoutError } from './timeout'

const E = t.errors

/** How postgrest-js reports a fetch that never got an answer (toTransportFailure / the builder's catch). */
const transport = (name: string, message: string) => new PostgrestError({ message: `${name}: ${message}`, details: `${name}: ${message}\n    at fetch`, hint: '', code: '' })

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('no signal', () => {
  it.each([
    ['Chrome', new TypeError('Failed to fetch')],
    ['Safari', new TypeError('Load failed')],
    ['Firefox', new TypeError('NetworkError when attempting to fetch resource.')],
  ])('%s fetch failure', (_browser, e) => {
    expect(humanError(e)).toBe(E.network)
  })

  it('the same failures after supabase-js wraps them', () => {
    expect(humanError(transport('TypeError', 'Failed to fetch'))).toBe(E.network)
    expect(humanError(ApiError.from(transport('TypeError', 'Load failed')))).toBe(E.network)
    expect(humanError(new ApiError('TypeError: NetworkError when attempting to fetch resource.', ''))).toBe(E.network)
    expect(humanError(new AuthRetryableFetchError('Failed to fetch', 0))).toBe(E.network)
  })

  it('a phone that is offline, whatever the error says', () => {
    vi.stubGlobal('navigator', { onLine: false })
    expect(humanError(new Error('something odd'))).toBe(E.network)
    // An answer from the server proves there is signal: its copy stands.
    expect(humanError(new ApiError('Solo el Comité puede corregir tarjetas', '42501'))).toBe('Solo el Comité puede corregir tarjetas')
    // A line of copy is not an error to reclassify.
    expect(humanError(t.errors.offlineFirstOpen)).toBe(t.errors.offlineFirstOpen)
  })
})

describe('no answer in time', () => {
  it('the deadline supabase.ts puts on every request (REL-14)', () => {
    expect(humanError(new RequestTimeoutError(12_000))).toBe(E.timeout)
    // fetch rejects with the abort reason; postgrest-js prefixes its name.
    expect(humanError(transport('RequestTimeout', 'Sin respuesta del servidor en 12 s'))).toBe(E.timeout)
    expect(humanError(new ApiError('RequestTimeout: Sin respuesta del servidor en 12 s', ''))).toBe(E.timeout)
  })

  it('withTimeout, a bare abort, a statement timeout, a gateway timeout', () => {
    expect(humanError(new TimeoutError('perfil', 10_000))).toBe(E.timeout)
    expect(humanError(new DOMException('signal is aborted without reason', 'AbortError'))).toBe(E.timeout)
    expect(humanError(transport('AbortError', 'The operation was aborted.'))).toBe(E.timeout)
    expect(humanError(new ApiError('canceling statement due to statement timeout', '57014'))).toBe(E.timeout)
    expect(humanError({ status: 504 })).toBe(E.timeout)
  })
})

describe('an expired or missing session', () => {
  it.each([
    ['PostgREST JWT expired', new PostgrestError({ message: 'JWT expired', details: null as unknown as string, hint: null as unknown as string, code: 'PGRST303' })],
    ['Auth session missing', new AuthSessionMissingError()],
    ['our raise', new ApiError('Sin sesión', '42501')],
    ['a 401', { status: 401, message: 'Unauthorized' }],
    ['unauthenticated', new Error('unauthenticated')],
    ['refresh token gone', new AuthApiError('Invalid Refresh Token: Refresh Token Not Found', 400, 'refresh_token_not_found')],
  ])('%s', (_label, e) => {
    expect(humanError(e)).toBe(E.session)
  })
})

describe('Postgres codes', () => {
  it('42501: RLS and privileges', () => {
    const rls = { code: '42501', message: 'new row violates row-level security policy for table "scores"', details: null, hint: null }
    expect(humanError(rls)).toBe(E.permission)
    expect(humanError(ApiError.from(rls))).toBe(E.permission)
    expect(humanError(new ApiError('permission denied for function tournament_audit', '42501'))).toBe(E.permission)
    // Storage throws without the code.
    expect(humanError(new Error('new row violates row-level security policy'))).toBe(E.permission)
  })

  it('23505: a duplicate, with the copy of the form that hit it', () => {
    const dup = new ApiError('duplicate key value violates unique constraint "rounds_tournament_id_number_key"', '23505')
    expect(humanError(dup)).toBe(E.duplicate)
    expect(humanError(dup, { '23505': t.admin.rounds.duplicateNumber(2) })).toBe(t.admin.rounds.duplicateNumber(2))
    const body = new PostgrestError({ code: '23505', message: 'duplicate key value violates unique constraint "profiles_handle_key"', details: 'Key (handle)=(diego) already exists.', hint: null as unknown as string })
    expect(humanError(body)).toBe(E.duplicate)
  })

  it('23503 and the invalid-value family', () => {
    expect(humanError(new ApiError('update or delete on table "courses" violates foreign key constraint "rounds_course_id_fkey" on table "rounds"', '23503'))).toBe(E.linked)
    expect(humanError(new ApiError('invalid input syntax for type uuid: "x"', '22P02'))).toBe(E.invalid)
    expect(humanError(new ApiError('cannot extract elements from a scalar', '22023'))).toBe(E.invalid)
    expect(humanError(new ApiError('new row for relation "players" violates check constraint "players_base_hcp_check"', '23514'))).toBe(E.invalid)
  })

  it('a short raise code keeps its own copy, from the server or the client', () => {
    expect(humanError(new ApiError('wrong-tournament', '22023'))).toBe(t.admin.data.wrongTournament)
    expect(humanError(new Error('wrong-tournament'))).toBe(t.admin.data.wrongTournament)
  })

  it('an unrecognised raise does not leak', () => {
    expect(humanError(new ApiError('some_internal_state', 'P0001'))).toBe(E.unknownRef('P0001'))
  })
})

describe('copy written for people passes through', () => {
  const dir = join(process.cwd(), 'supabase/migrations')
  const sql = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .map((f) => readFileSync(join(dir, f), 'utf8'))
    .join('\n')
  const raises = [...sql.matchAll(/raise exception '((?:[^']|'')*)'(?:\s*,[^;]*?)?\s+using errcode\s*=\s*'([0-9A-Z]{5})'/gi)].map((m) => ({
    message: m[1]!.replace(/''/g, "'").replace(/%/g, 'Blancas'),
    code: m[2]!,
  }))
  const mapped: Record<string, string> = { 'Sin sesión': E.session, 'wrong-tournament': t.admin.data.wrongTournament }

  it('finds the raises', () => {
    expect(raises.length).toBeGreaterThan(150)
  })

  it('every sentence our SQL raises reaches the person as written', () => {
    const wrong = raises
      .map(({ message, code }) => ({ message, got: humanError(new ApiError(message, code)), want: mapped[message] ?? message }))
      .filter((r) => r.got !== r.want)
    expect(wrong).toEqual([])
  })

  it('also as the PostgrestError supabase-js returns', () => {
    const e = new PostgrestError({ message: 'Ya hay tarjetas firmadas; el sorteo no se puede rehacer', code: '22023', details: null as unknown as string, hint: null as unknown as string })
    expect(humanError(e)).toBe('Ya hay tarjetas firmadas; el sorteo no se puede rehacer')
  })

  it("the client's own copy: UserError, a 22023 from api.ts, a route's line", () => {
    expect(humanError(new UserError(t.account.syncFirst))).toBe(t.account.syncFirst)
    expect(humanError(new ApiError('Ese tee lo juega alguien en una ronda; cámbialo primero', '22023'))).toBe('Ese tee lo juega alguien en una ronda; cámbialo primero')
    expect(humanError(new RouteError('Muchas búsquedas seguidas; espera un minuto.', 429, null))).toBe('Muchas búsquedas seguidas; espera un minuto.')
  })
})

describe('Supabase Auth', () => {
  it('maps the codes a person can hit', () => {
    expect(humanError(new AuthApiError('Invalid login credentials', 400, 'invalid_credentials'))).toBe(E.wrongPassword)
    expect(humanError(new AuthApiError('Email not confirmed', 400, 'email_not_confirmed'))).toBe(E.emailNotConfirmed)
    expect(humanError(new AuthApiError('Token has expired or is invalid', 403, 'otp_expired'))).toBe(t.auth.badCode)
    expect(humanError(new AuthApiError('email rate limit exceeded', 429, 'over_email_send_rate_limit'))).toBe(t.account.tooFast)
    expect(humanError(new AuthWeakPasswordError('Password should be at least 8 characters.', 422, ['length']))).toBe(E.weakPassword)
    expect(humanError(new AuthApiError('User is banned', 400, 'user_banned'))).toBe(E.banned)
  })

  it('a context can say it its own way', () => {
    expect(humanError(new AuthApiError('Invalid login credentials', 400, 'invalid_credentials'), { invalid_credentials: t.auth.badCode })).toBe(t.auth.badCode)
  })

  it('a server error behind auth', () => {
    expect(humanError(new AuthRetryableFetchError('Bad Gateway', 502))).toBe(E.server)
  })
})

describe('anything else', () => {
  it.each([
    [new TypeError("Cannot read properties of undefined (reading 'id')"), E.unknownRef('TypeError')],
    [new Error('Could not compute: something exploded'), E.unknown],
    [new ApiError('Could not find the function public.snapshot(tid) in the schema cache', 'PGRST202'), E.unknownRef('PGRST202')],
    [new ApiError('relation "public.teams" does not exist', '42P01'), E.unknownRef('42P01')],
    [new AuthApiError('Anonymous sign-ins are disabled', 422, 'anonymous_provider_disabled'), E.unknownRef('anonymous_provider_disabled')],
    [{ status: 404 }, E.unknownRef('HTTP 404')],
    // Lookups are not fooled by Object.prototype names.
    [Object.assign(new Error('toString'), { code: 'constructor' }), E.unknownRef('constructor')],
    [null, E.unknown],
    [undefined, E.unknown],
    [42, E.unknown],
  ])('%#: the generic line, never the text', (e, want) => {
    const got = humanError(e)
    expect(got).toBe(want)
    const text = e && typeof e === 'object' && 'message' in e ? String(e.message) : ''
    if (text) expect(got).not.toContain(text)
  })

  it('technical text held as a string is not shown either', () => {
    expect(humanError('TypeError: Failed to fetch')).toBe(E.network)
    expect(humanError('new row violates row-level security policy for table "scores"')).toBe(E.permission)
    expect(humanError("TypeError: Cannot read properties of undefined (reading 'id')")).toBe(E.unknown)
  })
})

describe('copy stays copy', () => {
  const inputs: unknown[] = [
    new TypeError('Failed to fetch'),
    new RequestTimeoutError(12_000),
    new AuthSessionMissingError(),
    new ApiError('permission denied for table scores', '42501'),
    new ApiError('duplicate key value violates unique constraint "x"', '23505'),
    new ApiError('Solo el admin de Polo', '42501'),
    new ApiError('wrong-tournament', '22023'),
    new AuthApiError('Anonymous sign-ins are disabled', 422, 'anonymous_provider_disabled'),
    new TypeError('x is not a function'),
    { status: 503 },
    new Error('boom'),
  ]

  it('humanError of its own answer is the same answer', () => {
    for (const e of inputs) {
      const once = humanError(e)
      expect(humanError(once)).toBe(once)
    }
  })

  it('every line in t.errors passes as itself', () => {
    for (const [key, value] of Object.entries(t.errors)) {
      const line = typeof value === 'function' ? value('X1') : value
      expect(humanError(line), key).toBe(line)
    }
  })
})
