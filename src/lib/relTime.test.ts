import { describe, expect, it } from 'vitest'
import { relTime } from './relTime'

const NOW = Date.parse('2026-09-29T18:00:00Z')
const ago = (s: number) => new Date(NOW - s * 1000).toISOString()

describe('relTime', () => {
  it('rounds to the largest sensible unit', () => {
    expect(relTime(ago(10), NOW)).toBe('ahora')
    expect(relTime(ago(5 * 60), NOW)).toBe('hace 5 minutos')
    expect(relTime(ago(3 * 3600), NOW)).toBe('hace 3 horas')
    expect(relTime(ago(26 * 3600), NOW)).toBe('ayer')
    expect(relTime(ago(15 * 86400), NOW)).toBe('hace 2 semanas')
    expect(relTime(ago(90 * 86400), NOW)).toBe('hace 3 meses')
  })
})
