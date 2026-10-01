/**
 * QA-07: the store's reloads, against an in-memory server.
 * - Audit P1-15: when two reads are in flight, the older answer never lands
 *   over the newer one, and a stale failure never shows an error over good
 *   boards. Each guard has a test that fails without it.
 * - Audit P0-5: every snapshot shown is kept on the phone, and with no
 *   signal the app opens that copy and shows the same boards.
 * - Realtime: a burst of changes is one reload; a channel that comes back
 *   fetches what it missed.
 * - A failed load never shows another tournament's boards, and says why in
 *   the copy for what failed, even when only the tournament's own row did.
 * Reloads on `online` and on showing the app are in
 * tournamentStore.reconnect.test.ts (they need a DOM).
 */
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getFixture } from '../dev/fixtures'
import { t } from '../i18n/es-MX'
import { fakeSupabase, type FakeSupabase } from './testing/fakeSupabase'
import { snapshotToRows } from './testing/rows'

let server: FakeSupabase = fakeSupabase({})
vi.mock('../lib/supabase', () => ({ supabase: () => server.client, supabaseConfigured: true }))

const { useTournament } = await import('./tournamentStore')
const { readCached, saveEntry } = await import('./snapshotCache')

const fx = getFixture('minimal4-live')!
const TID = fx.snapshot.tournament.id
const store = () => useTournament.getState()
const shownName = () => store().data?.snapshot.tournament.name
const tournamentRow = () => server.tables.tournaments![0]!
/** Snapshot reads so far: each one starts with the tournament's row. */
const reads = () => server.requests.filter((r) => r.table === 'tournaments').length

beforeEach(async () => {
  server = fakeSupabase(snapshotToRows(fx.snapshot))
  await store().load(TID)
  expect(store().error).toBeNull()
})

afterEach(() => {
  store().unsubscribe()
  vi.useRealTimers()
  useTournament.setState({ tournamentId: null, loading: false, error: null, data: null, realtime: 'off', updatedAt: 0 })
})

describe('an older answer never replaces a newer one (audit P1-15)', () => {
  it('two overlapping reloads: the older one answering last does not win', async () => {
    tournamentRow().name = 'Antes'
    const slow = server.hold()
    const older = store().reload()
    await slow.received
    tournamentRow().name = 'Después'
    await store().reload()
    expect(shownName()).toBe('Después')
    slow.release()
    await older
    expect(shownName()).toBe('Después')
  })

  it('an older reload failing after a newer one landed shows no error', async () => {
    const slow = server.hold()
    const older = store().reload()
    await slow.received
    await store().reload()
    slow.fail({ message: 'TypeError: Failed to fetch' })
    await older
    expect(store().error).toBeNull()
    expect(shownName()).toBe(fx.snapshot.tournament.name)
  })

  it('two overlapping loads of the same tournament: the older one answering last does not win', async () => {
    tournamentRow().name = 'Antes'
    const slow = server.hold()
    const older = store().load(TID)
    await slow.received
    tournamentRow().name = 'Después'
    await store().load(TID)
    slow.release()
    await older
    expect([shownName(), store().loading]).toEqual(['Después', false])
  })

  it('an older load failing after a newer one landed shows no error', async () => {
    const slow = server.hold()
    const older = store().load(TID)
    await slow.received
    await store().load(TID)
    slow.fail({ message: 'TypeError: Failed to fetch' })
    await older
    expect([store().error, store().loading]).toEqual([null, false])
  })

  it('a reload still in flight for the tournament just left never lands on the one now open', async () => {
    const next = structuredClone(getFixture('gloria4')!.snapshot)
    const slow = server.hold()
    const older = store().reload()
    await slow.received
    // The next tournament opens from the phone's copy (no signal), which starts no read of its own.
    store().seed(next.tournament.id, next, 1)
    slow.release()
    await older
    expect([store().tournamentId, shownName()]).toEqual([next.tournament.id, next.tournament.name])
  })

  it('a load still in flight for the tournament just left never lands on the one opened from the phone’s copy', async () => {
    // The sequence guard alone lets it through: opening from the copy starts no read, so this load is still the newest.
    const next = structuredClone(getFixture('gloria4')!.snapshot)
    const slow = server.hold()
    const older = store().load(TID)
    await slow.received
    store().seed(next.tournament.id, next, 1)
    slow.release()
    await older
    expect([store().tournamentId, shownName(), store().loading]).toEqual([next.tournament.id, next.tournament.name, false])
  })

  it('opening another tournament while the first is still loading shows the second', async () => {
    server.tables.tournaments!.push({ ...tournamentRow(), id: 'fx-otro', slug: 'otro-torneo', name: 'Otro torneo', join_code: 'OTRO22' })
    const slow = server.hold()
    const first = store().load(TID)
    await slow.received
    await store().load('fx-otro')
    slow.release()
    await first
    expect([store().tournamentId, shownName()]).toEqual(['fx-otro', 'Otro torneo'])
  })
})

