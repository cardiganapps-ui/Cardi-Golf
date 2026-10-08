/**
 * REL-16: writes queued before the device's identity changed (a session that
 * lapsed in a dead zone) were pushed under the new identity, refused by the
 * server and moved to the rejected list. They must wait, untouched, until the
 * player is back on this device, then go out. So must writes saved before the
 * session was confirmed at all (a phone that opened from its saved boards).
 */
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

let uid: string | null = 'uid-a'
type AuthListener = (state: { user: { id: string } | null }, prev: { user: { id: string } | null }) => void
const authListeners = new Set<AuthListener>()
/** The device's identity changes, the way the auth store announces it. */
function becomes(next: string | null) {
  const prev = { user: uid ? { id: uid } : null }
  uid = next
  for (const l of authListeners) l({ user: uid ? { id: uid } : null }, prev)
}
vi.mock('./auth', () => ({
  useAuth: {
    getState: () => ({ user: uid ? { id: uid } : null }),
    subscribe: (l: AuthListener) => {
      authListeners.add(l)
      return () => authListeners.delete(l)
    },
  },
}))
vi.mock('../lib/supabase', () => ({ supabase: () => ({}), supabaseConfigured: false }))
vi.mock('./tournamentStore', () => ({
  registerOverlay: () => undefined,
  liveSeq: () => 0,
  liveClock: () => Date.now(),
  useTournament: { getState: () => ({ tournamentId: 't1', patch: () => undefined, refresh: () => undefined, landChanges: () => undefined, pushesDone: () => undefined, reload: async () => undefined }) },
}))

const { _outboxTest, adoptQueuedWrites, flush, hasUnsentWrites, queuedFor, unsentBeforeClaim, unsentWrites, useOutbox } = await import('./outbox')

const score = (hole: number, player = 'p1') => ({
  key: `score:r1:${player}:${hole}`,
  kind: 'score' as const,
  tournamentId: 't1',
  payload: { round_id: 'r1', player_id: player, hole, strokes: 4, putts: 2, picked_up: false, entered_by: 'p1', client_ts: 'x' },
  attempts: 0,
  createdAt: Date.now(),
})

