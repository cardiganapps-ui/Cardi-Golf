// @vitest-environment happy-dom
/**
 * PWA-05, after the verifier: one unreadable kept draft stopped the startup
 * sweep, so expired drafts after it stayed, and the unreadable one stayed
 * forever. It now goes, and the sweep carries on.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DRAFT_PREFIX, DRAFT_TTL_MS, _tarjetaDraftsTest, readKept, sweepKept, writeKept } from './tarjetaDrafts'

const kept = () => Object.keys(localStorage).filter((k) => k.startsWith(DRAFT_PREFIX)).sort()
const at = (ms: number) => JSON.stringify({ at: ms, players: { p1: { draft: { strokes: 5, putts: 2, pickedUp: false }, server: '-' } } })

beforeEach(() => {
  localStorage.clear()
  _tarjetaDraftsTest.resetSweep()
})
afterEach(() => localStorage.clear())

describe('kept Tarjeta drafts', () => {
  it('the sweep drops an unreadable value and the expired ones, and keeps the fresh one and everything else', () => {
    localStorage.setItem(`${DRAFT_PREFIX}a`, '{half-written')
    localStorage.setItem(`${DRAFT_PREFIX}b`, at(Date.now() - DRAFT_TTL_MS - 1000))
    localStorage.setItem(`${DRAFT_PREFIX}c`, at(Date.now()))
    localStorage.setItem('cardi-golf:otra-cosa', 'x')
    sweepKept()
    expect(kept()).toEqual([`${DRAFT_PREFIX}c`])
    expect(localStorage.getItem('cardi-golf:otra-cosa')).toBe('x')
  })

  it('an unreadable value read for its hole is dropped, not kept for ever', () => {
    localStorage.setItem(`${DRAFT_PREFIX}r1|g1|7`, '{half-written')
    expect(readKept('r1|g1|7')).toBeNull()
    expect(kept()).toEqual([])
  })

  it('writes, reads back, and an empty write removes', () => {
    writeKept('r1|g1|7', { p1: { draft: { strokes: 6, putts: 2, pickedUp: false }, server: '-' } })
    expect(readKept('r1|g1|7')?.players.p1?.draft.strokes).toBe(6)
    writeKept('r1|g1|7', {})
    expect(kept()).toEqual([])
  })
})
