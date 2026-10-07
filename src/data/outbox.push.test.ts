/**
 * REL-11 round 3: what a push hands the store is what the server says it
 * stored. Each write asks for its rows back (`select()`, PostgREST's
 * return=representation), the store lands exactly those once the write is
 * taken, and the app's other tabs hear them. The client here answers as
 * PostgREST does: an upsert or an insert returns the rows as stored, a delete
 * the rows it removed, and an upsert that ignored a duplicate returns none.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const srv = vi.hoisted(() => {
  type Row = Record<string, unknown>
  const state = {
    /** `table:method` → the rows the server answers with. */
    answers: new Map<string, Row[]>(),
    /** The requests that asked for their rows back. */
    selected: [] as string[],
    landed: [] as Array<{ tournamentId: string; changes: unknown[]; since: number; opts?: unknown }>,
    /** Flushes the store heard end. */
    pushesDone: 0,
    /** Fetches the outbox asked the store for. */
    reloads: 0,
    /** How long the server takes to answer, in ms. */
    delay: 0,
    client: null as unknown,
  }
  function request(table: string, method: string) {
    let asked = false
    const req = {
      eq: () => req,
      setHeader: () => req,
      select() {
        asked = true
        return req
      },
      then<A, B>(ok?: (v: { data: Row[] | null; error: null }) => A, bad?: (e: unknown) => B) {
        if (asked) state.selected.push(`${table}:${method}`)
        const answer = { data: asked ? structuredClone(state.answers.get(`${table}:${method}`) ?? []) : null, error: null }
        return new Promise<typeof answer>((r) => setTimeout(() => r(answer), state.delay)).then(ok, bad)
      },
    }
    return req
  }
  state.client = {
    auth: { getSession: async () => ({ data: { session: { access_token: 'tok' } }, error: null }) },
    from: (table: string) => ({
      upsert: () => request(table, 'upsert'),
      insert: () => request(table, 'insert'),
      delete: () => request(table, 'delete'),
    }),
  }
  return state
})
vi.mock('../lib/supabase', () => ({ supabase: () => srv.client, supabaseConfigured: true }))
vi.mock('./tournamentStore', () => ({
  registerOverlay: () => undefined,
  liveSeq: () => 7,
  liveClock: () => Date.now(),
  useTournament: {
    getState: () => ({
      tournamentId: 't1',
      patch: () => undefined,
      refresh: () => undefined,
      reload: async () => void srv.reloads++,
      landChanges: (tournamentId: string, changes: unknown[], since: number, _sentAt: number, opts?: unknown) => srv.landed.push({ tournamentId, changes, since, opts }),
      pushesDone: () => void srv.pushesDone++,
    }),
  },
}))

const { _outboxTest, flush, startOutbox, useOutbox } = await import('./outbox')
const { useAuth } = await import('./auth')

const item = <K extends 'score' | 'tiebreak' | 'award' | 'signature'>(kind: K, key: string, payload: Record<string, unknown>) => ({ key, kind, tournamentId: 't1', payload, attempts: 0, createdAt: 1 }) as never
const award = (winners: string[]) => item('award', 'award:r1:g1:closest:12', { round_id: 'r1', group_id: 'g1', hole: 12, game_id: 'closest', player_ids: winners, decided_by: 'p1' })
const winner = (id: string, player: string) => ({ id, round_id: 'r1', group_id: 'g1', hole: 12, game_id: 'closest', player_id: player, decided_by: 'p1', created_at: '2027-04-09T18:00:00.5+00:00' })

beforeEach(() => {
  _outboxTest.reset()
  srv.answers.clear()
  srv.selected = []
  srv.landed = []
  srv.reloads = 0
  srv.pushesDone = 0
  srv.delay = 0
  useAuth.setState({ user: { id: 'uid-phone' } as never, session: { access_token: 'tok' } as never })
})

