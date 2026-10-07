/**
 * REL-11 round 3: a write this phone made, once the server took it, goes on
 * the server's rows as the server stored it (the rows the push gets back),
 * except what the live channel already brought: its echo, after which
 * anything newer is in too (events come in commit order). PR #92's second
 * verifier found the round-2 rule wrong in each case here: it skipped the
 * landing on any change for the key (an older one too), matched contest
 * winners without their group, lost the row's id, and let a fetch on its way
 * take the write back. Also here: a payment Dinero marked counted once, rows
 * parked for a day not loaded, and another tab's write.
 *
 * The store and outbox are the app's; the push is the test's, and answers
 * with the server's rows as PostgREST does (`select()` after the write).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getFixture } from '../dev/fixtures'
import type { OutboxItem } from './outbox'
import type { LiveChange } from './realtimeApply'
import { fakeSupabase, type FakeSupabase } from './testing/fakeSupabase'
import { snapshotToRows } from './testing/rows'

let server: FakeSupabase = fakeSupabase({})
vi.mock('../lib/supabase', () => ({ supabase: () => server.client, supabaseConfigured: true }))

const { useTournament, registerOverlay, liveClock, _liveTest } = await import('./tournamentStore')
const { _outboxTest, overlayPending, enqueueScore, enqueueAward, enqueueTiebreak, startOutbox, useOutbox } = await import('./outbox')
const { useAuth } = await import('./auth')
const { applyPaidWrites } = await import('../engine/core/money')
useAuth.setState({ user: { id: 'uid-A' } as never })
registerOverlay(overlayPending)

type Row = Record<string, unknown>
const store = () => useTournament.getState()
const reads = () => server.requests.filter((r) => r.table === 'tournaments').length
const channel = () => server.channels.at(-1)!
const emit = (table: string, payload: Record<string, unknown>) => channel().bindings.get(table)!(payload)
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
/** Rows as the push gets them back. */
const upserted = (table: string, rows: Row[]): LiveChange[] => rows.map((row) => ({ table, eventType: 'UPDATE', new: structuredClone(row), old: {} }))
const awardKey = (r: Row) => ({ round_id: r.round_id, game_id: r.game_id, hole: r.hole, player_id: r.player_id })
const deleted = (rows: Row[]): LiveChange[] => rows.map((r) => ({ table: 'hole_awards', eventType: 'DELETE', new: {}, old: awardKey(r) }))

/** Every push waits for the test, which answers with the server's rows (`land`) or loses it. */
function pushController() {
  const pushes: Array<{ item: OutboxItem; land: (changes: LiveChange[]) => void; lose: () => void; refuse: () => void }> = []
  _outboxTest.setPush(
    (item) =>
      new Promise<LiveChange[]>((ok, no) => {
        pushes.push({ item, land: ok, lose: () => no(new Error('TypeError: Failed to fetch')), refuse: () => no(refused()) })
      }),
  )
  return {
    async nth(n: number) {
      await vi.waitFor(() => expect(pushes.length).toBeGreaterThanOrEqual(n))
      return pushes[n - 1]!
    },
    loseAll: () => pushes.forEach((p) => p.lose()),
  }
}
/** The server refusing a push for good (RLS). */
const refused = () => new Error('new row violates row-level security policy for table "scores"')
let control: ReturnType<typeof pushController> | null = null

/** A reload whose last wave waits: it read the scores before what the test does next. */
function slowReload() {
  const orig = server.client.from
  let release!: () => void
  const gate = new Promise<void>((r) => (release = r))
  let reached!: () => void
  const atLastWave = new Promise<void>((r) => (reached = r))
  let gated = false
  server.client.from = (t: string) => {
    const q = orig(t)
    if (t !== 'holes' || gated) return q
    gated = true
    const then = q.then.bind(q)
    ;(q as unknown as { then: typeof then }).then = ((a, b) => {
      reached()
      return gate.then(() => then(a, b))
    }) as typeof then
    return q
  }
  const reloading = store().reload()
  return {
    atLastWave,
    async finish() {
      release()
      server.client.from = orig
      await reloading
    },
  }
}

async function open(name: string) {
  const fx = getFixture(name)!
  server = fakeSupabase(snapshotToRows(fx.snapshot))
  await store().load(fx.snapshot.tournament.id)
  channel().status!('SUBSCRIBED')
  await vi.waitFor(() => expect(reads()).toBe(2))
  return fx
}

beforeEach(() => {
  _outboxTest.reset()
  control = pushController()
})
afterEach(async () => {
  control?.loseAll()
  await vi.waitFor(() => expect(useOutbox.getState().syncing).toBe(false))
  store().unsubscribe()
  _outboxTest.reset()
  useTournament.setState({ tournamentId: null, loading: false, error: null, data: null, realtime: 'off', updatedAt: 0, source: null, keepOnPhone: true })
})

