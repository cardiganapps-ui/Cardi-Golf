/**
 * The two tables the channel listens to since 0027 and 0028 are on
 * production (REL-01, `ON_PRODUCTION`): the Comité's money decisions
 * (`money_adjustments`, MONEY-05) reach every phone's Dinero from the event,
 * with no reload; the inbox of holes the server kept (`rejected_writes`,
 * REL-08) is not part of the boards: a change reads the Comité's
 * «Pendientes de revisar» again, coalesced, and nothing else. A player's
 * phone (no list loaded) hears its own rows at no cost, and a delete, which
 * RLS does not filter (DB-05), reads the list only for a row it holds.
 */
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getFixture } from '../dev/fixtures'
import type { Row } from './mappers'
import { fakeSupabase, type FakeSupabase } from './testing/fakeSupabase'
import { snapshotToRows } from './testing/rows'

let server: FakeSupabase = fakeSupabase({})
vi.mock('../lib/supabase', () => ({ supabase: () => server.client, supabaseConfigured: true }))

const { useTournament } = await import('./tournamentStore')
const { INBOX_RELOAD_MS, useRejectedInbox } = await import('./rejectedInbox')

const fx = getFixture('full12-live')!
const TID = fx.snapshot.tournament.id
const store = () => useTournament.getState()
const inbox = () => useRejectedInbox.getState()
/** Snapshot reads so far: each one starts with the tournament's row. */
const reads = () => server.requests.filter((r) => r.table === 'tournaments').length
const requests = () => server.requests.length
const inboxReads = () => server.rpcCalls.filter((c) => c.name === 'rejected_inbox').length
const channel = () => server.channels.at(-1)!
const emit = (table: string, payload: Record<string, unknown>) => {
  const bound = channel().bindings.get(table)
  if (!bound) throw new Error(`the channel does not listen to ${table}`)
  bound(payload)
}
const round = fx.snapshot.rounds.find((r) => r.status === 'live')!
const p = (i: number) => fx.snapshot.players[i]!.id

const adjustment = (over: Record<string, unknown> = {}): Row => ({
  id: 'adj-1',
  tournament_id: TID,
  source_key: 'snake',
  kind: 'refund',
  to_player_id: p(0),
  amount: 150,
  reason: 'Víbora sin dueño',
  call_id: 'call-1',
  created_by: 'org',
  created_at: '2027-04-10T20:00:00+00:00',
  voided_at: null,
  voided_by: null,
  void_reason: null,
  ...over,
})

/** One row as save_hole keeps it. */
const kept = (id: string, over: Record<string, unknown> = {}): Row => ({
  id,
  tournament_id: TID,
  round_id: round.id,
  hole: 5,
  player_id: p(1),
  writer_player_id: p(2),
  auth_user_id: 'uid-p3',
  device_id: null,
  mutation_id: null,
  payload: { player_id: p(1), fields: { strokes: 6 }, base: {} },
  reason: 'round_not_live',
  status: 'open',
  created_at: '2027-04-10T15:00:00Z',
  ...over,
})

beforeEach(async () => {
  server = fakeSupabase(snapshotToRows(fx.snapshot))
  useRejectedInbox.setState({ tournamentId: null, items: [], status: 'idle', error: null, fixture: false })
  const n = reads()
  await store().load(TID)
  expect(store().error).toBeNull()
  channel().status!('SUBSCRIBED')
  // Coming up live fetches what was missed: let that settle before counting.
  await vi.waitFor(() => expect(reads()).toBe(n + 2))
})
afterEach(() => {
  store().unsubscribe()
  vi.useRealTimers()
  useTournament.setState({ tournamentId: null, loading: false, error: null, data: null, realtime: 'off', updatedAt: 0, source: null, keepOnPhone: true })
})

