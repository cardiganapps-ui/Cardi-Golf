/**
 * «Guardar hoyo»'s decisions, branch by branch (ARCH-14, QA-13): whether a tap saves, which question comes
 * first, who is written, where the card goes after and what an undo puts back. The screen's own tests
 * (ScorecardScreen*.test.tsx) drive the same paths through the real card.
 */
import { describe, expect, it } from 'vitest'
import type { HoleResult } from '../../../engine/core/types'
import { t } from '../../../i18n/es-MX'
import type { Draft } from '../tarjetaDrafts'
import { afterSave, canUndo, decideSave, entryFields, pickWrites, snakeCandidates, undoSnapshot, unusualValues, type SaveCheck } from './saveDecision'
import { DOUBLE_SAVE_MS, SETTLE_MS } from './timing'

const S = t.card
const d = (strokes: number, putts = 2, pickedUp = false): Draft => ({ strokes, putts, pickedUp })
const hole = (o: Partial<HoleResult> = {}): HoleResult => ({ hole: 1, par: 4, strokeIndex: 1, yards: null, strokesReceived: 0, gross: null, net: null, points: 0, putts: null, pickedUp: false, played: false, disputed: false, why: { title: '', steps: [] }, ...o })
/** A tap long after the hole changed and the last save, with nothing to ask. */
const check = (o: Partial<SaveCheck> = {}): SaveCheck => ({
  force: false,
  canEdit: true,
  busy: false,
  saving: false,
  queueRead: true,
  sinceSettled: 10_000,
  sinceLastSave: 10_000,
  allDefaults: false,
  unusual: [],
  needsReason: false,
  reason: '',
  candidates: [],
  answered: false,
  ...o,
})

describe('decideSave: whether a tap saves, and what it asks first', () => {
  it('a hole played normally saves', () => {
    expect(decideSave(check())).toEqual({ kind: 'commit' })
  })

  it('saves nothing on a card that can’t be edited, while busy, while a hole is on its way into storage, or before the queue is read (NEW-11)', () => {
    for (const o of [{ canEdit: false }, { busy: true }, { saving: true }, { queueRead: false }]) {
      expect(decideSave(check(o)), JSON.stringify(o)).toEqual({ kind: 'ignore' })
      // Not even an answer to a question gets past these.
      expect(decideSave(check({ ...o, force: true })), JSON.stringify(o)).toEqual({ kind: 'ignore' })
    }
  })

  it('a second tap inside the settle window is the first tap again (UX-02); an answer to a question is not', () => {
    expect(decideSave(check({ sinceSettled: SETTLE_MS - 1 }))).toEqual({ kind: 'ignore' })
    expect(decideSave(check({ sinceSettled: SETTLE_MS }))).toEqual({ kind: 'commit' })
    expect(decideSave(check({ sinceSettled: 0, force: true }))).toEqual({ kind: 'commit' })
  })

  it('untouched defaults seconds after the last save ask «¿todos par?»; later they save', () => {
    expect(decideSave(check({ allDefaults: true, sinceLastSave: DOUBLE_SAVE_MS - 1 }))).toEqual({ kind: 'confirmDefaults' })
    expect(decideSave(check({ allDefaults: true, sinceLastSave: DOUBLE_SAVE_MS }))).toEqual({ kind: 'commit' })
    // The first save of the card: nothing came before it.
    expect(decideSave(check({ allDefaults: true, sinceLastSave: Infinity }))).toEqual({ kind: 'commit' })
    // «Sí, todos par» is past the question.
    expect(decideSave(check({ allDefaults: true, sinceLastSave: 0, force: true }))).toEqual({ kind: 'commit' })
  })

  it('unusual values ask «¿Seguro?» with their lines, after the defaults question and before everything else', () => {
    const lines = ['Ana: 11 golpes']
    expect(decideSave(check({ unusual: lines }))).toEqual({ kind: 'confirmUnusual', lines })
    expect(decideSave(check({ unusual: lines, allDefaults: true, sinceLastSave: 0 }))).toEqual({ kind: 'confirmDefaults' })
    expect(decideSave(check({ unusual: lines, needsReason: true, candidates: ['a', 'b'] }))).toEqual({ kind: 'confirmUnusual', lines })
    expect(decideSave(check({ unusual: lines, force: true }))).toEqual({ kind: 'commit' })
  })

  it('a Comité correction on a signed card asks its reason until it has three characters, after the values’ questions', () => {
    expect(decideSave(check({ needsReason: true }))).toEqual({ kind: 'askReason' })
    expect(decideSave(check({ needsReason: true, reason: '  ab  ' }))).toEqual({ kind: 'askReason' })
    expect(decideSave(check({ needsReason: true, reason: 'abc' }))).toEqual({ kind: 'commit' })
    // The answer to «¿Seguro?» still needs the reason.
    expect(decideSave(check({ needsReason: true, force: true }))).toEqual({ kind: 'askReason' })
  })

  it('two or more at the snake’s threshold ask «¿Quién embocó al último?», after the reason, unless the group answered', () => {
    expect(decideSave(check({ candidates: ['a'] }))).toEqual({ kind: 'commit' })
    expect(decideSave(check({ candidates: ['a', 'b'] }))).toEqual({ kind: 'askTiebreak', candidates: ['a', 'b'] })
    expect(decideSave(check({ candidates: ['a', 'b'], answered: true }))).toEqual({ kind: 'commit' })
    // The reason first: the question used to open under the reason sheet (PR 81's verifier).
    expect(decideSave(check({ candidates: ['a', 'b'], needsReason: true }))).toEqual({ kind: 'askReason' })
    expect(decideSave(check({ candidates: ['a', 'b'], needsReason: true, reason: 'abc', force: true }))).toEqual({ kind: 'askTiebreak', candidates: ['a', 'b'] })
  })
})