describe('a score this phone saved, once the server took it', () => {
  let TID: string, R: string, P: string, A: string, B: string
  const HOLE = 16
  const key = (x: { roundId: string; playerId: string; hole: number }) => x.roundId === R && x.playerId === P && x.hole === HOLE
  const shown = () => store().data!.snapshot.scores.find(key)
  const inBase = () => store().data!.base.scores.find(key)
  const save = (strokes: number) => enqueueScore(TID, { round_id: R, player_id: P, hole: HOLE, strokes, putts: 2, picked_up: false, entered_by: A, client_ts: new Date().toISOString() })
  /** The server's row for the hole after a write, with the stamp scores_touch gives it. */
  function serverWrite(fields: Row) {
    const rows = server.tables.scores!
    let row = rows.find((r) => r.round_id === R && r.player_id === P && r.hole === HOLE)
    if (!row) {
      row = { id: 'srv-row', round_id: R, player_id: P, hole: HOLE, strokes: null, putts: 2, picked_up: false, entered_by: null, client_ts: null, updated_at: null, disputed: false, previous: null, reason: null }
      rows.push(row)
    }
    Object.assign(row, fields)
    return structuredClone(row)
  }
  beforeEach(async () => {
    const fx = (await open('full12-live'))!
    TID = fx.snapshot.tournament.id
    const round = fx.snapshot.rounds.find((r) => r.status === 'live')!
    const group = fx.snapshot.groups.find((g) => g.roundId === round.id)!
    R = round.id
    P = group.playerIds[0]!
    A = group.playerIds[1]!
    B = group.playerIds[2]!
  })

  it('a quick correction (5, then 6) shows 6 once taken, though 5’s echo came while 6 was out (L1)', async () => {
    void save(5)
    const p1 = await control!.nth(1)
    void save(6)
    await vi.waitFor(() => expect(shown()).toMatchObject({ strokes: 6 }))
    const five = serverWrite({ strokes: 5, entered_by: A, updated_at: '2027-04-09T18:00:01+00:00' })
    p1.land(upserted('scores', [five]))
    const p2 = await control!.nth(2)
    expect(p2.item.payload).toMatchObject({ strokes: 6 })
    // Realtime is slower than HTTP: 5's echo comes back while 6 is out.
    emit('scores', { eventType: 'UPDATE', new: five, old: {} })
    await sleep(60)
    expect(shown()).toMatchObject({ strokes: 6 })
    p2.land(upserted('scores', [serverWrite({ strokes: 6, entered_by: A, updated_at: '2027-04-09T18:00:02+00:00' })]))
    await vi.waitFor(() => expect(_outboxTest.queue()).toHaveLength(0))
    await sleep(10)
    expect(inBase()).toMatchObject({ strokes: 6 })
    expect(shown()).toMatchObject({ strokes: 6 })
  })

  it('and when 6’s echo never comes, 6 stays: nothing waits for a fetch (L1b)', async () => {
    void save(5)
    const p1 = await control!.nth(1)
    void save(6)
    const five = serverWrite({ strokes: 5, entered_by: A, updated_at: '2027-04-09T18:00:01+00:00' })
    p1.land(upserted('scores', [five]))
    const p2 = await control!.nth(2)
    emit('scores', { eventType: 'UPDATE', new: five, old: {} })
    await sleep(60)
    p2.land(upserted('scores', [serverWrite({ strokes: 6, entered_by: A, updated_at: '2027-04-09T18:00:02+00:00' })]))
    await vi.waitFor(() => expect(_outboxTest.queue()).toHaveLength(0))
    const n = reads()
    await sleep(300)
    expect(reads()).toBe(n)
    expect(shown()).toMatchObject({ strokes: 6 })
  })

  it('another phone’s older write, heard while this one was out, is not what shows once this one is taken (L2)', async () => {
    void save(5)
    const p1 = await control!.nth(1)
    // B saved 7 a moment before; the server then took this phone's 5 (the later write) and flagged it.
    emit('scores', { eventType: 'UPDATE', new: serverWrite({ strokes: 7, entered_by: B, updated_at: '2027-04-09T18:00:00+00:00' }), old: {} })
    await sleep(60)
    p1.land(upserted('scores', [serverWrite({ strokes: 5, entered_by: A, updated_at: '2027-04-09T18:00:01+00:00', disputed: true, previous: { strokes: 7, putts: 2, picked_up: false, entered_by: B } })]))
    await vi.waitFor(() => expect(_outboxTest.queue()).toHaveLength(0))
    await sleep(10)
    expect(shown()).toMatchObject({ strokes: 5, disputed: true })
  })

  it('a reload that read the scores before the write and lands after it does not take the write back (L3)', async () => {
    const reload = slowReload()
    await reload.atLastWave
    void save(8)
    const p = await control!.nth(1)
    p.land(upserted('scores', [serverWrite({ strokes: 8, entered_by: A, updated_at: '2027-04-09T18:00:05+00:00' })]))
    await vi.waitFor(() => expect(_outboxTest.queue()).toHaveLength(0))
    expect(shown()).toMatchObject({ strokes: 8 })
    await reload.finish()
    expect(shown()).toMatchObject({ strokes: 8 })
  })

  it('a fetch that brought another phone’s later value first keeps it: the server stamped this write earlier (L4)', async () => {
    void save(5)
    const p = await control!.nth(1)
    // The server took this phone's 5, then B's 7. A reload reads 7 and lands; neither event is in yet.
    const five = serverWrite({ strokes: 5, entered_by: A, updated_at: '2027-04-09T18:00:01+00:00' })
    serverWrite({ strokes: 7, entered_by: B, updated_at: '2027-04-09T18:00:02+00:00', disputed: true })
    await store().reload()
    expect(inBase()).toMatchObject({ strokes: 7 })
    // This phone's answer comes last (a slow uplink).
    p.land(upserted('scores', [five]))
    await vi.waitFor(() => expect(_outboxTest.queue()).toHaveLength(0))
    await sleep(10)
    expect(shown()).toMatchObject({ strokes: 7, disputed: true })
  })

  it('the landed row keeps the id the server gave it: a later delete by id takes it away (L5)', async () => {
    serverWrite({ strokes: 4, entered_by: B, updated_at: '2027-04-09T18:00:00+00:00' })
    await store().reload()
    expect(inBase()).toMatchObject({ id: 'srv-row', strokes: 4 })
    void save(6)
    const p = await control!.nth(1)
    p.land(upserted('scores', [serverWrite({ strokes: 6, entered_by: A, updated_at: '2027-04-09T18:00:01+00:00' })]))
    await vi.waitFor(() => expect(_outboxTest.queue()).toHaveLength(0))
    expect(inBase()).toMatchObject({ id: 'srv-row', strokes: 6 })
    // The Comité deletes the score: the delete names the id.
    server.tables.scores = server.tables.scores!.filter((r) => r.id !== 'srv-row')
    emit('scores', { eventType: 'DELETE', new: {}, old: { id: 'srv-row' } })
    await sleep(80)
    expect(shown()).toBeUndefined()
  })

  it('rows another tournament’s write brought back are not put on these boards (L6)', async () => {
    const was = shown()?.strokes ?? null
    store().landChanges('another-tournament', upserted('scores', [serverWrite({ strokes: 13, entered_by: A, updated_at: '2027-04-09T18:00:06+00:00' })]), 0, Date.now())
    expect(shown()?.strokes ?? null).toBe(was)
    expect(inBase()?.strokes ?? null).toBe(was)
  })

  it('a correction refused (5, then 6, and 6 refused): the 5 the server took shows at once, before the reload is back (L7)', async () => {
    void save(5)
    const p1 = await control!.nth(1)
    await save(6)
    // Taken while 6 waits behind it: the server's rows hold 5, the boards show 6.
    p1.land(upserted('scores', [serverWrite({ strokes: 5, entered_by: A, updated_at: '2027-04-09T18:00:01+00:00' })]))
    const p2 = await control!.nth(2)
    expect(shown()).toMatchObject({ strokes: 6 })
    const slow = server.hold()
    p2.refuse()
    await slow.received
    await vi.waitFor(() => expect(_outboxTest.queue()).toHaveLength(0))
    expect(shown()).toMatchObject({ strokes: 5 })
    slow.release()
  })

  // #92's third verifier, on the harness: a transaction's stamp is when it began (now()), so the write
  // that waited on the row's lock commits last with the earlier stamp.
  const B_STAMP = '2027-04-09T18:00:00.840158+00:00'
  const A_STAMP = '2027-04-09T18:00:00.534263+00:00'

  it('another phone’s two writes heard in commit order, the last with the earlier stamp: the last shows (R1)', async () => {
    emit('scores', { eventType: 'UPDATE', new: serverWrite({ strokes: 4, entered_by: B, updated_at: B_STAMP }), old: {} })
    emit('scores', { eventType: 'UPDATE', new: serverWrite({ strokes: 7, entered_by: A, updated_at: A_STAMP, disputed: true }), old: {} })
    await sleep(80)
    expect(shown()).toMatchObject({ strokes: 7, disputed: true })
  })

  it('this phone’s write committed last with the earlier stamp: once its echo comes it shows, though its answer yielded to the other phone’s row (R2)', async () => {
    void save(7)
    const p = await control!.nth(1)
    // B's write commits first and is heard; this phone's commits last, with the earlier stamp.
    emit('scores', { eventType: 'UPDATE', new: serverWrite({ strokes: 4, entered_by: B, updated_at: B_STAMP }), old: {} })
    await sleep(60)
    const ours = serverWrite({ strokes: 7, entered_by: A, updated_at: A_STAMP, disputed: true })
    p.land(upserted('scores', [ours]))
    await vi.waitFor(() => expect(_outboxTest.queue()).toHaveLength(0))
    emit('scores', { eventType: 'UPDATE', new: ours, old: {} })
    await sleep(80)
    expect(shown()).toMatchObject({ strokes: 7, disputed: true })
  })

  it('a fetch that landed while the write was out read the server around it: the write lands under the stamp guard, which keeps the later 7, and one more fetch confirms what the server holds (L4, R3)', async () => {
    void save(5)
    const p = await control!.nth(1)
    // The server took this phone's 5, then B's 7; a reload reads 7 and lands; neither event comes (the channel dropped).
    const five = serverWrite({ strokes: 5, entered_by: A, updated_at: '2027-04-09T18:00:01+00:00' })
    serverWrite({ strokes: 7, entered_by: B, updated_at: '2027-04-09T18:00:02+00:00', disputed: true })
    await store().reload()
    const n = reads()
    p.land(upserted('scores', [five]))
    await vi.waitFor(() => expect(_outboxTest.queue()).toHaveLength(0))
    expect(shown()).toMatchObject({ strokes: 7, disputed: true })
    await vi.waitFor(() => expect(reads()).toBe(n + 1))
    expect(shown()).toMatchObject({ strokes: 7, disputed: true })
  })

  it('a fetch on its way that read a later write than this one keeps it when it lands: the write it replays yields (R3)', async () => {
    void save(5)
    const p = await control!.nth(1)
    // The server took this phone's 5, then B's 7; the channel was down for both. A reload reads them now.
    const five = serverWrite({ strokes: 5, entered_by: A, updated_at: '2027-04-09T18:00:01+00:00' })
    serverWrite({ strokes: 7, entered_by: B, updated_at: '2027-04-09T18:00:02+00:00', disputed: true })
    const reload = slowReload()
    await reload.atLastWave
    p.land(upserted('scores', [five]))
    await vi.waitFor(() => expect(_outboxTest.queue()).toHaveLength(0))
    await reload.finish()
    expect(shown()).toMatchObject({ strokes: 7, disputed: true })
  })

  it('a write that lands while a fetch is on its way shows at once, and one more fetch follows that one (R3)', async () => {
    const reload = slowReload()
    await reload.atLastWave
    void save(8)
    const p = await control!.nth(1)
    p.land(upserted('scores', [serverWrite({ strokes: 8, entered_by: A, updated_at: '2027-04-09T18:00:05+00:00' })]))
    await vi.waitFor(() => expect(_outboxTest.queue()).toHaveLength(0))
    expect(shown()).toMatchObject({ strokes: 8 })
    expect(_liveTest.refetchAsked()).toBe(true)
    const n = reads()
    await reload.finish()
    expect(shown()).toMatchObject({ strokes: 8 })
    await vi.waitFor(() => expect(reads()).toBe(n + 1))
    expect(_liveTest.refetchAsked()).toBe(false)
  })

  it('a fetch that landed while the push was out read before the write: the hole shows at once, on the boards and in the copy, and stays when the one more fetch fails (N1)', async () => {
    void save(5)
    const p = await control!.nth(1)
    // A reload lands while the push is out: it read the server before the write.
    await store().reload()
    const five = serverWrite({ strokes: 5, entered_by: A, updated_at: '2027-04-09T18:00:01+00:00' })
    // No signal for the one more fetch, and the echo never comes.
    server.down = { message: 'TypeError: Failed to fetch' }
    try {
      const n = reads()
      p.land(upserted('scores', [five]))
      await vi.waitFor(() => expect(_outboxTest.queue()).toHaveLength(0))
      expect(shown()).toMatchObject({ strokes: 5 })
      expect(inBase()).toMatchObject({ strokes: 5 })
      // The one more fetch goes once the flush ends, and fails: the hole stays.
      await vi.waitFor(() => expect(reads()).toBeGreaterThan(n))
      await sleep(30)
      expect(shown()).toMatchObject({ strokes: 5 })
      expect(inBase()).toMatchObject({ strokes: 5 })
    } finally {
      server.down = null
    }
  })

  it('a flush whose landings overlap fetches asks its one more fetch once, when it ends (N8)', async () => {
    const holes = [13, 14, 15]
    for (const h of holes) void enqueueScore(TID, { round_id: R, player_id: P, hole: h, strokes: 5, putts: 2, picked_up: false, entered_by: A, client_ts: new Date().toISOString() })
    const answer = (h: number) => {
      const rows = server.tables.scores!
      const row = { id: `srv-${h}`, round_id: R, player_id: P, hole: h, strokes: 5, putts: 2, picked_up: false, entered_by: A, client_ts: null, updated_at: `2027-04-09T18:00:${10 + h}+00:00`, disputed: false, previous: null, reason: null }
      rows.splice(0, rows.length, ...rows.filter((r) => !(r.round_id === R && r.player_id === P && r.hole === h)), row)
      return upserted('scores', [row])
    }
    const n = reads()
    for (const [i, h] of holes.entries()) {
      const p = await control!.nth(i + 1)
      // A fetch lands while each push is out, and the pushes take their time on 4G.
      await store().reload()
      if (i === 0) expect(_liveTest.fetchAfterPushesAsked()).toBe(false)
      p.land(answer(h))
      if (i < holes.length - 1) {
        await control!.nth(i + 2)
        await sleep(200)
      }
    }
    await vi.waitFor(() => expect(_outboxTest.queue()).toHaveLength(0))
    // Its own three, and one more for the whole flush.
    await vi.waitFor(() => expect(reads()).toBe(n + holes.length + 1))
    await sleep(250)
    expect(reads()).toBe(n + holes.length + 1)
    for (const h of holes) expect(store().data!.snapshot.scores.find((x) => x.roundId === R && x.playerId === P && x.hole === h)).toMatchObject({ strokes: 5 })
  })

  it('two fetches out and a write lands during both: the newer lands first, and the older’s landing still sends the one more fetch (N2)', async () => {
    const older = slowReload()
    await older.atLastWave
    void save(8)
    const p = await control!.nth(1)
    p.land(upserted('scores', [serverWrite({ strokes: 8, entered_by: A, updated_at: '2027-04-09T18:00:05+00:00' })]))
    await vi.waitFor(() => expect(_outboxTest.queue()).toHaveLength(0))
    expect(_liveTest.refetchAsked()).toBe(true)
    // The newer fetch lands while the older is still out: nothing to ask yet.
    await store().reload()
    expect(_liveTest.refetchAsked()).toBe(true)
    const n = reads()
    await older.finish()
    await vi.waitFor(() => expect(reads()).toBe(n + 1))
    expect(_liveTest.refetchAsked()).toBe(false)
  })

  it('the guard keeps a row stamped later than the landed one, and one more fetch says which stands (N4)', async () => {
    void save(5)
    const p = await control!.nth(1)
    // Another phone's 7 is on the boards (its echo came) with a later stamp; this phone's 5 waited on the row's lock,
    // committed last with the earlier stamp, and its echo is lost.
    emit('scores', { eventType: 'UPDATE', new: serverWrite({ strokes: 7, entered_by: B, updated_at: '2027-04-09T18:00:02+00:00' }), old: {} })
    await vi.waitFor(() => expect(inBase()).toMatchObject({ strokes: 7 }))
    const five = serverWrite({ strokes: 5, entered_by: A, updated_at: '2027-04-09T18:00:01+00:00' })
    const n = reads()
    p.land(upserted('scores', [five]))
    await vi.waitFor(() => expect(reads()).toBe(n + 1))
    await vi.waitFor(() => expect(shown()).toMatchObject({ strokes: 5 }))
  })

  it('an answer that comes later than the change log keeps (2 min after its push) lands and asks one more fetch (N5)', async () => {
    void save(5)
    const p = await control!.nth(1)
    const five = serverWrite({ strokes: 5, entered_by: A, updated_at: '2027-04-09T18:00:01+00:00' })
    // No fetch landed since the push went out; its answer comes three minutes later.
    const later = performance.now() + 3 * 60_000
    const clock = vi.spyOn(performance, 'now').mockReturnValue(later)
    try {
      const n = reads()
      p.land(upserted('scores', [five]))
      await vi.waitFor(() => expect(_outboxTest.queue()).toHaveLength(0))
      expect(shown()).toMatchObject({ strokes: 5 })
      await vi.waitFor(() => expect(reads()).toBe(n + 1))
    } finally {
      clock.mockRestore()
    }
  })

  it('a tournament left is fetched by nothing: another tab’s write that lands after it asks no fetch (N9)', async () => {
    await startOutbox()
    const sentAt = liveClock()
    await store().reload()
    store().unsubscribe()
    const n = reads()
    // The other tab's push went out before this tab's last fetch: on an open tournament that is one more fetch.
    const other = new BroadcastChannel('cardi-golf-outbox')
    other.postMessage({ landed: { tournamentId: TID, changes: upserted('scores', [serverWrite({ strokes: 5, entered_by: A, updated_at: '2027-04-09T18:00:01+00:00' })]), age: liveClock() - sentAt } })
    other.close()
    await vi.waitFor(() => expect(shown()).toMatchObject({ strokes: 5 }))
    await sleep(300)
    expect(reads()).toBe(n)
  })

  it('a tournament left is fetched by nothing, a push answer that comes after it included (N9)', async () => {
    void save(5)
    const p = await control!.nth(1)
    await store().reload()
    store().unsubscribe()
    expect(_liveTest.isOpen()).toBe(false)
    const n = reads()
    p.land(upserted('scores', [serverWrite({ strokes: 5, entered_by: A, updated_at: '2027-04-09T18:00:01+00:00' })]))
    await vi.waitFor(() => expect(_outboxTest.queue()).toHaveLength(0))
    await sleep(300)
    expect(reads()).toBe(n)
  })
})

