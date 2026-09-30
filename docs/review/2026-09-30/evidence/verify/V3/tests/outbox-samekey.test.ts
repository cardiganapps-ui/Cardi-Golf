/**
 * V3 independent repro for ARCH-01 / QA-01 (outbox same-key race).
 *
 * - The real src/data/outbox.ts, unmodified.
 * - The real Dexie on fake-indexeddb, so IndexedDB persistence is checked too (not only the in-memory mirror).
 * - A push stub whose calls I hold and release by hand: deterministic, no sleeps, no timing guesses.
 * - A minimal stand-in for tournamentStore: a local snapshot the outbox patches optimistically, and a
 *   reload() that rebuilds it from the "server" plus the pending overlay, like tournamentStore.compute().
 * - writeHole() mirrors ScorecardScreen.tsx:273-279 (four awaited enqueueScore calls); "Deshacer" is the
 *   toast action at ScorecardScreen.tsx:318-323 (writeHole with the previous values).
 * Each test asserts the OBSERVED (buggy) outcome and logs it, plus controls that show the harness is sound.
 */
import 'fake-indexeddb/auto'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

type Row = { roundId: string; playerId: string; hole: number; strokes: number | null; putts: number | null; pickedUp: boolean; enteredBy: string | null; updatedAt: string }
const h = vi.hoisted(() => {
  const server = new Map<string, number | null>()
  const st = {
    server,
    local: null as null | Record<string, unknown>,
    overlay: null as null | ((s: unknown) => void),
    reloads: 0,
    snapshotFromServer() {
      const scores = [...server.entries()].map(([k, strokes]) => {
        const [, roundId, playerId, hole] = k.split(':')
        return { roundId, playerId, hole: Number(hole), strokes, putts: 2, pickedUp: false, enteredBy: 'p1', updatedAt: '' }
      })
      return { tournament: { id: 't1' }, scores, snakeTiebreaks: [], holeAwards: [], cardSignatures: [] }
    },
  }
  return st
})

vi.mock('/home/user/Cardi-Golf/src/lib/supabase', () => ({ supabase: () => ({}), supabaseConfigured: false }))
vi.mock('/home/user/Cardi-Golf/src/data/tournamentStore', () => ({
  registerOverlay: (fn: (s: unknown) => void) => {
    h.overlay = fn
  },
  useTournament: {
    getState: () => ({
      tournamentId: 't1',
      patch: (fn: (s: unknown) => void) => {
        const s = structuredClone(h.local ?? h.snapshotFromServer())
        fn(s)
        h.local = s
      },
      // What a Realtime event does 150 ms after a score row changes (tournamentStore.ts:270-274, 245-258).
      reload: async () => {
        h.reloads++
        const s = h.snapshotFromServer()
        h.overlay?.(s)
        h.local = s
      },
    }),
  },
}))

const outbox = await import('/home/user/Cardi-Golf/src/data/outbox')
const { t } = await import('/home/user/Cardi-Golf/src/i18n/es-MX')
const { _outboxTest, enqueueScore, flush, useOutbox, startOutbox } = outbox
await startOutbox() // registers the overlay and loads the (empty) Dexie queue, as AppShell does

// ---- controllable push -------------------------------------------------------------------
type Gate = { promise: Promise<void>; resolve: () => void; reject: (e: Error) => void }
const gate = (): Gate => {
  let resolve!: () => void
  let reject!: (e: Error) => void
  const promise = new Promise<void>((a, b) => {
    resolve = a
    reject = b
  })
  return { promise, resolve, reject }
}
const posts: Array<{ key: string; strokes: number | null }> = []
const holds = new Map<number, Gate>()
/** Hold the Nth push from now (0 = the next one). */
const holdPush = (n = 0) => {
  const g = gate()
  holds.set(posts.length + n, g)
  return g
}
_outboxTest.setPush(async (item) => {
  const i = posts.length
  const p = item.payload as { strokes: number | null }
  posts.push({ key: item.key, strokes: p.strokes })
  const g = holds.get(i)
  if (g) await g.promise
  h.server.set(item.key, p.strokes)
})