describe('the questions’ inputs', () => {
  it('strokes of 10 or more and putts of 5 or more are unusual, one line each; a pick-up never is', () => {
    const named = [
      { id: 'a', name: 'Ana' },
      { id: 'b', name: 'Beto' },
      { id: 'c', name: 'Caro' },
      { id: 'x', name: 'Sin borrador' },
    ]
    const lines = unusualValues(named, { a: d(10, 5), b: d(9, 4), c: d(14, 6, true) })
    expect(lines).toEqual([`Ana: 10 ${S.strokes.toLowerCase()}`, `Ana: 5 ${S.putts.toLowerCase()}`])
  })

  it('the snake’s candidates are the players at the threshold or over; with the snake off (Infinity) nobody is', () => {
    const drafts = { a: d(5, 3), b: d(6, 4), c: d(4, 2) }
    expect(snakeCandidates(['a', 'b', 'c', 'gone'], drafts, 3)).toEqual(['a', 'b'])
    expect(snakeCandidates(['a', 'b', 'c'], drafts, Infinity)).toEqual([])
  })
})

describe('pickWrites: a save writes what this phone means (REL-05)', () => {
  it('the players touched here and the ones the server has nothing for; never one the other phone saved, untouched', () => {
    const drafts = { a: d(4), b: d(5), c: d(6) }
    const played = (id: string) => id !== 'c'
    expect(pickWrites(['a', 'b', 'c'], drafts, new Set(['a']), played)).toEqual({ a: d(4), c: d(6) })
  })

  it('a player with no draft is nobody’s write', () => {
    expect(pickWrites(['a', 'gone'], { a: d(4) }, new Set(['gone']), () => false)).toEqual({ a: d(4) })
  })
})

