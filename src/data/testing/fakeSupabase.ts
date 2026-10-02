/**
 * One in-memory Supabase for the data layer's tests, never imported by the
 * app. One server (its tables, PostgREST's answers) with two ways in:
 *
 * - `client` stands in for the Supabase client itself (QA-07). Tests that
 *   mock `lib/supabase` with it read through the store with no supabase-js
 *   underneath: `from(table).select()` with `eq` / `in` filters, `order`,
 *   `range` and `single`; `rpc`; and the Realtime channel the store opens.
 * - `fetch` is the network under the app's real client (QA-06). Tests that
 *   point `lib/supabase` at it (testing/fakePhone.ts) run supabase-js and
 *   auth-js as the phone does: the URL, headers and body they put on the
 *   wire, the 12 s request timeout (REL-14), PostgREST's error bodies as
 *   postgrest-js reads them. Writes, RPCs and a small auth server (anonymous
 *   sign-in, token refresh) come in this way only. Every request is judged by
 *   the `Authorization` header it actually carries, as #87's outbox tests
 *   judge theirs: the publishable key is `anon`, a live token is its user, a
 *   lapsed or unknown one is a 401. A write must pass the row-level security
 *   of §7: the caller's user holds a player by PIN (`claim_player`), the
 *   round is live, and the row is that player's group's.
 *
 * Both ways answer the way PostgREST does, which is what the tests lean on:
 * - rows come back in the order asked for, and never more than `maxRows` in
 *   one response, whatever range was asked (the server's max-rows);
 * - ordering by a column the table doesn't have is a 400 (ARCH-09), but
 *   only once the table has a row to check against: real PostgREST answers
 *   400 for an empty table too, so the keys of tables that may be empty are
 *   checked against the migrations (snapshotTables.test.ts, backupKeys.test.ts);
 * - each read sees the table as it was when the request was made, even if
 *   its answer is held back (`hold`) to arrive after a later one.
 *
 * The rows themselves are whatever the test serves: testing/rows.ts writes
 * numeric columns as text, which PostgREST does not (see there).
 */
import type { Row } from '../mappers'
import { SNAPSHOT_KEYS } from '../snapshotTables'
import { compareValues } from './rows'

/** Supabase's default max-rows for PostgREST: the server's cap, not the client's page size. */
export const SERVER_MAX_ROWS = 1000

export interface FakeError {
  message: string
  code?: string
}

export interface FakeRequest {
  table: string
  filters: string[]
  order: string[]
  range: [number, number] | null
  single: boolean
}

type Result = { data: unknown; error: FakeError | null }

export interface Hold {
  /** Resolves once the server has read the tables for the held request. */
  received: Promise<void>
  /** Let the answer arrive. */
  release(): void
  /** Answer with this error instead (e.g. the signal dropped). */
  fail(error: FakeError): void
}

export interface FakeChannel {
  name: string
  opts: unknown
  /** table → the store's postgres_changes callback. */
  bindings: Map<string, (payload: unknown) => void>
  system?: (payload: unknown) => void
  status?: (status: string) => void
  on(type: string, filter: { table?: string }, cb: (payload: unknown) => void): FakeChannel
  subscribe(cb: (status: string) => void): FakeChannel
}

/** One request that came in over the network door, as the server saw it. */
export interface Exchange {
  method: string
  /** A REST table (`scores`), an RPC (`rpc/claim_player`) or an auth endpoint (`auth/signup`). */
  target: string
  params: URLSearchParams
  body: unknown
  /** The `Authorization` header the request actually carried. */
  authorization: string | null
  /**
   * Who that header made the caller: a user's id; `anon` for the publishable
   * key (or no header); `lapsed` for a token that expired; `unknown` for one
   * the server never issued.
   */
  as: string
  /** The status the server answered, or how the network lost it. Unset while in flight. */
  result?: number | 'offline' | 'aborted'
}

/**
 * What happens to one request over the network door: the server answers it,
 * the network fails it (`TypeError: Failed to fetch`), it hangs until the
 * client gives up, or the server answers with this status and body.
 */
export type Outcome = 'answer' | 'offline' | 'stall' | { status: number; body: unknown }

