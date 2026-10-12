// @vitest-environment happy-dom
/**
 * Which version of the notice and the terms each person accepted (TRUST-05,
 * migration 0038): recorded once the action under the consent line goes
 * through, kept on the phone until the server takes it, and compared with
 * what the app shows so a change is said once.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { User } from '@supabase/supabase-js'

const rpc = vi.fn()
const getSession = vi.fn()
vi.mock('../lib/supabase', () => ({ supabaseConfigured: true, supabase: () => ({ rpc, auth: { getSession } }), authSettings: async () => null }))

const { acceptLegal, compareVersions, currentVersions, flushLegal, forgetLegal, legalUpdate } = await import('./legal')
const { useAuth } = await import('./auth')
const { claimPlayer } = await import('./api')

const KEY = 'cardi-golf:legal'
const cur = currentVersions()
const answer = (privacy: string | null, terms: string | null) => ({
  data: { privacy: privacy && { version: privacy, acceptedAt: '2026-10-12T00:00:00Z' }, terms: terms && { version: terms, acceptedAt: '2026-10-12T00:00:00Z' } },
  error: null,
})

function signIn(uid: string | null) {
  useAuth.setState({ user: uid ? ({ id: uid } as User) : null })
  getSession.mockResolvedValue({ data: { session: uid ? { user: { id: uid } } : null } })
}

beforeEach(() => {
  rpc.mockReset()
  localStorage.clear()
  signIn('u1')
})

describe('versions', () => {
  it('orders by date, then by the number after the dot', () => {
    expect(compareVersions('2026-10-12.10', '2026-10-12.9')).toBeGreaterThan(0)
    expect(compareVersions('2026-10-12', '2026-10-12.1')).toBeLessThan(0)
    expect(compareVersions('2026-10-01', '2026-09-30.7')).toBeGreaterThan(0)
    expect(compareVersions(cur.privacy, cur.privacy)).toBe(0)
  })
})

describe('acceptLegal', () => {
  it('records the versions on screen, where, for whoever is signed in', async () => {
    rpc.mockResolvedValueOnce(answer(cur.privacy, cur.terms))
    expect(await acceptLegal('pin')).toBe(true)
    expect(rpc).toHaveBeenCalledWith('accept_legal', { p_privacy: cur.privacy, p_terms: cur.terms, p_context: 'pin' })
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual({ seen: { uid: 'u1', privacy: cur.privacy, terms: cur.terms } })
  })

  it('waits on the phone without a session, and goes once there is one', async () => {
    signIn(null)
    expect(await acceptLegal('organizer')).toBe(false)
    expect(rpc).not.toHaveBeenCalled()
    expect(JSON.parse(localStorage.getItem(KEY)!).pending.context).toBe('organizer')
    signIn('u2')
    rpc.mockResolvedValueOnce(answer(cur.privacy, cur.terms))
    expect(await flushLegal()).toBe(true)
    expect(rpc).toHaveBeenCalledWith('accept_legal', { p_privacy: cur.privacy, p_terms: cur.terms, p_context: 'organizer' })
    expect(JSON.parse(localStorage.getItem(KEY)!).pending).toBeUndefined()
  })

  it('keeps it through no signal and a server without 0038, and drops one the server refuses for what it is', async () => {
    rpc.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    expect(await acceptLegal('quick')).toBe(false)
    rpc.mockResolvedValueOnce({ data: null, error: { code: 'PGRST202', message: 'not found' } })
    expect(await flushLegal()).toBe(false)
    expect(JSON.parse(localStorage.getItem(KEY)!).pending.context).toBe('quick')
    rpc.mockResolvedValueOnce({ data: null, error: { code: '22023', message: 'versión' } })
    expect(await flushLegal()).toBe(false)
    expect(localStorage.getItem(KEY)).toBeNull()
  })

  it('a week nobody could send it in is dropped: every sign-in shows its own consent line', async () => {
    signIn(null)
    await acceptLegal('account')
    const stored = JSON.parse(localStorage.getItem(KEY)!)
    stored.pending.at -= 8 * 24 * 60 * 60 * 1000
    localStorage.setItem(KEY, JSON.stringify(stored))
    signIn('u1')
    expect(await flushLegal()).toBe(true)
    expect(rpc).not.toHaveBeenCalled()
    expect(localStorage.getItem(KEY)).toBeNull()
  })

  it('signing out forgets it, so it never goes under the next person', async () => {
    signIn(null)
    await acceptLegal('pin')
    forgetLegal()
    signIn('u3')
    expect(await flushLegal()).toBe(true)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('a PIN the server took records it; a refused one does not', async () => {
    rpc.mockImplementation(async (name: string) => (name === 'claim_player' ? { data: { ok: false, reason: 'wrong_pin', attemptsLeft: 4 }, error: null } : answer(cur.privacy, cur.terms)))
    await claimPlayer('p1', '0000')
    await flushLegal()
    expect(rpc.mock.calls.map((c) => c[0])).toEqual(['claim_player'])
    rpc.mockImplementation(async (name: string) => (name === 'claim_player' ? { data: { ok: true, playerId: 'p1' }, error: null } : answer(cur.privacy, cur.terms)))
    await claimPlayer('p1', '1234')
    await flushLegal()
    expect(rpc).toHaveBeenCalledWith('accept_legal', { p_privacy: cur.privacy, p_terms: cur.terms, p_context: 'pin' })
  })
})

describe('legalUpdate', () => {
  it('says nothing without a session, or before anything was accepted', async () => {
    signIn(null)
    expect(await legalUpdate()).toBeNull()
    signIn('u1')
    rpc.mockResolvedValueOnce(answer(null, null))
    expect(await legalUpdate()).toEqual({ privacy: false, terms: false })
  })

  it('names the document whose accepted version is older than the one on screen', async () => {
    rpc.mockResolvedValueOnce(answer('2026-10-01', cur.terms))
    expect(await legalUpdate()).toEqual({ privacy: true, terms: false })
  })

  it('an older app that accepted an older version changes nothing on a newer one, nor the other way round', async () => {
    rpc.mockResolvedValueOnce(answer('2099-01-01', '2099-01-01'))
    expect(await legalUpdate()).toEqual({ privacy: false, terms: false })
  })

  it('asks the server only when what it last read is not what is on screen', async () => {
    rpc.mockResolvedValueOnce(answer(cur.privacy, cur.terms))
    await legalUpdate()
    expect(await legalUpdate()).toEqual({ privacy: false, terms: false })
    expect(rpc).toHaveBeenCalledTimes(1)
    // Another user on this phone is asked about afresh.
    signIn('u9')
    rpc.mockResolvedValueOnce(answer('2026-10-01', '2026-10-01'))
    expect(await legalUpdate()).toEqual({ privacy: true, terms: compareVersions('2026-10-01', cur.terms) < 0 })
  })

  it('an acceptance still to be sent already answers yes to what is on screen', async () => {
    rpc.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await acceptLegal('update')
    expect(await legalUpdate()).toEqual({ privacy: false, terms: false })
    expect(rpc).toHaveBeenCalledTimes(1)
  })

  it('cannot tell without signal or 0038', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: 'PGRST202', message: 'not found' } })
    expect(await legalUpdate()).toBeNull()
    rpc.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    expect(await legalUpdate()).toBeNull()
  })
})
