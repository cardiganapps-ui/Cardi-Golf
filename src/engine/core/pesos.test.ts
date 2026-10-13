/** The engine's peso formatters: whole pesos everywhere, centavos only where a share becomes pesos (MONEY-16). */
import { describe, expect, it } from 'vitest'
import { pesos, pesosCents } from './pesos'

describe('pesos', () => {
  it('whole pesos with thousands commas and a real minus', () => {
    expect([pesos(10000), pesos(0), pesos(-1200), pesos(587.5)]).toEqual(['$10,000', '$0', '−$1,200', '$588'])
  })
  it('centavos only when there are some', () => {
    expect([pesosCents(6462.5), pesosCents(587.5), pesosCents(6600), pesosCents(1615.625), pesosCents(0.05), pesosCents(-0.5)]).toEqual(['$6,462.50', '$587.50', '$6,600', '$1,615.63', '$0.05', '−$0.50'])
  })
})