/** The auth server's side of who the phone is. */
export interface FakeAuth {
  /** Every user it created, oldest first (each anonymous sign-in is a new one). */
  users: string[]
  /** Who holds which player by PIN (`claim_player`): the server's device_sessions. */
  claims: Array<{ uid: string; playerId: string }>
  /** Each player's PIN; a player without one can't be claimed. */
  pins: Record<string, string>
  /** Seconds a new access token lives. */
  lifetime: number
  /**
   * The user's sessions lapse, as for a phone that sat in a dead zone past
   * its token's expiry: its access tokens are expired and its refresh tokens
   * are gone (the server answers «Refresh Token Not Found»).
   */
  lapse(uid: string): void
  /** The player a user holds in a tournament (`my_player_id`), or null. */
  playerOf(uid: string, tournamentId: string): string | null
}

export interface FakeSupabase {
  /** What `supabase()` returns, for tests that mock `lib/supabase` with it. */
  client: {
    from(table: string): Query
    rpc(name: string, args?: Record<string, unknown>): Promise<Result>
    channel(name: string, opts?: unknown): FakeChannel
    removeChannel(ch: FakeChannel): Promise<void>
  }
  /** The server's tables: edit them to change what the next read sees. */
  tables: Record<string, Row[]>
  /** Every read the server answered, through either door. */
  requests: FakeRequest[]
  rpcCalls: Array<{ name: string; args: Record<string, unknown> | undefined }>
  /** What `rpc` answers (default: no data, no error); over the network, for functions without an answer of their own here. */
  rpcResult: Result
  channels: FakeChannel[]
  /** Every read fails with this while set (no signal); over the network, every request fails. */
  down: FakeError | null
  /** Rows per response at most (the project's max-rows setting); SERVER_MAX_ROWS unless a test changes it. */
  maxRows: number
  /** Hold back the answer to the next tournament snapshot (its `tournaments` read). */
  hold(): Hold

  /** The project URL to point the app's client at: the network door answers this origin only. */
  readonly url: string
  /** The publishable key the app's client sends when it has no session. */
  readonly anonKey: string
  /** The network door: a `fetch` for the app's real client. */
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>
  /** Every request over the network door, in order, the ones the network lost included. */
  wire: Exchange[]
  /** Every row a write stored, in order, with the user whose token wrote it. */
  writes: Array<{ table: string; row: Row; by: string }>
  /** Requests the fake does not serve (another host, an endpoint it doesn't know): a test expects none. */
  unexpected: string[]
  /** Decides each network request's fate; may wait, and the request stays in flight meanwhile. */
  decide: (req: Exchange) => Outcome | Promise<Outcome>
  /** False while the phone has no signal: no request gets out at all. */
  reachable: () => boolean
  auth: FakeAuth
  /** Rows the server already holds (another phone wrote them): stored with the columns' defaults, outside the logs. */
  seed(table: string, rows: Row[]): void
  /** Back to these tables (or the ones it started with), with empty logs and a network that answers. Users, tokens and claims stay. */
  reset(tables?: Record<string, Row[]>): void
  /** Write requests (POST, DELETE) to a table, oldest first. */
  writeRequests(table?: string): Exchange[]
  /** The score row the server holds for one hole of one player. */
  score(player: string, hole: number, round?: string): Row | undefined
  /** The strokes the server stored for one hole of one player, in the order it stored them. */
  strokesWritten(player: string, hole: number, round?: string): unknown[]
}

interface Gate {
  markReceived(): void
  /** Settles with null (release) or the error to answer with (fail). */
  answer: Promise<FakeError | null>
}

interface Filter {
  label: string
  test: (r: Row) => boolean
}

/** A read, whichever door it came through. */
interface ReadSpec {
  table: string
  filters: Filter[]
  order: Array<{ column: string; ascending: boolean }>
  range: [number, number] | null
  single: boolean
}

