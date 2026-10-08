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
 *   lapsed or unknown one is a 401. Reads and the phone's writes meet the
 *   database's own rules, ported from the migrations: the row-level security
 *   of every policy, the column types as Postgres casts them (an integer
 *   literal and its range, a boolean's words, a time's fields in the order
 *   Postgres checks them: the time of day to the microsecond, the offset,
 *   the date; only C's spaces around a value), the defaults (never over a
 *   null sent, the generated key included), NOT NULL, the foreign and unique
 *   keys, column grants and checks, the discrepancy trigger, and the order
 *   the database meets them in: a column PostgREST doesn't know (of
 *   `columns` when it is sent, which PostgREST then reads alone, else of the
 *   body), the ON CONFLICT target, the grants, the whole body cast, then row
 *   by row, the foreign keys last. The requests in cases/serverRules.json pin
 *   all of it against the real migrations (see serverRules.test.ts), on what
 *   a phone sends.
 *
 *   Not modelled, so a test must not lean on it (PR #93's third and fourth
 *   verifiers compared 301 requests; none of these is on a phone's path):
 *   - inputs Postgres reads that the fake refuses, among them time words
 *     («now»), RFC 2822 times, zone names, a one-digit month or day, an
 *     offset with seconds or written short (+5, +053), a space before the
 *     offset, hex or underscored integers, prefixes of a boolean word; and
 *     the order of the casts inside one row;
 *   - the shape of a uuid: ids here are names, so any text is one;
 *   - how a time reads back: the fake keeps the text it was sent (and
 *     stamps its own in ISO form), where PostgREST answers in Postgres's
 *     (`+00:00`); no case compares a time;
 *   - a filter value its column's type can't read: PostgREST answers 400
 *     (22P02), while the fake, like scripts/server-rules.mjs, compares an
 *     `eq.` or `in.` filter as text and finds no row;
 *   - a list of rows sent without `columns` whose keys differ (PostgREST
 *     refuses it, PGRST102; supabase-js always sends `columns` for a list);
 *   - platform admins (`is_platform_admin`), and the insert trigger that
 *     leaves a new tournament unprotected (a test may seed a protected one);
 *     and what a deleted row takes with it: the database cascades to (or
 *     nulls) the rows that point to it, the fake leaves them, so a test that
 *     deletes a row removes them;
 *   - `claim_player`: the lockout after five wrong PINs and the attempts
 *     left (the fake always says 4), a PIN sent as a number; an unknown
 *     function or argument is not a 404;
 *   - reads: an unknown filter or select column is not a 42703; an owner
 *     sees only his own seat in `tournament_organizers`; `profiles` and the
 *     tables no test seeds read empty or 404; the audit triggers write
 *     nothing to `audit_log`.
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

/** The auth server's side of who the phone is. Who holds which player by PIN is the `device_sessions` table, as on the server. */
export interface FakeAuth {
  /** Every user it created, oldest first (each anonymous sign-in is a new one). */
  users: string[]
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
  /** A live access token for this user, as if it had just signed in (the rule cases name their callers). */
  sessionFor(uid: string): string
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
  /** Rows the server already holds (another phone wrote them): stored as the database stores a new row (its defaults, and the insert triggers of the tables a phone writes), outside the logs and the rules. */
  seed(table: string, rows: Row[]): void
  /** Back to these tables (or the ones it started with), with empty logs and a network that answers. Users, tokens and PIN claims stay. */
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

/** What the server answers to a read, read now. Over the network, `visible` is the row-level security the caller meets. */
function read(server: FakeSupabase, q: ReadSpec, visible?: (r: Row) => boolean): Result {
  const { table } = q
  server.requests.push({ table, filters: q.filters.map((f) => f.label), order: q.order.map((o) => o.column), range: q.range, single: q.single })
  if (server.down) return { data: null, error: server.down }
  const all = server.tables[table]
  if (!all) return { data: null, error: { message: `Could not find the table 'public.${table}' in the schema cache`, code: 'PGRST205' } }
  const missing = all.length ? q.order.find((o) => !(o.column in all[0]!)) : undefined
  if (missing) return { data: null, error: { message: `column ${table}.${missing.column} does not exist`, code: '42703' } }
  const rows = all.filter((r) => (!visible || visible(r)) && q.filters.every((f) => f.test(r)))
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

// The database's rules for the tables a player's phone writes (§7), ported
// from the migrations as written: the policies, unique keys, column grants,
// checks and triggers the phone's requests meet. The requests in
// cases/serverRules.json pin them: this server (serverRules.test.ts) and the
// real migrations (scripts/server-rules.mjs, in the db job) must answer each
// as written there. A write to any other table is not served (`unexpected`).

/** Each phone table's unique keys, primary first, with the constraint's name. */
const UNIQUE_KEYS: Record<string, Array<{ name: string; columns: string[] }>> = {
  scores: [
    { name: 'scores_pkey', columns: ['id'] },
    { name: 'scores_round_id_player_id_hole_key', columns: ['round_id', 'player_id', 'hole'] },
  ],
  snake_tiebreaks: [{ name: 'snake_tiebreaks_pkey', columns: ['round_id', 'group_id', 'hole'] }],
  card_signatures: [{ name: 'card_signatures_pkey', columns: ['round_id', 'pair_id'] }],
  hole_awards: [{ name: 'hole_awards_pkey', columns: ['round_id', 'game_id', 'hole', 'player_id'] }],
}
/** What a session may insert and update in `scores` (0010): the flags and the Comité's reason are not a phone's to send. */
const SCORE_INSERT = new Set(['id', 'round_id', 'player_id', 'hole', 'strokes', 'putts', 'picked_up', 'entered_by', 'client_ts'])
const SCORE_UPDATE = new Set(['round_id', 'player_id', 'hole', 'strokes', 'putts', 'picked_up', 'entered_by', 'client_ts'])
/** Each table's NOT NULL columns in the table's order, the order Postgres checks them in (a primary key is one). */
const NOT_NULL: Record<string, string[]> = {
  scores: ['id', 'round_id', 'player_id', 'hole', 'picked_up'],
  snake_tiebreaks: ['round_id', 'group_id', 'hole', 'last_holed_player_id', 'created_at'],
  card_signatures: ['round_id', 'pair_id', 'signed_at'],
  hole_awards: ['round_id', 'hole', 'game_id', 'player_id', 'created_at'],
}
const between = (v: unknown, lo: number, hi: number) => v == null || (typeof v === 'number' && v >= lo && v <= hi)
/** Each table's checks, in the order Postgres runs them (by name). A check holds when it is not false. */
const CHECKS: Record<string, Array<[string, (r: Row) => boolean]>> = {
  scores: [
    ['scores_check', (r) => r.picked_up === true || r.strokes != null],
    ['scores_check1', (r) => r.putts == null || r.strokes == null || Number(r.putts) <= Number(r.strokes)],
    ['scores_hole_check', (r) => between(r.hole, 1, 18)],
    ['scores_putts_check', (r) => between(r.putts, 0, 15)],
    ['scores_strokes_check', (r) => between(r.strokes, 1, 15)],
  ],
  snake_tiebreaks: [['snake_tiebreaks_hole_check', (r) => between(r.hole, 1, 18)]],
  hole_awards: [
    ['hole_awards_game_id_check', (r) => r.game_id == null || (typeof r.game_id === 'string' && /^[a-z0-9-]{1,32}$/.test(r.game_id))],
    ['hole_awards_hole_check', (r) => between(r.hole, 1, 18)],
  ],
}
/** Each phone table's columns and their types (information_schema): what PostgREST's schema cache knows, and what Postgres casts the body to. */
type ColumnType = 'uuid' | 'int' | 'bool' | 'timestamptz' | 'text' | 'jsonb'
const COLUMNS: Record<string, Record<string, ColumnType>> = {
  scores: { id: 'uuid', round_id: 'uuid', player_id: 'uuid', hole: 'int', strokes: 'int', putts: 'int', picked_up: 'bool', entered_by: 'uuid', client_ts: 'timestamptz', updated_at: 'timestamptz', disputed: 'bool', previous: 'jsonb', reason: 'text' },
  snake_tiebreaks: { round_id: 'uuid', group_id: 'uuid', hole: 'int', last_holed_player_id: 'uuid', decided_by: 'uuid', created_at: 'timestamptz' },
  card_signatures: { round_id: 'uuid', pair_id: 'uuid', signed_by: 'uuid', signed_at: 'timestamptz' },
  hole_awards: { round_id: 'uuid', group_id: 'uuid', hole: 'int', game_id: 'text', player_id: 'uuid', decided_by: 'uuid', created_at: 'timestamptz' },
}
/** Each phone table's foreign keys, as the migrations name them. Ids here are names, so a uuid's shape is not checked; that it exists is. */
const FOREIGN_KEYS: Record<string, Array<{ name: string; column: string; table: string }>> = {
  scores: [
    { name: 'scores_round_id_fkey', column: 'round_id', table: 'rounds' },
    { name: 'scores_player_id_fkey', column: 'player_id', table: 'players' },
    { name: 'scores_entered_by_fkey', column: 'entered_by', table: 'players' },
  ],
  snake_tiebreaks: [
    { name: 'snake_tiebreaks_round_id_fkey', column: 'round_id', table: 'rounds' },
    { name: 'snake_tiebreaks_group_id_fkey', column: 'group_id', table: 'groups' },
    { name: 'snake_tiebreaks_last_holed_player_id_fkey', column: 'last_holed_player_id', table: 'players' },
    { name: 'snake_tiebreaks_decided_by_fkey', column: 'decided_by', table: 'players' },
  ],
  card_signatures: [
    { name: 'card_signatures_round_id_fkey', column: 'round_id', table: 'rounds' },
    { name: 'card_signatures_pair_id_fkey', column: 'pair_id', table: 'pairs' },
    { name: 'card_signatures_signed_by_fkey', column: 'signed_by', table: 'players' },
  ],
  hole_awards: [
    { name: 'hole_awards_round_id_fkey', column: 'round_id', table: 'rounds' },
    { name: 'hole_awards_group_id_fkey', column: 'group_id', table: 'groups' },
    { name: 'hole_awards_player_id_fkey', column: 'player_id', table: 'players' },
    { name: 'hole_awards_decided_by_fkey', column: 'decided_by', table: 'players' },
  ],
}
const BOOL_TEXT: Record<string, boolean> = { t: true, true: true, y: true, yes: true, on: true, '1': true, f: false, false: false, n: false, no: false, off: false, '0': false }
/** The spaces Postgres's input functions skip around a value (C's isspace): a no-break or an em space is not one, and fails the cast. */
const trimC = (s: string) => s.replace(/^[\t\n\v\f\r ]+|[\t\n\v\f\r ]+$/g, '')
/** An integer as int4in reads one: digits after an optional sign. A JSON number is read from its text, so `1e+21` or `5.5` is none (22P02). */
const INTEGER = /^[\t\n\v\f\r ]*[+-]?\d+[\t\n\v\f\r ]*$/
/** A timestamp as Postgres reads one off the wire (ISO 8601, a space for the T): the date, the time of day and its fraction, the offset. */
const TIMESTAMP = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2})(\.\d+)?)?)?(?:Z|([+-])(\d{2})(?::?(\d{2}))?)?$/i
/**
 * What is out of range in a timestamp's fields, in the order Postgres meets
 * them. The time of day first (`time_overflows`): an hour up to 24, a minute
 * up to 59, a second up to 60 (a leap second), and the whole no later than
 * 24:00:00, its fraction rounded to the microsecond as C's rint rounds it (a
 * tie to the even one, so half a microsecond is none). Then the offset: 15
 * hours and 59 minutes at most (22009). Then the date: there is no year 0,
 * and 30 February is no day.
 */
