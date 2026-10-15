/**
 * UX-23: who signs a card. A tournament stored before the setting reads as it
 * always behaved (the pairs with the pairs game on, nobody without), so its
 * unsigned cards and its close gate stay as they were; `marker` asks for one
 * signature per player per day; `none` asks for none.
 */
import { describe, expect, it } from 'vitest'
import { closeCheck } from '../close'
import { computeTournament } from '../computeTournament'
import { DEFAULT_SETTINGS, FIRST_TOURNAMENT_SETTINGS } from '../settings/presets'
import { parseSettings, type TournamentSettings } from '../settings/schema'
import { settingsSense } from '../settings/sense'
import { fillRound, makeFirstTournament, makeGroup, makePlayer, makeRound, makeSnapshot } from '../testing/fixtures'
import type { Snapshot } from '../types'
import { quickSettings } from '../games/quick'
import { cardSignedFor, cardSigningMode, cardSigningModeOf, newTournamentCardSigning, signatureCard } from './cardSigning'

const withPairs = (on: boolean, cardSigning?: TournamentSettings['cardSigning']): TournamentSettings => ({
  ...DEFAULT_SETTINGS,
  modules: { ...DEFAULT_SETTINGS.modules, pairs: { ...DEFAULT_SETTINGS.modules.pairs, enabled: on } },
  ...(cardSigning && { cardSigning }),
})

/** Four players, one group, day 1 played by everyone and finished. */
function foursome(settings: TournamentSettings): Snapshot {
  const players = Array.from({ length: 4 }, (_, i) => makePlayer(i + 1))
  const snap = makeSnapshot({ players, rounds: [makeRound(1, { status: 'finished' })], settings })
  snap.groups = [makeGroup('r1', 1, ['p1', 'p2', 'p3', 'p4'])]
  fillRound(snap, 'r1', 3)
  snap.scores.forEach((s) => (s.putts = Math.min(2, s.strokes ?? 2)))
  return snap
}

describe('the rule a tournament signs by', () => {
  it('reads a tournament stored without the key as before: the pairs with the pairs game, nobody without', () => {
    expect(cardSigningMode(withPairs(true))).toBe('pairs')
    expect(cardSigningMode(withPairs(false))).toBe('none')
    expect(cardSigningMode(FIRST_TOURNAMENT_SETTINGS)).toBe('pairs')
    expect(cardSigningMode(DEFAULT_SETTINGS)).toBe('none')
  })

  it('reads marker and none as set, and the pairs only with their game', () => {
    expect(cardSigningMode(withPairs(false, 'marker'))).toBe('marker')
    expect(cardSigningMode(withPairs(true, 'marker'))).toBe('marker')
    expect(cardSigningMode(withPairs(true, 'none'))).toBe('none')
    expect(cardSigningMode(withPairs(true, 'pairs'))).toBe('pairs')
    expect(cardSigningMode(withPairs(false, 'pairs'))).toBe('none')
  })

  it('parses a stored value a later build adds as no key, never failing the whole settings', () => {
    const raw = { ...structuredClone(FIRST_TOURNAMENT_SETTINGS), cardSigning: 'witness' }
    const parsed = parseSettings(raw)
    expect(parsed.cardSigning).toBeUndefined()
    expect(cardSigningMode(parsed)).toBe('pairs')
    expect(parseSettings({ ...structuredClone(DEFAULT_SETTINGS), cardSigning: 'marker' }).cardSigning).toBe('marker')
  })

  it('reads stored settings the same way 0054 `card_signing_mode` does (the cases card_signing.sql holds it to)', () => {
    const cases: Array<[unknown, string]> = [
      [null, 'none'],
      [{}, 'none'],
      [{ modules: { pairs: { enabled: true } } }, 'pairs'],
      [{ modules: { pairs: { enabled: false } } }, 'none'],
      [{ cardSigning: 'marker', modules: { pairs: { enabled: true } } }, 'marker'],
      [{ cardSigning: 'none', modules: { pairs: { enabled: true } } }, 'none'],
      [{ cardSigning: 'pairs' }, 'none'],
      [{ cardSigning: 'pairs', modules: { pairs: { enabled: true } } }, 'pairs'],
      [{ cardSigning: 'someday', modules: { pairs: { enabled: true } } }, 'pairs'],
    ]
    for (const [raw, mode] of cases) expect(cardSigningModeOf(raw), JSON.stringify(raw)).toBe(mode)
    // And the parsed settings agree with the raw ones.
    for (const s of [withPairs(true), withPairs(false), withPairs(false, 'marker'), withPairs(true, 'none'), withPairs(false, 'pairs')]) expect(cardSigningMode(s)).toBe(cardSigningModeOf(s))
  })

  it('creates a tournament with a rule of its own: the pairs with the pairs game, a marker without; a Ronda rápida signs nothing', () => {
    expect(newTournamentCardSigning(withPairs(true))).toBe('pairs')
    expect(newTournamentCardSigning(withPairs(false))).toBe('marker')
    const quick = quickSettings({ games: [], money: false, entryFee: 0, players: 4 })
    expect(quick.cardSigning).toBe('none')
    expect(cardSigningMode(quick)).toBe('none')
  })

  it('names the pairs rule without the pairs game as something to fix before saving', () => {
    expect(settingsSense(withPairs(false, 'pairs'), null).map((x) => x.key)).toEqual(['signingPairs'])
    expect(settingsSense(withPairs(true, 'pairs'), null)).toEqual([])
    expect(settingsSense(withPairs(false, 'marker'), null)).toEqual([])
    expect(settingsSense(withPairs(false), null)).toEqual([])
  })
})

