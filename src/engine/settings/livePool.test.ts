/**
 * MONEY-06: the money plan is checked against the real tournament, live.
 * Settings were validated only when saved, so a player who never showed left
 * the pool short and a round added later created an unfunded prize, and
 * nothing said so until the bank verdict turned red on Sunday. And finishing
 * day 1 of a two-day event whose day 2 was not created yet made it final.
 */
import { describe, expect, it } from 'vitest'
import { computeTournament } from '../computeTournament'
import { FIRST_TOURNAMENT_SETTINGS } from './presets'
import { makeFirstTournament, makeRound } from '../testing/fixtures'

const S = FIRST_TOURNAMENT_SETTINGS

describe('the pool, against the real tournament (MONEY-06)', () => {
  it('the first tournament as planned balances, and says nothing', () => {
    const snap = makeFirstTournament()
    snap.tournament.status = 'live'
    const st = computeTournament(snap, S)
    expect(st.flags.pool.balanced).toBe(true)
    expect(st.flags.poolWarning).toBeNull()
  })

  it('a player who never shows leaves the prizes unfunded, and everyone is told', () => {
    const snap = makeFirstTournament()
    snap.tournament.status = 'live'
    snap.players = snap.players.filter((p) => p.id !== 'p12')
    for (const g of snap.groups) g.playerIds = g.playerIds.filter((id) => id !== 'p12')
    const st = computeTournament(snap, S)
    // 11 × $2,500 = $27,500 in; prizes $30,000 less two snake survivors ($400) for the group of three.
    expect(st.flags.pool).toMatchObject({ entryPot: 27500, prizesTotal: 29600, difference: -2100, balanced: false })
    expect(st.flags.poolWarning).toContain('faltan $2,100')
    expect(st.flags.warnings).toContain(st.flags.poolWarning)
  })

  it('a round added beyond the plan counts its best round and snake', () => {
    const snap = makeFirstTournament()
    snap.tournament.status = 'live'
    snap.rounds.push(makeRound(3))
    const st = computeTournament(snap, S)
    // Day 3: $1,200 best round + 3 groups × $600 snake, nobody paid in for it.
    expect(st.flags.pool.difference).toBe(-3000)
    expect(st.flags.poolWarning).toContain('faltan $3,000')
  })

  it('during setup the pool is reported but nobody is warned yet: players are still joining', () => {
    const snap = makeFirstTournament()
    snap.tournament.status = 'setup'
    snap.rounds.forEach((r) => (r.status = 'scheduled'))
    snap.players = snap.players.slice(0, 8)
    snap.groups = []
    const st = computeTournament(snap, S)
    expect(st.flags.pool.balanced).toBe(false)
    expect(st.flags.poolWarning).toBeNull()
  })
})

describe('final means every planned round (MONEY-06)', () => {
  it('finishing day 1 of a two-day event whose day 2 does not exist yet is not final', () => {
    const snap = makeFirstTournament()
    snap.tournament.status = 'live'
    snap.rounds = snap.rounds.filter((r) => r.id === 'r1')
    snap.rounds[0]!.status = 'finished'
    expect(computeTournament(snap, S).tournamentFinal).toBe(false)
  })
  it('both days finished is final; so is the Comité marking it Terminado', () => {
    const snap = makeFirstTournament()
    snap.tournament.status = 'live'
    snap.rounds.forEach((r) => (r.status = 'finished'))
    expect(computeTournament(snap, S).tournamentFinal).toBe(true)
    const early = makeFirstTournament()
    early.tournament.status = 'finished'
    expect(computeTournament(early, S).tournamentFinal).toBe(true)
  })
})