function timeError(m: RegExpExecArray): '22008' | '22009' | null {
  const n = (i: number) => Number(m[i] ?? 0)
  const day = (n(4) * 60 + n(5)) * 60 + n(6)
  if (n(4) > 24 || n(5) > 59 || n(6) > 60 || day > 86_400 || (day === 86_400 && Number(`0${m[7] ?? ''}`) * 1e6 > 0.5)) return '22008'
  if (m[8] && (n(9) > 15 || n(10) > 59)) return '22009'
  const y = n(1)
  const leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0)
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][n(2) - 1] ?? 0
  return y < 1 || n(3) < 1 || n(3) > days ? '22008' : null
}
const INT4 = [-2147483648, 2147483647] as const
/**
 * The body's values cast to their columns, as json_populate_recordset does
 * before any policy sees the row: an integer from its literal, a boolean from
 * its words; a time that is not one, a fraction or an exponent for an
 * integer, are 22007 / 22P02; an integer or a time's field out of its range
 * is 22003 / 22008 / 22009.
 */
function cast(table: string, row: Row): { row: Row } | { error: FakeError } {
  const out: Row = {}
  for (const [column, v] of Object.entries(row)) {
    const type = COLUMNS[table]?.[column]
    if (v == null || !type || type === 'jsonb') {
      out[column] = v ?? null
      continue
    }
    // The value as the body spells it: Postgres reads a JSON number from its text too.
    const text = typeof v === 'string' ? v : JSON.stringify(v)
    if (type === 'int') {
      if (!INTEGER.test(text)) return { error: { code: '22P02', message: `invalid input syntax for type integer: "${text}"` } }
      const n = Number(text)
      if (n < INT4[0] || n > INT4[1]) return { error: { code: '22003', message: `value "${text}" is out of range for type integer` } }
      out[column] = n
    } else if (type === 'bool') {
      const b = typeof v === 'boolean' ? v : BOOL_TEXT[trimC(text).toLowerCase()]
      if (b === undefined) return { error: { code: '22P02', message: `invalid input syntax for type boolean: "${text}"` } }
      out[column] = b
    } else if (type === 'timestamptz') {
      const m = typeof v === 'string' ? TIMESTAMP.exec(trimC(v)) : null
      if (!m) return { error: { code: '22007', message: `invalid input syntax for type timestamp with time zone: "${text}"` } }
      const code = timeError(m)
      if (code) return { error: { code, message: `${code === '22009' ? 'time zone displacement' : 'date/time field value'} out of range: "${text}"` } }
      out[column] = v
    } else if (type === 'uuid') {
      if (typeof v !== 'string') return { error: { code: '22P02', message: `invalid input syntax for type uuid: "${text}"` } }
      out[column] = v
    } else out[column] = typeof v === 'string' ? v : text
  }
  return { row: out }
}

