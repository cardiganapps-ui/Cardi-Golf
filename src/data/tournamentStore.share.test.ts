/**
 * PERF-09: a reload, a live change or a recompute built the boards again from
 * rows, so every screen got new objects and re-rendered, even when nothing had
 * changed: a reload that brought nothing new cost a full board render on every
 * phone. Now what reads the same comes back as the object the screens already
 * hold. With nothing new, the store keeps its data and the engine does not run.
 */
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getFixture } from '../dev/fixtures'
import { fakeSupabase, type FakeSupabase } from './testing/fakeSupabase'
import { snapshotToRows } from './testing/rows'

let server: FakeSupabase = fakeSupabase({})
vi.mock('../lib/supabase', () => ({ supabase: () => server.client, supabaseConfigured: true }))
const engine = vi.hoisted(() => ({ runs: 0 }))
vi.mock('../engine/computeTournament', async (importOriginal) => {
  const real = await importOriginal<typeof import('../engine/computeTournament')>()
  return {
    ...real,
    computeTournament: (...args: Parameters<typeof real.computeTournament>) => {
      engine.runs++
      return real.computeTournament(...args)
    },
  }
})

const { useTournament } = await import('./tournamentStore')

const fx = getFixture('full12-live')!
const TID = fx.snapshot.tournament.id
const store = () => useTournament.getState()
const channel = () => server.channels.at(-1)!
const emit = (table: string, payload: Record<string, unknown>) => channel().bindings.get(table)!(payload)

beforeEach(async () => {
  server = fakeSupabase(snapshotToRows(fx.snapshot))
  await store().load(TID)
  expect(store().error).toBeNull()
  channel().status!('SUBSCRIBED')
  // Coming up live fetches what was missed: let that settle first.
  await vi.waitFor(() => expect(store().loading).toBe(false))
  await new Promise((r) => setTimeout(r, 50))
})
afterEach(() => {
  store().unsubscribe()
  vi.useRealTimers()
  useTournament.setState({ tournamentId: null, loading: false, error: null, data: null, realtime: 'off', updatedAt: 0, source: null, keepOnPhone: true })
})

describe('the boards keep what did not change (PERF-09)', () => {
  it('a reload that brings nothing new keeps the very same boards, and the engine does not run', async () => {
    const shown = store().data
    const runs = engine.runs
    const before = store().updatedAt
    await new Promise((r) => setTimeout(r, 5))
    await store().reload()
    expect(store().data).toBe(shown)
    expect(engine.runs).toBe(runs)
    // The boards are as fresh as the server's answer all the same.
    expect(store().updatedAt).toBeGreaterThan(before)
  })

  it('a score changed on the server: one run of the engine; every other table, and every other score, the object it was', async () => {
    const shown = store().data!
    const row = server.tables.scores!.find((r) => r.strokes != null)!
    row.strokes = (row.strokes as number) + 1
    const runs = engine.runs
    await store().reload()
    const now = store().data!
    expect(now).not.toBe(shown)
    expect(engine.runs).toBe(runs + 1)
    expect(now.snapshot.players).toBe(shown.snapshot.players)
    expect(now.snapshot.rounds).toBe(shown.snapshot.rounds)
    expect(now.snapshot.tournament).toBe(shown.snapshot.tournament)
    expect(now.settings).toBe(shown.settings)
    expect(now.snapshot.scores).not.toBe(shown.snapshot.scores)
    const changed = now.snapshot.scores.filter((s, i) => s !== shown.snapshot.scores[i])
    expect(changed).toHaveLength(1)
    expect(changed[0]).toMatchObject({ playerId: row.player_id, hole: row.hole, strokes: row.strokes })
  })

  it('a live change that brings the row the boards already hold (a write’s echo, a replay) changes nothing', async () => {
    vi.useFakeTimers()
    const shown = store().data
    const runs = engine.runs
    const row = server.tables.scores!.find((r) => r.strokes != null)!
    emit('scores', { eventType: 'UPDATE', new: { ...row }, old: { id: row.id } })
    await vi.advanceTimersByTimeAsync(400)
    expect(store().data).toBe(shown)
    expect(engine.runs).toBe(runs)
  })

  it('a recompute with nothing waiting in the outbox changes nothing', () => {
    const shown = store().data
    const runs = engine.runs
    store().refresh()
    expect(store().data).toBe(shown)
    expect(engine.runs).toBe(runs)
  })

  it('a change to the settings parses them again; a payment changed leaves them as they were', async () => {
    const shown = store().data!
    server.tables.payments!.push({ id: 'pay-new', tournament_id: TID, from_player_id: fx.snapshot.players[0]!.id, to_player_id: null, amount: 2500, kind: 'entry', paid: true, note: null })
    await store().reload()
    expect(store().data!.settings).toBe(shown.settings)
    const t = server.tables.tournaments!.find((r) => r.id === TID)!
    t.settings = { ...(t.settings as Record<string, unknown>), entryFee: 3000 }
    await store().reload()
    expect(store().data!.settings).not.toBe(shown.settings)
    expect(store().data!.settings.entryFee).toBe(3000)
  })
})