// ---- helpers -------------------------------------------------------------------------------
const PLAYERS = ['p1', 'p2', 'p3', 'p4']
async function writeHole(round: string, hole: number, values: Record<string, number>) {
  for (const pid of PLAYERS) {
    await enqueueScore('t1', { round_id: round, player_id: pid, hole, strokes: values[pid]!, putts: 2, picked_up: false, entered_by: 'p1', client_ts: new Date().toISOString() })
  }
}
const tick = () => new Promise((r) => setTimeout(r, 0))
async function drain() {
  for (let i = 0; i < 200; i++) {
    await tick()
    if (!useOutbox.getState().syncing && _outboxTest.queue().length === 0) {
      await tick()
      return
    }
  }
}
function idbItems(): Promise<Array<{ key: string; payload: { strokes: number | null }; attempts: number }>> {
  return new Promise((res, rej) => {
    const r = indexedDB.open('cardi-golf-outbox')
    r.onerror = () => rej(r.error)
    r.onsuccess = () => {
      const db = r.result
      const q = db.transaction('items', 'readonly').objectStore('items').getAll()
      q.onsuccess = () => {
        db.close()
        res(q.result)
      }
      q.onerror = () => rej(q.error)
    }
  })
}
/** The Tarjeta's sync line (ScorecardScreen.tsx:345), online. */
function chip(): string {
  const s = useOutbox.getState()
  return s.rejected.length ? t.sync.rejected(s.rejected.length) : s.lastError ? s.lastError : s.pending > 0 ? t.sync.pending(s.pending) : t.sync.synced
}
const localStrokes = (round: string, pid: string, hole: number) =>
  ((h.local?.scores as Row[] | undefined) ?? []).find((x) => x.roundId === round && x.playerId === pid && x.hole === hole)?.strokes
const queued = (key: string) => _outboxTest.queue().find((x) => x.key === key)
const k = (round: string, pid: string, hole: number) => `score:${round}:${pid}:${hole}`

beforeEach(() => {
  holds.clear()
})
// A failed push leaves a 2 s backoff timer (outbox.ts:289); clear it so tests do not leak into each other.
afterEach(() => _outboxTest.reset())
async function until(cond: () => boolean) {
  for (let i = 0; i < 500; i++) {
    if (cond()) return
    await tick()
  }
  throw new Error('until: condition never met')
}

