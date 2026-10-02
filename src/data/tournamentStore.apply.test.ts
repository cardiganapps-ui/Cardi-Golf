/**
 * REL-11, PERF-07: a saved hole reaches the other phones from the event
 * itself, without the whole tournament downloaded again (22 requests); a
 * structural change still reloads; and a reload that was on its way when a
 * change landed never takes that change back.
 */
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getFixture } from '../dev/fixtures'
import { fakeSupabase, type FakeSupabase } from './testing/fakeSupabase'
import { snapshotToRows } from './testing/rows'

let server: FakeSupabase = fakeSupabase({})
vi.mock('../lib/supabase', () => ({ supabase: () => server.client, supabaseConfigured: true }))

const { useTournament } = await import('./tournamentStore')

const fx = getFixture('full12-live')!
const TID = fx.snapshot.tournament.id
const store = () => useTournament.getState()
/** Snapshot reads so far: each one starts with the tournament's row. */
const reads = () => server.requests.filter((r) => r.table === 'tournaments').length
/** Every request the server saw, any table. */
const requests = () => server.requests.length
const channel = () => server.channels.at(-1)!
const emit = (table: string, payload: Record<string, unknown>) => channel().bindings.get(table)!(payload)
const round = fx.snapshot.rounds.find((r) => r.status === 'live')!
const group = fx.snapshot.groups.find((g) => g.roundId === round.id)!
const scoreOf = (playerId: string, hole: number) => store().data!.snapshot.scores.find((x) => x.roundId === round.id && x.playerId === playerId && x.hole === hole)
const scoreRow = (playerId: string, hole: number, strokes: number) => ({ id: `live-${playerId}-${hole}`, round_id: round.id, player_id: playerId, hole, strokes, putts: 1, picked_up: false, updated_at: '2027-04-09T12:00:00Z', disputed: false })

beforeEach(async () => {
  server = fakeSupabase(snapshotToRows(fx.snapshot))
  await store().load(TID)
  expect(store().error).toBeNull()
  channel().status!('SUBSCRIBED')
  // Coming up live fetches what was missed: let that settle before counting.
  await vi.waitFor(() => expect(reads()).toBe(2))
})
afterEach(() => {
  store().unsubscribe()
  vi.useRealTimers()
})

describe('a hole saved on another phone', () => {
  it('four rows of a foursome: one recompute, and not one request', async () => {
    vi.useFakeTimers()
    const before = requests()
    const shown = store().data
    for (const playerId of group.playerIds) emit('scores', { eventType: 'UPDATE', new: scoreRow(playerId, 18, 3), old: {} })
    // Taken together: nothing moves until the four are in.
    expect(store().data).toBe(shown)
    await vi.advanceTimersByTimeAsync(40)
    expect(store().data).not.toBe(shown)
    for (const playerId of group.playerIds) expect(scoreOf(playerId, 18)).toMatchObject({ strokes: 3, putts: 1 })
    // The engine ran on them: the boards moved.
    expect(store().data!.state).not.toBe(shown!.state)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(requests()).toBe(before)
  })

  it('a payment of another tournament (an account in two of them) changes nothing and asks for nothing', async () => {
    vi.useFakeTimers()
    const before = requests()
    const shown = store().data
    emit('payments', { eventType: 'INSERT', new: { id: 'elsewhere', tournament_id: 'other', from_player_id: 'x', to_player_id: null, amount: 100, kind: 'entry', paid: true }, old: {} })
    await vi.advanceTimersByTimeAsync(1_000)
    expect(store().data).toBe(shown)
    expect(requests()).toBe(before)
  })

  it('a structural change (a group redrawn) still reloads, once', async () => {
    vi.useFakeTimers()
    const before = reads()
    emit('groups', { eventType: 'UPDATE', new: { id: group.id }, old: {} })
    await vi.advanceTimersByTimeAsync(200)
    expect(reads()).toBe(before + 1)
  })

  it("a score of a day this phone has not loaded (a round just created) reloads", async () => {
    vi.useFakeTimers()
    const before = reads()
    emit('scores', { eventType: 'INSERT', new: { ...scoreRow(group.playerIds[0]!, 1, 4), round_id: 'a-new-day' }, old: {} })
    await vi.advanceTimersByTimeAsync(250)
    expect(reads()).toBe(before + 1)
  })
})

describe('a reload on its way when a change lands', () => {
  it('does not take the change back: what it read before the change is corrected with it', async () => {
    const playerId = group.playerIds[0]!
    // A reload starts (the phone woke up) and its answer is slow.
    const slow = server.hold()
    const reload = store().reload()
    await slow.received
    // Meanwhile another phone saves hole 17, which the reload read before it was saved
    // (here: the server's table never gets it, as when the read came first).
    emit('scores', { eventType: 'UPDATE', new: scoreRow(playerId, 17, 2), old: {} })
    await vi.waitFor(() => expect(scoreOf(playerId, 17)).toMatchObject({ strokes: 2 }))
    // The slow reload lands with what it read.
    slow.release()
    await reload
    expect(scoreOf(playerId, 17)).toMatchObject({ strokes: 2 })
  })
})