describe('a hole contest’s winners (the push deletes the group’s winners for the hole, then inserts the new ones)', () => {
  let TID: string
  const R = 'r2'
  const HOLE = 3
  const GAME = 'cerca'
  const G1 = 'r2g1'
  const G2 = 'r2g2'
  const winners = (group?: string) =>
    (store().data!.snapshot.holeAwards ?? [])
      .filter((a) => a.roundId === R && a.gameId === GAME && a.hole === HOLE && (!group || a.groupId === group))
      .map((a) => a.playerId)
      .sort()
  const row = (group: string, playerId: string): Row => ({ round_id: R, group_id: group, hole: HOLE, game_id: GAME, player_id: playerId, decided_by: 'p1', created_at: '2027-05-16T15:00:00+00:00' })
  const serverInsert = (r: Row) => (server.tables.hole_awards!.push(r), structuredClone(r))
  function serverDelete(group: string) {
    const gone = server.tables.hole_awards!.filter((x) => x.round_id === R && x.game_id === GAME && x.hole === HOLE && x.group_id === group)
    server.tables.hole_awards = server.tables.hole_awards!.filter((x) => !gone.includes(x))
    return gone
  }
  const award = (ids: string[]) => enqueueAward(TID, { round_id: R, group_id: G1, hole: HOLE, game_id: GAME, player_ids: ids, decided_by: 'p1' })
  beforeEach(async () => {
    const fx = (await open('friends8'))!
    TID = fx.snapshot.tournament.id
    server.tables.hole_awards = server.tables.hole_awards!.filter((x) => !(x.round_id === R && x.hole === HOLE && x.game_id === GAME))
    await store().reload()
  })

  it('two winners: the first insert’s echo came while the push was out; once taken, both show (A1)', async () => {
    void award(['p1', 'p2'])
    const p = await control!.nth(1)
    const a = serverInsert(row(G1, 'p1'))
    emit('hole_awards', { eventType: 'INSERT', new: a, old: {} })
    const b = serverInsert(row(G1, 'p2'))
    await sleep(60)
    p.land(upserted('hole_awards', [a, b]))
    await vi.waitFor(() => expect(_outboxTest.queue()).toHaveLength(0))
    await sleep(10)
    expect(winners()).toEqual(['p1', 'p2'])
  })

  it('a winner replaced (p1 for p3): the delete’s echo came while the push was out; once taken, p3 shows (A2)', async () => {
    serverInsert(row(G1, 'p1'))
    await store().reload()
    expect(winners()).toEqual(['p1'])
    void award(['p3'])
    const p = await control!.nth(1)
    const gone = serverDelete(G1)
    emit('hole_awards', { eventType: 'DELETE', new: {}, old: awardKey(gone[0]!) })
    const c = serverInsert(row(G1, 'p3'))
    await sleep(60)
    p.land([...deleted(gone), ...upserted('hole_awards', [c])])
    await vi.waitFor(() => expect(_outboxTest.queue()).toHaveLength(0))
    await sleep(10)
    expect(winners()).toEqual(['p3'])
  })

  it('a winner taken away, with no echo before the answer (A3)', async () => {
    serverInsert(row(G1, 'p1'))
    await store().reload()
    void award([])
    const p = await control!.nth(1)
    p.land(deleted(serverDelete(G1)))
    await vi.waitFor(() => expect(_outboxTest.queue()).toHaveLength(0))
    await sleep(10)
    expect(winners()).toEqual([])
  })

  it('the other group’s claim on the same hole, heard while this group’s push was out: both groups’ winners show (A4)', async () => {
    void award(['p2'])
    const p = await control!.nth(1)
    const z = serverInsert(row(G2, 'p6'))
    emit('hole_awards', { eventType: 'INSERT', new: z, old: {} })
    const ours = serverInsert(row(G1, 'p2'))
    await sleep(60)
    p.land(upserted('hole_awards', [ours]))
    await vi.waitFor(() => expect(_outboxTest.queue()).toHaveLength(0))
    await sleep(10)
    expect(winners(G1)).toEqual(['p2'])
    expect(winners(G2)).toEqual(['p6'])
  })

  it('a late answer after a reconnect: the fetch read the group mate’s later winner; this push’s older one shows only until the one more fetch brings the mate’s back (R3a)', async () => {
    void award(['p1'])
    const p = await control!.nth(1)
    // The server took p1, then the group mate's phone replaced it with p2; the channel was down for both.
    const ours = serverInsert(row(G1, 'p1'))
    serverDelete(G1)
    serverInsert(row(G1, 'p2'))
    await store().reload()
    p.land(upserted('hole_awards', [ours]))
    await vi.waitFor(() => expect(_outboxTest.queue()).toHaveLength(0))
    await sleep(250)
    expect(winners(G1)).toEqual(['p2'])
  })
})