describe('the copy on the phone (audit P0-5)', () => {
  it('every snapshot shown is kept; with no signal the app opens that copy and shows the same boards', async () => {
    // A tournament this phone has no copy of yet. The gate records which tournament the slug is.
    const snap = structuredClone(fx.snapshot)
    snap.tournament = { ...snap.tournament, id: 'fx-copia', slug: 'copia' }
    server = fakeSupabase(snapshotToRows(snap))
    await saveEntry({ slug: 'copia', tournamentId: 'fx-copia', lookup: fx.lookup, me: fx.me })
    await store().load('fx-copia')
    await vi.waitFor(async () => expect((await readCached('copia'))?.snapshot).toEqual(store().data!.snapshot))
    // A correction arrives and is shown: the copy follows.
    server.tables.scores![0]!.strokes = 9
    await store().reload()
    const shown = store().data!
    expect(shown.snapshot.scores[0]!.strokes).toBe(9)
    await vi.waitFor(async () => expect((await readCached('copia'))?.snapshot).toEqual(shown.snapshot))
    // Later: the app starts again with no signal.
    useTournament.setState({ tournamentId: null, loading: false, error: null, data: null, updatedAt: 0 })
    server.down = { message: 'TypeError: Failed to fetch' }
    const cached = (await readCached('copia'))!
    store().seed(cached.entry.tournamentId, cached.snapshot, cached.savedAt)
    expect(store().data!.state).toEqual(shown.state)
    expect([store().tournamentId, store().updatedAt, store().realtime]).toEqual(['fx-copia', cached.savedAt, 'off'])
  })

  it('a reload with no signal keeps the boards on screen and says why', async () => {
    const before = store().data
    server.down = { message: 'TypeError: Failed to fetch' }
    await store().reload()
    expect(store().data).toBe(before)
    expect(store().error).toBe(t.errors.network)
  })
})

describe('where the boards on screen came from (REL-02)', () => {
  it('the server’s once a load or a reload lands: the gate stops asking, the header stops saying «Conectando…»', async () => {
    // Opened from the phone's copy.
    useTournament.setState({ tournamentId: null, data: null, source: null })
    store().seed(TID, structuredClone(fx.snapshot), 1)
    expect(store().source).toBe('cache')
    await store().load(TID)
    expect(store().source).toBe('server')
    useTournament.setState({ source: 'cache' })
    await store().reload()
    expect(store().source).toBe('server')
  })
})

describe('how old the boards are (REL-04)', () => {
  it('a hole saved on the phone leaves the age of the server data', () => {
    // A copy saved two days ago, opened with no signal.
    const twoDaysAgo = Date.now() - 2 * 86_400_000
    useTournament.setState({ tournamentId: null, data: null, source: null })
    store().seed(TID, structuredClone(fx.snapshot), twoDaysAgo)
    // The player saves a hole: the boards change on the phone at once, but nothing new came from the server.
    store().patch((s) => {
      s.scores[0]!.strokes = 9
    })
    expect(store().data!.snapshot.scores[0]!.strokes).toBe(9)
    expect(store().updatedAt).toBe(twoDaysAgo)
  })
})

describe('a load that fails', () => {
  it('opening another tournament with no signal shows nothing of the one before, never its boards under the new name', async () => {
    expect(shownName()).toBe(fx.snapshot.tournament.name)
    server.down = { message: 'TypeError: Failed to fetch' }
    await store().load('otro-torneo')
    expect([store().tournamentId, store().data, store().error, store().loading]).toEqual(['otro-torneo', null, t.errors.network, false])
  })

  it('only the tournament’s own row failing still says why: the signal dropped, not a broken page', async () => {
    // Every other table answers; the store must stop at the missing row, not read fields off nothing.
    const slow = server.hold()
    const again = store().load(TID)
    await slow.received
    slow.fail({ message: 'TypeError: Failed to fetch' })
    await again
    expect([store().error, store().loading, shownName()]).toEqual([t.errors.network, false, fx.snapshot.tournament.name])
  })
})

describe('Realtime changes become reloads', () => {
  const channel = () => server.channels.at(-1)!

  it('the channel listens once the snapshot is in', () => {
    expect(server.channels.map((c) => c.name)).toEqual([`tournament:${TID}`])
    expect(store().realtime).toBe('connecting')
  })

  it('a burst of changes is one reload, 150 ms after the last of them', async () => {
    vi.useFakeTimers()
    const before = reads()
    // A foursome saving a hole: four rows, then a signature a moment later.
    for (let i = 0; i < 4; i++) channel().bindings.get('scores')!({ eventType: 'UPDATE' })
    await vi.advanceTimersByTimeAsync(100)
    channel().bindings.get('card_signatures')!({ eventType: 'INSERT' })
    await vi.advanceTimersByTimeAsync(149)
    expect(reads()).toBe(before)
    await vi.advanceTimersByTimeAsync(1)
    expect(reads()).toBe(before + 1)
  })

  it('coming back live after a gap fetches what Realtime did not replay', async () => {
    const before = reads()
    channel().status!('SUBSCRIBED')
    await vi.waitFor(() => expect(reads()).toBe(before + 1))
    // Still live: nothing was missed.
    channel().status!('SUBSCRIBED')
    await new Promise((r) => setTimeout(r, 20))
    expect(reads()).toBe(before + 1)
    channel().status!('TIMED_OUT')
    expect(store().realtime).toBe('error')
    channel().status!('SUBSCRIBED')
    await vi.waitFor(() => expect(reads()).toBe(before + 2))
    expect(store().realtime).toBe('live')
  })
})
