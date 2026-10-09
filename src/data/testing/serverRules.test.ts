/**
 * The test server's rules, against the case file the real database answers
 * too (QA-06). Every case in cases/serverRules.json is one request a phone
 * makes; here it goes to the fake's network door as supabase-js would put it
 * on the wire, and the answer and the rows it leaves must be the ones the
 * case expects. scripts/server-rules.mjs runs the same cases on the
 * migrations in the db job, so the outbox's tests lean on rules the database
 * really has.
 */
import { describe, expect, it } from 'vitest'
import type { Row } from '../mappers'
import spec from './cases/serverRules.json'
import { fakeSupabase, type FakeSupabase } from './fakeSupabase'

interface Request {
  method: 'GET' | 'POST' | 'DELETE' | 'RPC'
  table?: string
  /** An RPC's function and its arguments. */
  fn?: string
  args?: Record<string, unknown>
  onConflict?: string
  prefer?: string
  eq?: Record<string, unknown>
  /** `in.(…)` filters, as postgrest-js's `in` sends them; `<embed>.<column>` filters an embedded resource. */
  in?: Record<string, unknown[]>
  select?: string
  body?: unknown
  /** PostgREST's `columns`, sent as written: otherwise what supabase-js sends (every key of a list's rows, none for one row). */
  columns?: string[]
}
interface Case {
  name: string
  as: string
  given?: Record<string, Row[]>
  /** Players whose PIN (1234) the case's phone knows. */
  pins?: string[]
  before?: Request[]
  request: Request
  /** `answer`: an RPC's answer holds at least this (scripts/server-rules.mjs `holds`). */
  expect: { status: number; code?: string; rows?: Row[]; answer?: unknown }
  then?: Array<{ table: string; where?: Record<string, unknown>; rows: Row[] }>
}

/** A world of its own for each case: the case file's rows, as the database would have stored them. */
function world(c: Case): { server: FakeSupabase; token: string } {
  const server = fakeSupabase({})
  for (const [table, rows] of Object.entries(spec.world.tables as Record<string, Row[]>)) server.seed(table, rows)
  for (const [table, rows] of Object.entries(c.given ?? {})) server.seed(table, rows)
  for (const p of c.pins ?? []) server.auth.pins[p] = '1234'
  const token = c.as === 'anon' ? server.anonKey : server.auth.sessionFor(c.as)
  return { server, token }
}

/** The request as supabase-js sends it. */
function send(server: FakeSupabase, token: string, req: Request): Promise<Response> {
  const headers0: Record<string, string> = { apikey: server.anonKey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  if (req.method === 'RPC') return server.fetch(`${server.url}/rest/v1/rpc/${req.fn}`, { method: 'POST', headers: headers0, body: JSON.stringify(req.args ?? {}) })
  const url = new URL(`${server.url}/rest/v1/${req.table}`)
  // supabase-js names the columns of a list of rows (postgrest-js `insert`/`upsert`): PostgREST then reads a key a row leaves out as null.
  const columns = req.columns ?? (Array.isArray(req.body) ? [...new Set((req.body as Row[]).flatMap((r) => Object.keys(r)))] : null)
  if (columns) url.searchParams.set('columns', columns.map((c) => `"${c}"`).join(','))
  if (req.onConflict) url.searchParams.set('on_conflict', req.onConflict)
  if (req.select) url.searchParams.set('select', req.select)
  for (const [column, value] of Object.entries(req.eq ?? {})) url.searchParams.set(column, `eq.${String(value)}`)
  for (const [column, values] of Object.entries(req.in ?? {})) url.searchParams.set(column, `in.(${values.map(String).join(',')})`)
  const headers: Record<string, string> = { apikey: server.anonKey, Authorization: `Bearer ${token}` }
  if (req.prefer) headers.Prefer = req.prefer
  if (req.body !== undefined) headers['Content-Type'] = 'application/json'
  return server.fetch(url, { method: req.method, headers, body: req.body === undefined ? undefined : JSON.stringify(req.body) })
}

/** Rows as a multiset, compared on the columns the case names. */
const bag = (rows: Row[]) => rows.map((r) => JSON.stringify(Object.keys(r).sort().map((k) => [k, r[k] ?? null]))).sort()
const pick = (row: Row, columns: string[]) => Object.fromEntries(columns.map((c) => [c, row[c] ?? null]))
/** At least what the case writes: an object's named keys; a list's items each matching a different one, in any order; else equal. */
function holds(actual: unknown, want: unknown): boolean {
  if (Array.isArray(want)) {
    if (!Array.isArray(actual) || actual.length !== want.length) return false
    const free = actual.map(() => true)
    return want.every((w) => {
      const i = actual.findIndex((a, j) => free[j] && holds(a, w))
      if (i < 0) return false
      free[i] = false
      return true
    })
  }
  if (want && typeof want === 'object') return !!actual && typeof actual === 'object' && !Array.isArray(actual) && Object.entries(want).every(([k, v]) => holds((actual as Row)[k] ?? null, v))
  return actual === want
}

describe('the test server answers each request as the database does (cases/serverRules.json)', () => {
  it.each((spec.cases as Case[]).map((c) => [c.name, c] as const))('%s', async (_name, c) => {
    const { server, token } = world(c)
    for (const step of c.before ?? []) expect((await send(server, token, step)).ok, `before: ${step.method} ${step.table}`).toBe(true)
    const res = await send(server, token, c.request)
    const body = res.status === 204 || res.status === 201 ? null : await res.json()
    expect({ status: res.status, code: res.ok ? undefined : body?.code }).toEqual({ status: c.expect.status, code: c.expect.code ?? (res.ok ? undefined : body?.code) })
    // An RPC answers its function's value: the database side reads it as a one-row list.
    if (c.expect.rows) expect(bag(c.request.method === 'RPC' ? [body as Row] : (body as Row[]))).toEqual(bag(c.expect.rows))
    if (c.expect.answer !== undefined) expect(holds(body, c.expect.answer), `answered ${JSON.stringify(body)}`).toBe(true)
    for (const t of c.then ?? []) {
      const columns = [...new Set(t.rows.flatMap((r) => Object.keys(r)))]
      const where = Object.entries(t.where ?? {})
      const found = (server.tables[t.table] ?? []).filter((r) => where.every(([k, v]) => r[k] === v)).map((r) => pick(r, columns))
      expect(bag(found), `${t.table} where ${JSON.stringify(t.where ?? {})}`).toEqual(bag(t.rows))
    }
    expect(server.unexpected).toEqual([])
  })
})
