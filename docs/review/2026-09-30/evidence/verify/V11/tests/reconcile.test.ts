/**
 * V11 / REL-07: does a phone reconcile its own write with the server?
 * Real modules: src/data/outbox.ts + src/data/tournamentStore.ts + the engine (HEAD). Replaced seams only:
 * the supabase client (an in-memory "server" that answers fetchSnapshot's queries, applies upserts with the
 * 0010 dispute semantics, and exposes the Realtime channel callbacks), the row mappers (identity: the fake
 * server stores engine-shaped rows) and the IndexedDB snapshot cache (no-op).
 * Data: the full12-live design fixture (12 players, day 2 live).
 */
import { describe, expect, it, vi } from 'vitest'

const H = vi.hoisted(() => {
  const win = new EventTarget()
  const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' })
  ;(globalThis as unknown as { window: unknown }).window = win
  ;(globalThis as unknown as { document: unknown }).document = doc
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type AnyRow = any
  const server = {
    tables: {} as Record<string, AnyRow[]>,
    requests: 0,
    upserts: 0,
    afterUpsert: null as null | ((row: AnyRow) => void),
    channels: [] as Array<{ handlers: Array<() => void>; statusCb: ((s: string) => void) | null }>,
  }
  function applyScore(p: AnyRow) {
    const rows = server.tables.scores!
    const i = rows.findIndex((r) => r.roundId === p.round_id && r.playerId === p.player_id && r.hole === p.hole)
    const old = i >= 0 ? rows[i] : null
    const next: AnyRow = { roundId: p.round_id, playerId: p.player_id, hole: p.hole, strokes: p.strokes, putts: p.putts, pickedUp: p.picked_up, enteredBy: p.entered_by, updatedAt: new Date().toISOString(), disputed: old?.disputed ?? false, previous: old?.previous ?? null }
    // 0010 scores_detect_dispute: a different entered_by changing the values flags the row and keeps the old values.
    if (old && (old.strokes !== next.strokes || old.putts !== next.putts || old.pickedUp !== next.pickedUp) && next.enteredBy && next.enteredBy !== old.enteredBy && old.enteredBy) {
      next.disputed = true
      next.previous = { strokes: old.strokes, putts: old.putts, picked_up: old.pickedUp, entered_by: old.enteredBy }
    }
    if (i >= 0) rows[i] = next
    else rows.push(next)
    return next
  }
  function query(table: string) {
    let upsertPayload: AnyRow = null
    let single = false
    const b: AnyRow = {
      select: () => b,
      eq: () => b,
      in: () => b,
      order: () => b,
      range: () => b,
      single: () => ((single = true), b),
      upsert: (payload: AnyRow) => ((upsertPayload = payload), b),
      then(resolve: (v: unknown) => void, reject: (e: unknown) => void) {
        try {
          server.requests++
          if (upsertPayload) {
            server.upserts++
            const row = applyScore(upsertPayload)
            server.afterUpsert?.(row)
            // PostgREST default (Prefer: return=minimal): no body comes back to the client.
            resolve({ data: null, error: null })
            return
          }
          const rows = structuredClone(server.tables[table] ?? [])
          resolve(single ? { data: rows[0] ?? null, error: rows[0] ? null : { message: 'not found' } } : { data: rows, error: null })
        } catch (e) {
          reject(e)
        }
      },
    }
    return b
  }
  const client = {
    from: (t: string) => query(t),
    channel: () => {
      const ch: AnyRow = { handlers: [], statusCb: null }
      ch.on = (_type: string, _filter: unknown, cb: () => void) => (ch.handlers.push(cb), ch)
      ch.subscribe = (cb: (s: string) => void) => ((ch.statusCb = cb), ch)
      server.channels.push(ch)
      return ch
    },
    removeChannel: async () => undefined,
  }
  return { win, doc, server, client }
})

vi.mock('/home/user/Cardi-Golf/src/lib/supabase', () => ({ supabase: () => H.client, supabaseConfigured: true }))
vi.mock('/home/user/Cardi-Golf/src/data/snapshotCache', () => ({ saveSnapshot: async () => undefined }))
vi.mock('/home/user/Cardi-Golf/src/data/mappers', () => {
  const id = <T,>(x: T) => x
  return {
    mapTournament: id, mapPlayer: id, mapHole: id, mapTee: id, mapCourse: id, mapRound: id, mapGroup: id, mapRoundTee: id,
    mapPair: id, mapTeam: id, mapScore: id, mapSnakeTiebreak: id, mapCardSignature: id, mapHandicapOverride: id, mapLot: id,
    mapBid: id, mapBuyback: id, mapGameEntry: id, mapHoleAward: id, mapGameResult: id, mapPayment: id,
  }
})

const { getFixture } = await import('/home/user/Cardi-Golf/src/dev/fixtures')
const { useTournament } = await import('/home/user/Cardi-Golf/src/data/tournamentStore')
const { startOutbox, enqueueScore, useOutbox } = await import('/home/user/Cardi-Golf/src/data/outbox')

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function seedServer() {
  const f = getFixture('full12-live')!
  const s = structuredClone(f.snapshot)
  H.server.tables = {
    tournaments: [s.tournament],
    players: s.players,
    rounds: s.rounds.map((r) => ({ ...r, course_id: r.courseId })),
    pairs: s.pairs,
    teams: s.teams ?? [],
    calcutta_lots: s.calcuttaLots,
    payments: s.payments,
    game_entries: s.gameEntries ?? [],
    game_results: s.gameResults ?? [],
    groups: s.groups,
    round_tees: s.roundTees,
    scores: s.scores,
    snake_tiebreaks: s.snakeTiebreaks,
    card_signatures: s.cardSignatures,
    handicap_overrides: s.handicapOverrides,
    calcutta_bids: s.calcuttaBids,
    calcutta_buybacks: s.calcuttaBuybacks,
    courses: s.courses,
    tees: [],
    hole_awards: s.holeAwards ?? [],
    group_members: [],
    holes: [],
    team_members: [],
  }
  return s
}

