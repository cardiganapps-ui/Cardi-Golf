/**
 * REL-16, the path the identity hold doesn't cover: the app stays open while
 * the token expires in a dead zone. auth-js keeps the user, so a hole saved
 * offline carries the same identity and is not held. When the signal comes
 * back inside auth-js's refresh cooldown (60 s after a failed refresh),
 * getSession() has no session, supabase-js sends the write with the anon key,
 * and the server's refusal was read as final: «4 rechazados» for four good
 * holes. A write never goes out without the player's own token now; with
 * none it waits, and goes out once the session is back.
 *
 * The real push runs against a client that does what supabase-js does: a
 * request without its own Authorization header gets the session's token, or
 * the anon key when there is no session.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const srv = vi.hoisted(() => {
  const state = {
    /** What auth-js's getSession() has: null while the refresh cools down. */
    session: null as { access_token: string } | null,
    /** The server refuses the write even with the player's token (a signed card, a closed round). */
    refuseForPlayer: false,
    sent: [] as Array<{ table: string; method: string; auth: string }>,
    client: null as unknown,
  }
  const getSession = async () => ({ data: { session: state.session }, error: state.session ? null : new Error('refresh cooling down') })
  function request(table: string, method: string) {
    const headers = new Map<string, string>()
    const req = {
      setHeader(name: string, value: string) {
        headers.set(name.toLowerCase(), value)
        return req
      },
      eq: () => req,
      then<A, B>(ok?: (v: { data: null; error: { message: string } | null }) => A, bad?: (e: unknown) => B) {
        return (async () => {
          const auth = headers.get('authorization') ?? `Bearer ${(await getSession()).data.session?.access_token ?? 'anon-key'}`
          state.sent.push({ table, method, auth })
          if (auth === 'Bearer anon-key' || state.refuseForPlayer) return { data: null, error: { message: `new row violates row-level security policy for table "${table}"` } }
          return { data: null, error: null }
        })().then(ok, bad)
      },
    }
    return req
  }
  state.client = {
    auth: { getSession },
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
  useTournament: { getState: () => ({ tournamentId: 't1', patch: () => undefined, reload: async () => undefined }) },
}))

const { _outboxTest, flush, useOutbox } = await import('./outbox')
const { useAuth } = await import('./auth')
const { t } = await import('../i18n/es-MX')

const score = (hole: number) => ({
  key: `score:r1:p1:${hole}`,
  kind: 'score' as const,
  tournamentId: 't1',
  payload: { round_id: 'r1', player_id: 'p1', hole, strokes: 4, putts: 2, picked_up: false, entered_by: 'p1', client_ts: 'x' },
  attempts: 0,
  createdAt: hole,
})
const award = (hole: number) => ({
  key: `award:r1:g1:closest:${hole}`,
  kind: 'award' as const,
  tournamentId: 't1',
  payload: { round_id: 'r1', group_id: 'g1', hole, game_id: 'closest', player_ids: ['p1'], decided_by: 'p1' },
  attempts: 0,
  createdAt: hole,
})

beforeEach(() => {
  _outboxTest.reset()
  srv.sent = []
  srv.refuseForPlayer = false
  srv.session = { access_token: 'tok-1' }
  // The player entered with the PIN on this phone: its writes carry who wrote them.
  useAuth.setState({ user: { id: 'uid-phone' } as never, session: { access_token: 'tok-1' } as never })
})
afterEach(() => {
  _outboxTest.reset()
})

describe('a write goes out with the player’s own token, or waits (REL-16)', () => {
  it('signal back inside the refresh cooldown: nothing goes out as anon, nothing is rejected, and it all goes out once the session is back', async () => {
    // The token lapsed in a dead zone; auth-js keeps the user, but has no session to send with.
    srv.session = null
    await _outboxTest.enqueue(score(12))
    await _outboxTest.enqueue(award(12))
    await flush()
    expect(srv.sent.filter((s) => s.auth === 'Bearer anon-key')).toEqual([])
    expect(useOutbox.getState().rejected).toEqual([])
    expect(_outboxTest.queue().map((x) => x.key)).toEqual(['score:r1:p1:12', 'award:r1:g1:closest:12'])
    expect(useOutbox.getState().lastError).toBe(t.sync.errNetwork)

    // The refresh works: auth-js announces the new session and the queue goes out with it.
    srv.session = { access_token: 'tok-2' }
    useAuth.setState({ session: { access_token: 'tok-2' } as never })
    await vi.waitFor(() => expect(_outboxTest.queue()).toEqual([]))
    expect(srv.sent).toEqual([
      { table: 'scores', method: 'upsert', auth: 'Bearer tok-2' },
      { table: 'hole_awards', method: 'delete', auth: 'Bearer tok-2' },
      { table: 'hole_awards', method: 'insert', auth: 'Bearer tok-2' },
    ])
    expect(useOutbox.getState().rejected).toEqual([])
  })

  it('the server refusing the signed-in player is still final', async () => {
    srv.refuseForPlayer = true
    await _outboxTest.enqueue(score(13))
    await flush()
    expect(srv.sent).toEqual([{ table: 'scores', method: 'upsert', auth: 'Bearer tok-1' }])
    expect(useOutbox.getState().rejected.map((r) => r.key)).toEqual(['score:r1:p1:13'])
    expect(_outboxTest.queue()).toEqual([])
  })
})
