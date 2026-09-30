/**
 * V11 / REL-14 (dup ARCH-11): deterministic repro of "one stalled request freezes the outbox".
 * Real module under test: /home/user/Cardi-Golf/src/data/outbox.ts (HEAD), with only its I/O seams
 * replaced: the supabase client (never called: pushImpl is swapped via the module's own test hook)
 * and the tournament store. startOutbox() is the real one, so its real `online` / `visibilitychange`
 * listeners are registered on minimal EventTarget stand-ins for window/document.
 */
import { describe, expect, it, vi } from 'vitest'

const hoisted = vi.hoisted(() => {
  const win = new EventTarget()
  const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' })
  ;(globalThis as unknown as { window: unknown }).window = win
  ;(globalThis as unknown as { document: unknown }).document = doc
  return { win, doc, reloads: { n: 0 } }
})

vi.mock('/home/user/Cardi-Golf/src/lib/supabase', () => ({ supabase: () => ({}), supabaseConfigured: false }))
vi.mock('/home/user/Cardi-Golf/src/data/tournamentStore', () => ({
  registerOverlay: () => undefined,
  useTournament: {
    getState: () => ({
      tournamentId: 't1',
      patch: () => undefined,
      reload: async () => {
        hoisted.reloads.n++
      },
    }),
  },
}))

const { _outboxTest, flush, useOutbox, startOutbox } = await import('/home/user/Cardi-Golf/src/data/outbox')
const { withTimeout } = await import('/home/user/Cardi-Golf/src/lib/timeout')
type Item = Parameters<typeof _outboxTest.enqueue>[0]

// Two holes x four players, as the Tarjeta enqueues them (one item per player per hole).
const item = (hole: number, p: number): Item => ({
  key: `score:r2:p${p}:${hole}`,
  kind: 'score',
  tournamentId: 't1',
  payload: { round_id: 'r2', player_id: `p${p}`, hole, strokes: 4, putts: 2, picked_up: false, entered_by: 'p1', client_ts: 'x' },
  attempts: 0,
  createdAt: hole * 10 + p,
})

const t0 = { v: 0 }
function snap(label: string, calls: string[]) {
  const s = useOutbox.getState()
  const line = {
    t_s: Math.round((Date.now() - t0.v) / 1000),
    label,
    pushesAttempted: calls.length,
    queued: _outboxTest.queue().length,
    pendingChip: s.pending,
    syncing: s.syncing,
    lastError: s.lastError,
  }
  console.log(JSON.stringify(line))
  return line
}
async function enqueueTwoHoles() {
  for (const h of [15, 16]) for (const p of [1, 2, 3, 4]) await _outboxTest.enqueue(item(h, p))
}
async function nudgeFor(seconds: number) {
  // Every 10 s: the device reports `online`, the app becomes visible again, and something calls flush().
  for (let s = 10; s <= seconds; s += 10) {
    await vi.advanceTimersByTimeAsync(10_000)
    hoisted.win.dispatchEvent(new Event('online'))
    hoisted.doc.dispatchEvent(new Event('visibilitychange'))
    await flush()
  }
}

describe('REL-14: a push that never settles', () => {
  it('A: freezes every later item; online / visibility / flush() nudges are no-ops; no internal timeout ever fires', async () => {
    vi.useFakeTimers({ now: 0 })
    t0.v = Date.now()
    _outboxTest.reset()
    await startOutbox() // the app's real listeners
    const calls: string[] = []
    let release!: { resolve: () => void; reject: (e: Error) => void }
    _outboxTest.setPush((it) => {
      calls.push(it.key)
      // First request: connection up, request sent, no response and no error (lie-fi / dead socket).
      if (calls.length === 1) return new Promise<void>((resolve, reject) => (release = { resolve, reject }))
      return Promise.resolve()
    })
    await enqueueTwoHoles()
    snap('8 items enqueued (holes 15-16 x 4 players)', calls)
    await nudgeFor(60)
    const a = snap('after 60 s with online + visibilitychange + flush() every 10 s', calls)
    await vi.advanceTimersByTimeAsync(30 * 60_000)
    const b = snap('after 30 more minutes, no nudges', calls)
    expect(a.pushesAttempted).toBe(1)
    expect(b.pushesAttempted).toBe(1)
    expect(b.queued).toBe(8)
    expect(b.pendingChip).toBe(8)
    expect(b.syncing).toBe(true)
    expect(b.lastError).toBeNull()
    // The platform finally errors the socket (browser/OS network timeout): the outbox recovers on its own.
    release.reject(new TypeError('Load failed'))
    await vi.advanceTimersByTimeAsync(0)
    snap('the stalled request finally errors (TypeError: Load failed)', calls)
    await vi.advanceTimersByTimeAsync(2_000)
    const c = snap('2 s later (backoff 2^1 s)', calls)
    expect(c.queued).toBe(0)
    expect(c.pushesAttempted).toBe(9)
    vi.useRealTimers()
  })

  it('B (control): pushes that fail FAST with a network error are retried by the backoff timer alone, and the queue drains', async () => {
    vi.useFakeTimers({ now: 0 })
    t0.v = Date.now()
    _outboxTest.reset()
    const calls: string[] = []
    const net = { down: true }
    _outboxTest.setPush(async (it) => {
      calls.push(it.key)
      if (net.down) throw new TypeError('Failed to fetch')
    })
    await enqueueTwoHoles()
    snap('8 items enqueued while every push fails fast (network error)', calls)
    net.down = false
    // No nudges at all: only the outbox's own backoff timer (last armed at 2^attempts s, capped at 30 s).
    await vi.advanceTimersByTimeAsync(30_000)
    const c = snap('network back; 30 s later with no nudges', calls)
    expect(c.queued).toBe(0)
    expect(c.lastError).toBeNull()
    vi.useRealTimers()
  })

  it('C (the recommended fix, sketched): the same hang behind a 10 s timeout is retried and the queue drains in ~12 s', async () => {
    vi.useFakeTimers({ now: 0 })
    t0.v = Date.now()
    _outboxTest.reset()
    const calls: string[] = []
    _outboxTest.setPush((it) => {
      calls.push(it.key)
      const p = calls.length === 1 ? new Promise<void>(() => undefined) : Promise.resolve()
      return withTimeout(p, 10_000, 'push')
    })
    await enqueueTwoHoles()
    snap('8 items enqueued; first push hangs behind withTimeout(10 s)', calls)
    await vi.advanceTimersByTimeAsync(10_000)
    snap('10 s: timeout fires, treated as a network error', calls)
    await vi.advanceTimersByTimeAsync(2_000)
    const c = snap('12 s: retried after backoff', calls)
    expect(c.queued).toBe(0)
    vi.useRealTimers()
  })
})
