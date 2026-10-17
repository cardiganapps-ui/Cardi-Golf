// @vitest-environment happy-dom
/**
 * ARCH-03: «Tu último torneo» is what this phone kept in localStorage, read on
 * every Home and on every launch of the installed app. A value that doesn't
 * read (another build's, a slug that is no slug) is none, never a link to
 * `/t/undefined`.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { getLastTournament, setLastTournament } from './session'

const KEY = 'cardi-golf:last-tournament'
afterEach(() => localStorage.clear())

describe('the last tournament this phone opened (ARCH-03)', () => {
  it('reads back as it was kept', () => {
    setLastTournament({ slug: 'viaje', name: 'Viaje', at: 5 })
    expect(getLastTournament()).toEqual({ slug: 'viaje', name: 'Viaje', at: 5 })
    setLastTournament({ slug: 'viaje', name: 'Viaje' })
    expect(getLastTournament()).toEqual({ slug: 'viaje', name: 'Viaje' })
  })
  it.each([['not JSON', '{'], ['a word', '"viaje"'], ['no slug', JSON.stringify({ name: 'Viaje' })], ['an empty slug', JSON.stringify({ slug: '', name: 'Viaje' })], ['a time that is no time', JSON.stringify({ slug: 'viaje', name: 'Viaje', at: 'ayer' })]])(
    '%s is none',
    (_what, raw) => {
      localStorage.setItem(KEY, raw)
      expect(getLastTournament()).toBeNull()
    },
  )
})
