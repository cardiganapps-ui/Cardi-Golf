/**
 * STRAT-17: the example on `/demo` is a finished tournament that shows every
 * game working and money that squares to the peso, with nothing left for a
 * Comité to answer (no snake tiebreak, nothing «por asignar», no unsigned
 * card), and it is the same tournament every time.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { dataFromSnapshot } from '../data/tournamentStore'
import { forSpectators } from '../data/spectator'
import { DEMO_ID, demoSnapshot } from './demoTournament'
import { words } from '../engine/testing/words'

const data = dataFromSnapshot(forSpectators(demoSnapshot(), true, DEMO_ID))
const { state } = data

describe('the example tournament (STRAT-17)', () => {
  it('is twelve players, two finished days, and final', () => {
    expect(data.snapshot.players).toHaveLength(12)
    expect(data.snapshot.rounds.map((r) => r.status)).toEqual(['finished', 'finished'])
    expect(state.tournamentFinal).toBe(true)
    for (const p of data.snapshot.players) for (const rid of state.core.roundIds) expect(state.core.rounds[rid]![p.id]!.complete).toBe(true)
  })

  it('plays every game of the first tournament', () => {
    const m = state.modules
    expect(m.individual?.rows).toHaveLength(12)
    expect(m.bestRound?.days).toHaveLength(2)
    expect(m.pairs?.rows).toHaveLength(6)
    expect(m.snake).toBeTruthy()
    expect(m.fewestPutts).toBeTruthy()
    expect(m.auction?.lots.every((l) => l.status === 'sold')).toBe(true)
  })

  it('leaves nothing open: no tiebreak, no unsigned card, no warning', () => {
    expect(state.flags.pendingSnakeTiebreaks).toEqual([])
    expect(state.flags.unsignedCards).toEqual([])
    expect(words(state.flags.warnings)).toEqual([])
    expect(state.flags.missingPutts).toEqual([])
  })

  it('squares to the peso, with nothing «por asignar» and a settlement to show', () => {
    expect(state.money.banker.balanced).toBe(true)
    expect(state.money.netSum).toBe(0)
    expect(state.money.unassigned.total).toBe(0)
    expect(state.money.unassigned.heldTotal).toBe(0)
    expect(state.money.viaBank.some((tr) => tr.amount > 0)).toBe(true)
  })

  it('is the same tournament every time', () => {
    expect(JSON.stringify(demoSnapshot())).toBe(JSON.stringify(demoSnapshot()))
  })

  it('is built from production code only (ARCH-07: no fixture, no test builder)', () => {
    const src = readFileSync(join(process.cwd(), 'src/demo/demoTournament.ts'), 'utf8')
    expect(src).not.toMatch(/from '\.\.\/(dev|engine\/testing)\//)
  })
})
