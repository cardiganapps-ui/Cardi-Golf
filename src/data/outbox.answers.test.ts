/**
 * Outbox v2's answers, entry by entry (0026 `save_hole`), on a phone with no
 * IndexedDB (private mode): the queue lives in memory, and holes still merge
 * field by field until one is sent. What each refusal says, and when a
 * landing asks one more fetch (a conflict over a row that is gone, a replayed
 * answer that may be older than the hole is now).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const landed = vi.hoisted(() => ({ calls: [] as Array<{ changes: unknown[]; opts: { fetch?: boolean } | undefined }> }))
vi.mock('../lib/supabase', () => ({ supabase: () => ({}), supabaseConfigured: false }))
vi.mock('./tournamentStore', () => ({
  serverReadSince: () => null,
  registerOverlay: () => undefined,
  liveSeq: () => 0,
  liveClock: () => Date.now(),
  useTournament: {
    getState: () => ({
      tournamentId: 't1',
      patch: () => undefined,
      refresh: () => undefined,
      landChanges: (_tid: string, changes: unknown[], _since: number, _at: number, opts?: { fetch?: boolean }) => void landed.calls.push({ changes, opts }),
      pushesDone: () => undefined,
      reload: async () => undefined,
    }),
  },
}))

const { _outboxTest, enqueueHole, flush, sendMineAgain, setOutboxBlocked, useOutbox } = await import('./outbox')
type HoleAnswer = import('./outbox').HoleAnswer
type OutboxItem = import('./outbox').OutboxItem
const { useAuth } = await import('./auth')
const { t } = await import('../i18n/es-MX')
useAuth.setState({ user: { id: 'uid-phone' } as never })

const hole = (n: number, entries: Array<{ player_id: string; fields: Record<string, unknown>; base?: Record<string, unknown>; auto?: boolean }>) =>
  enqueueHole('t1', { round_id: 'r1', hole: n, entered_by: 'p1', entries: entries.map((e) => ({ base: {}, ...e })) })
/** Answer every call with `answer`, recording what was sent. */
function answering(answer: (item: OutboxItem) => HoleAnswer) {
  const sent: OutboxItem[] = []
  _outboxTest.setPush(async (item) => {
    sent.push(structuredClone(item))
    return answer(item)
  })
  return sent
}

beforeEach(() => {
  _outboxTest.reset()
  landed.calls = []
  vi.useRealTimers()
})

describe('what each refusal says', () => {
  it('a signed card, a closed day, another group, values it cannot take', async () => {
    answering(() => ({
      status: 'rejected',
      rows: [],
      conflicts: [],
      rejected: [
        { player_id: 'p1', reason: 'card_signed' },
        { player_id: 'p2', reason: 'round_not_live' },
        { player_id: 'p3', reason: 'not_in_group' },
        { player_id: 'p4', reason: 'invalid' },
        // An entry the phone never sent: nothing to keep.
        { player_id: null, reason: 'invalid' },
      ],
      unchanged: [],
    }))
    await hole(4, ['p1', 'p2', 'p3', 'p4'].map((player_id) => ({ player_id, fields: { strokes: 5, putts: 2 } })))
    await flush()
    expect(useOutbox.getState().rejected.map((r) => [r.key, r.message])).toEqual([
      ['score:r1:p1:4', t.sync.errSigned],
      ['score:r1:p2:4', t.sync.errNotLive],
      ['score:r1:p3:4', t.sync.errNotInGroup],
      ['score:r1:p4:4', t.sync.errInvalid],
    ])
    expect(useOutbox.getState().lastError).toBe(t.sync.errSigned)
    expect(_outboxTest.queue()).toEqual([])
  })
})

describe('when a landing asks one more fetch', () => {
  it('a conflict over a row that is gone: nothing to land for it, and a fetch says what stands', async () => {
    answering(() => ({ status: 'conflict', rows: [], conflicts: [{ player_id: 'p2', fields: ['strokes'], server: null }], rejected: [], unchanged: [] }))
    await hole(4, [{ player_id: 'p2', fields: { strokes: 5 }, base: { strokes: 4, putts: 2, picked_up: false } }])
    await flush()
    expect(landed.calls).toEqual([{ changes: [], opts: expect.objectContaining({ fetch: true }) }])
    expect(useOutbox.getState().conflicts).toMatchObject([{ player_id: 'p2', hole: 4, server: null, clash: ['strokes'] }])
  })

  it('a replayed answer lands its rows, and a fetch follows: the hole may have moved on since', async () => {
    const row = { id: 's1', round_id: 'r1', player_id: 'p1', hole: 4, strokes: 5, putts: 2, picked_up: false }
    answering(() => ({ status: 'ok', rows: [row], conflicts: [], rejected: [], unchanged: [], replayed: true }))
    await hole(4, [{ player_id: 'p1', fields: { strokes: 5, putts: 2 } }])
    await flush()
    expect(landed.calls).toEqual([{ changes: [{ table: 'scores', eventType: 'UPDATE', new: row, old: {} }], opts: expect.objectContaining({ fetch: true }) }])
  })

  it('an answer that says only its status lands nothing, keeps nothing, and settles the hole', async () => {
    answering(() => ({ status: 'ok' }))
    await hole(4, [{ player_id: 'p1', fields: { strokes: 5, putts: 2 } }])
    await flush()
    expect(landed.calls).toEqual([{ changes: [], opts: expect.objectContaining({ fetch: false }) }])
    expect(_outboxTest.queue()).toEqual([])
    expect(useOutbox.getState().rejected).toEqual([])
  })

  it('a conflict on a default nobody touched lands the server row and asks nothing; one on a player never sent is ignored', async () => {
    const theirs = { id: 's2', round_id: 'r1', player_id: 'p4', hole: 4, strokes: 6, putts: 2, picked_up: false }
    answering(() => ({
      status: 'conflict',
      rows: [],
      conflicts: [
        { player_id: 'p4', fields: ['strokes'], server: theirs },
        { player_id: 'p9', fields: ['strokes'], server: null },
      ],
      rejected: [],
      unchanged: [],
    }))
    await hole(4, [{ player_id: 'p4', fields: { strokes: 4, putts: 2 }, auto: true }])
    await flush()
    expect(landed.calls[0]!.changes).toEqual([{ table: 'scores', eventType: 'UPDATE', new: theirs, old: {} }])
    expect(useOutbox.getState().conflicts).toEqual([])
  })

  it('a plain answer asks none', async () => {
    answering(() => ({ status: 'ok', rows: [], conflicts: [], rejected: [], unchanged: [] }))
    await hole(4, [{ player_id: 'p1', fields: { strokes: 5, putts: 2 } }])
    await flush()
    expect(landed.calls[0]!.opts).toMatchObject({ fetch: false })
  })
})

