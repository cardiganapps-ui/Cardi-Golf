/**
 * REL-10: a fetch of the boards that failed was never tried again until the
 * next trigger (a live change, the five-minute check), and the header kept
 * «En vivo» over boards minutes old. Now a failure on the way (no signal, a
 * timeout, the server down) is tried again after 5 s, then 10, 20, 40, 80 and
 * every 2 minutes while the phone is on screen, and the error stays (the
 * header says «Conectando…» and how old the boards are) until a fetch works.
 *
 * REL-19: a hole saved on the phone leaves the boards as old as they were.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getFixture } from '../dev/fixtures'
import { fakeSupabase, type FakeSupabase } from './testing/fakeSupabase'
import { snapshotToRows } from './testing/rows'

let server: FakeSupabase = fakeSupabase({})
vi.mock('../lib/supabase', () => ({ supabase: () => server.client, supabaseConfigured: true }))
const { useTournament, RELOAD_RETRY_MIN_MS } = await import('./tournamentStore')
const store = () => useTournament.getState()
const reads = () => server.requests.filter((r) => r.table === 'tournaments').length
const channel = () => server.channels.at(-1)!
const fx = getFixture('full12-live')!
const TID = fx.snapshot.tournament.id
const NO_SIGNAL = { message: 'TypeError: Failed to fetch' }
const GONE = { message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116' }

async function ready() {
  vi.useFakeTimers()
  server = fakeSupabase(snapshotToRows(fx.snapshot))
  await store().load(TID)
  channel().status!('SUBSCRIBED')
  await vi.advanceTimersByTimeAsync(10)
  expect(reads()).toBe(2)
}
afterEach(() => {
  store().unsubscribe()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  useTournament.setState({ tournamentId: null, loading: false, error: null, data: null, realtime: 'off', updatedAt: 0, source: null, keepOnPhone: true })
})

/** The seconds since `t0` at which a fetch began, over `seconds`. */
async function fetchTimes(seconds: number) {
  const t0 = Date.now()
  const at: number[] = []
  const n0 = reads()
  for (let s = 0; s < seconds; s++) {
    await vi.advanceTimersByTimeAsync(1000)
    while (reads() > n0 + at.length) at.push(Math.round((Date.now() - t0) / 1000))
  }
  return at
}

describe('a fetch of the boards that failed on the way (REL-10)', () => {
  it('is tried again, waiting longer each time, and the error stays until one works', async () => {
    await ready()
    server.down = NO_SIGNAL
    await store().reload()
    expect(store().error).not.toBeNull()
    expect(store().data).not.toBeNull()
    expect(RELOAD_RETRY_MIN_MS).toBe(5_000)
    const at = await fetchTimes(170)
    expect(at).toEqual([5, 15, 35, 75, 155])
    expect(store().error).not.toBeNull()
    // The signal is back: the next try, two minutes after the last (at 275 s), works, and the tries stop.
    server.down = null
    expect(await fetchTimes(125)).toEqual([105])
    expect(store().error).toBeNull()
    expect(await fetchTimes(4 * 60)).toEqual([])
  })

  it('a fetch that works by other means (a live change, the phone back on screen) ends the tries', async () => {
    await ready()
    server.down = NO_SIGNAL
    await store().reload()
    server.down = null
    await store().reload()
    expect(store().error).toBeNull()
    expect(await fetchTimes(4 * 60)).toEqual([])
  })

  it('an answer that will not change by itself (a deleted tournament, a released phone) is not retried: the five-minute check takes it', async () => {
    await ready()
    server.down = GONE
    await store().reload()
    expect(store().error).not.toBeNull()
    expect(await fetchTimes(4 * 60)).toEqual([])
  })

  it('a load of the open tournament that fails over the server\'s boards is retried the same way', async () => {
    await ready()
    server.down = NO_SIGNAL
    await store().load(TID)
    expect(store().source).toBe('server')
    expect(await fetchTimes(20)).toEqual([5, 15])
  })

  it('nothing is retried once the tournament is left', async () => {
    await ready()
    server.down = NO_SIGNAL
    await store().reload()
    store().unsubscribe()
    expect(await fetchTimes(3 * 60)).toEqual([])
  })

  // Within the five minutes before the check: what comes after is the check's (tournamentStore.heal.test.ts).
  it('out of sight, the try waits: the phone coming back to the front reloads', async () => {
    await ready()
    server.down = NO_SIGNAL
    vi.stubGlobal('document', { visibilityState: 'hidden' })
    await store().reload()
    expect(await fetchTimes(4 * 60)).toEqual([])
  })

  it('with no signal, the try waits: the signal coming back reloads', async () => {
    await ready()
    server.down = NO_SIGNAL
    vi.stubGlobal('navigator', { onLine: false })
    await store().reload()
    expect(await fetchTimes(4 * 60)).toEqual([])
  })

  it('while the channel is down the 15 s poll is the retry: nothing is added to it', async () => {
    await ready()
    channel().status!('CHANNEL_ERROR')
    server.down = NO_SIGNAL
    const r0 = reads()
    await vi.advanceTimersByTimeAsync(5 * 60_000)
    expect(reads() - r0).toBe(20)
  })
})

describe('a hole saved on the phone (REL-19)', () => {
  it('changes the boards, not how old they are', async () => {
    await ready()
    const before = Date.now() - 7 * 60_000
    useTournament.setState({ updatedAt: before })
    const first = store().data!.base.scores[0]!
    store().patch((s) => {
      s.scores[0]!.strokes = (first.strokes ?? 4) + 1
    })
    expect(store().data!.base.scores[0]!.strokes).toBe((first.strokes ?? 4) + 1)
    expect(store().updatedAt).toBe(before)
  })
})
