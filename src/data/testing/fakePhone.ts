/**
 * The phone under the outbox tests (QA-06): its browser (the signal, the
 * page's events, the site's storage) and the app's real Supabase client
 * pointed at the network door of the one fake server (testing/fakeSupabase.ts).
 *
 * Nothing between the outbox and the server is a stand-in: supabase-js builds
 * the requests, auth-js keeps the session in the phone's localStorage and
 * refreshes it, lib/supabase.ts gives every request its 12 s deadline. The
 * player gets in as on a real phone: an anonymous session, then the PIN
 * (`enterAs`).
 *
 * Call `installFakePhone()` at the top of a test file, before importing any
 * module that imports the Supabase client: the client reads its URL on load.
 * Every test then fails if the app sent anything the fake does not serve
 * (another host, an endpoint it doesn't know, a Realtime socket).
 */
import { afterAll, afterEach, expect, vi } from 'vitest'
import { makeSnapshot } from '../../engine/testing/fixtures'
import type { Row } from '../mappers'
import type { AwardPayload, ScorePayload, TiebreakPayload } from '../outbox'
import { fakeSupabase, type Exchange, type FakeSupabase, type Outcome } from './fakeSupabase'
import { snapshotToRows } from './rows'

export type { Outcome }

/** The PIN of each player of the seeded foursome. */
export const PIN = '1234'
/** Where auth-js keeps the session (lib/supabase.ts, `storageKey`). */
export const SESSION_KEY = 'cardi-golf-auth'
/** The channel the outbox's tabs talk on (outbox.ts, `CHANNEL`). */
export const OUTBOX_CHANNEL = 'cardi-golf-outbox'

/**
 * One live round of one foursome, as the server holds it: tournament t1
 * («ensayo»), round r1, players p1–p4 in group g1 starting on hole 1, on a
 * par-72 card. They are two pairs, pa (p1, p2) and pb (p3, p4), and each
 * signs the other's card (§9.3). The engine's fixture written out by
 * testing/rows.ts.
 */
export function tournamentRows(): Record<string, Row[]> {
  const group = { id: 'g1', roundId: 'r1', number: 1, teeTime: null, startHole: 1, playerIds: ['p1', 'p2', 'p3', 'p4'] }
  const snapshot = makeSnapshot({ players: 4, rounds: 1, groups: [group] })
  snapshot.pairs = [
    { id: 'pa', name: null, player1Id: 'p1', player2Id: 'p2', kind: null, pickedByHonoree: false, drawnAt: null },
    { id: 'pb', name: null, player1Id: 'p3', player2Id: 'p4', kind: null, pickedByHonoree: false, drawnAt: null },
  ]
  return snapshotToRows(snapshot)
}

/** A hole of one player as the Tarjeta saves it. */
export function holeScore(player: string, hole: number, strokes: number, round = 'r1'): ScorePayload {
  // A time, as the phone stamps it: the column is a timestamptz, and the database refuses anything else (22007).
  return { round_id: round, player_id: player, hole, strokes, putts: 2, picked_up: false, entered_by: 'p1', client_ts: new Date(Date.UTC(2027, 3, 9, 12, hole, strokes)).toISOString() }
}
/** The group's answer to «¿Quién embocó al último?» on a hole. */
export function snakeAnswer(hole: number, lastHoled: string): TiebreakPayload {
  return { round_id: 'r1', group_id: 'g1', hole, last_holed_player_id: lastHoled, decided_by: 'p1' }
}
/** The group's winners of a hole contest: one push of two requests (the old answer goes, the new one goes in). */
export function holeAward(hole: number, winners: string[]): AwardPayload {
  return { round_id: 'r1', group_id: 'g1', hole, game_id: 'closest', player_ids: winners, decided_by: 'p1' }
}

/** A write to `table` (POST or DELETE): what `decide` usually picks out. */
export function isWrite(req: Exchange, table = 'scores'): boolean {
  return req.target === table && req.method !== 'GET'
}
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