describe('with no IndexedDB, the queue in memory', () => {
  it('holes merge field by field until one is sent; the one sent is never touched', async () => {
    setOutboxBlocked(true)
    const sent = answering(() => ({ status: 'ok', rows: [], conflicts: [], rejected: [], unchanged: [] }))
    await hole(4, [{ player_id: 'p1', fields: { strokes: 5, putts: 2 } }])
    await hole(4, [{ player_id: 'p1', fields: { putts: 1 }, base: { strokes: 5, putts: 2, picked_up: false } }, { player_id: 'p2', fields: { strokes: 6, putts: 2 }, auto: true }])
    // Another round's hole 4 is another hole.
    await enqueueHole('t1', { round_id: 'r2', hole: 4, entered_by: 'p1', entries: [{ player_id: 'p1', fields: { strokes: 3 }, base: {} }] })
    expect(_outboxTest.queue()).toHaveLength(2)
    const [first] = _outboxTest.queue()
    expect(first?.kind === 'hole' && first.payload.entries).toEqual([
      { player_id: 'p1', fields: { strokes: 5, putts: 1 }, base: {}, auto: false },
      { player_id: 'p2', fields: { strokes: 6, putts: 2 }, base: {}, auto: true },
    ])
    setOutboxBlocked(false)
    await flush()
    expect(sent.map((x) => x.sent)).toEqual([true, true])
    expect(_outboxTest.queue()).toEqual([])
  })

  it('an older hole keeps its players the newer one leaves out; a hole queued under another identity is not merged into', async () => {
    setOutboxBlocked(true)
    await hole(4, [{ player_id: 'p1', fields: { strokes: 5, putts: 2 } }, { player_id: 'p2', fields: { strokes: 4, putts: 2 } }])
    await hole(4, [{ player_id: 'p2', fields: { putts: 1 } }])
    const [only] = _outboxTest.queue()
    expect(only?.kind === 'hole' && only.payload.entries.map((e) => [e.player_id, e.fields])).toEqual([
      ['p1', { strokes: 5, putts: 2 }],
      ['p2', { strokes: 4, putts: 1 }],
    ])
    // The session changed (REL-16): what the other identity queued waits for its player, apart.
    useAuth.setState({ user: { id: 'uid-other' } as never })
    try {
      await hole(4, [{ player_id: 'p1', fields: { strokes: 6 } }])
    } finally {
      useAuth.setState({ user: { id: 'uid-phone' } as never })
    }
    expect(_outboxTest.queue()).toHaveLength(2)
    setOutboxBlocked(false)
  })

  it('a hole with nothing set is not queued', async () => {
    await hole(4, [{ player_id: 'p1', fields: {} }])
    expect(_outboxTest.queue()).toEqual([])
  })
})

describe('«Guardar el mío»', () => {
  it('over a row that is gone, it goes as a phone that saw none; a conflict already settled does nothing', async () => {
    answering(() => ({ status: 'conflict', rows: [], conflicts: [{ player_id: 'p2', fields: ['strokes'], server: null }], rejected: [], unchanged: [] }))
    await hole(4, [{ player_id: 'p2', fields: { strokes: 5 }, base: { strokes: 4, putts: 2, picked_up: false } }])
    await flush()
    const [c] = useOutbox.getState().conflicts
    setOutboxBlocked(true)
    await sendMineAgain(c!.key, 'p1')
    expect(_outboxTest.queue().map((x) => x.kind === 'hole' && x.payload.entries)).toEqual([[{ player_id: 'p2', fields: { strokes: 5 }, base: {} }]])
    expect(useOutbox.getState().conflicts).toEqual([])
    await sendMineAgain(c!.key, 'p1')
    expect(_outboxTest.queue()).toHaveLength(1)
    setOutboxBlocked(false)
  })
})

describe('a mutation id', () => {
  it('is a version 4 uuid, made from random bytes where the browser has no randomUUID (iOS before 15.4)', async () => {
    setOutboxBlocked(true)
    const real = globalThis.crypto.randomUUID
    Object.defineProperty(globalThis.crypto, 'randomUUID', { value: undefined, configurable: true })
    try {
      await hole(4, [{ player_id: 'p1', fields: { strokes: 5 } }])
      await hole(5, [{ player_id: 'p1', fields: { strokes: 5 } }])
    } finally {
      Object.defineProperty(globalThis.crypto, 'randomUUID', { value: real, configurable: true })
    }
    const ids = _outboxTest.queue().map((x) => (x.kind === 'hole' ? x.payload.mutation_id : ''))
    for (const id of ids) expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(new Set(ids).size).toBe(2)
    setOutboxBlocked(false)
  })
})