describe('outbox across a change of identity', () => {
  beforeEach(async () => {
    _outboxTest.reset()
    await _outboxTest.clearStored()
    uid = 'uid-a'
  })

  it('holds writes queued by the earlier session, pushes them once the player is back', async () => {
    const pushed: string[] = []
    _outboxTest.setPush(async () => {
      throw new Error('TypeError: Failed to fetch')
    })
    // Two holes in a dead zone, two players each.
    for (let h = 1; h <= 2; h++) for (const p of ['p1', 'p2']) await _outboxTest.enqueue(score(h, p))

    // The token lapses; the device comes back as a new anonymous user.
    uid = 'uid-b'
    let adopted = false
    _outboxTest.setPush(async (item) => {
      // Under uid-b and before the PIN, the server would refuse these.
      if (uid === 'uid-b' && !adopted) throw new Error('new row violates row-level security policy for table "scores"')
      pushed.push(item.key)
    })
    await flush()
    expect(pushed).toEqual([])
    expect(useOutbox.getState().rejected).toEqual([])
    expect(queuedFor('t1')).toEqual({ holes: 2, heldHoles: 2, writes: 4 })
    expect(useOutbox.getState().held).toBe(4)

    // The player enters the PIN again: the gate confirms membership.
    adopted = true
    await adoptQueuedWrites('t1')
    await flush()
    expect(pushed).toHaveLength(4)
    expect(_outboxTest.queue()).toEqual([])
    expect(queuedFor('t1')).toEqual({ holes: 0, heldHoles: 0, writes: 0 })
  })

  it('still rejects a write the server refuses for the same identity', async () => {
    _outboxTest.setPush(async () => {
      throw new Error('new row violates row-level security policy for table "scores"')
    })
    await _outboxTest.enqueue(score(3))
    await flush()
    expect(useOutbox.getState().rejected.map((r) => r.key)).toEqual(['score:r1:p1:3'])
  })

  it('holds a hole saved before the session was confirmed, and sends it as the player the gate confirms', async () => {
    const pushed: Array<{ key: string; as: string | null | undefined }> = []
    _outboxTest.setPush(async (item) => {
      // Before the PIN, under a new anonymous session, the server would refuse it.
      if (uid !== 'uid-c' || !item.actingUid) throw new Error('new row violates row-level security policy for table "scores"')
      pushed.push({ key: item.key, as: item.actingUid })
    })
    // Opened from the saved boards with no signal: nobody confirmed yet.
    uid = null
    await _outboxTest.enqueue(score(5))
    await flush()
    expect(pushed).toEqual([])
    expect(useOutbox.getState().rejected).toEqual([])
    expect(queuedFor('t1')).toEqual({ holes: 1, heldHoles: 1, writes: 1 })
    // The stored session was dead: a new anonymous one starts, before the PIN.
    becomes('uid-c')
    await flush()
    expect(pushed).toEqual([])
    expect(useOutbox.getState().rejected).toEqual([])
    // The player enters the PIN: the gate confirms membership and adopts the hole.
    await adoptQueuedWrites('t1')
    await flush()
    expect(pushed).toEqual([{ key: 'score:r1:p1:5', as: 'uid-c' }])
    expect(queuedFor('t1')).toEqual({ holes: 0, heldHoles: 0, writes: 0 })
  })

  it('the held count follows the device\'s identity, not only the queue', async () => {
    _outboxTest.setPush(async () => {
      throw new Error('TypeError: Failed to fetch')
    })
    await _outboxTest.enqueue(score(6))
    await flush()
    expect(useOutbox.getState().held).toBe(0)
    // The session lapses and a new one starts: nothing in the queue moved.
    becomes('uid-b')
    expect(useOutbox.getState().held).toBe(1)
    becomes('uid-a')
    expect(useOutbox.getState().held).toBe(0)
  })

  it('keeps held writes across a restart', async () => {
    _outboxTest.setPush(async () => {
      throw new Error('TypeError: Failed to fetch')
    })
    await _outboxTest.enqueue(score(4))
    uid = 'uid-b'
    _outboxTest.reset()
    await _outboxTest.load()
    expect(queuedFor('t1')).toEqual({ holes: 1, heldHoles: 1, writes: 1 })
  })
})

