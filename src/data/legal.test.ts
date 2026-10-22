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
/** This phone's PIN claim (`device_sessions`, RLS: its own row): none unless a test says so. */
const claim = vi.fn(async () => ({ data: null as { player_id: string } | null, error: null }))
const from = vi.fn(() => ({ select: () => ({ maybeSingle: claim }) }))
vi.mock('../lib/supabase', () => ({
  supabaseConfigured: true,
  supabase: () => ({ rpc, auth: { getSession }, from }),
  authSettings: async () => null,
}))

const { acceptLegal, compareVersions, currentVersions, flushLegal, forgetLegal, legalUpdate, sayAdult } =
  await import('./legal')
const { useAuth } = await import('./auth')
const { claimPlayer } = await import('./api')

const KEY = 'cardi-golf:legal'
const cur = currentVersions()
const answer = (privacy: string | null, terms: string | null) => ({
  data: {
    privacy: privacy && { version: privacy, acceptedAt: '2026-10-12T00:00:00Z' },
    terms: terms && { version: terms, acceptedAt: '2026-10-12T00:00:00Z' },
  },
  error: null,
})

function signIn(uid: string | null, anonymous = true) {
  useAuth.setState({ user: uid ? ({ id: uid, is_anonymous: anonymous } as User) : null })
  getSession.mockResolvedValue({ data: { session: uid ? { user: { id: uid, is_anonymous: anonymous } } : null } })
}
const sent = (context: string, user = expect.any(String)) => ({
  p_privacy: cur.privacy,
  p_terms: cur.terms,
  p_context: context,
  p_age_seconds: expect.any(Number),
  p_user: user,
})

