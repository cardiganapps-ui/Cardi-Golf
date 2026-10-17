/**
 * The outbox on a phone with no IndexedDB (private mode), where the queue lives in memory: a second conflict
 * while another waits, a conflict that goes into the correction queued behind its call, and a flush whose lock
 * could not be asked for. Like outbox.edges.test.ts, these are paths Vitest 5's coverage found no test on.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

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
      landChanges: () => undefined,
      pushesDone: () => undefined,
      reload: async () => undefined,
    }),
  },
}))

const { _outboxTest, adoptQueuedWrites, describeSyncError, enqueueAward, enqueueHole, enqueueSignature, flush, overlayPending, queuedFor, setOutboxBlocked, useOutbox } = await import('./outbox')
type HoleAnswer = import('./outbox').HoleAnswer
type OutboxItem = import('./outbox').OutboxItem
type HoleItem = Extract<OutboxItem, { kind: 'hole' }>
const { useAuth } = await import('./auth')
const { t } = await import('../i18n/es-MX')
useAuth.setState({ user: { id: 'uid-phone' } as never })

const hole = (n: number, entries: Array<{ player_id: string; fields: Record<string, unknown>; base?: Record<string, unknown> }>) =>
  enqueueHole('t1', { round_id: 'r1', hole: n, entered_by: 'p1', entries: entries.map((e) => ({ base: {}, ...e })) })
const conflictOn = (player_id: string): HoleAnswer => ({ status: 'conflict', rows: [], conflicts: [{ player_id, fields: ['strokes'], server: null }], rejected: [], unchanged: [] })
const ok: HoleAnswer = { status: 'ok', rows: [], conflicts: [], rejected: [], unchanged: [] }

beforeEach(() => {
  _outboxTest.reset()
  _outboxTest.setLocks(null)
})

describe('conflicts in memory', () => {
  it('a second question while another waits keeps both; the same one again takes its place', async () => {
    const answers = [conflictOn('p2'), conflictOn('p3'), conflictOn('p2')]
    _outboxTest.setPush(async () => answers.shift()!)
    await hole(4, [{ player_id: 'p2', fields: { strokes: 5 } }])
    await flush()
    await hole(5, [{ player_id: 'p3', fields: { strokes: 6 } }])
    await flush()
    expect(useOutbox.getState().conflicts.map((c) => `${c.player_id}:${c.hole}`)).toEqual(['p2:4', 'p3:5'])
    await hole(4, [{ player_id: 'p2', fields: { strokes: 7 } }])
    await flush()
    // Hole 4's question is the newest one, once: not two for one player and hole.
    expect(useOutbox.getState().conflicts.map((c) => `${c.player_id}:${c.hole}:${(c.fields as { strokes: number }).strokes}`)).toEqual(['p3:5:6', 'p2:4:7'])
  })

  it('a conflict goes into the correction still waiting behind its call, and nobody is asked', async () => {
    let open!: () => void
    const held = new Promise<void>((r) => (open = r))
    const sent: HoleItem[] = []
    _outboxTest.setPush(async (item) => {
      sent.push(structuredClone(item as HoleItem))
      if (sent.length === 1) {
        await held
        return conflictOn('p2')
      }
      return ok
    })
    await hole(4, [{ player_id: 'p2', fields: { strokes: 5, putts: 2 } }])
    const first = flush()
    await vi.waitFor(() => expect(sent).toHaveLength(1))
    // Typed over the 5 while its call is out: queued behind it, never merged into a hole on its way.
    await hole(4, [{ player_id: 'p2', fields: { putts: 1 }, base: { strokes: 5, putts: 2, picked_up: false } }])
    open()
    await first
    await flush()
    expect(sent).toHaveLength(2)
    // One entry, carrying both of this phone's values over the row its first call saw.
    expect(sent[1]!.payload.entries).toHaveLength(1)
    expect(sent[1]!.payload.entries[0]).toMatchObject({ player_id: 'p2', fields: { strokes: 5, putts: 1 }, base: {} })
    expect(useOutbox.getState().conflicts).toEqual([])
  })
})

describe('a flush that cannot start', () => {
  it('its lock could not be asked for: the flush ends, the hole stays queued, and the next one sends it', async () => {
    const sent: OutboxItem[] = []
    _outboxTest.setPush(async (item) => {
      sent.push(item)
      return ok
    })
    _outboxTest.setLocks({ request: () => Promise.reject(new Error('locks unavailable')) })
    await hole(4, [{ player_id: 'p2', fields: { strokes: 5 } }])
    await expect(flush()).resolves.toBeUndefined()
    expect(sent).toEqual([])
    expect(_outboxTest.queue()).toHaveLength(1)
    _outboxTest.setLocks(null)
    await flush()
    expect(sent).toHaveLength(1)
    expect(_outboxTest.queue()).toEqual([])
  })
})

describe('a push that throws something that is no Error', () => {
  it('a string from the network is the network: the hole stays queued, to be tried again', async () => {
    _outboxTest.setPush(async () => {
      throw 'socket hang up'
    })
    await hole(4, [{ player_id: 'p2', fields: { strokes: 5 } }])
    await flush()
    expect(_outboxTest.queue()).toHaveLength(1)
    expect(useOutbox.getState().rejected).toEqual([])
    expect(useOutbox.getState().lastError).toBe(t.sync.errNetwork)
  })

  it('a string that reads as a refusal rejects the hole and the contest, each with its words', async () => {
    _outboxTest.setPush(async () => {
      throw 'permission denied for table scores'
    })
    await hole(4, [{ player_id: 'p2', fields: { strokes: 5 } }])
    await flush()
    await enqueueAward('t1', { round_id: 'r1', group_id: 'g1', hole: 3, game_id: 'closest', player_ids: ['p2'], decided_by: 'p1' })
    await flush()
    // A hole's refusal is kept per player, as the write the Comité can enter again.
    expect(useOutbox.getState().rejected).toMatchObject([
      { kind: 'score', message: t.sync.errDenied },
      { kind: 'award', message: t.sync.errDenied },
    ])
    expect(_outboxTest.queue()).toEqual([])
  })
})

describe('held for the PIN, in memory', () => {
  it('the server no longer counts this phone in the group: each hole is held for the PIN, the others with it', async () => {
    const sent: OutboxItem[] = []
    _outboxTest.setPush(async (item) => {
      sent.push(item)
      return { status: 'not_member' }
    })
    await hole(4, [{ player_id: 'p2', fields: { strokes: 5 } }])
    await hole(5, [{ player_id: 'p2', fields: { strokes: 4 } }])
    // Hole 4 went at its save; hole 5, saved as that pass ended, goes in the pass after it.
    await vi.waitFor(() => expect(sent).toHaveLength(2))
    await vi.waitFor(() => expect(queuedFor('t1')).toMatchObject({ holes: 2, heldHoles: 2 }))
    expect(useOutbox.getState().lastError).toBe(t.sync.errNotMember)
  })

  it('a hole saved before any session was confirmed goes once the device is adopted', async () => {
    const sent: OutboxItem[] = []
    _outboxTest.setPush(async (item) => {
      sent.push(item)
      return ok
    })
    const user = useAuth.getState().user
    useAuth.setState({ user: null })
    try {
      await hole(4, [{ player_id: 'p2', fields: { strokes: 5 } }])
      await flush()
      expect(sent).toEqual([])
    } finally {
      useAuth.setState({ user })
    }
    await adoptQueuedWrites('t1')
    await vi.waitFor(() => expect(sent).toHaveLength(1))
    expect(sent[0]!.actingUid).toBe('uid-phone')
  })
})

describe('the boards with writes still queued', () => {
  it('a queued signature shows once, signed by whoever it names or nobody; a newer build’s write is left out', async () => {
    setOutboxBlocked(true)
    await enqueueSignature('t1', { round_id: 'r1', pair_id: 'pa', signed_by: null })
    await enqueueSignature('t1', { round_id: 'r1', player_id: 'p3', signed_by: null })
    await _outboxTest.enqueue({ key: 'future:1', kind: 'future', tournamentId: 't1', payload: {}, attempts: 0, createdAt: Date.now() } as never)
    const boards = { tournament: { id: 't1' }, scores: [], cardSignatures: [] } as unknown as Parameters<typeof overlayPending>[0]
    overlayPending(boards)
    expect(boards.cardSignatures).toMatchObject([
      { roundId: 'r1', pairId: 'pa', signedBy: '' },
      { roundId: 'r1', playerId: 'p3', signedBy: '' },
    ])
    // Its echo already on the boards: never twice.
    overlayPending(boards)
    expect(boards.cardSignatures).toHaveLength(2)
    setOutboxBlocked(false)
  })
})

describe('the chip’s words', () => {
  it('a refusal that says the card is signed, and one that says the day is closed', () => {
    expect(describeSyncError('La tarjeta ya está firmada')).toBe(t.sync.errSigned)
    expect(describeSyncError('La ronda ya no está en juego; el Comité tiene que capturarlo')).toBe(t.sync.errNotLive)
  })
})
