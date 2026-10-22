/**
 * A browser with no BroadcastChannel (Safari before 15.4): the outbox starts with no channel to the other tabs,
 * and saves and sends as anywhere else.
 */
import { expect, it, vi } from 'vitest'

vi.stubGlobal('BroadcastChannel', undefined)
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

const { _outboxTest, enqueueHole, startOutbox } = await import('./outbox')
type OutboxItem = import('./outbox').OutboxItem
const { useAuth } = await import('./auth')
useAuth.setState({ user: { id: 'uid-phone' } as never })

it('starts, saves a hole and sends it, with no channel to tell other tabs', async () => {
  const sent: OutboxItem[] = []
  _outboxTest.setPush(async (item) => {
    sent.push(item)
    return { status: 'ok', rows: [], conflicts: [], rejected: [], unchanged: [] }
  })
  await startOutbox()
  await enqueueHole('t1', {
    round_id: 'r1',
    hole: 4,
    entered_by: 'p1',
    entries: [{ player_id: 'p2', fields: { strokes: 5 }, base: {} }],
  })
  await vi.waitFor(() => expect(sent).toHaveLength(1))
  expect(_outboxTest.queue()).toEqual([])
})
