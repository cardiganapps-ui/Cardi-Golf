/**
 * The open hole's drafts and the card's rules, as pure functions (ARCH-14): what a hole opens on, what comes
 * back of a half-entered hole (PWA-05, NEW-11), what another phone's save changes (REL-05), who may change what
 * (§7) and the words of the sync line (REL-16, REL-17, REL-21).
 */
import { describe, expect, it } from 'vitest'
import type { HoleResult } from '../../../engine/core/types'
import { t } from '../../../i18n/es-MX'
import type { Draft, KeptDraft } from '../tarjetaDrafts'
import { cardRules, groupPairs, pairNameIn } from './cardRules'
import { cardNameIn, isUntouched, keptPlayers, openingDraft, parseDrafts, restoreKept, savedDraft, serverValue, takeServerValues } from './holeEntry'
import { syncWords } from './syncWords'

const d = (strokes: number, putts = 2, pickedUp = false): Draft => ({ strokes, putts, pickedUp })
const hole = (o: Partial<HoleResult> = {}): HoleResult => ({ hole: 1, par: 4, strokeIndex: 1, yards: null, strokesReceived: 0, gross: null, net: null, points: 0, putts: null, pickedUp: false, played: false, disputed: false, why: { title: '', steps: [] }, ...o })

describe('what a hole opens on', () => {
  it('the saved values, else par for the player’s own tee and 2 putts', () => {
    expect(openingDraft(hole({ played: true, gross: 6, putts: 3 }))).toEqual(d(6, 3))
    expect(openingDraft(hole({ par: 5 }))).toEqual(d(5))
    expect(openingDraft(undefined)).toEqual(d(4))
    // A pick-up with no strokes opens at par; putts never entered at 2.
    expect(savedDraft(hole({ played: true, pickedUp: true, gross: null, putts: null }))).toEqual(d(4, 2, true))
    expect(savedDraft(hole())).toBeNull()
  })

  it('the server’s value as the kept draft compares it', () => {
    expect(serverValue(undefined)).toBe('-')
    expect(serverValue(hole())).toBe('-')
    expect(serverValue(hole({ played: true, gross: 5, putts: 2 }))).toBe('5:2:false')
  })

  it('the quiet badge: untouched defaults on a hole the player hasn’t played', () => {
    expect(isUntouched(hole(), d(4), d(4))).toBe(true)
    expect(isUntouched(hole(), d(4), d(5))).toBe(false)
    expect(isUntouched(hole({ played: true, gross: 4 }), d(4), d(4))).toBe(false)
    expect(isUntouched(hole(), undefined, d(4))).toBe(false)
  })

  it('the drafts kept as JSON read back, and an unreadable value reads as none', () => {
    expect(parseDrafts(JSON.stringify({ a: d(4) }))).toEqual({ a: d(4) })
    expect(parseDrafts('')).toEqual({})
    expect(parseDrafts('null')).toEqual({})
    expect(parseDrafts('{')).toEqual({})
  })

  it('two players with the same short name are told apart by their full names (A11Y-01)', () => {
    const players = [
      { id: 'a', displayName: 'Diego', fullName: 'Diego Arámburu' },
      { id: 'b', displayName: 'Diego', fullName: 'Diego Ortiz' },
      { id: 'c', displayName: 'René', fullName: 'René Nosti' },
    ]
    const name = cardNameIn(players)
    expect(players.map(name)).toEqual(['Diego Arámburu', 'Diego Ortiz', 'René'])
  })
})

