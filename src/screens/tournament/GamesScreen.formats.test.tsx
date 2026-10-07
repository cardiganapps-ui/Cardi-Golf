// @vitest-environment happy-dom
/**
 * STRAT-03: Juegos › the main event under match play. A decided match reads
 * the same for both sides («4&3»), so each day on the board says whose it was:
 * «Día 1 ganó 4&3», «Día 1 perdió 4&3», and the loser of a match won on the
 * 18th «perdió 1 abajo», never «perdió 1 arriba».
 */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import { getFixture } from '../../dev/fixtures'
import { dataFromSnapshot, useTournament } from '../../data/tournamentStore'
import type { TournamentSettings } from '../../engine/settings/schema'
import { makeGroup, PAR_72, score } from '../../engine/testing/fixtures'
import type { Snapshot } from '../../engine/types'
import { GamesScreen } from './GamesScreen'
import { TournamentContext } from './TournamentGate'

/** match8's Juegos, opened on the main event («Match play»). */
function matchBoard(edit?: (s: Snapshot) => void) {
  const fx = getFixture('match8')!
  const snap = structuredClone(fx.snapshot)
  edit?.(snap)
  useTournament.setState({ tournamentId: 'fixture:match8', data: dataFromSnapshot(snap), loading: false, error: null, realtime: 'off' })
  render(
    <MemoryRouter>
      <TournamentContext.Provider value={{ tournamentId: snap.tournament.id, slug: '_/match8', lookup: fx.lookup, me: fx.me, refresh: async () => undefined, leave: async () => undefined }}>
        <GamesScreen />
      </TournamentContext.Provider>
    </MemoryRouter>,
  )
  fireEvent.click(screen.getByRole('button', { name: /^Match play/ }))
}
/** The day line under a player's row on the board. */
const dayOf = (name: string) => within(screen.getByRole('button', { name: new RegExp(`, ${name}, `) })).getByText(/^Día 1 /).textContent

/** Match play without handicaps: club against club. */
const gross = (s: Snapshot) => {
  const st = s.tournament.settings as TournamentSettings
  s.tournament.settings = { ...st, modules: { ...st.modules, individual: { ...st.modules.individual, formatOptions: { ...st.modules.individual.formatOptions, scoring: 'gross' } } } }
}
const PARS = PAR_72.map(([par]) => par)
/** One player's whole card: his gross on each hole. */
function card(s: Snapshot, playerId: string, strokes: number[]) {
  s.scores = s.scores.filter((x) => !(x.roundId === 'r1' && x.playerId === playerId))
  strokes.forEach((g, i) => s.scores.push(score('r1', playerId, i + 1, g, 2)))
}

afterEach(() => cleanup())

describe('Juegos under match play (STRAT-03)', () => {
  it('each day says whose it was', () => {
    // Group 1 (off the 1st tee): Fabián beat Elías 4&3.
    matchBoard()
    expect(dayOf('Fabián')).toBe('Día 1 ganó 4&3')
    expect(dayOf('Elías')).toBe('Día 1 perdió 4&3')
  })

  it('a match won on the 18th reads «ganó 1 arriba» and «perdió 1 abajo»', () => {
    // Gross: Gael H. and Julián halve every hole until Gael H. bogeys the 18th.
    matchBoard((s) => {
      gross(s)
      s.groups = [makeGroup('r1', 1, ['p1', 'p2'], 1), makeGroup('r1', 2, ['p3', 'p6'], 1), makeGroup('r1', 3, ['p4', 'p5'], 1), makeGroup('r1', 4, ['p7', 'p8'], 1)]
      card(s, 'p6', PARS)
      card(s, 'p3', PARS.map((par, i) => (i === 17 ? par + 1 : par)))
    })
    expect(dayOf('Julián')).toBe('Día 1 ganó 1 arriba')
    expect(dayOf('Gael H.')).toBe('Día 1 perdió 1 abajo')
  })
})

describe('a match off the 10th tee (a bug older than STRAT-03)', () => {
  /*
   * BUG at 252bf7b, there since the formats came in (#49): the main event's
   * match play counts holes 1 to 18 in number order (playMatches in
   * src/engine/formats/matchPlay.ts), not in the group's play order as La
   * Víbora and the side games' matches do (playOrder(startHole)). A match off
   * the 10th that is over on the 1st, 10 up with 8 to play, and then played
   * out for the side games reads «ganó 2 arriba». In match8 and bracket8 every
   * match off the 10th shows a margin its play order does not (8&6 for 4&2).
   */
  it.fails('is decided in its play order: 10 to 18, then 1 to 9', () => {
    // Gross, Gael H. against Hugo I. off the 10th: Gael H. wins the 10th to the 18th and the 1st, Hugo I. the 2nd to the 9th.
    matchBoard((s) => {
      gross(s)
      card(s, 'p3', PARS.map((par, i) => (i >= 1 && i <= 8 ? par + 1 : par)))
      card(s, 'p4', PARS.map((par, i) => (i >= 1 && i <= 8 ? par : par + 1)))
    })
    expect(dayOf('Gael H.')).toBe('Día 1 ganó 10&8')
  })
})
