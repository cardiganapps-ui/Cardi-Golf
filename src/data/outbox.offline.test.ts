/**
 * QA-06 (1): the promise the day rests on (§2, «syncs later without losing
 * anything»). A hole saved with no signal is kept on the phone, survives the
 * app being closed and opened again, shows on the boards the phone opens
 * with, and reaches the server when the signal returns, with nothing else to
 * tap, as the player who saved it.
 *
 * A restart here is a restart: the page's IndexedDB connections, listeners
 * and channels are closed and every app module is loaded again, so nothing
 * survives but what the phone stored: the outbox and the saved boards in
 * (fake) IndexedDB, and the session auth-js keeps in localStorage. The app
 * opens the way AppShell and the tournament gate open it, and its real
 * Supabase client talks to the fake server (src/data/testing/fakePhone.ts).
 */
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LookupResult } from './api'
import type { Me } from '../screens/tournament/TournamentGate'
import { enterAs, holeScore, installFakePhone, PIN, settle, snakeAnswer, turn, until } from './testing/fakePhone'

const { server, phone } = installFakePhone()

// A restart in one test process makes a second auth client; a real one does not.
const warn = console.warn
vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
  if (!String(args[0]).includes('Multiple GoTrueClient instances')) warn(...args)
})

/** The app's modules, as one page load has them. */
interface App {
  outbox: typeof import('./outbox')
  auth: typeof import('./auth')
  api: typeof import('./api')
  store: typeof import('./tournamentStore')
  cache: typeof import('./snapshotCache')
  client: typeof import('../lib/supabase')
}
let app: App | null = null

const LOOKUP: LookupResult = { id: 't1', slug: 'ensayo', name: 'Ensayo', tagline: null, logoUrl: null, accentColor: null, status: 'live', joinCode: 'ABC123', players: [] }
const ME: Me = { playerId: 'p1', isOrganizer: false, isAdmin: false, via: 'device' }

/**
 * The page goes away, and its timers with it: the outbox's retry and the
 * auth client's refresh ticker (in one test process they would otherwise
 * live on, and act on the storage the next page shares).
 */
async function closePage(a: App): Promise<void> {
  a.outbox._outboxTest.reset()
  if (a.auth.useAuth.getState().ready) await a.client.supabase().auth.stopAutoRefresh()
  a.outbox._outboxTest.db()?.close()
}

/** Close the app if it is open, then load it again: a fresh page and modules over what the phone stored. */
async function restart(): Promise<App> {
  if (app) await closePage(app)
  phone.reloadPage()
  vi.resetModules()
  app = {
    outbox: await import('./outbox'),
    auth: await import('./auth'),
    api: await import('./api'),
    store: await import('./tournamentStore'),
    cache: await import('./snapshotCache'),
    client: await import('../lib/supabase'),
  }
  return app
}

/**
 * Opening the app on the tournament: AppShell confirms the stored session and
 * starts the outbox; the gate puts up the boards the phone kept, and points
 * the outbox's counters at that tournament (`enterFromCache`).
 */
async function open(a: App): Promise<void> {
  await Promise.all([a.auth.useAuth.getState().init(), a.outbox.startOutbox()])
  await openFromPhone(a)
}
async function openFromPhone(a: App): Promise<void> {
  const kept = await a.cache.readCached('ensayo')
  if (!kept) return
  a.store.useTournament.getState().seed(kept.entry.tournamentId, kept.snapshot, kept.savedAt)
  a.outbox.refreshOutboxCounters()
}

/** The gate, once the server confirmed the player: the tournament's entry and its boards stay on the phone. */
async function keepOnPhone(a: App): Promise<void> {
  await a.cache.saveEntry({ slug: 'ensayo', tournamentId: 't1', lookup: LOOKUP, me: ME })
  a.store.useTournament.setState({ tournamentId: 't1' })
  await a.store.useTournament.getState().reload()
  for (let i = 0; i < 500 && !(await a.cache.readCached('ensayo')); i++) await turn()
  expect(await a.cache.readCached('ensayo'), 'the boards kept on the phone').not.toBeNull()
}

/** What the boards show for a player's hole: the snapshot's row and the engine's gross. */
function shown(a: App, player: string, hole: number) {
  const data = a.store.useTournament.getState().data!
  const row = data.snapshot.scores.find((s) => s.roundId === 'r1' && s.playerId === player && s.hole === hole)
  const gross = data.state.core.rounds.r1?.[player]?.holes.find((h) => h.hole === hole)?.gross ?? null
  return { strokes: row?.strokes ?? null, gross }
}