describe('a snake answer changed', () => {
  it('the first answer’s echo during the second push does not leave the first showing (T1)', async () => {
    const fx = (await open('full12-live'))!
    const TID = fx.snapshot.tournament.id
    const round = fx.snapshot.rounds.find((r) => r.status === 'live')!
    const g = fx.snapshot.groups.find((x) => x.roundId === round.id)!
    const [a, b] = g.playerIds as [string, string]
    const HOLE = 17
    const shown = () => store().data!.snapshot.snakeTiebreaks.find((x) => x.roundId === round.id && x.groupId === g.id && x.hole === HOLE)?.lastHoledPlayerId
    void enqueueTiebreak(TID, { round_id: round.id, group_id: g.id, hole: HOLE, last_holed_player_id: a, decided_by: a })
    const p1 = await control!.nth(1)
    void enqueueTiebreak(TID, { round_id: round.id, group_id: g.id, hole: HOLE, last_holed_player_id: b, decided_by: a })
    const first = { round_id: round.id, group_id: g.id, hole: HOLE, last_holed_player_id: a, decided_by: a, created_at: '2027-04-09T18:00:00+00:00' }
    p1.land(upserted('snake_tiebreaks', [first]))
    const p2 = await control!.nth(2)
    emit('snake_tiebreaks', { eventType: 'INSERT', new: structuredClone(first), old: {} })
    await sleep(60)
    p2.land(upserted('snake_tiebreaks', [{ ...first, last_holed_player_id: b }]))
    await vi.waitFor(() => expect(_outboxTest.queue()).toHaveLength(0))
    await sleep(10)
    expect(shown()).toBe(b)
  })

  it('the group’s other phone answers after this one’s echo, before this push’s answer: its answer shows, not this one’s again (T2)', async () => {
    const fx = (await open('full12-live'))!
    const TID = fx.snapshot.tournament.id
    const round = fx.snapshot.rounds.find((r) => r.status === 'live')!
    const g = fx.snapshot.groups.find((x) => x.roundId === round.id)!
    const [a, b] = g.playerIds as [string, string]
    const HOLE = 17
    const shown = () => store().data!.snapshot.snakeTiebreaks.find((x) => x.roundId === round.id && x.groupId === g.id && x.hole === HOLE)?.lastHoledPlayerId
    void enqueueTiebreak(TID, { round_id: round.id, group_id: g.id, hole: HOLE, last_holed_player_id: a, decided_by: a })
    const p = await control!.nth(1)
    const ours = { round_id: round.id, group_id: g.id, hole: HOLE, last_holed_player_id: a, decided_by: a, created_at: '2027-04-09T18:00:00+00:00' }
    emit('snake_tiebreaks', { eventType: 'INSERT', new: structuredClone(ours), old: {} })
    emit('snake_tiebreaks', { eventType: 'UPDATE', new: { ...ours, last_holed_player_id: b, decided_by: b }, old: {} })
    await sleep(60)
    p.land(upserted('snake_tiebreaks', [ours]))
    await vi.waitFor(() => expect(_outboxTest.queue()).toHaveLength(0))
    await sleep(10)
    expect(shown()).toBe(b)
  })

  it('a late answer after a reconnect: the fetch read the group mate’s changed answer; this push’s older one shows only until the one more fetch brings the mate’s back (R3b)', async () => {
    const fx = (await open('full12-live'))!
    const TID = fx.snapshot.tournament.id
    const round = fx.snapshot.rounds.find((r) => r.status === 'live')!
    const g = fx.snapshot.groups.find((x) => x.roundId === round.id)!
    const [a, b] = g.playerIds as [string, string]
    const HOLE = 17
    const shown = () => store().data!.snapshot.snakeTiebreaks.find((x) => x.roundId === round.id && x.groupId === g.id && x.hole === HOLE)?.lastHoledPlayerId
    void enqueueTiebreak(TID, { round_id: round.id, group_id: g.id, hole: HOLE, last_holed_player_id: a, decided_by: a })
    const p = await control!.nth(1)
    const ours = { round_id: round.id, group_id: g.id, hole: HOLE, last_holed_player_id: a, decided_by: a, created_at: '2027-04-09T18:00:00+00:00' }
    server.tables.snake_tiebreaks = [...server.tables.snake_tiebreaks!.filter((x) => !(x.round_id === round.id && x.group_id === g.id && x.hole === HOLE)), { ...ours, last_holed_player_id: b, decided_by: b }]
    await store().reload()
    p.land(upserted('snake_tiebreaks', [ours]))
    await vi.waitFor(() => expect(_outboxTest.queue()).toHaveLength(0))
    await sleep(250)
    expect(shown()).toBe(b)
  })

  it('the phone’s clock set back while the answer is out: the reconnect fetch still counts as after it, and one more fetch brings the mate’s answer back (N6)', async () => {
    const fx = (await open('full12-live'))!
    const TID = fx.snapshot.tournament.id
    const round = fx.snapshot.rounds.find((r) => r.status === 'live')!
    const g = fx.snapshot.groups.find((x) => x.roundId === round.id)!
    const [a, b] = g.playerIds as [string, string]
    const HOLE = 17
    const shown = () => store().data!.snapshot.snakeTiebreaks.find((x) => x.roundId === round.id && x.groupId === g.id && x.hole === HOLE)?.lastHoledPlayerId
    void enqueueTiebreak(TID, { round_id: round.id, group_id: g.id, hole: HOLE, last_holed_player_id: a, decided_by: a })
    const p = await control!.nth(1)
    const ours = { round_id: round.id, group_id: g.id, hole: HOLE, last_holed_player_id: a, decided_by: a, created_at: '2027-04-09T18:00:00+00:00' }
    server.tables.snake_tiebreaks = [...server.tables.snake_tiebreaks!.filter((x) => !(x.round_id === round.id && x.group_id === g.id && x.hole === HOLE)), { ...ours, last_holed_player_id: b, decided_by: b }]
    // The phone's clock goes back two minutes (a time zone change, a sync) while the answer is out, and a reconnect fetch lands.
    const wall = vi.spyOn(Date, 'now').mockReturnValue(Date.now() - 2 * 60_000)
    try {
      await store().reload()
    } finally {
      wall.mockRestore()
    }
    p.land(upserted('snake_tiebreaks', [ours]))
    await vi.waitFor(() => expect(_outboxTest.queue()).toHaveLength(0))
    await sleep(250)
    expect(shown()).toBe(b)
  })

  it('the phone’s clock set forward while the answer is out: the log still holds the echoes, so the mate’s later answer shows, not this one’s again (N6b)', async () => {
    const fx = (await open('full12-live'))!
    const TID = fx.snapshot.tournament.id
    const round = fx.snapshot.rounds.find((r) => r.status === 'live')!
    const g = fx.snapshot.groups.find((x) => x.roundId === round.id)!
    const [a, b] = g.playerIds as [string, string]
    const HOLE = 17
    const shown = () => store().data!.snapshot.snakeTiebreaks.find((x) => x.roundId === round.id && x.groupId === g.id && x.hole === HOLE)?.lastHoledPlayerId
    void enqueueTiebreak(TID, { round_id: round.id, group_id: g.id, hole: HOLE, last_holed_player_id: a, decided_by: a })
    const p = await control!.nth(1)
    const ours = { round_id: round.id, group_id: g.id, hole: HOLE, last_holed_player_id: a, decided_by: a, created_at: '2027-04-09T18:00:00+00:00' }
    emit('snake_tiebreaks', { eventType: 'INSERT', new: structuredClone(ours), old: {} })
    emit('snake_tiebreaks', { eventType: 'UPDATE', new: { ...ours, last_holed_player_id: b, decided_by: b }, old: {} })
    await sleep(60)
    // The clock jumps three minutes ahead, and a change heard then ages the log: by the wall clock both echoes would go.
    const row = server.tables.scores!.find((r) => r.round_id === round.id)!
    const wall = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 3 * 60_000)
    try {
      emit('scores', { eventType: 'UPDATE', new: { ...structuredClone(row), strokes: 9, updated_at: '2027-04-09T18:00:09+00:00' }, old: {} })
      await vi.waitFor(() => expect(store().data!.snapshot.scores.find((x) => x.id === row.id)?.strokes).toBe(9))
    } finally {
      wall.mockRestore()
    }
    p.land(upserted('snake_tiebreaks', [ours]))
    await vi.waitFor(() => expect(_outboxTest.queue()).toHaveLength(0))
    await sleep(250)
    expect(shown()).toBe(b)
  })
})