describe('money_adjustments on the channel (0027, MONEY-05)', () => {
  it('the two rows of one decision land from their events as one assignment, with one recompute and no request', async () => {
    vi.useFakeTimers()
    const before = requests()
    const shown = store().data
    emit('money_adjustments', { eventType: 'INSERT', new: adjustment(), old: {} })
    emit('money_adjustments', { eventType: 'INSERT', new: adjustment({ id: 'adj-2', to_player_id: p(1) }), old: {} })
    expect(store().data).toBe(shown)
    await vi.advanceTimersByTimeAsync(40)
    expect(store().data!.snapshot.moneyAdjustments!.map((x) => [x.id, x.callId])).toEqual([
      ['adj-1', 'call-1'],
      ['adj-2', 'call-1'],
    ])
    expect(store().data!.state.money.unassigned!.assignments.map((a) => [a.callId, a.total])).toEqual([['call-1', 300]])
    await vi.advanceTimersByTimeAsync(10_000)
    expect(requests()).toBe(before)
  })

  it('a void reaches the boards and the assignment leaves the money; a delete (a restore) of a row it holds applies, another’s id is left alone', async () => {
    vi.useFakeTimers()
    emit('money_adjustments', { eventType: 'INSERT', new: adjustment(), old: {} })
    emit('money_adjustments', { eventType: 'INSERT', new: adjustment({ id: 'adj-2', to_player_id: p(1) }), old: {} })
    await vi.advanceTimersByTimeAsync(40)
    const before = requests()
    const voided = { voided_at: '2027-04-10T21:00:00+00:00', voided_by: 'org', void_reason: 'Era de otro' }
    emit('money_adjustments', { eventType: 'UPDATE', new: adjustment(voided), old: {} })
    emit('money_adjustments', { eventType: 'UPDATE', new: adjustment({ id: 'adj-2', to_player_id: p(1), ...voided }), old: {} })
    await vi.advanceTimersByTimeAsync(40)
    expect(store().data!.snapshot.moneyAdjustments!.map((x) => x.voidReason)).toEqual(['Era de otro', 'Era de otro'])
    expect(store().data!.state.money.unassigned!.assignments).toEqual([])

    const shown = store().data
    emit('money_adjustments', { eventType: 'DELETE', new: {}, old: { id: 'adj-de-otro-torneo' } })
    await vi.advanceTimersByTimeAsync(40)
    expect(store().data).toBe(shown)
    emit('money_adjustments', { eventType: 'DELETE', new: {}, old: { id: 'adj-1' } })
    await vi.advanceTimersByTimeAsync(40)
    expect(store().data!.snapshot.moneyAdjustments!.map((x) => x.id)).toEqual(['adj-2'])
    await vi.advanceTimersByTimeAsync(10_000)
    expect(requests()).toBe(before)
  })
})

