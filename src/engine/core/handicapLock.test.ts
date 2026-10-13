/**
 * UX-28: which handicaps changed after they were fixed, read the way the
 * engine reads a handicap (and the way 0046's handicap_used compares it), so
 * a change undone or a base no rule reads shows nothing.
 */
import { describe, expect, it } from 'vitest'
import { makePlayer, makeSnapshot } from '../testing/fixtures'
import { DEFAULT_SETTINGS } from '../settings/presets'
import { computeTournament } from '../computeTournament'
import { handicapChanges, handicapsLocked, handicapUsed } from './handicapLock'
import type { HandicapInputs, Player } from '../types'
import { hcpFromTo } from '../../i18n/es-MX'

const manual = (baseHcp: number): HandicapInputs => ({ handicapSource: 'manual', baseHcp, handicapIndex: null, estimateInputs: null })
const scores = (a: number, b: number, c: number): Player['estimateInputs'] => [
  { gross: a, rating: null, slope: null, par: null },
  { gross: b, rating: null, slope: null, par: null },
  { gross: c, rating: null, slope: null, par: null },
]

describe('handicapsLocked', () => {
  it('fixed by the Comité, or by the tournament leaving setup', () => {
    expect(handicapsLocked({ status: 'setup', handicapsLockedAt: null })).toBe(false)
    expect(handicapsLocked({ status: 'setup', handicapsLockedAt: '2027-04-08T03:00:00Z' })).toBe(true)
    expect(handicapsLocked({ status: 'auction', handicapsLockedAt: null })).toBe(true)
    // A tournament under way before 0046 has no moment, and is fixed all the same.
    expect(handicapsLocked({ status: 'live' })).toBe(true)
    expect(handicapsLocked({ status: 'finished', handicapsLockedAt: null })).toBe(true)
  })
})

describe('handicapUsed (0046 handicap_used)', () => {
  it('under an index the base is not read; the index with none typed is the base', () => {
    expect(handicapUsed({ handicapSource: 'index', baseHcp: 18, handicapIndex: 12.3, estimateInputs: null })).toBe(handicapUsed({ handicapSource: 'index', baseHcp: 12.3, handicapIndex: 12.3, estimateInputs: null }))
    expect(handicapUsed({ handicapSource: 'index', baseHcp: 18, handicapIndex: null, estimateInputs: null })).toBe(handicapUsed({ handicapSource: 'index', baseHcp: 18, handicapIndex: 18, estimateInputs: null }))
    expect(handicapUsed({ handicapSource: 'index', baseHcp: 18, handicapIndex: 12.3, estimateInputs: null })).not.toBe(handicapUsed({ handicapSource: 'index', baseHcp: 18, handicapIndex: 11, estimateInputs: null }))
  })
  it('an estimate is its three scores; one with none is the base', () => {
    expect(handicapUsed({ handicapSource: 'estimate', baseHcp: 18, handicapIndex: null, estimateInputs: scores(80, 85, 90) })).toBe(handicapUsed({ handicapSource: 'estimate', baseHcp: 9.9, handicapIndex: 3, estimateInputs: scores(80, 85, 90) }))
    expect(handicapUsed({ handicapSource: 'estimate', baseHcp: 18, handicapIndex: null, estimateInputs: scores(80, 85, 90) })).not.toBe(handicapUsed({ handicapSource: 'estimate', baseHcp: 18, handicapIndex: null, estimateInputs: scores(80, 85, 91) }))
    expect(handicapUsed({ handicapSource: 'estimate', baseHcp: 18, handicapIndex: null, estimateInputs: null })).toBe(handicapUsed(manual(18)))
  })
  it('a different source is a different handicap, even on the same number', () => {
    expect(handicapUsed(manual(14))).not.toBe(handicapUsed({ handicapSource: 'index', baseHcp: 14, handicapIndex: 14, estimateInputs: null }))
  })
})

describe('handicapChanges', () => {
  const note = (from: HandicapInputs, ...to: HandicapInputs[]) => ({ from, changes: to.map((x, i) => ({ at: `2027-04-09T1${i}:00:00Z`, reason: `Motivo ${i + 1}`, to: x })) })

  it('a player whose handicap is not what it was when fixed, with every reason', () => {
    const snap = makeSnapshot({ players: [makePlayer(1, { baseHcp: 12, handicapNote: note(manual(14), manual(13), manual(12)) }), makePlayer(2)] })
    const changes = handicapChanges(snap, DEFAULT_SETTINGS)
    expect(changes).toEqual([{ playerId: 'p1', from: { source: 'manual', base: 14 }, to: { source: 'manual', base: 12 }, changes: snap.players[0]!.handicapNote!.changes }])
    expect(hcpFromTo(changes[0]!.from, changes[0]!.to)).toBe('de 14 a 12')
  })

  it('a change undone shows nothing; nor does a player with no record', () => {
    const snap = makeSnapshot({ players: [makePlayer(1, { baseHcp: 14, handicapNote: note(manual(14), manual(12), manual(14)) }), makePlayer(2, { handicapNote: null })] })
    expect(handicapChanges(snap, DEFAULT_SETTINGS)).toEqual([])
  })

  it('reads the handicap as the engine does: an estimate by its scores, an index by its index', () => {
    const est = makePlayer(1, { handicapSource: 'estimate', estimateInputs: scores(98, 105, 115), baseHcp: 31.4, handicapNote: note(manual(20), manual(25)) })
    const idx = makePlayer(2, { handicapSource: 'index', handicapIndex: 8.1, baseHcp: 8.1, handicapNote: note({ handicapSource: 'index', baseHcp: 18, handicapIndex: 8.1, estimateInputs: null }, manual(10)) })
    const changes = handicapChanges(makeSnapshot({ players: [est, idx] }), DEFAULT_SETTINGS)
    // The estimate's scores give 31.4 (§13b-E); the index never moved, whatever its base said.
    expect(changes).toEqual([expect.objectContaining({ playerId: 'p1', from: { source: 'manual', base: 20 }, to: { source: 'estimate', base: 31.4 } })])
    expect(hcpFromTo(changes[0]!.from, changes[0]!.to)).toBe('de 20 (base) a 31.4 (estimado)')
  })

  it('reaches the boards through the engine', () => {
    const snap = makeSnapshot({ players: [makePlayer(1, { baseHcp: 9, handicapNote: note(manual(18), manual(9)) }), makePlayer(2), makePlayer(3), makePlayer(4)] })
    expect(computeTournament(snap, DEFAULT_SETTINGS).flags.handicapChanges.map((c) => c.playerId)).toEqual(['p1'])
  })
})

describe('hcpFromTo', () => {
  it('one word for the source when it did not change, one each side when it did', () => {
    expect(hcpFromTo({ source: 'index', base: 14.2 }, { source: 'index', base: 12.3 })).toBe('de 14.2 a 12.3 (índice)')
    expect(hcpFromTo({ source: 'manual', base: 14 }, { source: 'index', base: 12.3 })).toBe('de 14 (base) a 12.3 (índice)')
    expect(hcpFromTo({ source: 'manual', base: -1 }, { source: 'manual', base: 2 })).toBe('de +1 a 2')
  })
})