describe('a write to a day this phone has not loaded (parked until the day comes)', () => {
  const day = (TID: string, courseId: string | null) => ({ id: 'r3-new', tournament_id: TID, number: 3, date: '2027-04-11', course_id: courseId, holes: 18, status: 'live' })
  async function setup() {
    const fx = (await open('full12-live'))!
    const TID = fx.snapshot.tournament.id
    const P = fx.snapshot.groups.find((g) => g.roundId === 'r2')!.playerIds[0]!
    server.tables.rounds!.push(day(TID, fx.snapshot.rounds[0]!.courseId))
    const shown = () => store().data!.snapshot.scores.find((x) => x.roundId === 'r3-new' && x.playerId === P && x.hole === 1)
    const save = (strokes: number) => enqueueScore(TID, { round_id: 'r3-new', player_id: P, hole: 1, strokes, putts: 2, picked_up: false, entered_by: P, client_ts: new Date().toISOString() })
    const srow = (strokes: number, stamp: string, by: string) => ({ id: 'r3-s1', round_id: 'r3-new', player_id: P, hole: 1, strokes, putts: 2, picked_up: false, entered_by: by, client_ts: null, updated_at: stamp, disputed: false, previous: null, reason: null })
    return { TID, shown, save, srow }
  }

  it('a landed row parked: the fetch that brings the day read another phone’s later write, and the later one shows (LF1)', async () => {
    const { TID, shown, save, srow } = await setup()
    void save(5)
    const p = await control!.nth(1)
    p.land(upserted('scores', [srow(5, '2027-04-11T09:00:01+00:00', 'p1')]))
    await vi.waitFor(() => expect(_outboxTest.queue()).toHaveLength(0))
    expect(_liveTest.parkedSize()).toBeGreaterThan(0)
    server.tables.scores!.push(srow(7, '2027-04-11T09:00:02+00:00', 'p4'))
    emit('rounds', { eventType: 'INSERT', new: day(TID, 'x'), old: {} })
    await vi.waitFor(() => expect(store().data!.snapshot.rounds.some((r) => r.id === 'r3-new')).toBe(true))
    await sleep(200)
    expect(shown()?.strokes).toBe(7)
  })

  it('its echo parked first counts as heard: the other phone’s write committed after it (the earlier stamp) is what shows when the day comes (N7, LF2)', async () => {
    const { TID, shown, save, srow } = await setup()
    void save(5)
    const p = await control!.nth(1)
    const mine = srow(5, '2027-04-11T09:00:02+00:00', 'p1')
    // In commit order: this write, then the other phone's 9, which began first and waited on the row's lock.
    const theirs = srow(9, '2027-04-11T09:00:01.5+00:00', 'p4')
    emit('scores', { eventType: 'INSERT', new: structuredClone(mine), old: {} })
    emit('scores', { eventType: 'UPDATE', new: structuredClone(theirs), old: {} })
    await sleep(60)
    p.land(upserted('scores', [mine]))
    await vi.waitFor(() => expect(_outboxTest.queue()).toHaveLength(0))
    server.tables.scores!.push(theirs)
    emit('rounds', { eventType: 'INSERT', new: day(TID, 'x'), old: {} })
    await vi.waitFor(() => expect(store().data!.snapshot.rounds.some((r) => r.id === 'r3-new')).toBe(true))
    await sleep(200)
    expect(shown()?.strokes).toBe(9)
  })
})