describe('afterSave: a correction goes back to where the group is (UX-19); a new hole goes on', () => {
  const order = [1, 2, 3, 4]
  it('a new hole: the next one, and after the last the grid', () => {
    const played = (_id: string, h: number) => h < 2
    expect(afterSave({ order, savedHole: 2, playerIds: ['a', 'b'], played })).toEqual({ correcting: false, backTo: null, target: 2 })
    expect(afterSave({ order, savedHole: 4, playerIds: ['a', 'b'], played: (_id, h) => h !== 4 })).toEqual({ correcting: false, backTo: null, target: null })
  })

  it('a hole the whole group had played: back to the first hole someone still has to play', () => {
    // a played 1–3, b played 1 and 2: hole 2 corrected goes back to 3.
    const played = (id: string, h: number) => (id === 'a' ? h <= 3 : h <= 2)
    expect(afterSave({ order, savedHole: 2, playerIds: ['a', 'b'], played })).toEqual({ correcting: true, backTo: 3, target: 2 })
  })

  it('a group that played every hole: the grid', () => {
    expect(afterSave({ order, savedHole: 2, playerIds: ['a', 'b'], played: () => true })).toEqual({ correcting: true, backTo: null, target: null })
  })

  it('a group that starts on 10 goes back in its own order', () => {
    const tenFirst = [10, 11, 1, 2]
    const played = (_id: string, h: number) => h >= 10
    expect(afterSave({ order: tenFirst, savedHole: 10, playerIds: ['a'], played })).toEqual({ correcting: true, backTo: 1, target: 2 })
  })
})

describe('undoSnapshot and canUndo: what an undo puts back', () => {
  it('a player who had values gets them back; one who had none keeps the draft, and the hole offers «Corregir»', () => {
    const holes: Record<string, HoleResult> = { a: hole({ played: true, gross: 5, putts: 2 }), b: hole() }
    const u = undoSnapshot({ writes: { a: d(4), b: d(6) }, holeOf: (id) => holes[id], fallbackPar: 4, myPlayerId: null })
    expect(u.before).toEqual({ a: d(5, 2), b: d(6) })
    expect(u.wasPlayed).toEqual({ a: true, b: false })
    expect(canUndo(['a', 'b'], u.wasPlayed)).toBe(false)
    expect(canUndo(['a'], u.wasPlayed)).toBe(true)
    expect(canUndo([], u.wasPlayed)).toBe(false)
  })

  it('a pick-up comes back as one, its strokes at par', () => {
    const u = undoSnapshot({ writes: { a: d(5) }, holeOf: () => hole({ played: true, pickedUp: true, gross: null, putts: null }), fallbackPar: 4, myPlayerId: null })
    expect(u.before.a).toEqual({ strokes: 4, putts: 2, pickedUp: true })
  })

  it('celebrates a net birdie or better of this phone’s own player only, never a pick-up', () => {
    const holeOf = () => hole({ par: 4, strokesReceived: 1 })
    expect(undoSnapshot({ writes: { me: d(4) }, holeOf, fallbackPar: 4, myPlayerId: 'me' }).celebrate).toBe(true)
    expect(undoSnapshot({ writes: { other: d(3) }, holeOf, fallbackPar: 4, myPlayerId: 'me' }).celebrate).toBe(false)
    expect(undoSnapshot({ writes: { me: d(5) }, holeOf, fallbackPar: 4, myPlayerId: 'me' }).celebrate).toBe(false)
    expect(undoSnapshot({ writes: { me: d(1, 0, true) }, holeOf, fallbackPar: 4, myPlayerId: 'me' }).celebrate).toBe(false)
  })
})

describe('entryFields: only what differs from the row the phone saw (REL-05)', () => {
  it('a new hole sends every field; a correction only the one changed', () => {
    expect(entryFields({ strokes: 5, putts: 2, picked_up: false }, {})).toEqual({ strokes: 5, putts: 2 })
    expect(entryFields({ strokes: 5, putts: 3, picked_up: false }, { strokes: 5, putts: 2, picked_up: false })).toEqual({ putts: 3 })
  })

  it('a pick-up sends the pick-up and the strokes it clears', () => {
    expect(entryFields({ strokes: null, putts: 2, picked_up: true }, { strokes: 6, putts: 2, picked_up: false })).toEqual({ strokes: null, picked_up: true })
  })
})
