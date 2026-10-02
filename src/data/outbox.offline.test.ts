/**
 * QA-06 (1): the promise the day rests on (§2, "syncs later without losing
 * anything"). A hole saved with no signal is kept on the phone, survives the
 * app being closed and opened again, and reaches the server when the signal
 * returns, with nothing else to tap.
 *
 * A restart here is a restart: the page's IndexedDB connection, listeners and
 * outbox channel are closed and every app module is loaded again, so nothing
 * survives but what the real Dexie wrote to (fake) IndexedDB. The app's real
 * Supabase client talks to a fake server (src/data/testing/fakePhone.ts).
 */
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { holeScore, installFakeSupabase, snakeAnswer, until } from './testing/fakePhone'

vi.mock('./auth', () => ({ useAuth: { getState: () => ({ user: { id: 'uid-a' } }) } }))

const { server, browser } = installFakeSupabase()

// A restart in one test process makes a second auth client; a real one does not.
const warn = console.warn
vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
  if (!String(args[0]).includes('Multiple GoTrueClient instances')) warn(...args)
})

type App = typeof import('./outbox')
let app: App | null = null

/** Close the app if it is open, then open it: a fresh page and modules over whatever IndexedDB holds. */
async function restart(): Promise<App> {
  app?._outboxTest.db()?.close()
  browser.reloadPage()
  vi.resetModules()
  app = await import('./outbox')
  const { useTournament } = await import('./tournamentStore')
  useTournament.setState({ tournamentId: 't1' })
  return app
}

// Each restart loads the app's modules again, which is slower than the rest of the suite.
describe('a hole saved with no signal', { timeout: 20_000 }, () => {
  beforeEach(async () => {
    server.reset()
    browser.online = true
    // A phone that has never stored anything.
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.deleteDatabase('cardi-golf-outbox')
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })
  })
  afterEach(() => {
    app?._outboxTest.db()?.close()
    browser.reloadPage()
    app = null
  })

  it('survives a restart and goes out when the signal returns', async () => {
    browser.goOffline()
    const before = await restart()
    await before.startOutbox()
    await before.enqueueScore('t1', holeScore('p1', 7, 5))
    await before.enqueueScore('t1', holeScore('p2', 7, 6))
    await before.enqueueTiebreak('t1', snakeAnswer(7, 'p2'))
    expect(before.useOutbox.getState()).toMatchObject({ pending: 3, pendingHoles: 1 })

    const after = await restart()
    await after.startOutbox()
    // Restored from the phone and counted before any signal; nothing went out offline.
    expect(after._outboxTest.queue().map((x) => x.key)).toEqual(['score:r1:p1:7', 'score:r1:p2:7', 'tiebreak:r1:g1:7'])
    expect(after.useOutbox.getState()).toMatchObject({ pending: 3, pendingHoles: 1, rejected: [] })
    expect(server.requests).toEqual([])

    // The signal comes back while the app is open: it sends everything by itself.
    browser.goOnline()
    await until(() => after.useOutbox.getState().pending === 0, 'the restored writes to reach the server')
    expect(server.score('p1', 7)).toMatchObject({ strokes: 5, putts: 2 })
    expect(server.score('p2', 7)).toMatchObject({ strokes: 6, putts: 2 })
    expect(server.tables.snake_tiebreaks).toEqual([expect.objectContaining({ hole: 7, last_holed_player_id: 'p2' })])
    expect(server.writeRequests('scores')).toHaveLength(2)
    expect(await after._outboxTest.stored()).toEqual([])
  })

  it('is sent as soon as the app opens again with signal', async () => {
    browser.goOffline()
    const before = await restart()
    await before.startOutbox()
    await before.enqueueScore('t1', holeScore('p3', 8, 4))

    // The signal came back while the app was closed: no `online` event will come.
    browser.online = true
    const after = await restart()
    await after.startOutbox()
    await until(() => server.score('p3', 8) !== undefined, 'the kept hole to reach the server')
    expect(server.score('p3', 8)).toMatchObject({ strokes: 4 })
    await until(() => after.useOutbox.getState().pending === 0, 'the outbox to empty')
    expect(server.writeRequests('scores')).toHaveLength(1)
    expect(await after._outboxTest.stored()).toEqual([])
  })
})