describe('Dinero: «Marcar pagado» on an account with no row yet', () => {
  it('the mark laid on the boards and the server’s insert are one row: the payment counts once (M1)', async () => {
    const fx = (await open('full12-live'))!
    const TID = fx.snapshot.tournament.id
    const pid = fx.snapshot.players.find((p) => !server.tables.payments!.some((x) => x.from_player_id === p.id && x.kind === 'entry'))?.id
    expect(pid).toBeTruthy()
    const real = { id: '00000000-0000-4000-8000-00000000abcd', tournament_id: TID, from_player_id: pid, to_player_id: null, amount: 2500, kind: 'entry', paid: true, note: null, created_at: '2027-04-08T23:00:00+00:00' }
    server.tables.payments!.push(real)
    const slow = server.hold()
    // MoneyScreen: the server upserts, Dinero lays the mark, then reloads (slowly, on 4G).
    store().patch((s) => applyPaidWrites(s, [{ kind: 'entry', from: pid!, to: null, amount: 2500, paid: true }]))
    const reloading = store().reload()
    await slow.received
    emit('payments', { eventType: 'INSERT', new: structuredClone(real), old: {} })
    await sleep(80)
    expect(store().data!.base.payments.filter((p) => p.kind === 'entry' && p.fromPlayerId === pid).map((p) => p.id)).toEqual([real.id])
    slow.release()
    await reloading
  })
})

