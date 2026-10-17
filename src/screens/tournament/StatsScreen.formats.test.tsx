// @vitest-environment happy-dom
/**
 * STRAT-03: the race charts' figures on Estadísticas. Under stroke play the
 * players' race is each running total against par («+3», «−11», «E»); the
 * pairs race counts the pairs game's Stableford points whatever the main
 * event plays, both partners' points, written as points («69», never «+69»).
 *
 * Read from the race's table (A11Y-20: «Ver como tabla»), the 18th's column.
 */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'

import { getFixture } from '../../dev/fixtures'
import { dataFromSnapshot, useTournament } from '../../data/tournamentStore'
import type { TournamentSettings } from '../../engine/settings/schema'
import type { Snapshot } from '../../engine/types'
import { StatsScreen } from './StatsScreen'
import { TournamentContext } from './tournamentContext'

function stats(edit?: (s: Snapshot) => void) {
  const fx = getFixture('stroke8')!
  const snap = structuredClone(fx.snapshot)
  edit?.(snap)
  useTournament.setState({
    tournamentId: 'fixture:stroke8',
    data: dataFromSnapshot(snap),
    loading: false,
    error: null,
    realtime: 'off',
  })
  render(
    <MemoryRouter>
      <TournamentContext.Provider
        value={{
          tournamentId: snap.tournament.id,
          slug: '_/stroke8',
          lookup: fx.lookup,
          me: fx.me,
          refresh: async () => undefined,
          leave: async () => undefined,
        }}
      >
        <StatsScreen />
      </TournamentContext.Provider>
    </MemoryRouter>,
  )
}
/** Each row's figure at the 18th, «name : value», from the race's table. */
async function at18() {
  fireEvent.click(screen.getByRole('button', { name: 'Ver como tabla' }))
  const table = await screen.findByRole('table', { name: /hoyo por hoyo/ })
  return within(table)
    .getAllByRole('row')
    .slice(1)
    .map((tr) => {
      const cells = within(tr).getAllByRole('cell')
      return `${within(tr).getByRole('rowheader').textContent} : ${cells[17]!.textContent}`
    })
}

afterEach(() => cleanup())

describe('the race charts under stroke play (STRAT-03)', () => {
  it("the players' race reads each running total against par", async () => {
    // stroke8 is net stroke play: Elías finished +3, Fabián −11, Hugo I. level.
    stats()
    expect(await at18()).toEqual(expect.arrayContaining(['Elías : +3', 'Fabián : −11', 'Hugo I. : E']))
  })

  it("the pairs race adds both partners' Stableford points, written as points", async () => {
    // Fore! is Elías (33 points) and Matías (36): 69 at the 18th.
    stats((s) => {
      const st = s.tournament.settings as TournamentSettings
      s.tournament.settings = {
        ...st,
        modules: { ...st.modules, pairs: { ...st.modules.pairs, enabled: true, label: 'Parejas' } },
      }
      s.pairs = [
        {
          id: 'pr1',
          name: 'Fore!',
          player1Id: 'p1',
          player2Id: 'p8',
          kind: null,
          pickedByHonoree: false,
          drawnAt: null,
        },
        {
          id: 'pr2',
          name: 'Los Bogey',
          player1Id: 'p2',
          player2Id: 'p7',
          kind: null,
          pickedByHonoree: false,
          drawnAt: null,
        },
        {
          id: 'pr3',
          name: 'Los Cuñados',
          player1Id: 'p3',
          player2Id: 'p6',
          kind: null,
          pickedByHonoree: false,
          drawnAt: null,
        },
        {
          id: 'pr4',
          name: 'Par y Medio',
          player1Id: 'p4',
          player2Id: 'p5',
          kind: null,
          pickedByHonoree: false,
          drawnAt: null,
        },
      ]
    })
    fireEvent.click(screen.getByRole('radio', { name: 'Parejas' }))
    expect(screen.getByRole('heading', { name: 'Carrera de parejas' })).toBeTruthy()
    expect((await at18()).sort()).toEqual(['Fore! : 69', 'Los Bogey : 75', 'Los Cuñados : 76', 'Par y Medio : 77'])
  })
})
