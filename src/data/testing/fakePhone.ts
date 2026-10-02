/**
 * The network and the browser under the outbox, for tests (QA-06).
 *
 * `FakeServer` is a small Supabase REST (PostgREST) server held in memory and
 * reached through a stubbed `fetch`, so the app's own client runs unchanged:
 * src/lib/supabase.ts with its 12 s request timeout (REL-14), and the outbox's
 * real `push`. Each request can be answered, refused, lost by the network, or
 * held in flight until the test lets it go.
 *
 * `FakeBrowser` stands in for what the outbox listens to: `navigator.onLine`,
 * the window's `online` event and the document's `visibilitychange`.
 *
 * Call `installFakeSupabase()` at the top of a test file, before importing any
 * module that imports the Supabase client.
 */
import { afterEach, expect, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '../../engine/settings/presets'
import { PAR_72 } from '../../engine/testing/fixtures'
import type { ScorePayload, TiebreakPayload } from '../outbox'

export type Row = Record<string, unknown>

/** One request the phone sent, as the network saw it. */
export interface Exchange {
  method: string
  table: string
  params: URLSearchParams
  body: unknown
  /** The status the server answered, or how the network lost it. Unset while in flight. */
  result?: number | 'offline' | 'aborted'
}

/**
 * What happens to one request: the server answers it from its tables, the
 * network fails it (`TypeError: Failed to fetch`), it hangs until the client
 * gives up, or the server answers with this status and body.
 */
export type Outcome = 'answer' | 'offline' | 'stall' | { status: number; body: unknown }

/** PostgREST's answer to a write the row-level security policies refuse. */
export function refusedByRls(table: string): Outcome {
  return { status: 403, body: { code: '42501', details: null, hint: null, message: `new row violates row-level security policy for table "${table}"` } }
}

/** A promise the test resolves by hand: a request held in flight. */
export function gate(): { wait: Promise<void>; open: () => void } {
  let open!: () => void
  const wait = new Promise<void>((r) => (open = r))
  return { wait, open }
}

const URL_BASE = 'https://fake-polo.supabase.test'
const NOT_FILTERS = new Set(['select', 'order', 'offset', 'limit', 'on_conflict', 'columns'])

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

/** PostgREST filters the client uses: `col=eq.x` and `col=in.(a,b)`. */
function matches(row: Row, params: URLSearchParams): boolean {
  for (const [col, filter] of params) {
    if (NOT_FILTERS.has(col)) continue
    const value = String(row[col])
    if (filter.startsWith('eq.')) {
      if (value !== filter.slice(3)) return false
    } else if (filter.startsWith('in.(') && filter.endsWith(')')) {
      const list = filter.slice(4, -1).split(',').map((v) => v.replace(/^"(.*)"$/, '$1'))
      if (!list.includes(value)) return false
    } else {
      throw new Error(`FakeServer: unsupported filter ${col}=${filter}`)
    }
  }
  return true
}

export class FakeServer {
  readonly url = URL_BASE
  tables: Record<string, Row[]> = {}
  /** Every request the phone sent, in order, including the ones the network lost. */
  requests: Exchange[] = []
  /** Every row the server wrote, in order: what the database saw happen. */
  writes: Array<{ table: string; row: Row }> = []
  /** Requests to anything but the REST API: none are expected. */
  unexpected: string[] = []
  /** Decides each request's fate; may wait, and the request stays in flight meanwhile. */
  decide: (req: Exchange) => Outcome | Promise<Outcome> = () => 'answer'
  private clock = 0

  /** Back to the seeded tournament, an empty log and a network that answers. */
  reset() {
    this.tables = tournamentTables()
    this.requests = []
    this.writes = []
    this.unexpected = []
    this.decide = () => 'answer'
  }

  /** Requests that write (`POST`, `DELETE`) to `table`. */
  writeRequests(table = 'scores'): Exchange[] {
    return this.requests.filter((r) => r.table === table && r.method !== 'GET')
  }

  /** The strokes the server wrote for one hole of one player, in the order it wrote them. */
  strokesWritten(player: string, hole: number, round = 'r1'): unknown[] {
    return this.writes.filter((w) => w.table === 'scores' && w.row.round_id === round && w.row.player_id === player && w.row.hole === hole).map((w) => w.row.strokes)
  }

  /** The score row the server holds for one hole of one player. */
  score(player: string, hole: number, round = 'r1'): Row | undefined {
    return (this.tables.scores ?? []).find((r) => r.round_id === round && r.player_id === player && r.hole === hole)
  }

  readonly fetch = async (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
    const method = (init.method ?? 'GET').toUpperCase()
    const path = /^\/rest\/v1\/([a-z_]+)$/.exec(url.pathname)
    if (url.origin !== this.url || !path) {
      this.unexpected.push(`${method} ${url.href}`)
      throw new TypeError('Failed to fetch')
    }
    const headers = new Headers(init.headers)
    const req: Exchange = { method, table: path[1]!, params: url.searchParams, body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined }
    this.requests.push(req)

    // Like a browser: an aborted request rejects with the signal's reason.
    const signal = init.signal
    const aborted = new Promise<never>((_, reject) => {
      if (signal?.aborted) reject(signal.reason)
      signal?.addEventListener('abort', () => reject(signal.reason), { once: true })
    })
    aborted.catch(() => undefined)
    let outcome: Outcome
    try {
      outcome = await Promise.race([Promise.resolve(this.decide(req)), aborted])
      if (outcome === 'stall') await aborted
    } catch (e) {
      req.result = 'aborted'
      throw e
    }
    if (outcome === 'offline') {
      req.result = 'offline'
      throw new TypeError('Failed to fetch')
    }
    if (typeof outcome === 'object') {
      req.result = outcome.status
      return json(outcome.status, outcome.body)
    }
    const res = this.answer(req, headers)
    req.result = res.status
    return res
  }

  private answer(req: Exchange, headers: Headers): Response {
    const rows = (this.tables[req.table] ??= [])
    if (req.method === 'GET') {
      const found = rows.filter((r) => matches(r, req.params))
      const offset = Number(req.params.get('offset') ?? 0)
      const limit = req.params.get('limit')
      const page = found.slice(offset, limit == null ? undefined : offset + Number(limit))
      if ((headers.get('accept') ?? '').includes('vnd.pgrst.object')) {
        if (page.length !== 1) return json(406, { code: 'PGRST116', details: `The result contains ${page.length} rows`, hint: null, message: 'JSON object requested, multiple (or no) rows returned' })
        return json(200, page[0])
      }
      return json(200, page)
    }
    if (req.method === 'POST') {
      const conflict = req.params.get('on_conflict')?.split(',')
      const ignoreDuplicates = (headers.get('prefer') ?? '').includes('resolution=ignore-duplicates')
      for (const incoming of (Array.isArray(req.body) ? req.body : [req.body]) as Row[]) {
        const i = conflict ? rows.findIndex((r) => conflict.every((c) => r[c] === incoming[c])) : -1
        if (i >= 0 && ignoreDuplicates) continue
        const row = { ...(i >= 0 ? rows[i] : {}), ...incoming, updated_at: this.stamp() }
        if (i >= 0) rows[i] = row
        else rows.push(row)
        this.writes.push({ table: req.table, row: { ...row } })
      }
      return new Response(null, { status: 201 })
    }
    if (req.method === 'DELETE') {
      this.tables[req.table] = rows.filter((r) => !matches(r, req.params))
      return new Response(null, { status: 204 })
    }
    throw new Error(`FakeServer: unsupported ${req.method} ${req.table}`)
  }

  /** The server's own clock for `updated_at`: never a value the phone sent. */
  private stamp(): string {
    return new Date(Date.UTC(2027, 3, 9, 16, 0, ++this.clock)).toISOString()
  }
}

/** The channel the outbox's tabs talk on (outbox.ts `CHANNEL`). */
const OUTBOX_CHANNEL = 'cardi-golf-outbox'

function newWindow() {
  return Object.assign(new EventTarget(), { location: new URL('https://golf.test/t/ensayo/tarjeta') })
}
function newDocument() {
  return Object.assign(new EventTarget(), { visibilityState: 'visible' as 'visible' | 'hidden' })
}

export class FakeBrowser {
  online = true
  window = newWindow()
  document = newDocument()
  /** The outbox channels the open page created: closing the page closes them. */
  private channels: BroadcastChannel[] = []

  install() {
    const pageChannels = this.channels
    class PageChannel extends BroadcastChannel {
      constructor(name: string) {
        super(name)
        if (name === OUTBOX_CHANNEL) pageChannels.push(this)
      }
    }
    vi.stubGlobal('BroadcastChannel', PageChannel)
    this.stubPage()
    Object.defineProperty(globalThis.navigator, 'onLine', { configurable: true, get: () => this.online })
  }
  /**
   * The page is closed and loaded again: the listeners and the outbox channel
   * the old page set up are gone with it. Storage and the network stay.
   */
  reloadPage() {
    for (const c of this.channels.splice(0)) c.close()
    this.window = newWindow()
    this.document = newDocument()
    this.stubPage()
  }
  private stubPage() {
    vi.stubGlobal('window', this.window)
    vi.stubGlobal('document', this.document)
  }
  /** The phone loses the signal: `navigator.onLine` turns false. */
  goOffline() {
    this.online = false
    this.window.dispatchEvent(new Event('offline'))
  }
  /** The signal comes back: `navigator.onLine` and the window's `online` event. */
  goOnline() {
    this.online = true
    this.window.dispatchEvent(new Event('online'))
  }
  /** The player comes back to the app (it was in the background). */
  show() {
    this.document.visibilityState = 'visible'
    this.document.dispatchEvent(new Event('visibilitychange'))
  }
}

/**
 * Point the app's Supabase client at a `FakeServer` and give it a browser.
 * Must run at the top of the test file, before the client's module is
 * imported: it reads its URL on load. Every test then fails if the app sent
 * anything the fake does not serve (auth, storage, another host).
 */
export function installFakeSupabase(): { server: FakeServer; browser: FakeBrowser } {
  const server = new FakeServer()
  server.reset()
  const browser = new FakeBrowser()
  vi.stubEnv('VITE_SUPABASE_URL', server.url)
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key-for-tests')
  vi.stubGlobal('fetch', server.fetch)
  browser.install()
  afterEach(() => {
    expect(server.unexpected, 'requests the fake server does not serve').toEqual([])
  })
  return { server, browser }
}

/** One live round of one foursome: tournament t1, round r1, players p1–p4 in group g1 on a par-72 card. */
export function tournamentTables(): Record<string, Row[]> {
  const players = ['p1', 'p2', 'p3', 'p4']
  return {
    tournaments: [
      {
        id: 't1',
        slug: 'ensayo',
        name: 'Ensayo',
        join_code: 'ABC123',
        status: 'live',
        current_round_id: 'r1',
        banker_player_id: 'p1',
        settings: DEFAULT_SETTINGS,
        timezone: 'America/Mazatlan',
        currency: 'MXN',
      },
    ],
    players: players.map((id, i) => ({ id, tournament_id: 't1', full_name: `Jugador ${i + 1}`, display_name: `J${i + 1}`, base_hcp: 18, handicap_source: 'manual', default_tee_id: 'tee1', sort_order: i + 1 })),
    rounds: [{ id: 'r1', tournament_id: 't1', number: 1, course_id: 'course1', holes: 18, status: 'live' }],
    courses: [{ id: 'course1', name: 'Campo de prueba' }],
    tees: [{ id: 'tee1', course_id: 'course1', name: 'Azules', color: 'blue', rating: null, slope: null }],
    holes: PAR_72.map(([par, si], i) => ({ tee_id: 'tee1', number: i + 1, par, stroke_index: si })),
    groups: [{ id: 'g1', round_id: 'r1', number: 1, start_hole: 1 }],
    group_members: players.map((player_id) => ({ group_id: 'g1', player_id })),
    scores: [],
    snake_tiebreaks: [],
  }
}

/** A hole of one player as the Tarjeta saves it. */
export function holeScore(player: string, hole: number, strokes: number, round = 'r1'): ScorePayload {
  return { round_id: round, player_id: player, hole, strokes, putts: 2, picked_up: false, entered_by: 'p1', client_ts: `phone:${player}:${hole}:${strokes}` }
}

/** The group's answer to «¿Quién embocó al último?» on a hole. */
export function snakeAnswer(hole: number, lastHoled: string): TiebreakPayload {
  return { round_id: 'r1', group_id: 'g1', hole, last_holed_player_id: lastHoled, decided_by: 'p1' }
}

// Real event-loop turns: fake-indexeddb and the client's promises run on
// them whatever a fake clock does with setTimeout.
const realSetImmediate = globalThis.setImmediate
export function turn(): Promise<void> {
  return new Promise((r) => realSetImmediate(r))
}

/** Wait, in real turns, until `cond` holds. Fails the test if it never does. */
export async function until(cond: () => boolean, what: string, turns = 5000): Promise<void> {
  for (let i = 0; i < turns; i++) {
    if (cond()) return
    await turn()
  }
  throw new Error(`Gave up waiting for ${what}`)
}

/** Let the work already started run out: the outbox ends its pass (it may have armed a timer). */
export async function settle(outbox: { getState(): { syncing: boolean } }): Promise<void> {
  for (let i = 0; i < 50; i++) await turn()
  await until(() => !outbox.getState().syncing, 'the outbox to end its pass')
}
