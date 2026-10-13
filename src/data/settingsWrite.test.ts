/**
 * ARCH-13: what a Comité screen sends to update_settings (0043), and how its
 * draft goes over the row after a refusal. The server's side is pinned by
 * cases/serverRules.json; these are the client's halves.
 */
import { describe, expect, it } from 'vitest'
import { getFixture } from '../dev/fixtures'
import { DEFAULT_SETTINGS } from '../engine/settings/presets'
import { parseSettings, type TournamentSettings } from '../engine/settings/schema'
import { changedKeys, mergeOver, sameJson, settingsWrite } from './settingsWrite'

const fx = getFixture('friends8')!
const raw = fx.snapshot.tournament.settings as Record<string, unknown>
const parsed = parseSettings(raw)
const edit = (fn: (s: TournamentSettings) => void) => {
  const s = structuredClone(parsed)
  fn(s)
  return s
}

describe('values compare by content, as jsonb does', () => {
  it('an object’s key order and its undefined members never make a difference; a list’s order does', () => {
    expect(sameJson({ a: 1, b: { c: [1, 2], d: null } }, { b: { d: null, c: [1, 2] }, a: 1, e: undefined })).toBe(true)
    expect(sameJson([1, 2], [2, 1])).toBe(false)
    expect(sameJson(undefined, null)).toBe(true)
    expect(changedKeys({ a: 1, b: { x: 1, y: 2 } }, { b: { y: 2, x: 1 }, a: 2, c: 3 })).toEqual(['a', 'c'])
  })
})

describe('settingsWrite', () => {
  it('writes only the keys changed, each seen as the row held it', () => {
    const after = edit((s) => (s.labels.lastPlace = 'La Cuchara de Palo'))
    const w = settingsWrite(raw, parsed, after, { whole: false, readAll: false })
    expect(Object.keys(w.set)).toEqual(['labels'])
    expect(w.set.labels).toEqual(after.labels)
    expect(w.seen).toEqual({ labels: raw.labels })
  })

  it('a screen that read every key says what it saw of each; a key the row leaves to its default is seen as absent, never as the default', () => {
    const { houseCut: _cut, ...row } = raw
    const before = parseSettings(row)
    expect(before.houseCut).toBe(0)
    const after = { ...before, entryFee: before.entryFee + 100 }
    const w = settingsWrite(row, before, after, { whole: false, readAll: true })
    expect(Object.keys(w.set)).toEqual(['entryFee'])
    expect(new Set(Object.keys(w.seen))).toEqual(new Set(Object.keys(before)))
    for (const k of Object.keys(row)) expect(w.seen[k]).toEqual(row[k])
    expect(w.seen.houseCut).toBeNull()
  })

  it('a key taken out is written as null, which removes it', () => {
    const before = { ...parsed, expectedPlayers: 8 }
    const w = settingsWrite({ ...raw, expectedPlayers: 8 }, before, parsed, { whole: false, readAll: false })
    expect(w).toEqual({ seen: { expectedPlayers: 8 }, set: { expectedPlayers: null } })
  })

  it('a row that did not parse is written whole, so it parses again', () => {
    const after = { ...DEFAULT_SETTINGS, entryFee: 700 }
    const w = settingsWrite({ prizes: 'roto' }, DEFAULT_SETTINGS, after, { whole: true, readAll: true })
    expect(parseSettings(w.set)).toEqual(parseSettings(after))
    expect(w.seen.prizes).toBe('roto')
    expect(w.seen.entryFee).toBeNull()
  })

  it('nothing changed, nothing written', () => {
    expect(settingsWrite(raw, parsed, structuredClone(parsed), { whole: false, readAll: false })).toEqual({ seen: {}, set: {} })
  })
})

describe('mergeOver: the draft over the row after a refusal', () => {
  const before = { a: 1, b: 1, c: 1, d: 1 }

  it('keeps what only the screen changed, takes the rest from the row, and says where both changed it', () => {
    const mine = { a: 2, b: 1, c: 5, d: 7 }
    const now = { a: 1, b: 3, c: 6, d: 7 }
    expect(mergeOver(before, mine, now)).toEqual({ merged: { a: 2, b: 3, c: 6, d: 7 }, lost: ['c'] })
  })

  it('a key the row took out stays out, unless only the screen changed it', () => {
    expect(mergeOver(before, { ...before }, { a: 1, b: 1, c: 1 })).toEqual({ merged: { a: 1, b: 1, c: 1 }, lost: [] })
    expect(mergeOver(before, { ...before, d: 9 }, { a: 1, b: 1, c: 1 })).toEqual({ merged: { a: 1, b: 1, c: 1 }, lost: ['d'] })
  })

  it('on real settings: a label typed here over games changed elsewhere', () => {
    const mine = edit((s) => (s.labels.lastPlace = 'La Cuchara de Palo'))
    const now = edit((s) => (s.games[0]!.label = 'Skins de la tarde'))
    const { merged, lost } = mergeOver(parsed, mine, now)
    expect(lost).toEqual([])
    expect(merged.labels.lastPlace).toBe('La Cuchara de Palo')
    expect(merged.games[0]!.label).toBe('Skins de la tarde')
    expect(changedKeys(now, merged)).toEqual(['labels'])
  })
})
