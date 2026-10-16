import { describe, expect, it } from 'vitest'
import { formatMoney, formatSignedMoney } from './money'

describe('formatMoney', () => {
  it('formats MXN without decimals', () => {
    expect(formatMoney(2500, 'MXN')).toBe('$2,500')
    expect(formatMoney(30000, 'MXN')).toBe('$30,000')
    expect(formatMoney(0, 'MXN')).toBe('$0')
  })
  it('writes a negative amount with a true minus, never a hyphen', () => {
    expect(formatMoney(-300, 'MXN')).toBe('−$300')
    expect(formatMoney(-12500, 'MXN')).toBe('−$12,500')
  })
  it('formats signed nets', () => {
    expect(formatSignedMoney(1200, 'MXN')).toBe('+$1,200')
    expect(formatSignedMoney(-300, 'MXN')).toBe('−$300')
    expect(formatSignedMoney(0, 'MXN')).toBe('$0')
  })
})
