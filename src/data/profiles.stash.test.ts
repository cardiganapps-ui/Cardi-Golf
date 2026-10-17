// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { redeemStashedToken, stashedNameHint } from './profiles'

// ARCH-03: the link token's stash is what this tab kept across a sign-in. One that doesn't read (another build's, a
// value typed over it) is none: the sign-in goes on without it, instead of throwing out of JSON.parse.
describe('the link token kept across a sign-in (ARCH-03)', () => {
  const KEY = 'cardi-golf:link-token'
  it('a stash that does not read is none', async () => {
    for (const bad of ['{', '"x"', JSON.stringify({ token: 7, exp: 'mañana', hint: null }), JSON.stringify({ token: 't', exp: 1, hint: { displayName: 3 } })]) {
      sessionStorage.setItem(KEY, bad)
      expect(stashedNameHint()).toBeNull()
      await expect(redeemStashedToken()).resolves.toBeNull()
      expect(sessionStorage.getItem(KEY)).toBeNull()
    }
  })
  it('one that reads gives its names, and an expired token says so without asking the server', async () => {
    sessionStorage.setItem(KEY, JSON.stringify({ token: 't', exp: 1, hint: { displayName: 'Ana', fullName: null } }))
    expect(stashedNameHint()).toEqual({ displayName: 'Ana', fullName: null })
    await expect(redeemStashedToken()).resolves.toEqual({ ok: false, reason: 'expired' })
  })
})
