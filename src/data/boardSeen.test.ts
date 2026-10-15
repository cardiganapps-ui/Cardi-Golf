// @vitest-environment happy-dom
/**
 * MOT-06, MOT-18: what this phone last showed of a tournament's board. It is kept with the phone's copy of the
 * boards and goes with it; a link to watch keeps it in memory, never on the phone (STRAT-05).
 */
import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { forgetSeen, lastSeen, markSeen, readBoard, type SeenBoard } from './boardSeen'
import { clearAllCached, clearCached } from './snapshotCache'

const BOARD: SeenBoard = { round: 'r2', rows: { p1: { place: 1, figure: '61', today: '25' }, p2: { place: 3, figure: '55', today: '' } } }
const keys = () => Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i)!).filter((k) => k.startsWith('cardi-golf:board-seen:'))

afterEach(() => {
  localStorage.clear()
  forgetSeen(null)
})

describe('the last look (MOT-06)', () => {
  it('kept on the phone, per tournament, and read back as it was', () => {
    markSeen('t1', BOARD, true)
    expect(lastSeen('t1', true)).toEqual(BOARD)
    expect(lastSeen('t2', true)).toBeNull()
    expect(keys()).toEqual(['cardi-golf:board-seen:t1'])
  })

  it('a link to watch keeps it for the visit only: nothing on the phone', () => {
    markSeen('t1', BOARD, false)
    expect(lastSeen('t1', false)).toEqual(BOARD)
    expect(keys()).toEqual([])
    expect(lastSeen('t1', true)).toBeNull()
  })

  it('a stored look that no longer reads as one is no look', () => {
    expect(readBoard(BOARD)).toEqual(BOARD)
    for (const bad of [null, 'x', { rows: {} }, { round: 3, rows: {} }, { round: null, rows: [] }, { round: null, rows: { p1: { place: 0, figure: '1', today: '' } } }, { round: null, rows: { p1: { place: 2, figure: 1, today: '' } } }])
      expect(readBoard(bad)).toBeNull()
    localStorage.setItem('cardi-golf:board-seen:t1', '{not json')
    expect(lastSeen('t1', true)).toBeNull()
  })

  it('goes with the phone’s copy of the boards: changing player or a gone tournament forgets its own, signing out every one', async () => {
    markSeen('t1', BOARD, true)
    markSeen('t2', BOARD, true)
    markSeen('t3', BOARD, false)
    localStorage.setItem('cardi-golf:last-tournament', 'x')
    await clearCached('t1')
    expect(keys()).toEqual(['cardi-golf:board-seen:t2'])
    await clearAllCached()
    expect(keys()).toEqual([])
    expect(lastSeen('t3', false)).toBeNull()
    // Nothing else the phone keeps goes with it.
    expect(localStorage.getItem('cardi-golf:last-tournament')).toBe('x')
  })
})