describe('what still has to go out before the phone changes who it is', () => {
  beforeEach(async () => {
    _outboxTest.reset()
    await _outboxTest.clearStored()
    uid = 'uid-a'
    _outboxTest.setPush(async () => {
      throw new Error('TypeError: Failed to fetch')
    })
  })

  it('counts a card signature, a snake answer or a hole award, not only score holes («Cambiar de jugador»)', async () => {
    await _outboxTest.enqueue({ key: 'signature:r1:pair1', kind: 'signature', tournamentId: 't1', payload: { round_id: 'r1', pair_id: 'pair1', signed_by: 'p1' }, attempts: 0, createdAt: Date.now() })
    expect(queuedFor('t1')).toEqual({ holes: 0, heldHoles: 0, writes: 1 })
    await _outboxTest.enqueue({ key: 'tiebreak:r1:g1:7', kind: 'tiebreak', tournamentId: 't1', payload: { round_id: 'r1', group_id: 'g1', hole: 7, last_holed_player_id: 'p2', decided_by: 'p1' }, attempts: 0, createdAt: Date.now() })
    expect(queuedFor('t1').writes).toBe(2)
    expect(queuedFor('t-otro').writes).toBe(0)
  })

  it('names the tournament, for any tournament, and says whether signal is enough', async () => {
    expect(unsentWrites()).toBeNull()
    await _outboxTest.enqueue({ ...score(3), tournamentId: 't-otro' })
    expect(unsentWrites()).toEqual({ tournamentId: 't-otro', waitsFor: 'signal', name: null })
    expect(hasUnsentWrites()).toBe(true)
  })

  it('…or the PIN: the writes were queued under an identity the device no longer has', async () => {
    await _outboxTest.enqueue({ ...score(3), tournamentId: 't-otro' })
    becomes('uid-b')
    expect(unsentWrites()).toEqual({ tournamentId: 't-otro', waitsFor: 'pin', name: null })
  })

  it('«PIN» is said of the tournament it names: another tournament\'s held writes do not make this one wait for a PIN', async () => {
    // This tournament's hole waits only for signal (written as the phone's own identity)...
    await _outboxTest.enqueue({ ...score(3), tournamentId: 't-primero' })
    // ...while another tournament's was written under an identity the phone no longer has.
    await _outboxTest.enqueue({ ...score(4), tournamentId: 't-segundo', actingUid: 'uid-viejo' })
    expect(unsentWrites()).toEqual({ tournamentId: 't-primero', waitsFor: 'signal', name: null })
  })

  it('saved before the session was confirmed: opening the tournament with signal sends them, no PIN', async () => {
    uid = null
    await _outboxTest.enqueue(score(3))
    becomes('uid-a')
    expect(unsentWrites()).toEqual({ tournamentId: 't1', waitsFor: 'signal', name: null })
  })

  it('a write a newer build queued never blocks: this build can never send it, and it stays on the phone', async () => {
    const foreign = { ...score(9), key: 'photo:r1:p1:9', kind: 'photo' as unknown as 'score' }
    await _outboxTest.enqueue(foreign)
    expect(unsentWrites()).toBeNull()
    expect(hasUnsentWrites()).toBe(false)
    expect(queuedFor('t1').writes).toBe(0)
    expect((await _outboxTest.stored()).map((x) => x.key)).toEqual(['photo:r1:p1:9'])
  })
})

/**
 * A PIN in another tournament: the device keeps one PIN claim (claim_player
 * replaces it), so entering a tournament makes the phone nobody in the one
 * before, and that one's writes still on the phone went out and were refused
 * for good. What counts is what the claim would strand.
 */
describe('what still has to go out before the phone enters another tournament with a PIN', () => {
  beforeEach(async () => {
    _outboxTest.reset()
    await _outboxTest.clearStored()
    uid = 'uid-a'
  })

  it('another tournament\'s writes, written as this phone, named by the name they were queued under', async () => {
    expect(unsentBeforeClaim('t-nuevo')).toBeNull()
    await _outboxTest.enqueue({ ...score(3), tournamentId: 't-ensayo', tournamentName: 'Ensayo' })
    expect(unsentBeforeClaim('t-nuevo')).toEqual({ tournamentId: 't-ensayo', name: 'Ensayo' })
  })

  it('…and the ones saved there before the session was confirmed: they go out once that tournament confirms the player', async () => {
    uid = null
    await _outboxTest.enqueue({ ...score(3), tournamentId: 't-ensayo' })
    becomes('uid-a')
    expect(unsentBeforeClaim('t-nuevo')).toEqual({ tournamentId: 't-ensayo', name: null })
  })

  it('not the tournament being entered: its PIN is what sends its own, held ones too', async () => {
    await _outboxTest.enqueue({ ...score(3), tournamentId: 't-nuevo' })
    await _outboxTest.enqueue({ ...score(4), tournamentId: 't-nuevo', actingUid: 'uid-viejo' })
    expect(unsentBeforeClaim('t-nuevo')).toBeNull()
  })

  it('not writes held for a PIN elsewhere (they wait for it there either way), nor a newer build\'s', async () => {
    await _outboxTest.enqueue({ ...score(3), tournamentId: 't-ensayo', actingUid: 'uid-viejo' })
    await _outboxTest.enqueue({ ...score(9), tournamentId: 't-ensayo', key: 'photo:r1:p1:9', kind: 'photo' as unknown as 'score' })
    expect(unsentBeforeClaim('t-nuevo')).toBeNull()
    // Sign-out and the account switches still count the held one.
    expect(unsentWrites()).toMatchObject({ tournamentId: 't-ensayo', waitsFor: 'pin' })
  })
})
