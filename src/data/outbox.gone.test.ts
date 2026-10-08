/**
 * Writes of a tournament that no longer exists (the verifier of #87, round
 * 3): held for a PIN, or waiting for signal, they could never go out, and
 * they kept the phone from signing out or changing account for good. When the
 * tournament's link leads nowhere they move to the rejected list saying why;
 * and every write keeps the tournament's name, so the refusal can name it
 * after the boards saved on the phone are gone.
 */
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

let uid: string | null = 'uid-a'
vi.mock('./auth', () => ({
  useAuth: { getState: () => ({ user: uid ? { id: uid } : null }), subscribe: () => () => undefined },
}))
vi.mock('../lib/supabase', () => ({ supabase: () => ({}), supabaseConfigured: false }))
/** The tournament open on screen, as the store has it. */
const open = vi.hoisted(() => ({ state: { tournamentId: null as string | null, data: null as unknown, refresh: () => undefined, landChanges: () => undefined, pushesDone: () => undefined, reload: async () => undefined } }))
vi.mock('./tournamentStore', () => ({ registerOverlay: () => undefined, liveClock: () => performance.now(), liveSeq: () => 0, useTournament: { getState: () => open.state } }))

const { _outboxTest, enqueueScore, flush, rejectGoneTournament, unsentWrites, useOutbox } = await import('./outbox')
const { t } = await import('../i18n/es-MX')

const payload = (hole: number) => ({ round_id: 'r1', player_id: 'p1', hole, strokes: 4, putts: 2, picked_up: false, entered_by: 'p1', client_ts: 'x' })
/** A write of `tournamentId` queued earlier (`actingUid`: who wrote it; another identity than the phone's now waits for the PIN). */
const write = (tournamentId: string, hole: number, extra: Record<string, unknown> = {}) => ({
  key: `score:${tournamentId}:p1:${hole}`,
  kind: 'score' as const,
  tournamentId,
  payload: payload(hole),
  attempts: 0,
  createdAt: hole,
  ...extra,
})
const keys = () => _outboxTest.queue().map((x) => x.key)

beforeEach(async () => {
  _outboxTest.reset()
  await _outboxTest.clearStored()
  uid = 'uid-a'
  open.state = { ...open.state, tournamentId: null, data: null }
  // No signal: whatever is queued stays queued.
  _outboxTest.setPush(async () => {
    throw new Error('TypeError: Failed to fetch')
  })
})

describe('every write keeps the tournament it was queued in', () => {
  it('its name and slug, so the refusal can name it once the saved boards are gone', async () => {
    open.state = { ...open.state, tournamentId: 't-ensayo', data: { snapshot: { tournament: { id: 't-ensayo', name: 'Ensayo', slug: 'ensayo' } } } }
    await enqueueScore('t-ensayo', payload(1))
    expect(_outboxTest.queue()[0]).toMatchObject({ tournamentName: 'Ensayo', slug: 'ensayo' })
    expect((await _outboxTest.stored())[0]).toMatchObject({ tournamentName: 'Ensayo', slug: 'ensayo' })
    expect(unsentWrites()).toEqual({ tournamentId: 't-ensayo', waitsFor: 'signal', name: 'Ensayo' })
  })
})

describe('a tournament that no longer exists', () => {
  it('its writes, held ones too, move to the rejected list saying so, and stop keeping the phone from signing out', async () => {
    await _outboxTest.enqueue(write('t-ensayo', 1, { actingUid: 'uid-viejo', slug: 'ensayo' }))
    await _outboxTest.enqueue(write('t-ensayo', 2, { slug: 'ensayo' }))
    await _outboxTest.enqueue(write('t-otro', 3, { slug: 'otro' }))
    await flush()
    expect(unsentWrites()).toMatchObject({ tournamentId: 't-ensayo', waitsFor: 'pin' })

    expect(await rejectGoneTournament('ensayo', 't-ensayo')).toBe(2)
    expect(keys()).toEqual(['score:t-otro:p1:3'])
    expect((await _outboxTest.stored()).map((x) => x.key)).toEqual(['score:t-otro:p1:3'])
    const rejected = (await _outboxTest.db()!.rejected.toArray()).map((r) => [r.key, r.message])
    expect(rejected).toEqual([
      ['score:t-ensayo:p1:1', t.sync.errGone],
      ['score:t-ensayo:p1:2', t.sync.errGone],
    ])
    expect(unsentWrites()).toMatchObject({ tournamentId: 't-otro', waitsFor: 'signal' })
  })

  it('found by the slug its writes were queued under, when the phone kept no boards for it', async () => {
    await _outboxTest.enqueue(write('t-ensayo', 1, { actingUid: 'uid-viejo', slug: 'ensayo' }))
    expect(await rejectGoneTournament('ensayo', null)).toBe(1)
    expect(keys()).toEqual([])
    expect(unsentWrites()).toBeNull()
  })

  it('another link that leads nowhere (a join code that stopped working, a typo) moves nothing', async () => {
    await _outboxTest.enqueue(write('t-ensayo', 1, { slug: 'ensayo' }))
    expect(await rejectGoneTournament('ABC123', null)).toBe(0)
    expect(keys()).toEqual(['score:t-ensayo:p1:1'])
  })

  it('writes a newer build queued stay for it', async () => {
    await _outboxTest.enqueue(write('t-ensayo', 1, { slug: 'ensayo', kind: 'note', key: 'note:t-ensayo:1' }) as never)
    expect(await rejectGoneTournament('ensayo', 't-ensayo')).toBe(0)
    expect(keys()).toEqual(['note:t-ensayo:1'])
    expect(await _outboxTest.db()!.rejected.count()).toBe(0)
    expect(useOutbox.getState().foreign).toBe(1)
  })
})
