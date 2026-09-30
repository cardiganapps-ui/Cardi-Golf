// V13 / PERF-07: what the real tournament store does with Realtime events, against a fake Supabase client.
// Counts full snapshot fetches (one `tournaments` single() per fetch) and REST calls.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const calls: string[] = []
const handlers: Array<(p: unknown) => void> = []
let statusCb: ((s: string) => void) | null = null
const filters: unknown[] = []

function builder(table: string) {
  calls.push(table)
  const rows = table === 'tournaments' ? { id: 't1', slug: 'x', name: 'X', status: 'live', settings: null, join_code: 'AAAAAA', timezone: 'America/Mazatlan', currency: 'MXN' } : []
  const q: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'in', 'order', 'range']) q[m] = () => q
  q.single = () => ({ then: (res: (v: unknown) => void) => res({ data: rows, error: null }) })
  q.then = (res: (v: unknown) => void) => res({ data: rows, error: null })
  return q
}
vi.mock('/home/user/Cardi-Golf/src/lib/supabase.ts', () => ({
  supabaseConfigured: true,
  supabase: () => ({
    from: (t: string) => builder(t),
    channel: () => {
      const ch = {
        on: (_type: string, filter: unknown, cb: (p: unknown) => void) => {
          filters.push(filter)
          handlers.push(cb)
          return ch
        },
        subscribe: (cb: (s: string) => void) => {
          statusCb = cb
          return ch
        },
      }
      return ch
    },
    removeChannel: async () => {},
  }),
}))

const { useTournament } = await import('/home/user/Cardi-Golf/src/data/tournamentStore.ts')
const fetches = () => calls.filter((c) => c === 'tournaments').length

describe('tournament store: Realtime event → full reload', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  it('first load, first SUBSCRIBED, then a foursome hole save (4 sequential upserts)', async () => {
    await useTournament.getState().load('t1')
    const perFetch = calls.length
    console.log(`one snapshot fetch = ${perFetch} REST calls with empty tables (22 on Ensayo, measured live)`)
    console.log(`channel binds ${handlers.length} postgres_changes handlers; filters: ${JSON.stringify(filters.slice(0, 2))} …`)
    expect(fetches()).toBe(1)
    // The socket joins: the store refetches although nothing was missed.
    statusCb!('SUBSCRIBED')
    await vi.advanceTimersByTimeAsync(10)
    console.log(`after the first SUBSCRIBED: ${fetches()} snapshot fetches`)

    // 4 upserts land 250 ms apart (sequential pushes; each round trip > the 150 ms debounce).
    const before = fetches()
    const scoresCb = handlers[REALTIME_INDEX('scores')]!
    for (let i = 0; i < 4; i++) {
      scoresCb({ eventType: 'UPDATE', table: 'scores', new: { hole: 7 } })
      await vi.advanceTimersByTimeAsync(250)
    }
    await vi.advanceTimersByTimeAsync(500)
    const spaced = fetches() - before
    console.log(`4 events 250 ms apart → ${spaced} full snapshot fetches`)

    // Same 4 events within 50 ms of each other: coalesced.
    const before2 = fetches()
    for (let i = 0; i < 4; i++) {
      scoresCb({ eventType: 'UPDATE', table: 'scores', new: { hole: 8 } })
      await vi.advanceTimersByTimeAsync(50)
    }
    await vi.advanceTimersByTimeAsync(500)
    const burst = fetches() - before2
    console.log(`4 events 50 ms apart → ${burst} full snapshot fetch`)

    // An event on any table (e.g. payments) does the same full refetch.
    const before3 = fetches()
    handlers[REALTIME_INDEX('payments')]!({ eventType: 'UPDATE', table: 'payments', new: {} })
    await vi.advanceTimersByTimeAsync(400)
    console.log(`1 payments event → ${fetches() - before3} full snapshot fetch`)
    expect(spaced).toBe(4)
    expect(burst).toBe(1)
  })
})

// Order of REALTIME_TABLES in tournamentStore.ts:197-218.
function REALTIME_INDEX(t: string) {
  return ['tournaments', 'players', 'pairs', 'teams', 'team_members', 'rounds', 'groups', 'group_members', 'round_tees', 'scores', 'snake_tiebreaks', 'card_signatures', 'handicap_overrides', 'calcutta_lots', 'calcutta_bids', 'calcutta_buybacks', 'payments', 'game_entries', 'hole_awards', 'game_results'].indexOf(t)
}
