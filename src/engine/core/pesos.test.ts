/**
 * Pesos as every explanation writes them (MONEY-16): whole everywhere, centavos only where a share becomes pesos.
 * The engine formats no money since ARCH-05 (its amounts are figures, `core/pesos.ts` is gone): one renderer
 * writes them, `explain`'s `amount` and the Calcutta's share step, in the tournament's currency.
 */
import { describe, expect, it } from 'vitest'
import { msg } from '../messages'
import { words } from '../testing/words'

const pesos = (amount: number) => words(msg('amount', { amount }))
/** The step where a slot's share becomes pesos, which keeps its centavos. */
const cents = (raw: number) => words(msg('auction.shareOf', { share: 1, pot: 0, raw })).split(' = ')[1]

describe('pesos', () => {
  it('whole pesos with thousands commas and a real minus', () => {
    expect([pesos(10000), pesos(0), pesos(-1200), pesos(587.5)]).toEqual(['$10,000', '$0', '−$1,200', '$588'])
  })
  it('centavos only when there are some', () => {
    expect([cents(6462.5), cents(587.5), cents(6600), cents(1615.625), cents(0.05), cents(-0.5)]).toEqual(['$6,462.50', '$587.50', '$6,600', '$1,615.63', '$0.05', '−$0.50'])
  })
})
