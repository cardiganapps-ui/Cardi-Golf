/**
 * PWA-15: «Actualizar», the header's chip and the pull on the boards, asks the store for the boards now.
 * - A fetch already on its way is waited for, not sent twice, and its boards are on screen when it ends.
 * - A live channel that failed is opened again now, not at the end of its wait (30 s, doubling to 5 min).
 * - A joined channel, a design fixture and a tournament left are left alone.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getFixture } from '../dev/fixtures'
import { fakeSupabase, type FakeSupabase } from './testing/fakeSupabase'
import { snapshotToRows } from './testing/rows'

let server: FakeSupabase = fakeSupabase({})
vi.mock('../lib/supabase', () => ({ supabase: () => server.client, supabaseConfigured: true }))
const { useTournament } = await import('./tournamentStore')
const store = () => useTournament.getState()
const reads = () => server.requests.filter((r) => r.table === 'tournaments').length
const channel = () => server.channels.at(-1)!
const fx = getFixture('full12-live')!
const TID = fx.snapshot.tournament.id

async function ready() {
  vi.useFakeTimers()
  server = fakeSupabase(snapshotToRows(fx.snapshot))
  await store().load(TID)
  channel().status!('SUBSCRIBED')
  await vi.advanceTimersByTimeAsync(10)
}
afterEach(() => {
  store().unsubscribe()
  vi.useRealTimers()
  useTournament.setState({ tournamentId: null, loading: false, error: null, data: null, realtime: 'off', updatedAt: 0, source: null, keepOnPhone: true })
})

describe('«Actualizar» asks the store for the boards now (PWA-15)', () => {
  it('with nothing on its way, one fetch, and a failure before it is cleared', async () => {
    await ready()
    server.down = { message: 'TypeError: Failed to fetch' }
    await store().reload()
    expect(store().error).not.toBeNull()
    server.down = null
    const before = reads()
    await store().refreshNow()
    expect(reads()).toBe(before + 1)
    expect(store().error).toBeNull()
  })

  it('a fetch already on its way is waited for, not sent twice, and its boards are on screen when it ends', async () => {
    await ready()
    // The fetch on its way reads a change the boards don't show yet.
    server.tables.tournaments![0]!.name = 'Ya con el cambio'
    const hold = server.hold()
    const auto = store().reload()
    await hold.received
    const before = reads()
    let done = false
    const asked = store()
      .refreshNow()
      .then(() => (done = true))
    await vi.advanceTimersByTimeAsync(10)
    expect(done).toBe(false)
    expect(store().data!.snapshot.tournament.name).not.toBe('Ya con el cambio')
    hold.release()
    await asked
    // Done means on screen: the person sees what they asked for when the chip stops saying «Actualizando…».
    expect(store().data!.snapshot.tournament.name).toBe('Ya con el cambio')
    await auto
    expect(reads()).toBe(before)
  })

  it('a live channel that failed is opened again now, not at the end of its wait', async () => {
    await ready()
    const failed = channel()
    failed.status!('CHANNEL_ERROR')
    expect(store().realtime).toBe('error')
    const count = server.channels.length
    await store().refreshNow()
    expect(server.channels).toHaveLength(count + 1)
    expect(store().realtime).toBe('connecting')
    // The new one joins: live, and the wait's own rebuild does not come on top of it.
    channel().status!('SUBSCRIBED')
    expect(store().realtime).toBe('live')
    await vi.advanceTimersByTimeAsync(5 * 60_000)
    expect(server.channels).toHaveLength(count + 1)
  })

  it('with no signal a failed channel is left to its own wait: it could not join, and each try would lengthen the wait', async () => {
    await ready()
    channel().status!('CHANNEL_ERROR')
    const count = server.channels.length
    vi.stubGlobal('navigator', { onLine: false })
    try {
      await store().refreshNow()
      expect(server.channels).toHaveLength(count)
      expect(store().realtime).toBe('error')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('a joined channel is left as it is: only the boards are fetched', async () => {
    await ready()
    const count = server.channels.length
    const before = reads()
    await store().refreshNow()
    expect(server.channels).toHaveLength(count)
    expect(store().realtime).toBe('live')
    expect(reads()).toBe(before + 1)
  })

  it('a tournament left fetches nothing', async () => {
    await ready()
    store().unsubscribe()
    const before = reads()
    await store().refreshNow()
    expect(reads()).toBe(before)
    expect(server.channels.filter((c) => c.status)).toHaveLength(1)
  })

  it('a design fixture has no server to ask', async () => {
    server = fakeSupabase(snapshotToRows(fx.snapshot))
    useTournament.setState({ tournamentId: 'fixture:full12-live' })
    await store().refreshNow()
    expect(server.requests).toHaveLength(0)
    expect(server.channels).toHaveLength(0)
  })
})