describe('changes of a day this phone has not loaded, and the change log', () => {
  let TID: string
  let R: string
  let P: string
  beforeEach(async () => {
    const fx = (await open('full12-live'))!
    TID = fx.snapshot.tournament.id
    R = fx.snapshot.rounds.find((r) => r.status === 'live')!.id
    P = fx.snapshot.groups.find((g) => g.roundId === R)!.playerIds[0]!
  })
  const newDay = () => ({ id: 'r3-new', tournament_id: TID, number: 3, date: '2027-04-11', course_id: getFixture('full12-live')!.snapshot.rounds[0]!.courseId, holes: 18, status: 'live' })
  const dayScore = () => ({ id: 'r3-s1', round_id: 'r3-new', player_id: P, hole: 1, strokes: 4, putts: 2, picked_up: false, entered_by: P, client_ts: null, updated_at: '2027-04-11T09:10:00+00:00', disputed: false, previous: null, reason: null })

  it('a score saved and deleted on a day just created does not come back when the day lands (K1, round-1 repro G)', async () => {
    const day = newDay()
    server.tables.rounds!.push(day)
    const sc = dayScore()
    emit('rounds', { eventType: 'INSERT', new: day, old: {} })
    emit('scores', { eventType: 'INSERT', new: structuredClone(sc), old: {} })
    await sleep(60)
    emit('scores', { eventType: 'DELETE', new: {}, old: { id: sc.id } })
    await vi.waitFor(() => expect(store().data!.snapshot.rounds.some((r) => r.id === day.id)).toBe(true))
    await sleep(300)
    expect(store().data!.snapshot.scores.some((s) => s.id === sc.id)).toBe(false)
  })

  it('a parked change is not pushed out by 500 of another tournament’s (K2)', async () => {
    const day = newDay()
    server.tables.rounds!.push(day)
    const reload = slowReload()
    await reload.atLastWave
    const sc = dayScore()
    server.tables.scores!.push(sc)
    emit('scores', { eventType: 'INSERT', new: structuredClone(sc), old: {} })
    await sleep(60)
    for (let i = 0; i < 501; i++) emit('scores', { eventType: 'UPDATE', new: { id: `o-${i}`, round_id: 'other-round', player_id: 'op', hole: 1 + (i % 18), strokes: 4, putts: 2, picked_up: false, updated_at: '2027-04-11T09:10:00+00:00', disputed: false }, old: {} })
    await sleep(60)
    await reload.finish()
    expect(store().data!.snapshot.scores.some((s) => s.id === sc.id)).toBe(true)
  })

  it('1,000 deletes from a tournament deleted elsewhere, while a reload is out, do not push out a change applied before (K3)', async () => {
    const reload = slowReload()
    await reload.atLastWave
    const row = server.tables.scores!.find((r) => r.round_id === R && r.player_id === P && r.hole === 5)!
    Object.assign(row, { strokes: 9, updated_at: '2027-04-11T09:00:00+00:00' })
    emit('scores', { eventType: 'UPDATE', new: structuredClone(row), old: {} })
    await sleep(60)
    expect(store().data!.snapshot.scores.find((s) => s.id === row.id)?.strokes).toBe(9)
    for (let i = 0; i < 1000; i++) emit('scores', { eventType: 'DELETE', new: {}, old: { id: `elsewhere-${i}` } })
    await sleep(60)
    await reload.finish()
    expect(store().data!.snapshot.scores.find((s) => s.id === row.id)?.strokes).toBe(9)
  })

  const otherTournament = (i: number) => ({ id: `o-${i}`, round_id: 'other-round', player_id: 'op', hole: 1 + (i % 18), strokes: 4, putts: 2, picked_up: false, updated_at: '2027-04-11T09:10:00+00:00', disputed: false })

  it('another tournament’s flood parks at most PARK_MAX changes, the newest: a change of this day after it still lands (K4)', async () => {
    const day = newDay()
    server.tables.rounds!.push(day)
    const sc = dayScore()
    const reload = slowReload()
    try {
      await reload.atLastWave
      for (let i = 0; i < _liveTest.PARK_MAX + 1000; i++) emit('scores', { eventType: 'UPDATE', new: otherTournament(i), old: {} })
      server.tables.scores!.push(sc)
      emit('scores', { eventType: 'INSERT', new: structuredClone(sc), old: {} })
      await vi.waitFor(() => expect(_liveTest.parkedSize()).toBe(_liveTest.PARK_MAX))
    } finally {
      await reload.finish()
    }
    expect(store().data!.snapshot.scores.some((s) => s.id === sc.id)).toBe(true)
  })

  it('a flood of deletes while a reload is out logs at most LOG_MAX changes (K5)', async () => {
    const reload = slowReload()
    try {
      await reload.atLastWave
      for (let i = 0; i < _liveTest.LOG_MAX + 1000; i++) emit('scores', { eventType: 'DELETE', new: {}, old: { id: `elsewhere-${i}` } })
      await vi.waitFor(() => expect(_liveTest.logSize()).toBe(_liveTest.LOG_MAX))
    } finally {
      await reload.finish()
    }
  })

  it('a card signed, unsigned and signed again on a day just created, while a reload is out, lands signed (K7)', async () => {
    const day = newDay()
    server.tables.rounds!.push(day)
    const PAIR = getFixture('full12-live')!.snapshot.pairs[0]!.id
    const sig = { round_id: day.id, pair_id: PAIR, signed_by: P, signed_at: '2027-04-11T12:00:00+00:00' }
    const reload = slowReload()
    try {
      await reload.atLastWave
      emit('card_signatures', { eventType: 'INSERT', new: structuredClone(sig), old: {} })
      await sleep(60)
      emit('card_signatures', { eventType: 'DELETE', new: {}, old: { round_id: day.id, pair_id: PAIR } })
      await sleep(60)
      emit('card_signatures', { eventType: 'INSERT', new: { ...sig, signed_at: '2027-04-11T12:01:00+00:00' }, old: {} })
      await sleep(60)
    } finally {
      await reload.finish()
    }
    // The delete it logged for the fetch goes before what waited for the day: the last signature stands.
    expect(store().data!.snapshot.cardSignatures.filter((c) => c.roundId === day.id && c.pairId === PAIR).map((c) => c.signedAt)).toEqual(['2027-04-11T12:01:00+00:00'])
  })

  it('what waited for a day that never came is let go after two minutes (K8)', async () => {
    for (let i = 0; i < 10; i++) emit('scores', { eventType: 'UPDATE', new: otherTournament(i), old: {} })
    await vi.waitFor(() => expect(_liveTest.parkedSize()).toBe(10))
    const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 2 * 60_000 + 1000)
    try {
      emit('scores', { eventType: 'UPDATE', new: otherTournament(99), old: {} })
      await vi.waitFor(() => expect(_liveTest.parkedSize()).toBe(1))
    } finally {
      clock.mockRestore()
    }
  })

  it('a delete of a row the boards do not hold is not logged with no fetch out; a change applied is (K6)', async () => {
    await vi.waitFor(() => expect(_liveTest.fetching()).toBe(0))
    for (let i = 0; i < 100; i++) emit('scores', { eventType: 'DELETE', new: {}, old: { id: `elsewhere-${i}` } })
    await sleep(60)
    expect(_liveTest.logSize()).toBe(0)
    const row = server.tables.scores!.find((r) => r.round_id === R && r.player_id === P && r.hole === 5)!
    Object.assign(row, { strokes: 9, updated_at: '2027-04-11T09:00:00+00:00' })
    emit('scores', { eventType: 'UPDATE', new: structuredClone(row), old: {} })
    await vi.waitFor(() => expect(_liveTest.logSize()).toBe(1))
  })
})

