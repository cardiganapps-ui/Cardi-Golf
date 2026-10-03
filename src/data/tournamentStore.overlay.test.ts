/**
 * REL-11 with the outbox: this phone's unsent writes are laid over the
 * server's rows for the screens, and never become them. Once a write is
 * taken, what the screens show is what the server says, including a later
 * value from another phone or the discrepancy it flagged (PR #92's verifier
 * found both lost), and nothing flickers back in between. QA-06's two store
 * gaps are here too: a queued hole never reaches the phone's copy of the
 * boards, and the queue read after the boards went up still shows on them.
 */
import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getFixture } from '../dev/fixtures'
import { fakeSupabase, type FakeSupabase } from './testing/fakeSupabase'
import { snapshotToRows } from './testing/rows'

let server: FakeSupabase = fakeSupabase({})
vi.mock('../lib/supabase', () => ({ supabase: () => server.client, supabaseConfigured: true }))

const { useTournament, registerOverlay } = await import('./tournamentStore')
const { _outboxTest, overlayPending, enqueueScore } = await import('./outbox')
const { useAuth } = await import('./auth')
useAuth.setState({ user: { id: 'uid-A' } as never })
registerOverlay(overlayPending)

const fx = getFixture('full12-live')!
const TID = fx.snapshot.tournament.id
const store = () => useTournament.getState()
const reads = () => server.requests.filter((r) => r.table === 'tournaments').length
const channel = () => server.channels.at(-1)!
const emit = (table: string, payload: Record<string, unknown>) => channel().bindings.get(table)!(payload)
const round = fx.snapshot.rounds.find((r) => r.status === 'live')!
const group = fx.snapshot.groups.find((g) => g.roundId === round.id)!
const P = group.playerIds[0]!
const A = group.playerIds[1]!
const B = group.playerIds[2]!
const HOLE = 16
const key = (x: { roundId: string; playerId: string; hole: number }) => x.roundId === round.id && x.playerId === P && x.hole === HOLE
const shown = () => store().data!.snapshot.scores.find(key)
const inBase = () => store().data!.base.scores.find(key)
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const save = (strokes: number) => enqueueScore(TID, { round_id: round.id, player_id: P, hole: HOLE, strokes, putts: 2, picked_up: false, entered_by: A, client_ts: '2027-04-09T12:00:00.000Z' })

/** The server's row for P's hole: upsert by (round, player, hole), as the table's unique key does. */
function serverWrite(fields: Record<string, unknown>) {
  const rows = server.tables.scores!
  let row = rows.find((r) => r.round_id === round.id && r.player_id === P && r.hole === HOLE)
  if (!row) {
    row = { id: 'srv-row', round_id: round.id, player_id: P, hole: HOLE, strokes: null, putts: null, picked_up: false, entered_by: null, client_ts: null, updated_at: null, disputed: false, previous: null, reason: null }
    rows.push(row)
  }
  Object.assign(row, fields)
  return structuredClone(row)
}

/** A push that waits for `release`, with `inFlight` once it started; `fail` makes it a refusal. */
function gatedPush(fail?: string) {
  let release!: () => void
  let started!: () => void
  const gate = new Promise<void>((r) => (release = r))
  const inFlight = new Promise<void>((r) => (started = r))
  _outboxTest.setPush(async () => {
    started()
    await gate
    if (fail) throw new Error(fail)
  })
  return { release: () => release(), inFlight }
}

beforeEach(async () => {
  _outboxTest.reset()
  await _outboxTest.clearStored()
  server = fakeSupabase(snapshotToRows(fx.snapshot))
  await store().load(TID)
  channel().status!('SUBSCRIBED')
  await vi.waitFor(() => expect(reads()).toBe(2))
})
afterEach(() => {
  store().unsubscribe()
  useTournament.setState({ tournamentId: null, loading: false, error: null, data: null, realtime: 'off', updatedAt: 0, source: null, keepOnPhone: true })
})

describe('another phone saves the same hole while this one’s save is out', () => {
  it('its later value, and the discrepancy the server flagged, show once this save is taken', async () => {
    const { release, inFlight } = gatedPush()
    const saving = save(5)
    await inFlight
    expect(shown()).toMatchObject({ strokes: 5 })
    // This phone's write lands on the server; its own event comes back.
    emit('scores', { eventType: 'UPDATE', new: serverWrite({ strokes: 5, putts: 2, entered_by: A, updated_at: '2027-04-09T12:00:01.000000+00:00' }), old: {} })
    // Another phone's write lands after it (the server's final value), flagged.
    emit('scores', {
      eventType: 'UPDATE',
      new: serverWrite({ strokes: 7, putts: 2, entered_by: B, updated_at: '2027-04-09T12:00:02.000000+00:00', disputed: true, previous: { strokes: 5, putts: 2, picked_up: false, entered_by: A } }),
      old: {},
    })
    await sleep(60)
    // While this phone's write is out, its own value shows.
    expect(shown()).toMatchObject({ strokes: 5 })
    release()
    await saving
    await vi.waitFor(() => expect(_outboxTest.queue()).toHaveLength(0))
    await sleep(100)
    expect(shown()).toMatchObject({ strokes: 7, disputed: true })
  })

  it('its own echo coming back before the answer: the discrepancy the server flagged shows once it is taken', async () => {
    serverWrite({ strokes: 6, putts: 2, entered_by: B, updated_at: '2027-04-09T11:59:00.000000+00:00' })
    await store().reload()
    const { release, inFlight } = gatedPush()
    const saving = save(5)
    await inFlight
    emit('scores', {
      eventType: 'UPDATE',
      new: serverWrite({ strokes: 5, putts: 2, entered_by: A, updated_at: '2027-04-09T12:00:01.000000+00:00', disputed: true, previous: { strokes: 6, putts: 2, picked_up: false, entered_by: B } }),
      old: {},
    })
    await sleep(60)
    release()
    await saving
    await vi.waitFor(() => expect(_outboxTest.queue()).toHaveLength(0))
    await sleep(100)
    expect(shown()).toMatchObject({ strokes: 5, disputed: true })
    expect(store().data!.state.flags.discrepancies.some((d) => d.playerId === P && d.hole === HOLE)).toBe(true)
  })
})

