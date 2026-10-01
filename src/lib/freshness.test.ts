/**
 * REL-04: the age of the boards on screen. A two-day-old board read «10:42»,
 * like this morning's, or «hace 2880 min».
 */
import { describe, expect, it } from 'vitest'
import { savedWhen } from './freshness'

// Thursday 8 April 2027, 9:30 p.m. local: Calcutta night.
const now = new Date(2027, 3, 8, 21, 30).getTime()
const at = (d: number, h: number, m = 0) => new Date(2027, 3, d, h, m).getTime()

describe('savedWhen', () => {
  it('seconds ago is «hace un momento»', () => {
    expect(savedWhen(now - 20_000, now)).toBe('hace un momento')
  })
  it('minutes, then hours, scale', () => {
    expect(savedWhen(now - 5 * 60_000, now)).toBe('hace 5 min')
    expect(savedWhen(now - 59 * 60_000, now)).toBe('hace 59 min')
    expect(savedWhen(now - 60 * 60_000, now)).toBe('hace 1 hora')
    expect(savedWhen(now - 2 * 3_600_000, now)).toBe('hace 2 horas')
  })
  it('earlier today says the time; yesterday says «ayer»', () => {
    expect(savedWhen(at(8, 9, 5), now)).toMatch(/^hoy, 9:05/)
    expect(savedWhen(at(7, 18, 40), now)).toMatch(/^ayer, 6:40/)
  })
  it('a board from days ago never reads like today\'s', () => {
    expect(savedWhen(at(6, 10, 42), now)).toBe('hace 2 días')
    expect(savedWhen(at(1, 10, 42), now)).toBe('el 1 de abril')
    expect(savedWhen(now - 2 * 86_400_000, now)).not.toMatch(/min|^hoy|10:42$/)
  })
  it('a board from another year says the year', () => {
    // It read «el 6 de marzo», like this spring's.
    expect(savedWhen(new Date(2026, 2, 6, 10, 0).getTime(), now)).toBe('el 6 de marzo de 2026')
    expect(savedWhen(new Date(2026, 11, 20, 10, 0).getTime(), now)).toBe('el 20 de diciembre de 2026')
  })
  it('a clock a little behind the save is «hace un momento», not a negative age', () => {
    expect(savedWhen(now + 30_000, now)).toBe('hace un momento')
  })
  it('a save the clock puts well in the future says when it was, never «hace un momento»', () => {
    // The phone's clock was set back: how long ago is unknown, the time is not.
    expect(savedWhen(now + 90_000, now)).toMatch(/^hoy, 9:31/)
    expect(savedWhen(at(10, 9, 0), now)).toBe('el 10 de abril')
  })
})
