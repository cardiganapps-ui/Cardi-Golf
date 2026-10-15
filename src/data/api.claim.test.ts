/**
 * TRUST-15: a phone holds one PIN claim, so a PIN taken for a player of another
 * tournament makes the tournaments it held only by PIN someone else's. Their
 * saved boards used to stay, and with no signal the phone opened one of them
 * as the player it used to be. A refused PIN forgets nothing.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const answer = vi.hoisted(() => ({ data: null as unknown }))
const cache = vi.hoisted(() => ({ clearPinEntriesExcept: vi.fn(async () => undefined) }))
vi.mock('../lib/supabase', () => ({ supabase: () => ({ rpc: async () => ({ data: answer.data, error: null }) }) }))
vi.mock('./snapshotCache', () => cache)
vi.mock('./legal', () => ({ acceptLegal: vi.fn(async () => undefined) }))
const { claimPlayer } = await import('./api')

beforeEach(() => cache.clearPinEntriesExcept.mockClear())

describe('a PIN taken forgets the tournaments this phone held only by PIN (TRUST-15)', () => {
  it('the PIN the server took: every other tournament held by PIN goes', async () => {
    answer.data = { ok: true, playerId: 'p1', tournamentId: 't-nuevo' }
    await claimPlayer('p1', '1234')
    expect(cache.clearPinEntriesExcept).toHaveBeenCalledWith('t-nuevo')
  })
  it('a refused PIN forgets nothing', async () => {
    answer.data = { ok: false, reason: 'wrong_pin', attemptsLeft: 4 }
    await claimPlayer('p1', '0000')
    expect(cache.clearPinEntriesExcept).not.toHaveBeenCalled()
  })
})