/** What the server answers to a read, read now. */
function read(server: FakeSupabase, q: ReadSpec): Result {
  const { table } = q
  server.requests.push({ table, filters: q.filters.map((f) => f.label), order: q.order.map((o) => o.column), range: q.range, single: q.single })
  if (server.down) return { data: null, error: server.down }
  const all = server.tables[table]
  if (!all) return { data: null, error: { message: `Could not find the table 'public.${table}' in the schema cache`, code: 'PGRST205' } }
  const missing = all.length ? q.order.find((o) => !(o.column in all[0]!)) : undefined
  if (missing) return { data: null, error: { message: `column ${table}.${missing.column} does not exist`, code: '42703' } }
  const rows = all.filter((r) => q.filters.every((f) => f.test(r)))
  if (q.order.length) {
    rows.sort((a, b) => {
      for (const o of q.order) {
        const d = compareValues(a[o.column], b[o.column])
        if (d) return o.ascending ? d : -d
      }
      return 0
    })
  }
  const [from, to] = q.range ?? [0, Number.MAX_SAFE_INTEGER]
  const page = rows.slice(from, Math.min(to + 1, from + server.maxRows))
  if (q.single) {
    return page.length === 1 ? { data: structuredClone(page[0]), error: null } : { data: null, error: { message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116' } }
  }
  return { data: structuredClone(page), error: null }
}

class Query implements PromiseLike<Result> {
  private readonly server: FakeSupabase
  private readonly gates: Gate[]
  private readonly spec: ReadSpec

  constructor(server: FakeSupabase, gates: Gate[], table: string) {
    this.server = server
    this.gates = gates
    this.spec = { table, filters: [], order: [], range: null, single: false }
  }

  select(_columns = '*'): this {
    return this
  }
  eq(column: string, value: unknown): this {
    this.spec.filters.push({ label: `${column}=eq.${String(value)}`, test: (r) => r[column] === value })
    return this
  }
  in(column: string, values: readonly unknown[]): this {
    this.spec.filters.push({ label: `${column}=in.(${values.length})`, test: (r) => values.includes(r[column]) })
    return this
  }
  order(column: string): this {
    this.spec.order.push({ column, ascending: true })
    return this
  }
  range(from: number, to: number): this {
    this.spec.range = [from, to]
    return this
  }
  single(): this {
    this.spec.single = true
    return this
  }

  then<A = Result, B = never>(onFulfilled?: ((value: Result) => A | PromiseLike<A>) | null, onRejected?: ((reason: unknown) => B | PromiseLike<B>) | null): PromiseLike<A | B> {
    const result = read(this.server, this.spec)
    const gate = this.spec.table === 'tournaments' ? this.gates.shift() : undefined
    if (!gate) return Promise.resolve(result).then(onFulfilled, onRejected)
    gate.markReceived()
    return gate.answer.then((error) => (error ? { data: null, error } : result)).then(onFulfilled, onRejected)
  }
}

const URL_BASE = 'https://fake-polo.supabase.test'
const ANON_KEY = 'anon-key-for-tests'
/** Query parameters that are not filters. */
const NOT_FILTERS = new Set(['select', 'order', 'offset', 'limit', 'on_conflict', 'columns'])
/** The tables a player's phone writes (§7, «Write scores»): every other write is refused. */
const PHONE_TABLES = new Set(['scores', 'snake_tiebreaks', 'hole_awards', 'card_signatures'])

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } })
}

/** `a,"b,c",d` → [a, b,c, d]: PostgREST's list inside `in.(…)`. */
function splitList(list: string): string[] {
  const out: string[] = []
  for (const m of list.matchAll(/"((?:[^"\\]|\\.)*)"|([^,]+)/g)) out.push(m[1] !== undefined ? m[1].replace(/\\(.)/g, '$1') : m[2]!)
  return out
}

/** A read as the URL spells it. Filter values arrive as text and compare as text; anything else is an error message. */
function readFromUrl(table: string, params: URLSearchParams, headers: Headers): ReadSpec | string {
  const filters: Filter[] = []
  for (const [column, filter] of params) {
    if (NOT_FILTERS.has(column)) continue
    if (filter.startsWith('eq.')) {
      const v = filter.slice(3)
      filters.push({ label: `${column}=eq.${v}`, test: (r) => r[column] != null && String(r[column]) === v })
    } else if (filter.startsWith('in.(') && filter.endsWith(')')) {
      const values = splitList(filter.slice(4, -1))
      filters.push({ label: `${column}=in.(${values.length})`, test: (r) => r[column] != null && values.includes(String(r[column])) })
    } else {
      return `unsupported filter ${column}=${filter}`
    }
  }
  const order = (params.get('order') ?? '')
    .split(',')
    .filter(Boolean)
    .map((o) => {
      const [column, dir] = o.split('.')
      return { column: column!, ascending: dir !== 'desc' }
    })
  const offset = params.get('offset')
  const limit = params.get('limit')
  const from = Number(offset ?? 0)
  const range: [number, number] | null = offset == null && limit == null ? null : [from, limit == null ? Number.MAX_SAFE_INTEGER : from + Number(limit) - 1]
  return { table, filters, order, range, single: (headers.get('accept') ?? '').includes('vnd.pgrst.object') }
}