describe('another tab of the app on this phone', () => {
  it('its write the server took shows here before this tab’s own echo comes (X1)', async () => {
    await startOutbox()
    const fx = (await open('full12-live'))!
    const TID = fx.snapshot.tournament.id
    const R = fx.snapshot.rounds.find((r) => r.status === 'live')!.id
    const P = fx.snapshot.groups.find((g) => g.roundId === R)!.playerIds[0]!
    const shown = () => store().data!.snapshot.scores.find((x) => x.roundId === R && x.playerId === P && x.hole === 16)
    const row = { id: 'srv-x1', round_id: R, player_id: P, hole: 16, strokes: 9, putts: 2, picked_up: false, entered_by: P, client_ts: null, updated_at: '2027-04-09T18:00:01+00:00', disputed: false, previous: null, reason: null }
    // The tab that pushed says what the server stored, on the outbox's channel.
    const other = new BroadcastChannel('cardi-golf-outbox')
    other.postMessage({ landed: { tournamentId: TID, changes: upserted('scores', [row]), age: 0 } })
    other.close()
    await vi.waitFor(() => expect(shown()).toMatchObject({ id: 'srv-x1', strokes: 9 }))
  })

  it('its answer, after this tab heard its echo and the group’s other phone’s answer, does not come back over the other phone’s (X2)', async () => {
    await startOutbox()
    const fx = (await open('full12-live'))!
    const TID = fx.snapshot.tournament.id
    const round = fx.snapshot.rounds.find((r) => r.status === 'live')!
    const g = fx.snapshot.groups.find((x) => x.roundId === round.id)!
    const [a, b] = g.playerIds as [string, string]
    const HOLE = 17
    const answer = () => store().data!.snapshot.snakeTiebreaks.find((x) => x.roundId === round.id && x.groupId === g.id && x.hole === HOLE)?.lastHoledPlayerId
    const theirs = { round_id: round.id, group_id: g.id, hole: HOLE, last_holed_player_id: a, decided_by: a, created_at: '2027-04-09T18:00:00+00:00' }
    // The other tab's push went out before the server committed it, so before its echo came.
    const sentAt = liveClock()
    emit('snake_tiebreaks', { eventType: 'INSERT', new: structuredClone(theirs), old: {} })
    emit('snake_tiebreaks', { eventType: 'UPDATE', new: { ...theirs, last_holed_player_id: b, decided_by: b }, old: {} })
    await vi.waitFor(() => expect(answer()).toBe(b))
    // The tab that pushed says what the server stored for it; then a later write of its, to know the first was read.
    const later = { id: 'srv-x2', round_id: round.id, player_id: a, hole: 16, strokes: 9, putts: 2, picked_up: false, entered_by: a, client_ts: null, updated_at: '2027-04-09T18:00:05+00:00', disputed: false, previous: null, reason: null }
    const other = new BroadcastChannel('cardi-golf-outbox')
    other.postMessage({ landed: { tournamentId: TID, changes: upserted('snake_tiebreaks', [theirs]), age: liveClock() - sentAt } })
    other.postMessage({ landed: { tournamentId: TID, changes: upserted('scores', [later]), age: 0 } })
    other.close()
    await vi.waitFor(() => expect(store().data!.snapshot.scores.some((s) => s.id === 'srv-x2')).toBe(true))
    expect(answer()).toBe(b)
  })

  it('its write sent before this tab’s last fetch does not land: that fetch may have read past it, so one more fetch shows the server (X3)', async () => {
    await startOutbox()
    const fx = (await open('full12-live'))!
    const TID = fx.snapshot.tournament.id
    const R = fx.snapshot.rounds.find((r) => r.status === 'live')!.id
    const P = fx.snapshot.groups.find((g) => g.roundId === R)!.playerIds[0]!
    const shown = () => store().data!.snapshot.scores.find((x) => x.roundId === R && x.playerId === P && x.hole === 16)
    const sentAt = liveClock()
    // The other tab's 5 was stamped :02; another phone's 7, whose write waited on the row, committed after it stamped :01.
    const five = { id: 'srv-x3', round_id: R, player_id: P, hole: 16, strokes: 5, putts: 2, picked_up: false, entered_by: P, client_ts: null, updated_at: '2027-04-09T18:00:02+00:00', disputed: false, previous: null, reason: null }
    const rows = server.tables.scores!
    const held = rows.find((r) => r.round_id === R && r.player_id === P && r.hole === 16)
    const seven = { ...five, strokes: 7, updated_at: '2027-04-09T18:00:01+00:00', disputed: true }
    if (held) Object.assign(held, seven)
    else rows.push(seven)
    // This tab fetched after the write went out: it read the 7.
    await store().reload()
    expect(shown()).toMatchObject({ strokes: 7 })
    const n = reads()
    const other = new BroadcastChannel('cardi-golf-outbox')
    other.postMessage({ landed: { tournamentId: TID, changes: upserted('scores', [five]), age: liveClock() - sentAt } })
    other.close()
    await vi.waitFor(() => expect(reads()).toBe(n + 1))
    expect(shown()).toMatchObject({ strokes: 7, disputed: true })
  })

  it('an earlier identical row is not its write’s echo: a → b → a from the other tab, after this tab heard a’s and b’s echoes, shows a (N3)', async () => {
    await startOutbox()
    const fx = (await open('full12-live'))!
    const TID = fx.snapshot.tournament.id
    const round = fx.snapshot.rounds.find((r) => r.status === 'live')!
    const g = fx.snapshot.groups.find((x) => x.roundId === round.id)!
    const [a, b] = g.playerIds as [string, string]
    const HOLE = 17
    const answer = () => store().data!.snapshot.snakeTiebreaks.find((x) => x.roundId === round.id && x.groupId === g.id && x.hole === HOLE)?.lastHoledPlayerId
    // The same decider's rows: the upsert keeps created_at, so a and a again are byte-identical.
    const ans = (who: string) => ({ round_id: round.id, group_id: g.id, hole: HOLE, last_holed_player_id: who, decided_by: a, created_at: '2027-04-09T18:00:00+00:00' })
    emit('snake_tiebreaks', { eventType: 'INSERT', new: ans(a), old: {} })
    emit('snake_tiebreaks', { eventType: 'UPDATE', new: ans(b), old: {} })
    await vi.waitFor(() => expect(answer()).toBe(b))
    await sleep(5)
    // The third write, a again, went out just now; its echo has not come.
    const other = new BroadcastChannel('cardi-golf-outbox')
    other.postMessage({ landed: { tournamentId: TID, changes: upserted('snake_tiebreaks', [ans(a)]), age: 0 } })
    other.close()
    await vi.waitFor(() => expect(answer()).toBe(a))
  })

  /** Hole 16 of the live round's first player, as the server stored the other tab's write. */
  async function stored(strokes: number) {
    await startOutbox()
    const fx = (await open('full12-live'))!
    const TID = fx.snapshot.tournament.id
    const R = fx.snapshot.rounds.find((r) => r.status === 'live')!.id
    const P = fx.snapshot.groups.find((g) => g.roundId === R)!.playerIds[0]!
    const row = { id: 'srv-x4', round_id: R, player_id: P, hole: 16, strokes, putts: 2, picked_up: false, entered_by: P, client_ts: null, updated_at: '2027-04-09T18:00:03+00:00', disputed: false, previous: null, reason: null }
    const rows = server.tables.scores!
    const held = rows.find((r) => r.round_id === R && r.player_id === P && r.hole === 16)
    if (held) Object.assign(held, row)
    else rows.push(structuredClone(row))
    const shown = () => store().data!.snapshot.scores.find((x) => x.roundId === R && x.playerId === P && x.hole === 16)
    return { TID, row, shown }
  }

  it('its write whose push went out longer ago than the log keeps lands, and one more fetch follows (X4)', async () => {
    const { TID, row, shown } = await stored(9)
    const n = reads()
    const other = new BroadcastChannel('cardi-golf-outbox')
    other.postMessage({ landed: { tournamentId: TID, changes: upserted('scores', [row]), age: _liveTest.LOG_MS + 1000 } })
    other.close()
    await vi.waitFor(() => expect(shown()).toMatchObject({ strokes: 9 }))
    await vi.waitFor(() => expect(reads()).toBe(n + 1))
  })

  it('a message that does not say how long ago its push went out lands, and one more fetch follows (X5)', async () => {
    const { TID, row, shown } = await stored(8)
    const n = reads()
    const other = new BroadcastChannel('cardi-golf-outbox')
    other.postMessage({ landed: { tournamentId: TID, changes: upserted('scores', [row]) } })
    other.close()
    await vi.waitFor(() => expect(shown()).toMatchObject({ strokes: 8 }))
    await vi.waitFor(() => expect(reads()).toBe(n + 1))
  })

  it('a quick message lands with no fetch: its push went out after this tab’s last fetch (X6)', async () => {
    const { TID, row, shown } = await stored(7)
    const n = reads()
    const other = new BroadcastChannel('cardi-golf-outbox')
    other.postMessage({ landed: { tournamentId: TID, changes: upserted('scores', [row]), age: 0 } })
    other.close()
    await vi.waitFor(() => expect(shown()).toMatchObject({ strokes: 7 }))
    await sleep(300)
    expect(reads()).toBe(n)
  })
})