function view(tid: string, rid: string, pid: string, hole: number) {
  const d = useTournament.getState().data!
  const sc = d.snapshot.scores.find((x) => x.roundId === rid && x.playerId === pid && x.hole === hole)
  const srv = H.server.tables.scores!.find((x) => x.roundId === rid && x.playerId === pid && x.hole === hole)
  const o = useOutbox.getState()
  const chip = o.rejected.length ? 'rechazados' : o.lastError ? o.lastError : o.pending > 0 ? `${o.pending} pendientes` : 'Sincronizado'
  const flagged = d.state.flags.discrepancies.some((x) => x.roundId === rid && x.playerId === pid && x.hole === hole)
  return { phoneShows: sc?.strokes ?? null, phoneDisputedFlag: flagged, chip, serverHas: srv?.strokes ?? null, serverDisputed: !!srv?.disputed, tid }
}

describe('REL-07: the phone keeps its optimistic value after the push', () => {
  it('Realtime down (as REL-01): mismatch under «Sincronizado» until the next reload trigger; visibilitychange reconciles', async () => {
    const s = seedServer()
    const tid = s.tournament.id
    await startOutbox()
    await useTournament.getState().load(tid)
    const ch = H.server.channels.at(-1)!
    ch.statusCb?.('CHANNEL_ERROR') // REL-01: the subscription is refused, no events will arrive
    const rid = 'r2'
    const pid = 'p2'
    const played = new Set(s.scores.filter((x) => x.roundId === rid && x.playerId === pid).map((x) => x.hole))
    const hole = [...Array(18).keys()].map((i) => i + 1).find((h) => !played.has(h))!
    // Another device (player p4, the rival pair) saves the same hole right after this phone's push lands.
    H.server.afterUpsert = (row) => {
      H.server.afterUpsert = null
      if (row.playerId === pid && row.hole === hole) {
        const rows = H.server.tables.scores!
        const i = rows.findIndex((r) => r === row)
        rows[i] = { ...row, strokes: 7, enteredBy: 'p4', disputed: true, previous: { strokes: row.strokes, putts: row.putts, picked_up: row.pickedUp, entered_by: row.enteredBy } }
      }
    }
    const req0 = H.server.requests
    await enqueueScore(tid, { round_id: rid, player_id: pid, hole, strokes: 5, putts: 2, picked_up: false, entered_by: pid, client_ts: new Date().toISOString() })
    await sleep(50)
    const a = view(tid, rid, pid, hole)
    console.log('after push (Realtime down):', JSON.stringify(a), 'requests since save:', H.server.requests - req0)
    await sleep(3000)
    const b = view(tid, rid, pid, hole)
    console.log('3 s later, no trigger:', JSON.stringify(b))
    expect(a.chip).toBe('Sincronizado')
    expect(b.phoneShows).toBe(5)
    expect(b.serverHas).toBe(7)
    expect(b.phoneDisputedFlag).toBe(false)
    // The phone is locked and unlocked (or the app is switched away and back).
    H.doc.dispatchEvent(new Event('visibilitychange'))
    await sleep(100)
    const c = view(tid, rid, pid, hole)
    console.log('after visibilitychange → reload:', JSON.stringify(c))
    expect(c.phoneShows).toBe(7)
    expect(c.phoneDisputedFlag).toBe(true)
  })

  it('Realtime up: the change events trigger a refetch and the phone converges on the server value', async () => {
    const s = seedServer()
    const tid = s.tournament.id
    useTournament.getState().unsubscribe()
    await useTournament.getState().load(tid)
    const ch = H.server.channels.at(-1)!
    ch.statusCb?.('SUBSCRIBED')
    await sleep(50)
    const rid = 'r2'
    const pid = 'p2'
    const played = new Set(s.scores.filter((x) => x.roundId === rid && x.playerId === pid).map((x) => x.hole))
    const hole = [...Array(18).keys()].map((i) => i + 1).find((h) => !played.has(h))!
    H.server.afterUpsert = (row) => {
      H.server.afterUpsert = null
      const rows = H.server.tables.scores!
      const i = rows.findIndex((r) => r === row)
      rows[i] = { ...row, strokes: 7, enteredBy: 'p4', disputed: true, previous: { strokes: row.strokes, putts: row.putts, picked_up: row.pickedUp, entered_by: row.enteredBy } }
    }
    await enqueueScore(tid, { round_id: rid, player_id: pid, hole, strokes: 5, putts: 2, picked_up: false, entered_by: pid, client_ts: new Date().toISOString() })
    await sleep(50)
    const a = view(tid, rid, pid, hole)
    console.log('after push (Realtime up, before the events):', JSON.stringify(a))
    // postgres_changes for this phone's write and for the other device's write.
    for (const h of ch.handlers.slice(0, 1)) h()
    await sleep(40)
    for (const h of ch.handlers.slice(0, 1)) h()
    await sleep(300)
    const b = view(tid, rid, pid, hole)
    console.log('after the change events (150 ms debounce + refetch):', JSON.stringify(b))
    expect(b.phoneShows).toBe(7)
    expect(b.phoneDisputedFlag).toBe(true)
  })
})
