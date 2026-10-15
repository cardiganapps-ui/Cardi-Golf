import { describe, expect, it } from 'vitest'
import { bearerMatches } from './secret'

describe('bearerMatches (SEC-08)', () => {
  it('takes exactly «Bearer <secret>»', () => {
    expect(bearerMatches('Bearer s3cret', 's3cret')).toBe(true)
  })
  it('refuses anything else, a prefix or a longer value included', () => {
    for (const h of ['Bearer s3cre', 'Bearer s3cret ', 'bearer s3cret', 's3cret', 'Bearer ', '', undefined, ['Bearer s3cret', 'x']]) {
      expect(bearerMatches(h as string | string[] | undefined, 's3cret')).toBe(false)
    }
  })
  it('refuses every header when the secret is not set', () => {
    expect(bearerMatches('Bearer ', '')).toBe(false)
    expect(bearerMatches('Bearer undefined', undefined)).toBe(false)
  })
})