describe('what comes back of a half-entered hole (PWA-05)', () => {
  const kept: KeptDraft = { at: 0, players: { a: { draft: d(7), server: '-' }, b: { draft: d(3), server: '-' }, c: { draft: d(5), server: '-' } } }
  const serverOf = (id: string) => (id === 'b' ? '4:2:false' : '-')

  it('a player whose server value is what it was when typed; never one the server moved on from, nor one the card can’t edit', () => {
    const r = restoreKept({ playerIds: ['a', 'b', 'c'], kept, editable: (id) => id !== 'c', serverOf, queueRead: true })
    expect(Object.keys(r.restore)).toEqual(['a'])
    expect(r.held).toEqual({})
  })

  it('before the phone’s queue is read, one the server moved on from is held, not dropped (NEW-11)', () => {
    const r = restoreKept({ playerIds: ['a', 'b', 'c'], kept, editable: () => true, serverOf, queueRead: false })
    expect(Object.keys(r.restore)).toEqual(['a', 'c'])
    expect(Object.keys(r.held)).toEqual(['b'])
  })

  it('nothing kept, nothing back', () => {
    expect(restoreKept({ playerIds: ['a'], kept: null, editable: () => true, serverOf, queueRead: true })).toEqual({ restore: {}, held: {} })
  })

  it('what the phone keeps: the players touched here with their first server value, and the held ones not touched since', () => {
    const keep = keptPlayers({ held: { b: { draft: d(3), server: 'x' }, c: { draft: d(9), server: 'y' } }, touched: new Set(['a', 'c', 'gone']), drafts: { a: d(6), c: d(8) }, baselines: new Map([['a', '-']]), serverOf: () => 'now' })
    expect(keep).toEqual({ b: { draft: d(3), server: 'x' }, a: { draft: d(6), server: '-' }, c: { draft: d(8), server: 'now' } })
  })
})

describe('another phone saves the hole on screen (REL-05)', () => {
  const holes: Record<string, HoleResult> = { a: hole({ played: true, gross: 6, putts: 2 }), b: hole({ played: true, gross: 3, putts: 1 }), c: hole() }
  const holeOf = (id: string) => holes[id]

  it('its values go into every player nobody here touched; what was typed here stays', () => {
    const r = takeServerValues({ playerIds: ['a', 'b', 'c'], drafts: { a: d(4), b: d(5), c: d(4) }, initial: { a: d(4), b: d(4), c: d(4) }, touched: new Set(['b']), holeOf })
    expect(r?.drafts).toEqual({ a: d(6), b: d(5), c: d(4) })
    expect(r?.initial).toEqual({ a: d(6), b: d(4), c: d(4) })
  })

  it('nothing on screen changes: null', () => {
    expect(takeServerValues({ playerIds: ['a', 'c'], drafts: { a: d(6), c: d(4) }, initial: {}, touched: new Set(), holeOf })).toBeNull()
  })

  it('a player the Comité put in the group while the hole was open gets what a new hole gives him', () => {
    const r = takeServerValues({ playerIds: ['a', 'c'], drafts: { a: d(6) }, initial: { a: d(6) }, touched: new Set(), holeOf })
    expect(r?.drafts).toEqual({ a: d(6), c: d(4) })
    expect(r?.initial.c).toEqual(d(4))
  })
})

