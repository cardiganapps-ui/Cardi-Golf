import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from './presets'
import { moneyInPlay } from './moneyInPlay'

describe('moneyInPlay (TRUST-13)', () => {
  it('an entry fee, the Calcutta or a side pot is money; none of them is not', () => {
    const none = { ...DEFAULT_SETTINGS, entryFee: 0, modules: { ...DEFAULT_SETTINGS.modules, auction: { ...DEFAULT_SETTINGS.modules.auction, enabled: false } }, games: [] }
    expect(moneyInPlay(none)).toBe(false)
    expect(moneyInPlay({ ...none, entryFee: 500 })).toBe(true)
    expect(moneyInPlay({ ...none, modules: { ...none.modules, auction: { ...none.modules.auction, enabled: true } } })).toBe(true)
  })
})
