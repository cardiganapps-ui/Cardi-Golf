/**
 * REL-11 round 3: the heal, the check of a quiet live channel against the
 * server. PR #92's second verifier measured round 2's: a full fetch every
 * 90 s from every visible phone whether or not anything changed (880
 * requests an hour each), a new fetch every 15 s over one slower than that
 * (none ever landed), and a retry every 15 s for ever once fetches failed.
 * Now: one fetch after five quiet minutes, none while one is on its way, and
 * after a failure the wait doubles, to 30 minutes.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getFixture } from '../dev/fixtures'
import { fakeSupabase, type FakeSupabase } from './testing/fakeSupabase'
import { snapshotToRows } from './testing/rows'

let server: FakeSupabase = fakeSupabase({})
vi.mock('../lib/supabase', () => ({ supabase: () => server.client, supabaseConfigured: true }))
const { useTournament, HEAL_MS } = await import('./tournamentStore')
const store = () => useTournament.getState()
const reads = () => server.requests.filter((r) => r.table === 'tournaments').length
const channel = () => server.channels.at(-1)!
const fx = getFixture('full12-live')!
const TID = fx.snapshot.tournament.id
const MIN = 60_000

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

describe('the heal', () => {
  it('checks a quiet live board once five minutes after its last fetch, and every five minutes after', async () => {
    await ready()
    const at = await fetchTimes(16 * 60)
    expect(HEAL_MS).toBe(5 * MIN)
    expect(at[0]).toBeGreaterThanOrEqual(300)
    expect(at[0]).toBeLessThanOrEqual(300 + 15)
    // An idle hour: twelve fetches, not forty.
    expect(at.length).toBe(3)
  })

  it('never starts a fetch while one is on its way: a fetch slower than the heal’s tick lands', async () => {
    await ready()
    const pending: Array<{ release: () => void; at: number }> = []
    const origFrom = server.client.from
    server.client.from = (t: string) => {
      if (t === 'tournaments') pending.push({ release: server.hold().release, at: Date.now() })
      return origFrom(t)
    }
    let replaced = 0
    let last = store().data
    const n0 = reads()
    for (let s = 0; s < 15 * 60; s++) {
      await vi.advanceTimersByTimeAsync(1000)
      // Each fetch takes 40 s.
      for (const p of pending) {
        if (p.at < 0 || Date.now() - p.at < 40_000) continue
        p.release()
        p.at = -1
      }
      if (store().data !== last) {
        replaced++
        last = store().data
      }
    }
    expect(replaced).toBeGreaterThan(0)
    // One out at a time: a fetch every five minutes and 40 s at most.
    expect(reads() - n0).toBeLessThanOrEqual(3)
  })

  it('waits longer after each fetch that failed (a released phone, a deleted tournament, a server down)', async () => {
    await ready()
    server.down = { message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116' }
    const at = await fetchTimes(2 * 60 * 60)
    // At 5 min, then 10 and 20 minutes after each failure, then every 30.
    expect(at[0]).toBeLessThanOrEqual(300 + 15)
    const gaps = at.slice(1).map((t, i) => t - at[i]!)
    expect(gaps).toHaveLength(4)
    for (const [i, wait] of [600, 1200, 1800, 1800].entries()) {
      expect(gaps[i]).toBeGreaterThanOrEqual(wait)
      expect(gaps[i]).toBeLessThanOrEqual(wait + 15)
    }
  })

  it('counts a load of the open tournament (the gate resolving again) as a fetch: the next check is five minutes after it (K-V12b)', async () => {
    await ready()
    await vi.advanceTimersByTimeAsync(4 * MIN)
    await store().load(TID)
    const at = await fetchTimes(6 * 60)
    expect(at).toHaveLength(1)
    expect(at[0]).toBeGreaterThanOrEqual(300)
  })

  it('a fetch that works again ends the longer wait', async () => {
    await ready()
    server.down = { message: 'no', code: 'PGRST116' }
    await fetchTimes(6 * 60)
    server.down = null
    await store().reload()
    const at = await fetchTimes(6 * 60)
    expect(at).toHaveLength(1)
    expect(at[0]).toBeLessThanOrEqual(300 + 15)
  })

  it('adds nothing to the 15 s poll while the channel is down, whether the polls work or fail', async () => {
    await ready()
    channel().status!('CHANNEL_ERROR')
    const r0 = reads()
    await vi.advanceTimersByTimeAsync(5 * MIN)
    expect(reads() - r0).toBe(20)
    server.down = { message: 'no', code: 'PGRST116' }
    await vi.advanceTimersByTimeAsync(10 * MIN)
    expect(reads() - r0).toBe(20 + 40)
  })

  it('keeps checking after the phone’s clock was set back', async () => {
    await ready()
    await fetchTimes(6 * 60)
    vi.setSystemTime(Date.now() - 60 * MIN)
    const at = await fetchTimes(6 * 60)
    expect(at.length).toBeGreaterThanOrEqual(1)
  })

  it('never checks a hidden phone', async () => {
    await ready()
    vi.stubGlobal('document', { visibilityState: 'hidden' })
    const r0 = reads()
    await vi.advanceTimersByTimeAsync(30 * MIN)
    expect(reads() - r0).toBe(0)
  })
})
