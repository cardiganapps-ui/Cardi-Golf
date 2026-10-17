/** VIS-25: the printed card adds up each nine and the day, as the app's grid does. */
import { describe, expect, it } from 'vitest'
import { playOrder } from '../../engine/core/playOrder'
import { printColumns } from './printColumns'

const labels = (order: number[]) => printColumns(order).map((c) => c.label)

describe('printColumns (VIS-25)', () => {
  it('from the 1st: 1–9, Ida, 10–18, Vuelta, Total', () => {
    expect(labels(playOrder(1, 18))).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
      '8',
      '9',
      'Ida',
      '10',
      '11',
      '12',
      '13',
      '14',
      '15',
      '16',
      '17',
      '18',
      'Vuelta',
      'Total',
    ])
  })
  it('from the 10th: the back nine first, each nine still with its own subtotal', () => {
    const cols = printColumns(playOrder(10, 18))
    expect(cols.map((c) => c.label).slice(9, 10)).toEqual(['Vuelta'])
    expect(cols.find((c) => c.key === 'front')!.holes).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
    expect(cols.at(-1)!.holes).toHaveLength(18)
  })
  it('a nine-hole day: its holes and the total, no subtotal', () => {
    expect(labels(playOrder(1, 9))).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', 'Total'])
  })
})
