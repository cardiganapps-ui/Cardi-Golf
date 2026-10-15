/**
 * UX-23: a marker's signature in the outbox. It is a player's card, keyed
 * apart from a pair's (a pair's id and a player's never meet), shown on the
 * boards while it waits, and sent as an upsert that meets an earlier
 * signature of the same card on (round_id, player_id) and keeps it. A pair's
 * signature goes exactly as before.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const srv = vi.hoisted(() => {
  const state = { upserts: [] as Array<{ table: string; row: unknown; opts: unknown }>, client: null as unknown }
  state.client = {
    auth: { getSession: async () => ({ data: { session: { access_token: 'tok' } }, error: null }) },
    from: (table: string) => ({
      upsert(row: unknown, opts: unknown) {
        state.upserts.push({ table, row, opts })
        const req = {
          select: () => req,
          setHeader: () => req,
          then: <A>(ok: (v: { data: unknown[]; error: null }) => A) => Promise.resolve({ data: [], error: null }).then(ok),
        }
        return req
      },
    }),
  }
  return state
})
vi.mock('../lib/supabase', () => ({ supabase: () => srv.client, supabaseConfigured: true }))
vi.mock('./tournamentStore', () => ({
  serverReadSince: () => null,
  registerOverlay: () => undefined,
  liveSeq: () => 1,
  liveClock: () => Date.now(),
  useTournament: { getState: () => ({ tournamentId: 't1', patch: () => undefined, refresh: () => undefined, reload: async () => undefined, landChanges: () => undefined, pushesDone: () => undefined }) },
}))

const { _outboxTest, enqueueSignature, flush, overlayPending } = await import('./outbox')
const { useAuth } = await import('./auth')
const { makeSnapshot } = await import('../engine/testing/fixtures')

beforeEach(() => {
  _outboxTest.reset()
  srv.upserts = []
  useAuth.setState({ user: { id: 'uid-phone' } as never, session: { access_token: 'tok' } as never })
})

describe('a marker’s signature in the outbox', () => {
  it('is keyed by the player’s card, apart from a pair’s with the same id', async () => {
    await enqueueSignature('t1', { round_id: 'r1', player_id: 'x1', signed_by: 'p1' })
    await enqueueSignature('t1', { round_id: 'r1', pair_id: 'x1', signed_by: 'p1' })
    expect(_outboxTest.queue().map((i) => i.key)).toEqual(['signature:r1:player:x1', 'signature:r1:x1'])
  })

  it('shows on the boards while it waits, as the player’s card signed by this phone’s player', async () => {
    await enqueueSignature('t1', { round_id: 'r1', player_id: 'p2', signed_by: 'p1' })
    const s = makeSnapshot({ players: 4, rounds: 1 })
    overlayPending(s)
    expect(s.cardSignatures).toEqual([{ roundId: 'r1', pairId: null, playerId: 'p2', signedBy: 'p1', signedAt: expect.any(String) }])
    // Twice over the same boards still one signature.
    overlayPending(s)
    expect(s.cardSignatures).toHaveLength(1)
  })

  it('goes as an upsert on the player’s card that keeps a signature already there; a pair’s on the pair’s, as before', async () => {
    await enqueueSignature('t1', { round_id: 'r1', player_id: 'p2', signed_by: 'p1' })
    await enqueueSignature('t1', { round_id: 'r1', pair_id: 'pair1', signed_by: 'p1' })
    await flush()
    expect(srv.upserts).toEqual([
      { table: 'card_signatures', row: { round_id: 'r1', player_id: 'p2', signed_by: 'p1' }, opts: { onConflict: 'round_id,player_id', ignoreDuplicates: true } },
      { table: 'card_signatures', row: { round_id: 'r1', pair_id: 'pair1', signed_by: 'p1' }, opts: { onConflict: 'round_id,pair_id', ignoreDuplicates: true } },
    ])
    expect(_outboxTest.queue()).toEqual([])
  })
})