/** A PostgREST error body, at the status PostgREST gives its code. */
function restError(error: FakeError): Response {
  const status = error.code === 'PGRST205' ? 404 : error.code === 'PGRST116' ? 406 : error.code?.startsWith('PGRST3') ? 401 : 400
  return json(status, { code: error.code ?? null, details: null, hint: null, message: error.message })
}

/** A JWT-shaped token, as auth-js stores and sends it. The server keeps the truth about it; `exp` here is for show. */
function jwt(claims: Record<string, unknown>, serial: number): string {
  const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(claims)}.fake-signature-${serial}`
}

export function fakeSupabase(tables: Record<string, Row[]>): FakeSupabase {
  const gates: Gate[] = []
  let initial = structuredClone(tables)
  /** Live access tokens → whose, and until when (ms). */
  const access = new Map<string, { uid: string; until: number }>()
  /** Live refresh tokens → whose. */
  const refresh = new Map<string, string>()
  let serial = 0
  /** The server's own clock for the rows it stamps: never a value the phone sent. */
  let clock = 0
  const stamp = () => new Date(Date.UTC(2027, 3, 9, 16, 0, ++clock)).toISOString()

  /** A new row as the database stores it: the key it generates and the columns' defaults. */
  function withDefaults(table: string, row: Row): Row {
    const keys: readonly string[] = SNAPSHOT_KEYS[table as keyof typeof SNAPSHOT_KEYS] ?? []
    const id = keys.length === 1 && keys[0] === 'id' && row.id == null ? { id: `${table}-${++serial}` } : {}
    if (table === 'scores') return { ...id, disputed: false, previous: null, reason: null, ...row, updated_at: stamp() }
    if (table === 'snake_tiebreaks' || table === 'hole_awards') return { ...id, created_at: stamp(), ...row }
    if (table === 'card_signatures') return { ...id, signed_at: stamp(), ...row }
    return { ...id, ...row }
  }

  function user(uid: string) {
    return {
      id: uid,
      aud: 'authenticated',
      role: 'authenticated',
      is_anonymous: true,
      app_metadata: {},
      user_metadata: {},
      identities: [],
      created_at: '2027-04-08T18:00:00Z',
      updated_at: '2027-04-08T18:00:00Z',
    }
  }
  function session(uid: string) {
    const now = Math.floor(Date.now() / 1000)
    const expiresAt = now + server.auth.lifetime
    const token = jwt({ sub: uid, aud: 'authenticated', role: 'authenticated', is_anonymous: true, iat: now, exp: expiresAt }, ++serial)
    const refreshToken = `refresh-${uid}-${++serial}`
    access.set(token, { uid, until: expiresAt * 1000 })
    refresh.set(refreshToken, uid)
    return { access_token: token, token_type: 'bearer', expires_in: server.auth.lifetime, expires_at: expiresAt, refresh_token: refreshToken, user: user(uid) }
  }
  /** Who a request is, by the Authorization header it carries. */
  function callerOf(authorization: string | null): string {
    const token = authorization?.replace(/^Bearer /i, '')
    if (!token || token === ANON_KEY) return 'anon'
    const t = access.get(token)
    if (!t) return 'unknown'
    return t.until <= Date.now() ? 'lapsed' : t.uid
  }

  /** The group a player plays in, in a round. */
  function groupOf(roundId: unknown, playerId: unknown): unknown {
    const groups = (server.tables.groups ?? []).filter((g) => g.round_id === roundId)
    return groups.find((g) => (server.tables.group_members ?? []).some((m) => m.group_id === g.id && m.player_id === playerId))?.id
  }
  /** §7: the writer holds a player of this row's group, in a live round. */
  function mayWrite(table: string, row: Row, as: string): boolean {
    if (!PHONE_TABLES.has(table)) return false
    const round = (server.tables.rounds ?? []).find((r) => r.id === row.round_id)
    if (!round || round.status !== 'live') return false
    const mine: unknown[] = server.auth.claims.filter((c) => c.uid === as).map((c) => groupOf(round.id, c.playerId)).filter((g) => g != null)
    if (table === 'scores') return mine.includes(groupOf(round.id, row.player_id))
    if (table === 'card_signatures') return mine.length > 0
    return mine.includes(row.group_id)
  }

  function unsupported(req: Exchange, why: string): never {
    server.unexpected.push(`${req.method} ${req.target}: ${why}`)
    throw new TypeError('Failed to fetch')
  }

  function write(req: Exchange, headers: Headers): Response {
    const table = req.target
    const rows = server.tables[table]
    if (!rows) return restError({ message: `Could not find the table 'public.${table}' in the schema cache`, code: 'PGRST205' })
    if (req.method === 'DELETE') {
      const spec = readFromUrl(table, req.params, headers)
      if (typeof spec === 'string') return unsupported(req, spec)
      // Row-level security hides the rows a caller may not touch: they stay, and nothing says so.
      server.tables[table] = rows.filter((r) => !(spec.filters.every((f) => f.test(r)) && mayWrite(table, r, req.as)))
      return new Response(null, { status: 204 })
    }
    if (req.method !== 'POST') return unsupported(req, 'only GET, POST and DELETE are served')
    const incoming = (Array.isArray(req.body) ? req.body : [req.body]) as Row[]
    // One statement: every row passes, or none is written.
    if (!incoming.every((row) => mayWrite(table, row, req.as))) {
      return json(req.as === 'anon' ? 401 : 403, { code: '42501', details: null, hint: null, message: `new row violates row-level security policy for table "${table}"` })
    }
    const onConflict = req.params.get('on_conflict')?.split(',')
    const key: readonly string[] = onConflict ?? SNAPSHOT_KEYS[table as keyof typeof SNAPSHOT_KEYS] ?? []
    const ignore = (headers.get('prefer') ?? '').includes('resolution=ignore-duplicates')
    const at = (row: Row) => (key.length ? rows.findIndex((r) => key.every((c) => r[c] === row[c])) : -1)
    if (!onConflict && incoming.some((row) => at(row) >= 0)) {
      return json(409, { code: '23505', details: null, hint: null, message: `duplicate key value violates unique constraint "${table}_pkey"` })
    }
    for (const row of incoming) {
      const i = at(row)
      if (i >= 0 && ignore) continue
      const stored = i >= 0 ? { ...rows[i], ...row, ...(table === 'scores' ? { updated_at: stamp() } : {}) } : withDefaults(table, row)
      if (i >= 0) rows[i] = stored
      else rows.push(stored)
      server.writes.push({ table, row: { ...stored }, by: req.as })
    }
    return new Response(null, { status: 201 })
  }

  /** The functions a phone calls on its way in; any other answers `rpcResult`. */
  function rpc(name: string, args: Record<string, unknown>, as: string): Response {
    server.rpcCalls.push({ name, args: structuredClone(args) })
    if (name === 'claim_player') {
      if (as === 'anon') return json(401, { code: '42501', details: null, hint: null, message: 'permission denied for function claim_player' })
      const player = (server.tables.players ?? []).find((p) => p.id === args.p_player_id)
      if (!player) return json(200, { ok: false, reason: 'not_found' })
      const pin = server.auth.pins[String(player.id)]
      if (!pin) return json(200, { ok: false, reason: 'no_pin' })
      if (pin !== args.p_pin) return json(200, { ok: false, reason: 'wrong_pin', attemptsLeft: 4 })
      const tid = player.tournament_id
      const field = new Set((server.tables.players ?? []).filter((p) => p.tournament_id === tid).map((p) => p.id))
      server.auth.claims = [...server.auth.claims.filter((c) => !(c.uid === as && field.has(c.playerId))), { uid: as, playerId: String(player.id) }]
      return json(200, { ok: true, playerId: player.id, tournamentId: tid })
    }
    if (name === 'my_membership') {
      const playerId = server.auth.playerOf(as, String(args.tid))
      return json(200, { playerId, role: playerId ? 'member' : 'none', isOrganizer: false, isAdmin: false, via: playerId ? 'device' : null })
    }
    const { data, error } = server.rpcResult
    return error ? restError(error) : json(200, data)
  }

  /** GoTrue, as far as a player's phone uses it: anonymous sign-in, refresh, sign-out. A string: not served. */
  function authEndpoint(req: Exchange): Response | string {
    const endpoint = req.target.slice('auth/'.length)
    if (endpoint === 'signup' && req.method === 'POST') {
      const body = (req.body ?? {}) as Record<string, unknown>
      if (body.email || body.phone) return 'only anonymous sign-ups are served'
      const uid = `user-${server.auth.users.length + 1}`
      server.auth.users.push(uid)
      return json(200, session(uid))
    }
    if (endpoint === 'token' && req.method === 'POST' && req.params.get('grant_type') === 'refresh_token') {
      const token = String((req.body as { refresh_token?: unknown } | undefined)?.refresh_token ?? '')
      const uid = refresh.get(token)
      if (!uid) {
        const body = { code: 'refresh_token_not_found', error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token: Refresh Token Not Found' }
        return json(400, body, { 'x-supabase-api-version': '2024-01-01' })
      }
      // A refresh token is good once: the next one comes with the new session.
      refresh.delete(token)
      return json(200, session(uid))
    }
    if (endpoint === 'user' && req.method === 'GET') {
      return ['anon', 'unknown', 'lapsed'].includes(req.as) ? json(401, { code: 'bad_jwt', msg: 'invalid JWT' }) : json(200, user(req.as))
    }
    if (endpoint === 'logout' && req.method === 'POST') {
      for (const [t, uid] of refresh) if (uid === req.as) refresh.delete(t)
      return new Response(null, { status: 204 })
    }
    return `unsupported ${req.method} /auth/v1/${endpoint}`
  }

  /** The server's answer to a request the network let through. */
  async function answer(req: Exchange, headers: Headers, aborted: Promise<never>): Promise<Response> {
    if (req.target.startsWith('auth/')) {
      const res = authEndpoint(req)
      return typeof res === 'string' ? unsupported(req, res) : res
    }
    // PostgREST checks the token before anything else.
    if (req.as === 'lapsed') return json(401, { code: 'PGRST303', details: null, hint: null, message: 'JWT expired' })
    if (req.as === 'unknown') return json(401, { code: 'PGRST301', details: null, hint: null, message: 'No suitable key or wrong key type' })
    if (req.target.startsWith('rpc/')) return rpc(req.target.slice('rpc/'.length), (req.body ?? {}) as Record<string, unknown>, req.as)
    if (req.method !== 'GET') return write(req, headers)
    const spec = readFromUrl(req.target, req.params, headers)
    if (typeof spec === 'string') return unsupported(req, spec)
    const result = read(server, spec)
    const gate = spec.table === 'tournaments' ? gates.shift() : undefined
    if (gate) {
      gate.markReceived()
      // A held answer that fails is the signal dropping while it was on its way.
      if (await Promise.race([gate.answer, aborted])) throw new TypeError('Failed to fetch')
    }
    return result.error ? restError(result.error) : json(200, result.data)
  }

  const server: FakeSupabase = {
    tables: structuredClone(tables),
    requests: [],
    rpcCalls: [],
    rpcResult: { data: null, error: null },
    channels: [],
    down: null,
    maxRows: SERVER_MAX_ROWS,
    client: {
      from: (table) => new Query(server, gates, table),
      rpc: async (name, args) => {
        server.rpcCalls.push({ name, args: args === undefined ? undefined : structuredClone(args) })
        return server.rpcResult
      },
      channel(name, opts) {
        const ch: FakeChannel = {
          name,
          opts,
          bindings: new Map(),
          on(type, filter, cb) {
            if (type === 'system') ch.system = cb
            else ch.bindings.set(filter.table ?? '', cb)
            return ch
          },
          subscribe(cb) {
            ch.status = cb
            return ch
          },
        }
        server.channels.push(ch)
        return ch
      },
      async removeChannel(ch) {
        // Like realtime-js: leaving reports CLOSED before this returns.
        ch.status?.('CLOSED')
      },
    },
    hold() {
      let markReceived!: () => void
      let settle!: (error: FakeError | null) => void
      const received = new Promise<void>((r) => (markReceived = r))
      const answer = new Promise<FakeError | null>((r) => (settle = r))
      gates.push({ markReceived, answer })
      return { received, release: () => settle(null), fail: (error) => settle(error) }
    },

    url: URL_BASE,
    anonKey: ANON_KEY,
    wire: [],
    writes: [],
    unexpected: [],
    decide: () => 'answer',
    reachable: () => true,
    auth: {
      users: [],
      claims: [],
      pins: {},
      lifetime: 3600,
      lapse(uid) {
        for (const t of access.values()) if (t.uid === uid) t.until = Math.min(t.until, Date.now() - 1000)
        for (const [t, owner] of refresh) if (owner === uid) refresh.delete(t)
      },
      playerOf(uid, tournamentId) {
        const field = new Set((server.tables.players ?? []).filter((p) => p.tournament_id === tournamentId).map((p) => p.id))
        return server.auth.claims.find((c) => c.uid === uid && field.has(c.playerId))?.playerId ?? null
      },
    },

    async fetch(input, init = {}) {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
      const method = (init.method ?? 'GET').toUpperCase()
      const path = /^\/(rest|auth)\/v1\/(.+)$/.exec(url.pathname)
      if (url.origin !== server.url || !path) {
        server.unexpected.push(`${method} ${url.href}`)
        throw new TypeError('Failed to fetch')
      }
      const headers = new Headers(init.headers)
      const authorization = headers.get('authorization')
      const req: Exchange = {
        method,
        target: path[1] === 'auth' ? `auth/${path[2]}` : path[2]!,
        params: url.searchParams,
        body: typeof init.body === 'string' && init.body ? JSON.parse(init.body) : undefined,
        authorization,
        as: callerOf(authorization),
      }
      server.wire.push(req)
      if (!server.reachable() || server.down) {
        req.result = 'offline'
        throw new TypeError('Failed to fetch')
      }
      // Like a browser: an aborted request rejects with the signal's reason.
      const signal = init.signal
      const aborted = new Promise<never>((_, reject) => {
        if (signal?.aborted) reject(signal.reason)
        signal?.addEventListener('abort', () => reject(signal.reason), { once: true })
      })
      aborted.catch(() => undefined)
      try {
        const outcome = await Promise.race([Promise.resolve(server.decide(req)), aborted])
        if (outcome === 'stall') await aborted
        if (outcome === 'offline') throw new TypeError('Failed to fetch')
        const res = typeof outcome === 'object' ? json(outcome.status, outcome.body) : await answer(req, headers, aborted)
        req.result = res.status
        return res
      } catch (e) {
        req.result = signal?.aborted && e === signal.reason ? 'aborted' : 'offline'
        throw e
      }
    },
    seed(table, rows) {
      const list = (server.tables[table] ??= [])
      for (const row of rows) list.push(withDefaults(table, row))
    },
    reset(next) {
      if (next) initial = structuredClone(next)
      server.tables = structuredClone(initial)
      server.requests = []
      server.rpcCalls = []
      server.rpcResult = { data: null, error: null }
      server.down = null
      server.maxRows = SERVER_MAX_ROWS
      server.wire = []
      server.writes = []
      server.unexpected = []
      server.decide = () => 'answer'
    },
    writeRequests(table = 'scores') {
      return server.wire.filter((r) => r.target === table && r.method !== 'GET')
    },
    score(player, hole, round = 'r1') {
      return (server.tables.scores ?? []).find((r) => r.round_id === round && r.player_id === player && r.hole === hole)
    },
    strokesWritten(player, hole, round = 'r1') {
      return server.writes.filter((w) => w.table === 'scores' && w.row.round_id === round && w.row.player_id === player && w.row.hole === hole).map((w) => w.row.strokes)
    },
  }
  return server
}