describe('a push hands the store the rows the server stored', () => {
  it('a score: the row as stored, with its id, its time and what its trigger flagged', async () => {
    const row = { id: 's-1', round_id: 'r1', player_id: 'p1', hole: 12, strokes: 4, putts: 2, picked_up: false, entered_by: 'p1', client_ts: 'x', updated_at: '2027-04-09T18:00:00.123456+00:00', disputed: true, previous: 5, reason: null }
    srv.answers.set('scores:upsert', [row])
    await _outboxTest.enqueue(item('score', 'score:r1:p1:12', { round_id: 'r1', player_id: 'p1', hole: 12, strokes: 4, putts: 2, picked_up: false, entered_by: 'p1', client_ts: 'x' }))
    await flush()
    expect(srv.selected).toEqual(['scores:upsert'])
    // Since: the channel's position when the push went out, so an echo heard meanwhile is known. A landing during a
    // flush asks its one more fetch of the flush's end, which the store hears once.
    expect(srv.landed).toEqual([{ tournamentId: 't1', since: 7, changes: [{ table: 'scores', eventType: 'UPDATE', new: row, old: {} }], opts: { flushing: true, fetch: false } }])
    expect(_outboxTest.queue()).toEqual([])
    expect(srv.pushesDone).toBe(1)
  })

  it('a snake answer: the row as stored', async () => {
    const row = { round_id: 'r1', group_id: 'g1', hole: 7, last_holed_player_id: 'p4', decided_by: 'p1', created_at: '2027-04-09T18:00:00+00:00' }
    srv.answers.set('snake_tiebreaks:upsert', [row])
    await _outboxTest.enqueue(item('tiebreak', 'tiebreak:r1:g1:7', { round_id: 'r1', group_id: 'g1', hole: 7, last_holed_player_id: 'p4', decided_by: 'p1' }))
    await flush()
    expect(srv.landed.map((l) => l.changes)).toEqual([[{ table: 'snake_tiebreaks', eventType: 'UPDATE', new: row, old: {} }]])
  })

  it('winners replaced: the ones taken away, by the key a delete names, then the ones put in', async () => {
    srv.answers.set('hole_awards:delete', [winner('a-old', 'p3')])
    srv.answers.set('hole_awards:insert', [winner('a-new', 'p1'), winner('a-new2', 'p2')])
    await _outboxTest.enqueue(award(['p1', 'p2']))
    await flush()
    expect(srv.selected).toEqual(['hole_awards:delete', 'hole_awards:insert'])
    expect(srv.landed.map((l) => l.changes)).toEqual([
      [
        { table: 'hole_awards', eventType: 'DELETE', new: {}, old: { round_id: 'r1', game_id: 'closest', hole: 12, player_id: 'p3' } },
        { table: 'hole_awards', eventType: 'UPDATE', new: winner('a-new', 'p1'), old: {} },
        { table: 'hole_awards', eventType: 'UPDATE', new: winner('a-new2', 'p2'), old: {} },
      ],
    ])
  })

  it('a contest left without a winner: only the ones taken away', async () => {
    srv.answers.set('hole_awards:delete', [winner('a-old', 'p3'), winner('a-old2', 'p4')])
    await _outboxTest.enqueue(award([]))
    await flush()
    expect(srv.selected).toEqual(['hole_awards:delete'])
    expect(srv.landed.map((l) => l.changes)).toEqual([
      [
        { table: 'hole_awards', eventType: 'DELETE', new: {}, old: { round_id: 'r1', game_id: 'closest', hole: 12, player_id: 'p3' } },
        { table: 'hole_awards', eventType: 'DELETE', new: {}, old: { round_id: 'r1', game_id: 'closest', hole: 12, player_id: 'p4' } },
      ],
    ])
  })

  it('a card the other pair signed first comes back empty: the write is taken, nothing lands over its signature, and a fetch shows that signature', async () => {
    await _outboxTest.enqueue(item('signature', 'signature:r1:pair1', { round_id: 'r1', pair_id: 'pair1', signed_by: 'p1' }))
    await flush()
    expect(srv.selected).toEqual(['card_signatures:upsert'])
    expect(srv.landed.map((l) => [l.changes, l.opts])).toEqual([[[], { flushing: true, fetch: true }]])
    expect(_outboxTest.queue()).toEqual([])
    expect(useOutbox.getState().rejected).toEqual([])
    // The fetch is the store's, once the flush ends.
    expect(srv.reloads).toBe(0)
    expect(srv.pushesDone).toBe(1)
  })

  it('the app’s other tabs hear what landed, and nothing when nothing did', async () => {
    await startOutbox()
    const heard: unknown[] = []
    const tab = new BroadcastChannel('cardi-golf-outbox')
    tab.onmessage = (e: MessageEvent) => heard.push(e.data)
    try {
      await _outboxTest.enqueue(item('signature', 'signature:r1:pair1', { round_id: 'r1', pair_id: 'pair1', signed_by: 'p1' }))
      await flush()
      const row = { id: 's-2', round_id: 'r1', player_id: 'p1', hole: 3, strokes: 5, putts: 2, picked_up: false, entered_by: 'p1', client_ts: 'x', updated_at: '2027-04-09T18:00:01+00:00', disputed: false, previous: null, reason: null }
      srv.answers.set('scores:upsert', [row])
      // The server takes a moment: the other tabs hear how long the push was out.
      srv.delay = 60
      await _outboxTest.enqueue(item('score', 'score:r1:p1:3', { round_id: 'r1', player_id: 'p1', hole: 3, strokes: 5, putts: 2, picked_up: false, entered_by: 'p1', client_ts: 'x' }))
      await flush()
      // With how long ago the push went out (each tab's clock has its own origin): a fetch the other tab landed since
      // may have read past it.
      await vi.waitFor(() => expect(heard.filter((m) => (m as { landed?: unknown }).landed)).toEqual([{ landed: { tournamentId: 't1', changes: [{ table: 'scores', eventType: 'UPDATE', new: row, old: {} }], age: expect.any(Number) } }]))
      const { age } = (heard.find((m) => (m as { landed?: unknown }).landed) as { landed: { age: number } }).landed
      expect(age).toBeGreaterThanOrEqual(50)
      expect(age).toBeLessThan(5_000)
    } finally {
      tab.close()
    }
  })
})
