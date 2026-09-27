import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SETTINGS,
  FIRST_TOURNAMENT_PLAYER_COUNT,
  FIRST_TOURNAMENT_SETTINGS,
  PrizePoolError,
  assertPrizePool,
  checkPrizePool,
  parseSettings,
  safeParseSettings,
} from './index'

describe('settings schema', () => {
  it('accepts the platform defaults (individual only)', () => {
    expect(parseSettings(DEFAULT_SETTINGS)).toEqual(DEFAULT_SETTINGS)
  })

  it('accepts the first tournament settings', () => {
    expect(parseSettings(FIRST_TOURNAMENT_SETTINGS)).toEqual(FIRST_TOURNAMENT_SETTINGS)
  })

  it('accepts the legacy prizes.matrimonios key as prizes.pairs', () => {
    const { pairs, ...rest } = FIRST_TOURNAMENT_SETTINGS.prizes
    const raw = { ...FIRST_TOURNAMENT_SETTINGS, prizes: { ...rest, matrimonios: pairs } }
    expect(parseSettings(raw).prizes.pairs).toEqual([2000, 1000])
  })

  it('rejects a tier used twice in pairing rules', () => {
    const bad = structuredClone(FIRST_TOURNAMENT_SETTINGS)
    bad.modules.pairs.pairing = [
      ['A', 'D'],
      ['A', 'C'],
    ]
    expect(safeParseSettings(bad).success).toBe(false)
  })

  it('rejects Calcutta payout shares that do not add up to 100%', () => {
    const bad = structuredClone(FIRST_TOURNAMENT_SETTINGS)
    bad.auction.payout = [{ slot: 'place', place: 1, share: 0.5 }]
    expect(safeParseSettings(bad).success).toBe(false)
  })

  it('rejects duplicate tier names', () => {
    const bad = structuredClone(FIRST_TOURNAMENT_SETTINGS)
    bad.tiers = ['A', 'A']
    expect(safeParseSettings(bad).success).toBe(false)
  })
})

describe('prize pool check (§5.8)', () => {
  it('the first tournament balances at $30,000 = 12 × $2,500', () => {
    const check = checkPrizePool(FIRST_TOURNAMENT_SETTINGS, { players: FIRST_TOURNAMENT_PLAYER_COUNT })
    expect(check.entryPot).toBe(30000)
    expect(check.prizesTotal).toBe(30000)
    expect(check.balanced).toBe(true)
    const byModule = Object.fromEntries(check.lines.map((l) => [l.moduleId, l.amount]))
    expect(byModule).toEqual({
      individual: 20000,
      pairs: 3000,
      bestRound: 2400,
      snake: 3600,
      fewestPutts: 1000,
    })
  })

  it('a disabled module contributes nothing to the check', () => {
    const s = structuredClone(FIRST_TOURNAMENT_SETTINGS)
    s.modules.snake.enabled = false
    const check = checkPrizePool(s, { players: 12 })
    expect(check.lines.map((l) => l.moduleId)).not.toContain('snake')
    expect(check.prizesTotal).toBe(26400)
    expect(check.balanced).toBe(false)
    expect(check.difference).toBe(3600)
  })

  it('assertPrizePool throws with the breakdown when unbalanced', () => {
    const s = structuredClone(FIRST_TOURNAMENT_SETTINGS)
    s.prizes.fewestPutts = 900
    expect(() => assertPrizePool(s, { players: 12 })).toThrow(PrizePoolError)
  })

  it('a minimal tournament balances: 8 players, 1 round, individual only', () => {
    const s = structuredClone(DEFAULT_SETTINGS)
    s.entryFee = 500
    s.prizes.stableford = [2500, 1000, 500]
    expect(checkPrizePool(s, { players: 8 }).balanced).toBe(true)
  })
})
