/**
 * UX-04: the review is the prize statement. One line per game that is on,
 * from the same check Comité › Torneo prints, plus what the check leaves out
 * on purpose: the Calcutta's own pot and the games played for nothing.
 */
import { describe, expect, it } from 'vitest'
import { t } from '../../../i18n/es-MX'
import { PRESETS } from '../../../engine/games/presets'
import { checkPrizePool } from '../../../engine/settings/prizeCheck'
import { DEFAULT_SETTINGS } from '../../../engine/settings/presets'
import { reviewGameLines } from './reviewLines'

const W = t.organizer.wizard
const preset = (id: string) => PRESETS.find((p) => p.id === id)!
const lines = (id: string, players?: number) => {
  const p = preset(id)
  const s = p.build()
  return reviewGameLines(s, checkPrizePool(s, { players: players ?? p.players }))
}

describe('the review\'s game lines (UX-04)', () => {
  it('the Calcutta template: every module with its prize, the total, and the Calcutta as a pot of its own', () => {
    const out = lines('calcutta')
    expect(out.map((l) => [l.label, l.value])).toEqual([
      ['Individual', '$20,000'],
      ['Los Matrimonios', '$3,000'],
      ['Mejor ronda', '$2,400'],
      ['La Víbora', '$3,600'],
      ['Menos putts', '$1,000'],
      [W.reviewPrizes, '$30,000'],
      ['La Calcutta', W.reviewOwnPot],
    ])
    expect(out.at(-1)!.detail).toBe(W.reviewAuction(['Campeón 55%', 'Subcampeón 20%', 'Mejor C 10%', 'Mejor D 10%', 'La Cuchara de Palo 5%']))
  })

  it('side pots, direct bets and games for the glory each get a line, and none twice', () => {
    const friends = lines('friends')
    const byKey = new Map(friends.map((l) => [l.key, l]))
    expect(byKey.get('side:skins')!.value).toBe('$1,600')
    expect(byKey.get('side:skins')!.detail).toBe(W.reviewSidePot('8 × $200 = $1,600, se reparte por skin'))
    expect([...byKey.values()].filter((l) => l.value === W.reviewBet).length).toBeGreaterThan(0)
    expect(new Set(friends.map((l) => l.label)).size).toBe(friends.length)
    // «Solo diversión»: no money anywhere, every game still named.
    expect(lines('fun').map((l) => [l.label, l.value])).toEqual([
      ['Individual', W.reviewNoPrize],
      ...preset('fun')
        .build()
        .games.map((g) => [g.label, W.reviewNoPrize]),
    ])
  })

  it('a pool that doesn\'t balance says by how much; a place nobody can take says why', () => {
    const s = structuredClone(DEFAULT_SETTINGS)
    s.entryFee = 100
    s.prizes.stableford = [300, 200, 100]
    const out = reviewGameLines(s, checkPrizePool(s, { players: 2 }))
    expect(out.find((l) => l.key === 'total')!.detail).toBe(t.admin.tournament.notBalanced('$400'))
    expect(out.find((l) => l.key === 'individual')!.warn).toBe('3 lugares con premio y 2 jugadores')
  })

  it('settings that don\'t parse still name what is on', () => {
    const s = preset('calcutta').build()
    expect(reviewGameLines(s, null).map((l) => l.label)).toEqual(['Individual', 'Los Matrimonios', 'Mejor ronda', 'La Víbora', 'Menos putts', 'La Calcutta'])
  })
})
