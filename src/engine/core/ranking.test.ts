import { describe, expect, it } from 'vitest'
import { countback, flattenRanks, rankBy, splitPrizes } from './ranking'

const pts = (arr: number[]) => new Map(arr.map((p, i) => [i + 1, p]))

describe('countback', () => {
  it('Day 2 total decides: A 36 vs B 34 → A ahead', () => {
    const a = { pointsByHole: pts(Array(18).fill(2)), holes: 18 }
    const b = { pointsByHole: pts([...Array(16).fill(2), 1, 1]), holes: 18 }
    expect(countback(a, b).result).toBeLessThan(0)
  })
  it('equal total; holes 10–18: A 18 vs B 17 → A ahead', () => {
    const a = { pointsByHole: pts([...Array(9).fill(2), ...Array(9).fill(2)]), holes: 18 } // 36
    const bArr = [...Array(9).fill(2), ...Array(9).fill(2)]
    bArr[0] = 3 // front nine +1
    bArr[17] = 1 // back nine −1 → total still 36, back 17
    const b = { pointsByHole: pts(bArr), holes: 18 }
    const r = countback(a, b)
    expect(r.result).toBeLessThan(0)
    expect(r.steps.map((s) => s.label)).toEqual(['Total', 'Hoyos 10–18'])
  })
  it('equal all the way through hole 18 → tied', () => {
    const a = { pointsByHole: pts(Array(18).fill(2)), holes: 18 }
    const b = { pointsByHole: pts(Array(18).fill(2)), holes: 18 }
    const r = countback(a, b)
    expect(r.result).toBe(0)
    expect(r.steps.map((s) => s.label)).toEqual(['Total', 'Hoyos 10–18', 'Hoyos 13–18', 'Hoyos 16–18', 'Hoyo 18'])
  })
})

describe('rankBy + splitPrizes', () => {
  const items = [
    { id: 'a', v: 70 },
    { id: 'b', v: 70 },
    { id: 'c', v: 65 },
    { id: 'd', v: 60 },
    { id: 'e', v: 60 },
  ]
  const groups = rankBy(items, (x, y) => y.v - x.v, (x, y) => x.id.localeCompare(y.id))

  it('labels ties with T', () => {
    expect(flattenRanks(groups).map((r) => `${r.item.id}:${r.label}`)).toEqual(['a:T1', 'b:T1', 'c:3', 'd:T4', 'e:T4'])
  })

  it('two tied for 1st each get ($10,000 + $5,000) / 2 = $7,500', () => {
    const shares = splitPrizes(groups, [10000, 5000, 3000, 2000], (x) => x.id)
    const by = Object.fromEntries(shares.map((s) => [s.item.id, s.amount]))
    expect(by).toEqual({ a: 7500, b: 7500, c: 3000, d: 1000, e: 1000 })
    expect(shares.reduce((s, x) => s + x.amount, 0)).toBe(20000)
  })

  it('odd splits stay in whole pesos and still add up', () => {
    const g = rankBy([{ id: 'x' }, { id: 'y' }, { id: 'z' }], () => 0)
    const shares = splitPrizes(g, [1000, 500, 1], (x) => x.id)
    expect(shares.map((s) => s.amount)).toEqual([501, 500, 500])
  })
})
