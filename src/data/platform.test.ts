import { describe, expect, it } from 'vitest'
import { sameCard, suggestTeeMap, type CourseTee } from './platform'

const tee = (id: string, name: string, pars: number[] = [], sis: number[] = []): CourseTee => ({
  id,
  name,
  color: null,
  rating: 72,
  slope: 113,
  parTotal: 72,
  problems: [],
  inUse: 0,
  holes: Array.from({ length: 18 }, (_, i) => ({ n: i + 1, par: pars[i] ?? 4, si: sis[i] ?? i + 1 })),
})

describe('merging courses: which tee becomes which', () => {
  it('maps a tee to the kept tee with the same card, preferring the same name', () => {
    const keep = [tee('k-white', 'Blancas'), tee('k-blue', 'Azules'), tee('k-red', 'Rojas', [5])]
    const drop = [tee('d-blue', 'azules '), tee('d-red', 'Rojas', [5])]
    expect(suggestTeeMap(drop, keep)).toEqual({ 'd-blue': 'k-blue', 'd-red': 'k-red' })
  })
  it('leaves a tee unmapped when no kept tee scores the same', () => {
    expect(suggestTeeMap([tee('d', 'Azules', [], [2, 1])], [tee('k', 'Azules')])).toEqual({})
  })
  it('two cards score the same only if par and stroke index match on every hole', () => {
    expect(sameCard(tee('a', 'A'), tee('b', 'B'))).toBe(true)
    expect(sameCard(tee('a', 'A'), tee('b', 'B', [5]))).toBe(false)
    expect(sameCard(tee('a', 'A'), tee('b', 'B', [], [2, 1]))).toBe(false)
  })
})
