/**
 * An in-memory stand-in for the Supabase client (QA-07), never imported by
 * the app. It covers what the data layer reads with: `from(table).select()`
 * with `eq` / `in` filters, `order`, `range` and `single`; `rpc`; and the
 * Realtime channel the store opens.
 *
 * It answers the way PostgREST does, which is what the tests lean on:
 * - rows come back in the order asked for, and never more than 1,000 in one
 *   response, whatever range was asked (the server's max-rows);
 * - ordering by a column the table doesn't have is a 400 (ARCH-09);
 * - each read sees the table as it was when the request was made, even if
 *   its answer is held back (`hold`) to arrive after a later one.
 */
import type { Row } from '../mappers'
import { compareValues } from './rows'

/** PostgREST's max-rows on Supabase: the server's cap, not the client's page size. */
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

export interface FakeSupabase {
  /** What `supabase()` returns. */
  client: {
    from(table: string): Query
    rpc(name: string, args?: Record<string, unknown>): Promise<Result>
    channel(name: string, opts?: unknown): FakeChannel
    removeChannel(ch: FakeChannel): Promise<void>
  }
  /** The server's tables: edit them to change what the next read sees. */
  tables: Record<string, Row[]>
  requests: FakeRequest[]
  rpcCalls: Array<{ name: string; args: Record<string, unknown> | undefined }>
  /** What `rpc` answers (default: no data, no error). */
  rpcResult: Result
  channels: FakeChannel[]
  /** Every read fails with this while set (no signal). */
  down: FakeError | null
  /** Hold back the answer to the next tournament snapshot (its `tournaments` read). */
  hold(): Hold
}

interface Gate {
  markReceived(): void
  /** Settles with null (release) or the error to answer with (fail). */
  answer: Promise<FakeError | null>
}

class Query implements PromiseLike<Result> {
  private readonly server: FakeSupabase
  private readonly gates: Gate[]
  private readonly table: string
  private readonly filters: Array<{ label: string; test: (r: Row) => boolean }> = []
  private readonly orders: string[] = []
  private rangeArg: [number, number] | null = null
  private one = false

  constructor(server: FakeSupabase, gates: Gate[], table: string) {
    this.server = server
    this.gates = gates
    this.table = table
  }

  select(_columns = '*'): this {
    return this
  }
  eq(column: string, value: unknown): this {
    this.filters.push({ label: `${column}=eq.${String(value)}`, test: (r) => r[column] === value })
    return this
  }
  in(column: string, values: readonly unknown[]): this {
    this.filters.push({ label: `${column}=in.(${values.length})`, test: (r) => values.includes(r[column]) })
    return this
  }
  order(column: string): this {
    this.orders.push(column)
    return this
  }
  range(from: number, to: number): this {
    this.rangeArg = [from, to]
    return this
  }
  single(): this {
    this.one = true
    return this
  }

  /** What the server answers, read now. */
  private run(): Result {
    const { server, table } = this
    server.requests.push({ table, filters: this.filters.map((f) => f.label), order: [...this.orders], range: this.rangeArg, single: this.one })
    if (server.down) return { data: null, error: server.down }
    const all = server.tables[table]
    if (!all) return { data: null, error: { message: `Could not find the table 'public.${table}' in the schema cache`, code: 'PGRST205' } }
    const missing = all.length ? this.orders.find((c) => !(c in all[0]!)) : undefined
    if (missing) return { data: null, error: { message: `column ${table}.${missing} does not exist`, code: '42703' } }
    const rows = all.filter((r) => this.filters.every((f) => f.test(r)))
    if (this.orders.length) {
      rows.sort((a, b) => {
        for (const c of this.orders) {
          const d = compareValues(a[c], b[c])
          if (d) return d
        }
        return 0
      })
    }
    const [from, to] = this.rangeArg ?? [0, Number.MAX_SAFE_INTEGER]
    const page = rows.slice(from, Math.min(to + 1, from + SERVER_MAX_ROWS))
    if (this.one) {
      return page.length === 1 ? { data: structuredClone(page[0]), error: null } : { data: null, error: { message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116' } }
    }
    return { data: structuredClone(page), error: null }
  }

  then<A = Result, B = never>(onFulfilled?: ((value: Result) => A | PromiseLike<A>) | null, onRejected?: ((reason: unknown) => B | PromiseLike<B>) | null): PromiseLike<A | B> {
    const result = this.run()
    const gate = this.table === 'tournaments' ? this.gates.shift() : undefined
    if (!gate) return Promise.resolve(result).then(onFulfilled, onRejected)
    gate.markReceived()
    return gate.answer.then((error) => (error ? { data: null, error } : result)).then(onFulfilled, onRejected)
  }
}

export function fakeSupabase(tables: Record<string, Row[]>): FakeSupabase {
  const gates: Gate[] = []
  const server: FakeSupabase = {
    tables: structuredClone(tables),
    requests: [],
    rpcCalls: [],
    rpcResult: { data: null, error: null },
    channels: [],
    down: null,
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
  }
  return server
}
