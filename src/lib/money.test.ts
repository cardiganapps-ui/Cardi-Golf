import { describe, expect, it } from 'vitest'
import { formatMoney, formatSignedMoney } from './money'

describe('formatMoney', () => {
  it('formats MXN without decimals', () => {
    expect(formatMoney(2500)).toBe('$2,500')
    expect(formatMoney(30000)).toBe('$30,000')
    expect(formatMoney(0)).toBe('$0')
  })
  it('formats signed nets', () => {
    expect(formatSignedMoney(1200)).toBe('+$1,200')
    expect(formatSignedMoney(-300)).toBe('−$300')
    expect(formatSignedMoney(0)).toBe('$0')
  })
})
