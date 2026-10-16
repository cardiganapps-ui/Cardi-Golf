import { describe, expect, it } from 'vitest'
import { t } from '../i18n/es-MX'
import { strokeMarks } from './strokeMarks'

describe('stroke marks (MONEY-21)', () => {
  it('a dot per stroke received, a ring per stroke given back, nothing on a hole with neither', () => {
    expect(strokeMarks(2)).toBe('••')
    expect(strokeMarks(-1)).toBe('◦')
    expect(strokeMarks(0)).toBe('')
  })
  it('says them in words', () => {
    expect(t.admin.players.strokesOn(-1)).toBe('Da 1 golpe')
    expect(t.admin.players.strokesOn(-2)).toBe('Da 2 golpes')
    expect(t.admin.players.strokesOn(1)).toBe('1 golpe de ventaja')
  })
})