/** `a is distinct from b`, with a missing column read as null. */
const distinct = (a: unknown, b: unknown) => (a ?? null) !== (b ?? null)

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } })
}

/** `a,"b,c",d` → [a, b,c, d]: PostgREST's list inside `in.(…)`. */
function splitList(list: string): string[] {
  const out: string[] = []
  for (const m of list.matchAll(/"((?:[^"\\]|\\.)*)"|([^,]+)/g)) out.push(m[1] !== undefined ? m[1].replace(/\\(.)/g, '$1') : m[2]!)
  return out
}

/** The columns a `select` names, when it names plain columns only (no `*`, no embedding). */
function selectedColumns(params: URLSearchParams): string[] | null {
  const select = params.get('select')
  if (!select || !/^[a-z_][a-z0-9_]*(,[a-z_][a-z0-9_]*)*$/.test(select)) return null
  return select.split(',')
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

  /**
   * A new row as the database stores it: the key it generates, the columns'
   * defaults, and the insert triggers (0010 `scores_clean_insert`: a player's
   * hole never carries a reason or the discrepancy flags). The row's own
   * values go over the defaults, a null sent too (the key's included: NOT
   * NULL refuses it); the triggers go over the row.
   */
  function withDefaults(table: string, row: Row): Row {
    const keys: readonly string[] = SNAPSHOT_KEYS[table as keyof typeof SNAPSHOT_KEYS] ?? []
    const id = keys.length === 1 && keys[0] === 'id' && row.id == null ? { id: `${table}-${++serial}` } : {}
    if (table === 'scores') return { ...id, picked_up: false, ...row, updated_at: stamp(), disputed: false, previous: null, reason: null }
    if (table === 'snake_tiebreaks' || table === 'hole_awards') return { ...id, created_at: stamp(), ...row }
    if (table === 'card_signatures') return { ...id, signed_at: stamp(), ...row }
    return { ...id, ...row }
  }

  /**
   * A hole another request already stored, changed (0010 `scores_detect_dispute`,
   * 0002 `scores_touch`): for anyone but the Comité's RPCs the reason goes and
   * the flags stay as they were; another phone changing the values is a
   * discrepancy, and the old values are kept with it.
   */
  function scoreUpdated(old: Row, next: Row): Row {
    const row: Row = { ...next, reason: null, disputed: old.disputed, previous: old.previous ?? null }
    const changed = distinct(row.strokes, old.strokes) || distinct(row.putts, old.putts) || row.picked_up !== old.picked_up
    if (changed && row.entered_by != null && distinct(row.entered_by, old.entered_by) && (old.entered_by != null || old.reason != null)) {
      row.disputed = true
      row.previous = { strokes: old.strokes ?? null, putts: old.putts ?? null, picked_up: old.picked_up, entered_by: old.entered_by ?? null, updated_at: old.updated_at ?? null }
    }
    row.updated_at = stamp()
    return row
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

  const rowsOf = (table: string): Row[] => server.tables[table] ?? []
  /**
   * `my_player_id(tid)` (0013): the player confirmed-linked to the caller's
   * profile there, else the caller's PIN claim. A user holds one claim
   * (`device_sessions` is keyed by the user), so it counts in one tournament.
   */
  function myPlayer(uid: string, tid: unknown): unknown {
    if (tid == null) return undefined
    const linked = rowsOf('players').find((p) => p.tournament_id === tid && p.profile_id === uid && p.profile_status === 'confirmed')
    return linked ? linked.id : rowsOf('device_sessions').find((d) => d.auth_user_id === uid && d.tournament_id === tid)?.player_id
  }
  /** `is_tournament_organizer(tid)` (0021, platform admins aside): on the tournament's Comité, or holding a player the Comité made admin. */
  function organizes(uid: string, tid: unknown): boolean {
    if (tid == null) return false
    if (rowsOf('tournament_organizers').some((o) => o.tournament_id === tid && o.auth_user_id === uid)) return true
    const me = myPlayer(uid, tid)
    return me != null && rowsOf('players').some((p) => p.id === me && p.is_admin === true)
  }
  const roundTournament = (rid: unknown) => rowsOf('rounds').find((r) => r.id === rid)?.tournament_id
  const inGroup = (gid: unknown, pid: unknown) => pid != null && rowsOf('group_members').some((m) => m.group_id === gid && m.player_id === pid)
  const groupOfRound = (gid: unknown, rid: unknown) => rowsOf('groups').some((g) => g.id === gid && g.round_id === rid)
  /** `shares_group(rid, pid)`: the caller's player and `pid` play in one group of the round. */
  function sharesGroup(uid: string, rid: unknown, pid: unknown): boolean {
    const me = myPlayer(uid, roundTournament(rid))
    return me != null && rowsOf('groups').some((g) => g.round_id === rid && inGroup(g.id, me) && inGroup(g.id, pid))
  }
  const roundIsLive = (rid: unknown) => rowsOf('rounds').some((r) => r.id === rid && r.status === 'live')
  /** `card_is_signed(rid, pid)`: the card of the player's pair is signed for the round. */
  const cardIsSigned = (rid: unknown, pid: unknown) =>
    rowsOf('card_signatures').some((s) => s.round_id === rid && rowsOf('pairs').some((p) => p.id === s.pair_id && (p.player1_id === pid || p.player2_id === pid)))
  /** The tournament a row belongs to, by the path its read policy takes. */
  function tenantOf(table: string, row: Row): unknown {
    if (table === 'tournaments') return row.id
    if ('tournament_id' in row) return row.tournament_id
    if ('round_id' in row) return roundTournament(row.round_id)
    if ('group_id' in row) return roundTournament(rowsOf('groups').find((g) => g.id === row.group_id)?.round_id)
    if ('lot_id' in row) return rowsOf('calcutta_lots').find((l) => l.id === row.lot_id)?.tournament_id
    return undefined
  }
  /**
   * The read policies (0003, 0011, 0020): a member of a tournament reads all
   * of it; any session reads the course library; a session reads its own PIN
   * claim and Comité seats. The publishable key alone reads none of these.
   */
  function mayRead(table: string, row: Row, uid: string): boolean {
    if (uid === 'anon') return false
    if (table === 'courses' || table === 'tees' || table === 'holes') return true
    if (table === 'device_sessions' || table === 'tournament_organizers') return row.auth_user_id === uid
    // 0004 `audit_log_read`: the Comité's history, not the players'.
    if (table === 'audit_log') return organizes(uid, row.tournament_id)
    const tid = tenantOf(table, row)
    return organizes(uid, tid) || myPlayer(uid, tid) != null
  }

  /** The write policies of the phone tables, as the migrations state them. */
  interface WriteRule {
    /** INSERT's WITH CHECK, and UPDATE's: the row as it would be stored. */
    check(uid: string, row: Row): boolean
    /** UPDATE's USING: an existing row the caller may change. Always false where the table has no UPDATE policy. */
    using(uid: string, row: Row): boolean
    /** DELETE's USING. */
    deletes(uid: string, row: Row): boolean
  }
  /** The group's own rows (0013): the Comité, or a player of the row's group. */
  const groupRow = (uid: string, r: Row) => organizes(uid, roundTournament(r.round_id)) || inGroup(r.group_id, myPlayer(uid, roundTournament(r.round_id)))
  /** 0003 `scores_write` (for all): the Comité, or a phone of the player's group while the round is live and his card unsigned. */
  const scoreRule = (uid: string, r: Row) =>
    organizes(uid, roundTournament(r.round_id)) || (sharesGroup(uid, r.round_id, r.player_id) && roundIsLive(r.round_id) && !cardIsSigned(r.round_id, r.player_id))
  const RULES: Record<string, WriteRule> = {
    scores: { check: scoreRule, using: scoreRule, deletes: scoreRule },
    // 0013 `snake_tiebreaks_write`: a player of the group answers, for the group's own round, naming one of the group, as himself.
    snake_tiebreaks: {
      check(uid, r) {
        const tid = roundTournament(r.round_id)
        const me = myPlayer(uid, tid)
        return organizes(uid, tid) || (groupOfRound(r.group_id, r.round_id) && inGroup(r.group_id, me) && inGroup(r.group_id, r.last_holed_player_id) && me != null && r.decided_by === me)
      },
      using: groupRow,
      deletes: groupRow,
    },
    // 0013 `hole_awards_write`: the same for a hole's winners; the Comité names a winner of the tournament.
    hole_awards: {
      check(uid, r) {
        const tid = roundTournament(r.round_id)
        const me = myPlayer(uid, tid)
        const winnerHere = rowsOf('players').some((p) => p.id === r.player_id && p.tournament_id === tid)
        return (organizes(uid, tid) && winnerHere) || (groupOfRound(r.group_id, r.round_id) && inGroup(r.group_id, me) && inGroup(r.group_id, r.player_id) && me != null && r.decided_by === me)
      },
      using: groupRow,
      deletes: groupRow,
    },
    // 0013 `card_signatures_insert`: in a live round, as himself, the card of a pair of his group that is not his own.
    // 0003 `card_signatures_delete`: the Comité. No UPDATE policy: a signature never changes.
    card_signatures: {
      check(uid, r) {
        const tid = roundTournament(r.round_id)
        if (organizes(uid, tid)) return true
        const me = myPlayer(uid, tid)
        const pair = rowsOf('pairs').find((p) => p.id === r.pair_id && p.tournament_id === tid)
        return (
          !!pair &&
          me != null &&
          roundIsLive(r.round_id) &&
          r.signed_by === me &&
          sharesGroup(uid, r.round_id, pair.player1_id) &&
          sharesGroup(uid, r.round_id, pair.player2_id) &&
          me !== pair.player1_id &&
          me !== pair.player2_id
        )
      },
      using: () => false,
      deletes: (uid, r) => organizes(uid, roundTournament(r.round_id)),
    },
  }
  // Not modelled: signing a card clears none of its discrepancies. 0008's
  // `card_signature_settles` updates the scores through 0010's dispute
  // trigger, which keeps the old flags for anyone but the Comité (NEW-01).

  /** The first NOT NULL column or check the row breaks, as PostgREST answers it. */
  function constraintError(table: string, row: Row): Response | null {
    const empty = (NOT_NULL[table] ?? []).find((c) => row[c] == null)
    if (empty) return json(400, { code: '23502', details: null, hint: null, message: `null value in column "${empty}" of relation "${table}" violates not-null constraint` })
    const broken = (CHECKS[table] ?? []).find(([, holds]) => !holds(row))
    return broken ? json(400, { code: '23514', details: null, hint: null, message: `new row for relation "${table}" violates check constraint "${broken[0]}"` }) : null
  }

  function unsupported(req: Exchange, why: string): never {
    server.unexpected.push(`${req.method} ${req.target}: ${why}`)
    throw new TypeError('Failed to fetch')
  }

  /**
   * A write, as PostgREST runs it: one statement, so every row is written or
   * none is. In the order Postgres checks them: the columns' privileges; per
   * row the insert triggers, the INSERT policy, NOT NULL and the checks, then
   * the unique keys. An upsert that meets an existing row (on its
   * `on_conflict` key, else the primary key) skips it, or updates it through
   * the existing row's UPDATE policy, the update triggers and the policy again.
   */
  function write(req: Exchange, headers: Headers): Response {
    const table = req.target
    const rule = RULES[table]
    if (!rule) return unsupported(req, `${table} is not a table a phone writes`)
    const caller = req.as
    const refused = (message: string) => json(caller === 'anon' ? 401 : 403, { code: '42501', details: null, hint: null, message })
    const policy = (usingClause = false) => refused(`new row violates row-level security policy${usingClause ? ' (USING expression)' : ''} for table "${table}"`)
    const rows = rowsOf(table)
    if (req.method === 'DELETE') {
      const spec = readFromUrl(table, req.params, headers)
      if (typeof spec === 'string') return unsupported(req, spec)
      // Row-level security hides the rows a caller may not delete: they stay, and nothing says so.
      server.tables[table] = rows.filter((r) => !(spec.filters.every((f) => f.test(r)) && mayRead(table, r, caller) && rule.deletes(caller, r)))
      return new Response(null, { status: 204 })
    }
    if (req.method !== 'POST') return unsupported(req, 'only GET, POST and DELETE are served')
    const incoming = (Array.isArray(req.body) ? req.body : [req.body]) as Row[]
    const resolution = /resolution=(merge|ignore)-duplicates/.exec(headers.get('prefer') ?? '')?.[1]
    // The columns written: PostgREST's `columns` when it is sent (supabase-js names every key of a list's
    // rows), and then only those keys of the body are read; else the body's keys.
    const listed = req.params.get('columns')?.split(',').map((c) => c.replace(/"/g, '').trim())
    const columns = listed ?? [...new Set(incoming.flatMap((r) => Object.keys(r)))]
    // In the order they are met. PostgREST refuses a column its schema cache doesn't know before the database sees the request.
    const unknown = columns.find((c) => !(c in (COLUMNS[table] ?? {})))
    if (unknown) return json(400, { code: 'PGRST204', details: null, hint: null, message: `Could not find the '${unknown}' column of '${table}' in the schema cache` })
    // Planning: the ON CONFLICT target must be a unique key.
    const keys = UNIQUE_KEYS[table]!
    const target = resolution ? (req.params.get('on_conflict')?.split(',') ?? keys[0]!.columns) : null
    if (target && !keys.some((k) => k.columns.length === target.length && k.columns.every((c) => target.includes(c)))) {
      return json(400, { code: '42P10', details: null, hint: null, message: 'there is no unique or exclusion constraint matching the ON CONFLICT specification' })
    }
    // Then the columns' privileges: 0010 revoked `scores` from sessions but for the card's own columns (the publishable key's grants were left whole).
    if (table === 'scores' && caller !== 'anon' && columns.some((c) => !SCORE_INSERT.has(c) || (resolution === 'merge' && !SCORE_UPDATE.has(c)))) {
      return refused(`permission denied for table ${table}`)
    }
    // The body is cast to the columns' types whole (json_populate_recordset) before any row meets a
    // policy. With `columns`, a listed key a row leaves out is null in it, not the column's default (an
    // upsert sets it so over the row it meets), and a key it doesn't list is not written.
    const typedRows: Row[] = []
    for (const sent of incoming) {
      const full = listed ? Object.fromEntries(listed.map((c) => [c, Object.hasOwn(sent, c) ? sent[c] : null])) : sent
      const typed = cast(table, full)
      if ('error' in typed) return restError(typed.error)
      typedRows.push(typed.row)
    }
    const next = rows.map((r) => ({ ...r }))
    const stored: Row[] = []
    /** Rows of `next` this statement wrote: DO UPDATE may not reach one of them again (21000). */
    const written = new Set<Row>()
    const meets = (cols: string[], row: Row) => next.findIndex((r) => cols.every((c) => r[c] != null && r[c] === row[c]))
    for (const proposed of typedRows) {
      // Then row by row: the defaults and insert triggers, the policy, the checks, the keys.
      const row = withDefaults(table, proposed)
      if (!rule.check(caller, row)) return policy()
      const bad = constraintError(table, row)
      if (bad) return bad
      const at = target ? meets(target, row) : -1
      if (at < 0) {
        const taken = keys.find((k) => meets(k.columns, row) >= 0)
        if (taken) return json(409, { code: '23505', details: null, hint: null, message: `duplicate key value violates unique constraint "${taken.name}"` })
        next.push(row)
        stored.push(row)
        written.add(row)
        continue
      }
      if (resolution === 'ignore') continue
      const old = next[at]!
      if (written.has(old)) {
        return json(500, { code: '21000', details: null, hint: 'Ensure that no rows proposed for insertion within the same command have duplicate constrained values.', message: 'ON CONFLICT DO UPDATE command cannot affect row a second time' })
      }
      if (!mayRead(table, old, caller) || !rule.using(caller, old)) return policy(true)
      const merged = { ...old, ...Object.fromEntries(Object.entries(proposed).filter(([c]) => columns.includes(c))) }
      const updated = table === 'scores' ? scoreUpdated(old, merged) : merged
      if (!rule.check(caller, updated)) return policy()
      const badUpdate = constraintError(table, updated)
      if (badUpdate) return badUpdate
      next[at] = updated
      stored.push(updated)
      written.add(updated)
    }
    // At the statement's end, the foreign keys (checked by the table's owner: no policy hides the row they point to).
    for (const row of stored) {
      const broken = (FOREIGN_KEYS[table] ?? []).find((fk) => row[fk.column] != null && !rowsOf(fk.table).some((r) => r.id === row[fk.column]))
      if (broken) return json(409, { code: '23503', details: null, hint: null, message: `insert or update on table "${table}" violates foreign key constraint "${broken.name}"` })
    }
    server.tables[table] = next
    for (const row of stored) server.writes.push({ table, row: { ...row }, by: caller })
    return new Response(null, { status: 201 })
  }

  /** The functions a phone calls on its way in; any other answers `rpcResult`. */
  function rpc(name: string, args: Record<string, unknown>, as: string): Response {
    server.rpcCalls.push({ name, args: structuredClone(args) })
    if (name === 'claim_player') {
      if (as === 'anon') return json(401, { code: '42501', details: null, hint: null, message: 'permission denied for function claim_player' })
      const player = (server.tables.players ?? []).find((p) => p.id === args.p_player_id)
      if (!player) return json(200, { ok: false, reason: 'not_found' })
      // An account confirmed as another player of the tournament plays as him (0014).
      const linked = rowsOf('players').find((p) => p.tournament_id === player.tournament_id && p.profile_id === as && p.profile_status === 'confirmed')
      if (linked && linked.id !== player.id) return json(200, { ok: false, reason: 'already_linked', playerId: linked.id })
      const pin = server.auth.pins[String(player.id)]
      if (!pin) return json(200, { ok: false, reason: 'no_pin' })
      if (pin !== args.p_pin) return json(200, { ok: false, reason: 'wrong_pin', attemptsLeft: 4 })
      const tid = player.tournament_id
      // One claim per user (device_sessions' key): claiming here ends the claim it held anywhere else.
      server.tables.device_sessions = [...rowsOf('device_sessions').filter((d) => d.auth_user_id !== as), { auth_user_id: as, player_id: player.id, tournament_id: tid }]
      return json(200, { ok: true, playerId: player.id, tournamentId: tid })
    }
    if (name === 'my_membership') {
      // 0021's answer, platform admins aside: the Comité seat's role, else a member by player; admin by seat or by the Comité's flag on the player.
      const tid = String(args.tid)
      const playerId = (myPlayer(as, tid) as string | undefined) ?? null
      const seat = rowsOf('tournament_organizers').find((o) => o.tournament_id === tid && o.auth_user_id === as)
      const byProfile = rowsOf('players').some((p) => p.tournament_id === tid && p.profile_id === as && p.profile_status === 'confirmed')
      const adminPlayer = playerId != null && rowsOf('players').some((p) => p.id === playerId && p.is_admin === true)
      const t = rowsOf('tournaments').find((x) => x.id === tid)
      return json(200, {
        playerId,
        role: seat?.role ?? (playerId != null ? 'member' : 'none'),
        isOrganizer: !!seat,
        isAdmin: !!seat || adminPlayer,
        via: byProfile ? 'profile' : playerId != null ? 'device' : null,
        protected: t ? (t.is_protected ?? false) : null,
      })
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
    const result = read(server, spec, (r) => mayRead(spec.table, r, req.as))
    const gate = spec.table === 'tournaments' ? gates.shift() : undefined
    if (gate) {
      gate.markReceived()
      // A held answer that fails is the signal dropping while it was on its way.
      if (await Promise.race([gate.answer, aborted])) throw new TypeError('Failed to fetch')
    }
    if (result.error) return restError(result.error)
    const cols = selectedColumns(req.params)
    const pick = (r: Row) => (cols ? Object.fromEntries(cols.map((c) => [c, r[c] ?? null])) : r)
    return json(200, Array.isArray(result.data) ? result.data.map(pick) : pick(result.data as Row))
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
      pins: {},
      lifetime: 3600,
      lapse(uid) {
        for (const t of access.values()) if (t.uid === uid) t.until = Math.min(t.until, Date.now() - 1000)
        for (const [t, owner] of refresh) if (owner === uid) refresh.delete(t)
      },
      playerOf(uid, tournamentId) {
        const player = myPlayer(uid, tournamentId)
        return player == null ? null : String(player)
      },
      sessionFor(uid) {
        if (!server.auth.users.includes(uid)) server.auth.users.push(uid)
        return session(uid).access_token
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
      const claims = server.tables.device_sessions
      server.tables = structuredClone(initial)
      // The phones that entered stay in: their PIN claims are the server's, not the test's tables.
      if (claims && !server.tables.device_sessions) server.tables.device_sessions = claims
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
