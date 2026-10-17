/**
 * TRUST-09: deleting one's own account goes the way signing out does: never while this phone holds writes nobody
 * else can send (they would wait for an account that no longer exists), and the phone forgets the person after.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpc = vi.fn(async (_fn: string, _args?: unknown) => ({
  data: {} as unknown,
  error: null as null | { message: string; code: string },
}))
vi.mock('../lib/supabase', () => ({ supabase: () => ({ rpc }) }))
const account = vi.hoisted(() => ({
  unsentReason: vi.fn(async (_a: string): Promise<string | null> => null),
  forgetSignedOut: vi.fn(async () => undefined),
}))
vi.mock('./account', () => account)
const auth = vi.hoisted(() => ({ signOut: vi.fn(async () => true) }))
vi.mock('./auth', () => auth)
vi.mock('./backup', () => ({ downloadText: vi.fn() }))
const { deleteMyAccount, exportFileName } = await import('./myData')

beforeEach(() => {
  rpc.mockClear()
  auth.signOut.mockClear()
  account.forgetSignedOut.mockClear()
})

describe('deleteMyAccount (TRUST-09)', () => {
  it('refused while writes wait: no call goes out, the reason comes back', async () => {
    account.unsentReason.mockResolvedValueOnce('Lo capturado en Ensayo aún no se sube.')
    expect(await deleteMyAccount('ana@polo.test')).toEqual({
      done: false,
      reason: 'Lo capturado en Ensayo aún no se sube.',
    })
    expect(account.unsentReason).toHaveBeenCalledWith('delete')
    expect(rpc).not.toHaveBeenCalled()
  })

  it('deletes with the email typed, then signs this phone out and forgets the person', async () => {
    expect(await deleteMyAccount('ana@polo.test')).toEqual({ done: true })
    expect(rpc).toHaveBeenCalledWith('delete_my_account', { p_confirm: 'ana@polo.test' })
    expect(auth.signOut).toHaveBeenCalledTimes(1)
    expect(account.forgetSignedOut).toHaveBeenCalledTimes(1)
  })

  it('a refusal (the email does not match) signs nobody out', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'El correo no coincide', code: '22023' } })
    await expect(deleteMyAccount('otra@polo.test')).rejects.toThrow('El correo no coincide')
    expect(auth.signOut).not.toHaveBeenCalled()
  })

  it('names the download by the day', () => {
    expect(exportFileName(new Date(2026, 9, 16, 12))).toBe('polo-mis-datos-2026-10-16.json')
  })
})