/** The site's localStorage: it outlives the page, like the phone's. */
export class MemoryStorage {
  private readonly items = new Map<string, string>()
  /** Keys whose next read is their last (`dropAfterRead`). */
  private readonly dropping = new Set<string>()
  get length(): number {
    return this.items.size
  }
  key(i: number): string | null {
    return [...this.items.keys()][i] ?? null
  }
  getItem(key: string): string | null {
    const value = this.items.get(key) ?? null
    if (this.dropping.delete(key)) this.items.delete(key)
    return value
  }
  setItem(key: string, value: string): void {
    this.items.set(key, String(value))
  }
  removeItem(key: string): void {
    this.items.delete(key)
  }
  clear(): void {
    this.items.clear()
  }
  /** What is stored under `key`, read without touching it. */
  peek(key: string): string | null {
    return this.items.get(key) ?? null
  }
  /** The next read of `key` gets the value, and the value is gone right after (another tab signed out in between). */
  dropAfterRead(key: string): void {
    this.dropping.add(key)
  }
}

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
  /** The site's storage: the session auth-js keeps stays here across a reload. */
  readonly localStorage = new MemoryStorage()
  /** The channels the open page created (the outbox's, auth-js's): closing the page closes them. */
  private channels: BroadcastChannel[] = []

  /** What `navigator.onLine` was before the phone took it over. */
  private onLine: PropertyDescriptor | undefined

  install() {
    const pageChannels = this.channels
    class PageChannel extends BroadcastChannel {
      constructor(name: string) {
        super(name)
        pageChannels.push(this)
      }
    }
    vi.stubGlobal('BroadcastChannel', PageChannel)
    vi.stubGlobal('localStorage', this.localStorage)
    this.stubPage()
    this.onLine = Object.getOwnPropertyDescriptor(globalThis.navigator, 'onLine')
    Object.defineProperty(globalThis.navigator, 'onLine', { configurable: true, get: () => this.online })
  }
  /** Everything `install` replaced goes back, and the page's channels close. */
  uninstall() {
    for (const c of this.channels.splice(0)) c.close()
    if (this.onLine) Object.defineProperty(globalThis.navigator, 'onLine', this.onLine)
    else delete (globalThis.navigator as { onLine?: boolean }).onLine
  }
  /**
   * The page is closed and loaded again: the listeners and channels the old
   * page set up are gone with it. Storage (IndexedDB, localStorage) and the
   * network stay.
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
  /** The phone loses the signal: `navigator.onLine` turns false and nothing gets out. */
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
  /** The session auth-js keeps, as stored. */
  storedSession(): { access_token: string; expires_at: number; user: { id: string } } | null {
    const raw = this.localStorage.peek(SESSION_KEY)
    return raw ? JSON.parse(raw) : null
  }
  /** Hours go by for the stored session: its access token has run out (auth-js must refresh it before using it). */
  ageSession() {
    const s = this.storedSession()
    if (!s) throw new Error('no stored session to age')
    this.localStorage.setItem(SESSION_KEY, JSON.stringify({ ...s, expires_at: Math.floor(Date.now() / 1000) - 60 }))
  }
}

/**
 * Point the app's Supabase client at a fresh fake server, and give it a
 * phone. Must run at the top of the test file, before the client's module is
 * imported: it reads its URL on load.
 */
export function installFakePhone(): { server: FakeSupabase; phone: FakeBrowser } {
  const server = fakeSupabase(tournamentRows())
  for (const p of ['p1', 'p2', 'p3', 'p4']) server.auth.pins[p] = PIN
  const phone = new FakeBrowser()
  // With no signal, no request gets out at all.
  server.reachable = () => phone.online
  vi.stubEnv('VITE_SUPABASE_URL', server.url)
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', server.anonKey)
  vi.stubGlobal('fetch', server.fetch)
  // The outbox never needs Realtime; a socket to the fake host would only fail in the background.
  vi.stubGlobal(
    'WebSocket',
    class {
      constructor(url: string) {
        server.unexpected.push(`WebSocket ${url}`)
        throw new Error('fakePhone: no Realtime socket in these tests')
      }
    },
  )
  phone.install()
  afterEach(() => {
    expect(server.unexpected, 'requests the fake server does not serve').toEqual([])
  })
  // Vitest gives each file its own globals, but a file should not lean on that.
  afterAll(() => {
    phone.uninstall()
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })
  return { server, phone }
}

/**
 * What a player does on a phone that has never opened the tournament, with
 * the app's own functions over the network: the app starts its session
 * (anonymous, `ensureSession`), and the PIN claims the player
 * (`claim_player`). Returns the user's id.
 */
export async function enterAs(playerId: string): Promise<string> {
  const { ensureSession, useAuth } = await import('../auth')
  const { claimPlayer } = await import('../api')
  await useAuth.getState().init()
  await ensureSession()
  const claim = await claimPlayer(playerId, PIN)
  if (!claim.ok) throw new Error(`claim_player(${playerId}) said ${claim.reason}`)
  const uid = useAuth.getState().user?.id
  if (!uid) throw new Error('no user after entering')
  return uid
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