describe('a write taken before its echo is back', () => {
  it('keeps showing what was sent (no flicker to the old value), then the server’s own row', async () => {
    const before = inBase()?.strokes ?? null
    const { release, inFlight } = gatedPush()
    const saving = save(8)
    await inFlight
    release()
    await saving
    await vi.waitFor(() => expect(_outboxTest.queue()).toHaveLength(0))
    // Taken, and no event yet: the server's rows hold it now.
    expect(before).not.toBe(8)
    expect(shown()).toMatchObject({ strokes: 8 })
    expect(inBase()).toMatchObject({ strokes: 8 })
    emit('scores', { eventType: 'UPDATE', new: serverWrite({ strokes: 8, putts: 2, entered_by: A, updated_at: '2027-04-09T12:00:03.000000+00:00' }), old: {} })
    await sleep(80)
    expect(inBase()).toMatchObject({ id: 'srv-row', strokes: 8, updatedAt: '2027-04-09T12:00:03.000000+00:00' })
  })
})

describe('what is not the server’s stays off the server’s rows', () => {
  it('a hole waiting to go out shows on the boards, and is neither in the server’s rows nor in the phone’s copy', async () => {
    gatedPush()
    void save(9)
    await vi.waitFor(() => expect(shown()).toMatchObject({ strokes: 9 }))
    expect(inBase()?.strokes ?? null).not.toBe(9)
    // A change elsewhere saves the boards on the phone.
    emit('payments', { eventType: 'UPDATE', new: structuredClone(server.tables.payments![0]!), old: {} })
    await sleep(1700)
    const db = new Dexie('cardi-golf-cache')
    db.version(1).stores({ entries: 'slug, tournamentId', snapshots: 'tournamentId' })
    const kept = (await db.table('snapshots').get(TID)) as { snapshot: { scores: Array<{ roundId: string; playerId: string; hole: number; strokes: number | null }> } }
    db.close()
    expect(kept.snapshot.scores.find(key)?.strokes ?? null).not.toBe(9)
    // And a full reload lays it over what it brings, still unsent.
    await store().reload()
    expect(shown()).toMatchObject({ strokes: 9 })
    expect(inBase()?.strokes ?? null).not.toBe(9)
  })

  it('a write the server took, patched in while a hole waits to go out, does not carry the hole into the server’s rows', async () => {
    gatedPush()
    void save(9)
    await vi.waitFor(() => expect(shown()).toMatchObject({ strokes: 9 }))
    // The Comité renames the tournament: the app patches what the server took.
    store().patch((s) => (s.tournament.name = 'Copa renombrada'))
    expect(store().data!.snapshot.tournament.name).toBe('Copa renombrada')
    expect(shown()).toMatchObject({ strokes: 9 })
    expect(inBase()?.strokes ?? null).not.toBe(9)
  })

  it('a refused write leaves the boards at once, before the reload is back', async () => {
    const was = shown()?.strokes ?? null
    const { release, inFlight } = gatedPush('new row violates row-level security policy for table "scores"')
    const saving = save(11)
    await inFlight
    expect(shown()).toMatchObject({ strokes: 11 })
    const slow = server.hold()
    release()
    await saving
    // The reload it asked for is out, and held; the boards already say what the server has.
    await slow.received
    await vi.waitFor(() => expect(shown()?.strokes ?? null).toBe(was))
    expect(_outboxTest.queue()).toHaveLength(0)
    slow.release()
  })
})

describe('the queue read after the boards went up (a restart)', () => {
  it('its holes show on the boards the phone opened with', async () => {
    _outboxTest.setPush(() => new Promise(() => undefined))
    await _outboxTest.enqueue({ key: `score:${round.id}:${P}:${HOLE}`, kind: 'score', tournamentId: TID, payload: { round_id: round.id, player_id: P, hole: HOLE, strokes: 10, putts: 3, picked_up: false, entered_by: A, client_ts: '2027-04-09T12:00:00.000Z' }, attempts: 0, createdAt: Date.now() } as never)
    // The app restarts: the queue is only in IndexedDB, and the boards go up from the phone's copy first.
    const copy = structuredClone(store().data!.base)
    store().unsubscribe()
    useTournament.setState({ tournamentId: null, data: null, source: null })
    _outboxTest.reset()
    store().seed(TID, copy, Date.now())
    expect(shown()?.strokes ?? null).not.toBe(10)
    await _outboxTest.load()
    expect(shown()).toMatchObject({ strokes: 10 })
  })
})
