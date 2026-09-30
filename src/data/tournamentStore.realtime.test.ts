/**
 * REL-01: when the server rejects live updates, the app must say so, keep the
 * boards moving by polling, and try the channel again; it must never sit on
 * «En vivo» while nothing arrives.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type StatusCb = (status: string) => void
interface FakeChannel {
  name: string
  opts: unknown
  bindings: string[]
  system?: (p: unknown) => void
  status?: StatusCb
  on(type: string, filter: { table?: string }, cb: (p: unknown) => void): FakeChannel
  subscribe(cb: StatusCb): FakeChannel
}
const channels: FakeChannel[] = []
const removed: FakeChannel[] = []
const fakeClient = {
  channel(name: string, opts?: unknown): FakeChannel {
    const ch: FakeChannel = {
      name,
      opts,
      bindings: [],
      on(type, filter, cb) {
        if (type === 'system') ch.system = cb
        else ch.bindings.push(filter.table ?? '')
        return ch
      },
      subscribe(cb) {
        ch.status = cb
        return ch
      },
    }
    channels.push(ch)
    return ch
  },
  async removeChannel(ch: FakeChannel) {
    removed.push(ch)
  },
}

vi.mock('../lib/supabase', () => ({ supabase: () => fakeClient, supabaseConfigured: true }))
vi.mock('./snapshotCache', () => ({ saveSnapshot: async () => undefined }))

const { useTournament } = await import('./tournamentStore')
const { REALTIME_TABLES } = await import('./realtimeTables')

describe('tournament channel', () => {
  let reloads = 0
  beforeEach(() => {
    vi.useFakeTimers()
    channels.length = 0
    removed.length = 0
    reloads = 0
    useTournament.setState({
      tournamentId: 't1',
      data: null,
      realtime: 'off',
      reload: async () => {
        reloads++
      },
    })
  })
  afterEach(() => {
    useTournament.getState().unsubscribe()
    vi.useRealTimers()
  })

  it('asks the server to confirm every binding before reporting it live', () => {
    useTournament.getState().subscribe()
    const ch = channels[0]!
    expect(ch.opts).toEqual({ config: { postgres_changes_options: { wait: true } } })
    expect(ch.bindings).toEqual([...REALTIME_TABLES])
  })

  it('shows the outage, polls, and rebuilds the channel after a rejected join', async () => {
    useTournament.getState().subscribe()
    channels[0]!.status!('CHANNEL_ERROR')
    expect(useTournament.getState().realtime).toBe('error')

    await vi.advanceTimersByTimeAsync(15_000)
    expect(reloads).toBe(1)

    await vi.advanceTimersByTimeAsync(15_000)
    expect(removed).toContain(channels[0])
    expect(channels).toHaveLength(2)

    // The new channel comes up: polling stops.
    channels[1]!.status!('SUBSCRIBED')
    expect(useTournament.getState().realtime).toBe('live')
    const after = reloads
    await vi.advanceTimersByTimeAsync(60_000)
    expect(reloads).toBe(after)
  })

  it('treats a postgres_changes system error as an outage', () => {
    useTournament.getState().subscribe()
    channels[0]!.status!('SUBSCRIBED')
    expect(useTournament.getState().realtime).toBe('live')
    channels[0]!.system!({ extension: 'postgres_changes', status: 'error', message: 'Unable to subscribe' })
    expect(useTournament.getState().realtime).toBe('error')
  })

  it('stops polling and retries when the tournament is left', async () => {
    useTournament.getState().subscribe()
    channels[0]!.status!('TIMED_OUT')
    useTournament.getState().unsubscribe()
    await vi.advanceTimersByTimeAsync(10 * 60_000)
    expect(reloads).toBe(0)
    expect(channels).toHaveLength(1)
  })
})
