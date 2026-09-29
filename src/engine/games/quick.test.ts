import { describe, expect, it } from 'vitest'
import { checkPrizePool } from '../settings/prizeCheck'
import { safeParseSettings } from '../settings/schema'
import { QUICK_GAMES, quickSettings, quickSplit } from './quick'

describe('quickSettings', () => {
  it('is always a valid, balanced one-round tournament at full handicap', () => {
    for (const money of [false, true]) {
      for (const players of [1, 2, 4, 7, 8, 16]) {
        const s = quickSettings({ games: [...QUICK_GAMES], money, entryFee: 300, players })
        const parsed = safeParseSettings(s)
        expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true)
        expect(s.rounds).toBe(1)
        expect(s.handicap.allowance).toBe(1)
        expect(checkPrizePool(parsed.data!, { players }).balanced).toBe(true)
      }
    }
  })

  it('without money: no entry, no prizes, every game for the glory', () => {
    const s = quickSettings({ games: ['skins', 'birdies'], money: false, entryFee: 500, players: 4 })
    expect(s.entryFee).toBe(0)
    expect(s.prizes.stableford).toEqual([])
    expect(s.games.map((g) => g.money.source)).toEqual(['none', 'none'])
  })

  it('with money: 4 players at $300 → a $1,200 pot split 70/30; games keep their stakes', () => {
    const s = quickSettings({ games: ['skins'], money: true, entryFee: 300, players: 4 })
    expect(s.entryFee).toBe(300)
    expect(s.prizes).toMatchObject({ stableford: [70, 30], stablefordMode: 'percent' })
    expect(s.games[0]!.money.source).toBe('side')
  })

  it('splits by field size', () => {
    expect(quickSplit(2)).toEqual([100])
    expect(quickSplit(5)).toEqual([70, 30])
    expect(quickSplit(12)).toEqual([50, 30, 20])
  })
})