describe('ARCH-01 / QA-01: outbox same-key race (real outbox.ts + Dexie on fake-indexeddb)', () => {
  it('A. «Deshacer» tapped while the save is still pushing: the undo for the in-flight player is lost, chip says Sincronizado', async () => {
    const R = 'rA'
    Object.entries({ p1: 5, p2: 6, p3: 8, p4: 6 }).forEach(([pid, v]) => h.server.set(k(R, pid, 12), v))
    h.local = h.snapshotFromServer()
    const slow = holdPush(0) // the first POST of the save (p1) is slow: weak 4G
    const before = posts.length
    await writeHole(R, 12, { p1: 4, p2: 6, p3: 8, p4: 6 }) // «Guardar hoyo» with Nico 5 -> 4 (a mistake)
    await writeHole(R, 12, { p1: 5, p2: 6, p3: 8, p4: 6 }) // «Deshacer» on the toast: previous values back
    const mid = {
      phoneShows: localStrokes(R, 'p1', 12),
      queueHas: (queued(k(R, 'p1', 12))?.payload as { strokes: number }).strokes,
      idbHas: (await idbItems()).find((x) => x.key === k(R, 'p1', 12))?.payload.strokes,
      chip: chip(),
    }
    slow.resolve() // the slow POST lands
    await drain()
    const after = {
      posts: posts.slice(before).map((p) => `${p.key.split(':')[2]}=${p.strokes}`),
      server_p1: h.server.get(k(R, 'p1', 12)),
      queue: _outboxTest.queue().length,
      idb: (await idbItems()).length,
      pending: useOutbox.getState().pending,
      lastError: useOutbox.getState().lastError,
      chip: chip(),
      phoneBeforeReload: localStrokes(R, 'p1', 12),
    }
    await (await import('/home/user/Cardi-Golf/src/data/tournamentStore')).useTournament.getState().reload()
    const phoneAfterRealtimeReload = localStrokes(R, 'p1', 12)
    console.log('[A] while in flight:', JSON.stringify(mid))
    console.log('[A] after drain   :', JSON.stringify(after), 'phone after realtime reload:', phoneAfterRealtimeReload)
    expect(mid).toEqual({ phoneShows: 5, queueHas: 5, idbHas: 5, chip: '4 pendientes' })
    expect(after.posts).toEqual(['p1=4', 'p2=6', 'p3=8', 'p4=6']) // 4 POSTs only: the undo for p1 is never sent
    expect(after.server_p1).toBe(4) // the player undid to 5; the server keeps 4
    expect(after.queue).toBe(0)
    expect(after.idb).toBe(0) // gone from IndexedDB too: a restart cannot recover it
    expect(after.chip).toBe('Sincronizado')
    expect(after.phoneBeforeReload).toBe(5) // optimistic copy still right...
    expect(phoneAfterRealtimeReload).toBe(4) // ...until the next Realtime reload flips it back
  })

  it('B. backlog after reconnect: a hole corrected while the drain is running pushes the OLD payload and deletes the correction', async () => {
    const R = 'rB'
    Object.defineProperty(globalThis.navigator, 'onLine', { value: false, configurable: true })
    for (const [hole, v] of [[1, 5], [2, 6], [3, 7]] as const) {
      await enqueueScore('t1', { round_id: R, player_id: 'p1', hole, strokes: v, putts: 2, picked_up: false, entered_by: 'p1', client_ts: 'x' })
    }
    const before = posts.length
    expect(posts.length).toBe(before) // offline: nothing sent
    Object.defineProperty(globalThis.navigator, 'onLine', { value: true, configurable: true })
    const slow = holdPush(0)
    void flush() // the 'online' listener (outbox.ts:317)
    await tick()
    await enqueueScore('t1', { round_id: R, player_id: 'p1', hole: 3, strokes: 4, putts: 2, picked_up: false, entered_by: 'p1', client_ts: 'y' }) // fix hole 3: 7 -> 4
    const midQueue = (queued(k(R, 'p1', 3))?.payload as { strokes: number }).strokes
    slow.resolve()
    await drain()
    const res = {
      midQueue,
      posts: posts.slice(before).map((p) => `h${p.key.split(':')[3]}=${p.strokes}`),
      server: [1, 2, 3].map((x) => h.server.get(k(R, 'p1', x))),
      queue: _outboxTest.queue().length,
      idb: (await idbItems()).length,
      chip: chip(),
    }
    console.log('[B]', JSON.stringify(res))
    expect(res.midQueue).toBe(4)
    expect(res.posts).toEqual(['h1=5', 'h2=6', 'h3=7']) // the stale copy's hole 3 (7) is what goes out
    expect(res.server).toEqual([5, 6, 7]) // the correction (4) never reaches the server
    expect(res.queue).toBe(0)
    expect(res.idb).toBe(0)
    expect(res.chip).toBe('Sincronizado')
  })

  it('C. network error on the in-flight push: the queued correction is overwritten by the old payload, which is then retried', async () => {
    const R = 'rC'
    const slow = holdPush(0)
    const before = posts.length
    await enqueueScore('t1', { round_id: R, player_id: 'p1', hole: 5, strokes: 5, putts: 2, picked_up: false, entered_by: 'p1', client_ts: 'a' })
    await enqueueScore('t1', { round_id: R, player_id: 'p1', hole: 5, strokes: 6, putts: 2, picked_up: false, entered_by: 'p1', client_ts: 'b' }) // correction
    const mid = { queue: (queued(k(R, 'p1', 5))?.payload as { strokes: number }).strokes, idb: (await idbItems()).find((x) => x.key === k(R, 'p1', 5))?.payload.strokes }
    slow.reject(new Error('Failed to fetch')) // the weak-signal POST dies
    for (let i = 0; i < 20; i++) await tick()
    const afterFail = { queue: (queued(k(R, 'p1', 5))?.payload as { strokes: number }).strokes, attempts: queued(k(R, 'p1', 5))?.attempts, idb: (await idbItems()).find((x) => x.key === k(R, 'p1', 5))?.payload.strokes, chip: chip() }
    await flush() // the backoff retry (outbox.ts:289, 301-306), called directly instead of waiting 2 s
    await drain()
    const end = { posts: posts.slice(before).map((p) => p.strokes), server: h.server.get(k(R, 'p1', 5)), queue: _outboxTest.queue().length, idb: (await idbItems()).length, chip: chip() }
    console.log('[C] before failure:', JSON.stringify(mid), 'after failure:', JSON.stringify(afterFail), 'end:', JSON.stringify(end))
    expect(mid).toEqual({ queue: 6, idb: 6 })
    expect(afterFail.queue).toBe(5) // the newer 6 was replaced by the old 5 (+1 attempt)
    expect(afterFail.idb).toBe(5)
    expect(end.posts).toEqual([5, 5])
    expect(end.server).toBe(5)
    expect(end.chip).toBe('Sincronizado')
  })

  it('D. «Corregir» a different player while the save is draining (pass 2): the window covers the whole flush, not just the first POST', async () => {
    const R = 'rD'
    const g1 = holdPush(0) // p1's POST (pass 1) is slow
    const g2 = holdPush(1) // and so is the next one (p2, first of pass 2)
    const before = posts.length
    await writeHole(R, 13, { p1: 4, p2: 4, p3: 4, p4: 4 }) // new hole, all par; p2..p4 queue behind p1
    g1.resolve()
    await until(() => posts.length === before + 2) // pass 2 took its copy [p2,p3,p4]; p2 in flight
    await writeHole(R, 13, { p1: 4, p2: 4, p3: 4, p4: 6 }) // «Corregir»: p4 made 6, «Guardar hoyo» again
    const midQueueP4 = (queued(k(R, 'p4', 13))?.payload as { strokes: number }).strokes
    g2.resolve()
    await drain()
    const res = { midQueueP4, posts: posts.slice(before).map((p) => `${p.key.split(':')[2]}=${p.strokes}`), server_p4: h.server.get(k(R, 'p4', 13)), queue: _outboxTest.queue().length, idb: (await idbItems()).length, chip: chip() }
    console.log('[D]', JSON.stringify(res))
    expect(res.midQueueP4).toBe(6)
    expect(res.server_p4).toBe(4) // the correction to 6 is lost: the stale pass-2 copy of p4 (4) was pushed, then the 6 deleted
    expect(res.queue).toBe(0)
    expect(res.idb).toBe(0)
    expect(res.chip).toBe('Sincronizado')
  })

  it('CONTROL 1. same undo after the save has finished pushing: the server gets the undo', async () => {
    const R = 'rE'
    Object.entries({ p1: 5, p2: 6, p3: 8, p4: 6 }).forEach(([pid, v]) => h.server.set(k(R, pid, 12), v))
    await writeHole(R, 12, { p1: 4, p2: 6, p3: 8, p4: 6 })
    await drain()
    await writeHole(R, 12, { p1: 5, p2: 6, p3: 8, p4: 6 })
    await drain()
    console.log('[CONTROL 1] server p1 =', h.server.get(k(R, 'p1', 12)), 'chip', chip())
    expect(h.server.get(k(R, 'p1', 12))).toBe(5)
  })

  it('CONTROL 2. the slow first POST, undo tapped only after it lands: the server gets the undo', async () => {
    const R = 'rF'
    const slow = holdPush(0)
    await writeHole(R, 12, { p1: 4, p2: 6, p3: 8, p4: 6 })
    slow.resolve()
    await drain()
    await writeHole(R, 12, { p1: 5, p2: 6, p3: 8, p4: 6 })
    await drain()
    console.log('[CONTROL 2] server p1 =', h.server.get(k(R, 'p1', 12)))
    expect(h.server.get(k(R, 'p1', 12))).toBe(5)
  })
})