function deleteDatabase(name: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(name)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

// Each restart loads the app's modules again, which is slower than the rest of the suite.
describe('a hole saved with no signal', { timeout: 20_000 }, () => {
  beforeEach(async () => {
    server.reset()
    phone.online = true
    // A phone that has never stored anything.
    phone.localStorage.clear()
    await deleteDatabase('cardi-golf-outbox')
  })
  afterEach(async () => {
    // The saved boards go through the page's own connection: deleting that database under it would only make Dexie complain.
    await app?.cache.clearAllCached()
    if (app) await closePage(app)
    phone.reloadPage()
    app = null
  })

  it('survives a restart, shows on the boards the phone opens with, and goes out when the signal returns', async () => {
    // The first time the app opens on the tournament, with signal: the session, the PIN, the boards kept.
    const first = await restart()
    await open(first)
    const player = await enterAs('p1')
    await keepOnPhone(first)

    // No signal on the course.
    phone.goOffline()
    const sentBefore = server.wire.length
    await first.outbox.enqueueScore('t1', holeScore('p1', 7, 5))
    await first.outbox.enqueueScore('t1', holeScore('p2', 7, 6))
    await first.outbox.enqueueTiebreak('t1', snakeAnswer(7, 'p2'))
    expect(first.outbox.useOutbox.getState()).toMatchObject({ pending: 3, pendingHoles: 1 })

    // The phone restarts, still with no signal.
    const after = await restart()
    await open(after)
    // Restored from the phone and counted before any signal, as the player's; not one request was even tried offline.
    expect(after.outbox._outboxTest.queue().map((x) => [x.key, x.actingUid])).toEqual([
      ['score:r1:p1:7', player],
      ['score:r1:p2:7', player],
      ['tiebreak:r1:g1:7', player],
    ])
    expect(after.outbox.useOutbox.getState()).toMatchObject({ pending: 3, pendingHoles: 1, held: 0, rejected: [] })
    expect(server.wire.slice(sentBefore)).toEqual([])
    // The boards it opened from its saved copy show them at once.
    expect(shown(after, 'p1', 7)).toEqual({ strokes: 5, gross: 5 })
    expect(shown(after, 'p2', 7)).toEqual({ strokes: 6, gross: 6 })
    expect(after.store.useTournament.getState().data!.snapshot.snakeTiebreaks).toEqual([expect.objectContaining({ hole: 7, lastHoledPlayerId: 'p2' })])

    // The signal comes back while the app is open: it sends everything by itself, as the player.
    phone.goOnline()
    await until(() => after.outbox.useOutbox.getState().pending === 0, 'the restored writes to reach the server')
    expect(server.score('p1', 7)).toMatchObject({ strokes: 5, putts: 2 })
    expect(server.score('p2', 7)).toMatchObject({ strokes: 6, putts: 2 })
    expect(server.tables.snake_tiebreaks).toEqual([expect.objectContaining({ hole: 7, last_holed_player_id: 'p2' })])
    expect(server.writes.map((w) => [w.table, w.by])).toEqual([
      ['scores', player],
      ['scores', player],
      ['snake_tiebreaks', player],
    ])
    expect(server.writeRequests('scores')).toHaveLength(2)
    expect(await after.outbox._outboxTest.stored()).toEqual([])
  })

  it('is sent as soon as the app opens again with signal', async () => {
    const first = await restart()
    await open(first)
    const player = await enterAs('p1')
    phone.goOffline()
    await first.outbox.enqueueScore('t1', holeScore('p3', 8, 4))

    // The signal came back while the app was closed: no `online` event will come.
    phone.online = true
    const after = await restart()
    await open(after)
    await until(() => server.score('p3', 8) !== undefined, 'the kept hole to reach the server')
    expect(server.score('p3', 8)).toMatchObject({ strokes: 4 })
    await until(() => after.outbox.useOutbox.getState().pending === 0, 'the outbox to empty')
    expect(server.writes.map((w) => w.by)).toEqual([player])
    expect(server.writeRequests()).toHaveLength(1)
    expect(await after.outbox._outboxTest.stored()).toEqual([])
  })

  it('saved before the reopened session is confirmed: waits for the PIN when that session turns out dead, then goes as the player', async () => {
    const first = await restart()
    await open(first)
    const before = await enterAs('p1')
    await keepOnPhone(first)

    // Closed overnight: the token runs out, and the server forgets the refresh token.
    server.auth.lapse(before)
    phone.ageSession()

    // On the course the app opens from its saved boards, and a hole is saved before the session is confirmed.
    const after = await restart()
    await after.outbox.startOutbox()
    await openFromPhone(after)
    await after.outbox.enqueueScore('t1', holeScore('p1', 1, 5))
    expect(after.outbox._outboxTest.queue().map((x) => x.actingUid ?? null)).toEqual([null])
    expect(shown(after, 'p1', 1)).toEqual({ strokes: 5, gross: 5 })

    // Confirming the session: auth-js refreshes it, the server refuses, and the phone is signed out.
    await after.auth.useAuth.getState().init()
    expect(server.wire.filter((r) => r.target === 'auth/token').map((r) => r.result)).toEqual([400])
    expect(after.auth.useAuth.getState().user).toBeNull()
    // The gate starts a new anonymous session. The hole must not go out under it: the server would refuse it for good.
    await after.auth.ensureSession()
    const fresh = after.auth.useAuth.getState().user!.id
    expect(fresh).not.toBe(before)
    phone.goOffline()
    phone.goOnline()
    phone.show()
    await after.outbox.flush()
    await settle(after.outbox.useOutbox)
    expect(server.writes).toEqual([])
    expect(server.writeRequests()).toEqual([])
    expect(after.outbox.useOutbox.getState()).toMatchObject({ pending: 1, held: 1, rejected: [] })

    // The PIN, and the gate confirming the player: the hole goes out by itself, as the player.
    expect(await after.api.claimPlayer('p1', PIN)).toMatchObject({ ok: true })
    expect(await after.api.myMembership('t1')).toMatchObject({ playerId: 'p1' })
    await after.outbox.adoptQueuedWrites('t1')
    await until(() => after.outbox.useOutbox.getState().pending === 0, 'the hole to go out')
    expect(server.writes.map((w) => [w.row.player_id, w.row.hole, w.row.strokes, w.by])).toEqual([['p1', 1, 5, fresh]])
    expect(after.outbox.useOutbox.getState()).toMatchObject({ held: 0, rejected: [] })
  })

  it('the PIN’s adoption is kept on the phone: after a restart the holes are the player’s, waiting only for signal', async () => {
    const first = await restart()
    await open(first)
    const before = await enterAs('p1')
    await keepOnPhone(first)

    // A dead zone: a hole is saved, and meanwhile the session lapses.
    phone.goOffline()
    await first.outbox.enqueueScore('t1', holeScore('p2', 2, 4))
    server.auth.lapse(before)
    phone.ageSession()

    // A bar of signal: the gate finds the session dead and starts a new one, the PIN claims p1 for it, and the gate sees him in.
    phone.online = true
    await first.auth.ensureSession()
    const fresh = first.auth.useAuth.getState().user!.id
    expect(fresh).not.toBe(before)
    expect(await first.api.claimPlayer('p1', PIN)).toMatchObject({ ok: true })
    expect(await first.api.myMembership('t1')).toMatchObject({ playerId: 'p1' })
    // The bar is gone as the gate adopts the writes: nothing is even tried, so only the adoption itself is on the phone.
    phone.goOffline()
    await first.outbox.adoptQueuedWrites('t1')
    await settle(first.outbox.useOutbox)
    expect(server.writeRequests()).toEqual([])

    // The phone restarts with no signal: the hole is the player's now, waiting for signal, not for the PIN again.
    const after = await restart()
    await open(after)
    expect(after.outbox._outboxTest.queue().map((x) => [x.key, x.actingUid])).toEqual([['score:r1:p2:2', fresh]])
    expect(after.outbox.useOutbox.getState()).toMatchObject({ pending: 1, held: 0 })
    expect(after.outbox.unsentWrites()).toEqual({ tournamentId: 't1', waitsFor: 'signal' })

    // Signal: it goes out by itself, as the player.
    phone.goOnline()
    await until(() => after.outbox.useOutbox.getState().pending === 0, 'the hole to go out')
    expect(server.writes.map((w) => [w.row.player_id, w.row.hole, w.by])).toEqual([['p2', 2, fresh]])
  })
})