describe('rejected_writes on the channel (0028, REL-08)', () => {
  /** The Comité opened «Pendientes de revisar»: the list holds w1. */
  const comite = () => {
    server.rpcResult = { data: [kept('w1')], error: null }
    useRejectedInbox.setState({ tournamentId: TID, items: [{ id: 'w1', roundId: round.id, hole: 5, playerId: p(1), writerPlayerId: p(2), reason: 'round_not_live', fields: { strokes: 6 }, base: {}, auto: false, createdAt: '' }], status: 'ready', error: null, fixture: false })
  }

  it('a player’s phone (no list loaded) hears its own rows at no cost: no request, the boards untouched', async () => {
    vi.useFakeTimers()
    const before = requests()
    const shown = store().data
    emit('rejected_writes', { eventType: 'INSERT', new: kept('w9', { auth_user_id: 'me' }), old: {} })
    emit('rejected_writes', { eventType: 'UPDATE', new: kept('w9', { status: 'applied' }), old: {} })
    emit('rejected_writes', { eventType: 'DELETE', new: {}, old: { id: 'w9' } })
    await vi.advanceTimersByTimeAsync(10_000)
    expect(store().data).toBe(shown)
    expect(requests()).toBe(before)
    expect(inboxReads()).toBe(0)
    expect(inbox().status).toBe('idle')
  })

  it('on the Comité’s phone, the rows of one save_hole call read the list once, and never reload the tournament', async () => {
    vi.useFakeTimers()
    comite()
    const before = requests()
    const shown = store().data
    server.rpcResult = { data: [kept('w1'), kept('w2', { player_id: p(2) }), kept('w3', { player_id: p(3) })], error: null }
    emit('rejected_writes', { eventType: 'INSERT', new: kept('w2', { player_id: p(2) }), old: {} })
    emit('rejected_writes', { eventType: 'INSERT', new: kept('w3', { player_id: p(3) }), old: {} })
    await vi.advanceTimersByTimeAsync(INBOX_RELOAD_MS - 1)
    expect(inboxReads()).toBe(0)
    emit('rejected_writes', { eventType: 'INSERT', new: kept('w4', { player_id: p(0) }), old: {} })
    await vi.advanceTimersByTimeAsync(1)
    await vi.waitFor(() => expect(inbox().items.map((x) => x.id)).toEqual(['w1', 'w2', 'w3']))
    expect(inboxReads()).toBe(1)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(inboxReads()).toBe(1)
    // Not one tournament read, and the boards are the same object.
    expect(requests()).toBe(before)
    expect(store().data).toBe(shown)
  })

  it('another Comité phone’s answer takes the row off this one’s list', async () => {
    vi.useFakeTimers()
    comite()
    server.rpcResult = { data: [], error: null }
    emit('rejected_writes', { eventType: 'UPDATE', new: kept('w1', { status: 'dismissed' }), old: {} })
    await vi.advanceTimersByTimeAsync(INBOX_RELOAD_MS)
    await vi.waitFor(() => expect(inbox().items).toEqual([]))
    expect(inboxReads()).toBe(1)
  })

  it('another tournament’s row, and a delete of a row the list does not hold, read nothing; a delete of one it holds reads it again', async () => {
    vi.useFakeTimers()
    comite()
    emit('rejected_writes', { eventType: 'INSERT', new: kept('x1', { tournament_id: 'otro' }), old: {} })
    emit('rejected_writes', { eventType: 'DELETE', new: {}, old: { id: 'x1' } })
    emit('rejected_writes', { eventType: 'DELETE', new: {}, old: {} })
    await vi.advanceTimersByTimeAsync(10_000)
    expect(inboxReads()).toBe(0)
    server.rpcResult = { data: [], error: null }
    emit('rejected_writes', { eventType: 'DELETE', new: {}, old: { id: 'w1' } })
    await vi.advanceTimersByTimeAsync(INBOX_RELOAD_MS)
    await vi.waitFor(() => expect(inbox().items).toEqual([]))
    expect(inboxReads()).toBe(1)
  })

  it('a delete while the list is being read reads it again (that read may have seen the row)', async () => {
    vi.useFakeTimers()
    comite()
    useRejectedInbox.setState({ status: 'loading' })
    emit('rejected_writes', { eventType: 'DELETE', new: {}, old: { id: 'nunca-visto' } })
    await vi.advanceTimersByTimeAsync(INBOX_RELOAD_MS)
    await vi.waitFor(() => expect(inboxReads()).toBe(1))
  })

  it('an event that came with errors reads the list again on the Comité’s phone, and nothing on a player’s', async () => {
    vi.useFakeTimers()
    emit('rejected_writes', { eventType: 'INSERT', new: {}, old: {}, errors: ['Error 401: Unauthorized'] })
    await vi.advanceTimersByTimeAsync(10_000)
    expect(inboxReads()).toBe(0)
    comite()
    const before = requests()
    emit('rejected_writes', { eventType: 'INSERT', new: {}, old: {}, errors: ['Error 413: Payload Too Large'] })
    await vi.advanceTimersByTimeAsync(INBOX_RELOAD_MS)
    await vi.waitFor(() => expect(inboxReads()).toBe(1))
    expect(requests()).toBe(before)
  })

  it('the list of another tournament the Comité left open is not read for this one’s rows, nor a design fixture’s', async () => {
    vi.useFakeTimers()
    comite()
    useRejectedInbox.setState({ tournamentId: 'otro' })
    emit('rejected_writes', { eventType: 'INSERT', new: kept('w2'), old: {} })
    useRejectedInbox.setState({ tournamentId: TID, fixture: true })
    emit('rejected_writes', { eventType: 'INSERT', new: kept('w3'), old: {} })
    await vi.advanceTimersByTimeAsync(10_000)
    expect(inboxReads()).toBe(0)
  })

  it('a change heard just before the Comité moved to another tournament’s list does not read this one’s into it', async () => {
    vi.useFakeTimers()
    comite()
    emit('rejected_writes', { eventType: 'INSERT', new: kept('w2'), old: {} })
    useRejectedInbox.setState({ tournamentId: 'otro', items: [] })
    await vi.advanceTimersByTimeAsync(10_000)
    expect(inboxReads()).toBe(0)
    expect(inbox().tournamentId).toBe('otro')
  })
})