describe('whose card a signature signs', () => {
  const snap = makeFirstTournament()
  it('a pair covers both its players; a player only himself; neither another day', () => {
    snap.cardSignatures = [
      { roundId: 'r1', pairId: 'pair1', signedBy: 'p4', signedAt: '' },
      { roundId: 'r1', pairId: null, playerId: 'p2', signedBy: 'p5', signedAt: '' },
    ]
    expect(cardSignedFor(snap, 'r1', 'p1')).toBe(true)
    expect(cardSignedFor(snap, 'r1', 'p10')).toBe(true)
    expect(cardSignedFor(snap, 'r1', 'p2')).toBe(true)
    expect(cardSignedFor(snap, 'r1', 'p11')).toBe(false)
    expect(cardSignedFor(snap, 'r2', 'p1')).toBe(false)
    expect(snap.cardSignatures.map(signatureCard)).toEqual(['pair1', 'p2'])
  })
})

describe('unsigned cards and the close gate, by rule', () => {
  it('a marker: one card per player complete and unsigned; a signature takes his off', () => {
    const snap = foursome(withPairs(false, 'marker'))
    const st = computeTournament(snap, withPairs(false, 'marker'))
    expect(st.flags.unsignedCards).toEqual(['p1', 'p2', 'p3', 'p4'].map((playerId) => ({ roundId: 'r1', playerId })))
    snap.cardSignatures = [{ roundId: 'r1', pairId: null, playerId: 'p2', signedBy: 'p1', signedAt: '' }]
    expect(computeTournament(snap, withPairs(false, 'marker')).flags.unsignedCards.map((u) => ('playerId' in u ? u.playerId : u.pairId))).toEqual(['p1', 'p3', 'p4'])
  })

  it('a marker: a card not complete is not waiting for a signature', () => {
    const snap = foursome(withPairs(false, 'marker'))
    snap.scores = snap.scores.filter((s) => !(s.playerId === 'p3' && s.hole === 18))
    expect(computeTournament(snap, withPairs(false, 'marker')).flags.unsignedCards.map((u) => ('playerId' in u ? u.playerId : ''))).toEqual(['p1', 'p2', 'p4'])
  })

  it('a marker: the close waits for every card of a finished day, and lets go once they are signed', () => {
    const settings = withPairs(false, 'marker')
    const snap = foursome(settings)
    const before = closeCheck(snap, settings, { openRejected: 0 })
    expect(before.blockers.map((b) => b.kind)).toEqual(['unsignedCards'])
    expect(before.blockers[0]!.text).toContain('4 tarjetas sin firmar')
    snap.cardSignatures = ['p1', 'p2', 'p3', 'p4'].map((p, i) => ({ roundId: 'r1', pairId: null, playerId: p, signedBy: `p${((i + 1) % 4) + 1}`, signedAt: '' }))
    expect(closeCheck(snap, settings, { openRejected: 0 }).ok).toBe(true)
  })

  it('none: nothing waits for a signature, and the close does not ask for one', () => {
    for (const settings of [withPairs(false, 'none'), withPairs(false), withPairs(true, 'none')]) {
      const snap = foursome(settings)
      expect(computeTournament(snap, settings).flags.unsignedCards).toEqual([])
      expect(closeCheck(snap, settings, { openRejected: 0 }).ok).toBe(true)
    }
  })

  it('a tournament stored without the key, pairs game on: the pairs’ cards, exactly as before', () => {
    const snap = makeFirstTournament()
    fillRound(snap, 'r1', 1)
    snap.rounds[0]!.status = 'finished'
    const stored = structuredClone(FIRST_TOURNAMENT_SETTINGS)
    expect(stored.cardSigning).toBeUndefined()
    const flags = computeTournament(snap, stored).flags.unsignedCards
    expect(flags).toEqual(snap.pairs.map((p) => ({ roundId: 'r1', pairId: p.id })))
    // A player's signature does not stand for his pair's card under the pairs' rule.
    snap.cardSignatures = [{ roundId: 'r1', pairId: null, playerId: 'p1', signedBy: 'p4', signedAt: '' }]
    expect(computeTournament(snap, stored).flags.unsignedCards).toHaveLength(6)
    expect(computeTournament(snap, { ...stored, cardSigning: 'pairs' }).flags.unsignedCards).toEqual(flags)
  })

  it('a marker in a tournament that also plays pairs: each player, and a pair signed before still covers both', () => {
    const settings = { ...FIRST_TOURNAMENT_SETTINGS, cardSigning: 'marker' as const }
    const snap = makeFirstTournament()
    fillRound(snap, 'r1', 1, { playerIds: ['p1', 'p10', 'p4', 'p7'] })
    snap.cardSignatures = [{ roundId: 'r1', pairId: 'pair1', signedBy: 'p4', signedAt: '' }]
    expect(computeTournament(snap, settings).flags.unsignedCards).toEqual([
      { roundId: 'r1', playerId: 'p4' },
      { roundId: 'r1', playerId: 'p7' },
    ])
  })
})
