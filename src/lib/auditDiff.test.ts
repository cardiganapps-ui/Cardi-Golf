import { describe, expect, it } from 'vitest'
import { changedFields, showValue } from './auditDiff'

describe('changedFields', () => {
  it('an update shows only what changed, never the bookkeeping', () => {
    const f = changedFields({
      action: 'UPDATE',
      before: { id: 'x', strokes: 5, putts: 2, updated_at: 'a', reason: null },
      after: { id: 'x', strokes: 4, putts: 2, updated_at: 'b', reason: 'Corrección' },
    })
    expect(f).toEqual([
      { key: 'strokes', before: 5, after: 4 },
      { key: 'reason', before: null, after: 'Corrección' },
    ])
  })
  it('an insert shows the row it added, without empty fields', () => {
    expect(changedFields({ action: 'INSERT', before: null, after: { id: 'x', hole: 3, strokes: null } })).toEqual([{ key: 'hole', before: undefined, after: 3 }])
  })
  it('a delete shows the row it removed', () => {
    expect(changedFields({ action: 'DELETE', before: { name: 'Grupo 1' }, after: null }).map((x) => x.key)).toEqual(['name'])
  })
})

describe('showValue', () => {
  it('keeps one line', () => {
    expect(showValue(null)).toBe('—')
    expect(showValue(true)).toBe('sí')
    expect(showValue({ a: 'x'.repeat(100) }).length).toBeLessThanOrEqual(58)
  })
})