describe('cardRules: who may change what (§7)', () => {
  const snapshot = {
    pairs: [
      { id: 'p1', name: null, player1Id: 'a', player2Id: 'b', kind: null, pickedByHonoree: false, drawnAt: null },
      { id: 'p2', name: 'Los del 10', player1Id: 'c', player2Id: 'd', kind: null, pickedByHonoree: false, drawnAt: null },
    ],
    cardSignatures: [{ roundId: 'r1', pairId: 'p1', signedBy: 'c', signedAt: '' }],
  }
  const live = { id: 'r1', status: 'live' as const }

  it('a player: a signed card locks the whole card on a live day', () => {
    const r = cardRules({ snapshot, round: live, playerIds: ['a', 'b', 'c', 'd'], isComite: false })
    expect(r.signed('a')).toBe(true)
    expect(r.signed('c')).toBe(false)
    expect(r.anySigned).toBe(true)
    expect(r.canEdit).toBe(false)
    expect(r.editableFor('c')).toBe(false)
    expect(r.lockedFor('a')).toBe(true)
    expect(r.needsReason).toBe(false)
  })

  it('a player on a live day with nothing signed edits everyone; a closed day nobody', () => {
    const r = cardRules({ snapshot, round: live, playerIds: ['c', 'd'], isComite: false })
    expect(r.canEdit).toBe(true)
    expect(r.correctsOnServer(['c'])).toBe(false)
    expect(cardRules({ snapshot, round: { id: 'r1', status: 'finished' }, playerIds: ['c', 'd'], isComite: false }).canEdit).toBe(false)
  })

  it('the Comité edits a signed card with a reason, and corrects on the server what a phone may not write (REL-09, REL-22)', () => {
    const r = cardRules({ snapshot, round: live, playerIds: ['a', 'b', 'c', 'd'], isComite: true })
    expect(r.canEdit).toBe(true)
    expect(r.editableFor('a')).toBe(true)
    expect(r.lockedFor('a')).toBe(false)
    expect(r.needsReason).toBe(true)
    expect(r.correctsOnServer(['c'])).toBe(false)
    expect(r.correctsOnServer(['c', 'a'])).toBe(true)
    const closed = cardRules({ snapshot, round: { id: 'r1', status: 'finished' }, playerIds: ['c', 'd'], isComite: true })
    expect(closed.needsReason).toBe(false)
    expect(closed.correctsOnServer(['c'])).toBe(true)
  })

  it('the pairs: mine, the one whose card I keep, and their names', () => {
    expect(groupPairs(snapshot.pairs, ['a', 'b', 'c', 'd'], 'a')).toMatchObject({ myPair: { id: 'p1' }, rivalPair: { id: 'p2' } })
    expect(groupPairs(snapshot.pairs, ['a', 'b', 'c', 'd'], null)).toMatchObject({ myPair: null, rivalPair: null })
    expect(groupPairs(snapshot.pairs, ['a', 'b'], 'a').inGroup.map((p) => p.id)).toEqual(['p1'])
    const name = pairNameIn([
      { id: 'a', displayName: 'Ana' },
      { id: 'b', displayName: 'Beto' },
    ])
    expect(name(snapshot.pairs[0]!)).toBe(t.common.andList(['Ana', 'Beto']))
    expect(name(snapshot.pairs[1]!)).toBe('Los del 10')
  })
})

describe('the sync line’s words', () => {
  const base = { pending: 0, pendingHoles: 0, heldHoles: 0, lastError: null, rejected: 0, signedOut: false, online: true, storedSession: true }
  it('nothing waiting: «Sincronizado», not in the caution color', () => {
    expect(syncWords(base)).toEqual({ text: t.sync.synced, warn: false, short: null })
  })
  it('holes, not rows (REL-17); holes saved after the session went need the PIN (REL-16)', () => {
    expect(syncWords({ ...base, pending: 3, pendingHoles: 2 }).text).toBe(t.sync.pendingHoles(2))
    expect(syncWords({ ...base, pending: 1 }).text).toBe(t.sync.pending(1))
    expect(syncWords({ ...base, pending: 1, pendingHoles: 1, heldHoles: 1, signedOut: true, storedSession: false }).text).toBe(t.sync.heldForPinShort(1))
    expect(syncWords({ ...base, pending: 1, pendingHoles: 1, heldHoles: 1, signedOut: true, storedSession: true }).text).toBe(t.sync.pendingHoles(1))
  })
  it('the last error only with signal (REL-21); refused holes before everything', () => {
    expect(syncWords({ ...base, lastError: 'Falló' })).toMatchObject({ text: 'Falló', warn: true })
    expect(syncWords({ ...base, lastError: 'Falló', online: false })).toMatchObject({ text: t.sync.synced, warn: false })
    expect(syncWords({ ...base, rejected: 2, lastError: 'Falló' })).toEqual({ text: t.sync.rejected(2), warn: true, short: t.sync.rejected(2) })
  })
})