beforeEach(() => {
  rpc.mockReset()
  claim.mockClear()
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

describe('18 or older (TRUST-13, confirm_adult in 0070)', () => {
  it("an account's sign-up carries it to the server with the acceptance, once", async () => {
    signIn('u1', false)
    sayAdult()
    rpc.mockResolvedValueOnce(answer(cur.privacy, cur.terms)).mockResolvedValueOnce({ data: null, error: null })
    expect(await acceptLegal('account')).toBe(true)
    expect(rpc).toHaveBeenCalledWith('confirm_adult', {
      p_terms: cur.terms,
      p_context: 'account',
      p_age_seconds: expect.any(Number),
      p_user: 'u1',
    })
    // Said for that sign-in only.
    rpc.mockClear()
    rpc.mockResolvedValueOnce(answer(cur.privacy, cur.terms))
    await acceptLegal('update')
    expect(rpc).not.toHaveBeenCalledWith('confirm_adult', expect.anything())
  })

  it('a PIN phone (anonymous) records no age; an old check (over an hour) carries nothing', async () => {
    sayAdult()
    rpc.mockResolvedValue(answer(cur.privacy, cur.terms))
    await acceptLegal('pin')
    expect(rpc).not.toHaveBeenCalledWith('confirm_adult', expect.anything())
    signIn('u2', false)
    localStorage.setItem(KEY, JSON.stringify({ adult: { at: Date.now() - 2 * 3_600_000 } }))
    await acceptLegal('account')
    expect(rpc).not.toHaveBeenCalledWith('confirm_adult', expect.anything())
    rpc.mockReset()
  })

  it('a server without 0070 refuses the age and the acceptance still stands', async () => {
    signIn('u1', false)
    sayAdult()
    rpc
      .mockResolvedValueOnce(answer(cur.privacy, cur.terms))
      .mockResolvedValueOnce({ data: null, error: { code: 'PGRST202', message: 'not found' } })
    expect(await acceptLegal('account')).toBe(true)
    expect(JSON.parse(localStorage.getItem(KEY)!).pending).toBeUndefined()
  })
})

describe('acceptLegal', () => {
  it('records the versions on screen, where, for whoever is signed in', async () => {
    rpc.mockResolvedValueOnce(answer(cur.privacy, cur.terms))
    expect(await acceptLegal('pin')).toBe(true)
    expect(rpc).toHaveBeenCalledWith('accept_legal', sent('pin'))
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual({
      seen: { uid: 'u1', privacy: cur.privacy, terms: cur.terms },
    })
  })

  it("sends how long ago it was given, and for whom, not the phone's clock", async () => {
    rpc.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await acceptLegal('organizer')
    const stored = JSON.parse(localStorage.getItem(KEY)!)
    stored.pending.at -= 3_600_000
    localStorage.setItem(KEY, JSON.stringify(stored))
    rpc.mockResolvedValueOnce(answer(cur.privacy, cur.terms))
    expect(await flushLegal()).toBe(true)
    const args = rpc.mock.calls.at(-1)![1] as { p_age_seconds: number; p_user: string }
    expect(args.p_user).toBe('u1')
    expect(args.p_age_seconds).toBeGreaterThanOrEqual(3600)
    expect(args.p_age_seconds).toBeLessThan(3610)
  })

  it('a browser that keeps nothing sends it at once rather than lose it (round 2, P3)', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError')
    })
    rpc.mockResolvedValueOnce(answer(cur.privacy, cur.terms))
    expect(await acceptLegal('pin')).toBe(true)
    expect(rpc).toHaveBeenCalledWith('accept_legal', sent('pin', 'u1'))
    setItem.mockRestore()
  })

  it('a waiting acceptance this app did not write is dropped, not retried for ever (round 2, P3)', async () => {
    localStorage.setItem(KEY, JSON.stringify({ pending: { uid: 'u1', context: 'pin', versions: cur, at: 'mañana' } }))
    expect(await flushLegal()).toBe(true)
    expect(rpc).not.toHaveBeenCalled()
    expect(localStorage.getItem(KEY)).toBeNull()
  })

  it('without a session there is nothing to record: every caller acts with one', async () => {
    signIn(null)
    expect(await acceptLegal('organizer')).toBe(false)
    expect(rpc).not.toHaveBeenCalled()
    expect(localStorage.getItem(KEY)).toBeNull()
  })

  it('goes only under the user who accepted: another user on the phone drops it (PR 121 verifier, P2)', async () => {
    signIn('anon-A')
    rpc.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await acceptLegal('pin')
    // An anonymous phone signs in to an existing account, or auth-js replaced a dead session: no sign-out in between.
    signIn('someone-else')
    expect(await flushLegal()).toBe(true)
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(localStorage.getItem(KEY)).toBeNull()
  })

  it('a sign-out while it is out keeps nothing of that person', async () => {
    let answerNow: (v: unknown) => void = () => {}
    rpc.mockImplementationOnce(() => new Promise((r) => (answerNow = r)))
    const out = acceptLegal('pin')
    await new Promise((r) => setTimeout(r, 0))
    forgetLegal()
    signIn(null)
    answerNow(answer(cur.privacy, cur.terms))
    await out
    expect(localStorage.getItem(KEY)).toBeNull()
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

  it('a week nobody could send it in is dropped: the next consent point records it again', async () => {
    rpc.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await acceptLegal('account')
    const stored = JSON.parse(localStorage.getItem(KEY)!)
    stored.pending.at -= 8 * 24 * 60 * 60 * 1000
    localStorage.setItem(KEY, JSON.stringify(stored))
    signIn('u1')
    expect(await flushLegal()).toBe(true)
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(localStorage.getItem(KEY)).toBeNull()
  })

  it('signing out forgets it, so it never goes under the next person', async () => {
    rpc.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await acceptLegal('pin')
    forgetLegal()
    signIn('u3')
    expect(await flushLegal()).toBe(true)
    expect(rpc).toHaveBeenCalledTimes(1)
  })

  it('a PIN the server took records it; a refused one does not', async () => {
    rpc.mockImplementation(async (name: string) =>
      name === 'claim_player'
        ? { data: { ok: false, reason: 'wrong_pin', attemptsLeft: 4 }, error: null }
        : answer(cur.privacy, cur.terms),
    )
    await claimPlayer('p1', '0000')
    await new Promise((r) => setTimeout(r, 0))
    await flushLegal()
    expect(rpc.mock.calls.map((c) => c[0])).toEqual(['claim_player'])
    rpc.mockImplementation(async (name: string) =>
      name === 'claim_player' ? { data: { ok: true, playerId: 'p1' }, error: null } : answer(cur.privacy, cur.terms),
    )
    await claimPlayer('p1', '1234')
    await new Promise((r) => setTimeout(r, 0))
    await flushLegal()
    expect(rpc).toHaveBeenCalledWith('accept_legal', sent('pin'))
  })
})

describe('legalUpdate', () => {
  it('says nothing without a session, nor to an anonymous phone that never accepted (asked once)', async () => {
    signIn(null)
    expect(await legalUpdate()).toBeNull()
    signIn('u1')
    rpc.mockResolvedValueOnce(answer(null, null))
    expect(await legalUpdate()).toEqual({ privacy: false, terms: false })
    expect(await legalUpdate()).toEqual({ privacy: false, terms: false })
    expect(rpc).toHaveBeenCalledTimes(1)
  })

  it('a phone that entered with a PIN and has no record (before 0038, or it never got through) is shown both (round 2, P3)', async () => {
    rpc.mockResolvedValue(answer(null, null))
    claim.mockResolvedValueOnce({ data: { player_id: 'p1' }, error: null })
    expect(await legalUpdate()).toEqual({ privacy: true, terms: true, first: true })
  })

  it("an anonymous phone whose claim can't be read is not judged", async () => {
    rpc.mockResolvedValue(answer(null, null))
    claim.mockResolvedValueOnce({ data: null, error: { code: 'PGRST301', message: 'x' } } as never)
    expect(await legalUpdate()).toBeNull()
  })

  it('an account with no record (an email link, or before 0038) is shown both, until it says «Entendido» (PR 121 verifier, P2)', async () => {
    signIn('acc', false)
    rpc.mockResolvedValue(answer(null, null))
    expect(await legalUpdate()).toEqual({ privacy: true, terms: true, first: true })
    expect(await legalUpdate()).toEqual({ privacy: true, terms: true, first: true })
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
    // Another user's waiting acceptance answers nothing for this one.
    signIn('acc2', false)
    rpc.mockResolvedValueOnce(answer('2026-10-01', '2026-10-01'))
    expect((await legalUpdate())?.privacy).toBe(true)
  })

  it('cannot tell without signal or 0038', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: 'PGRST202', message: 'not found' } })
    expect(await legalUpdate()).toBeNull()
    rpc.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    expect(await legalUpdate()).toBeNull()
  })
})
