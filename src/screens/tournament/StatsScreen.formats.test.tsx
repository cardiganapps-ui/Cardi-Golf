// @vitest-environment happy-dom
/**
 * STRAT-03: the race charts' tooltips on Estadísticas. Under stroke play the
 * players' race is each running total against par («+3», «−11», «E»); the
 * pairs race counts the pairs game's Stableford points whatever the main
 * event plays, both partners' points, written as points («69», never «+69»).
 *
 * The chart is drawn at a fixed size (happy-dom lays nothing out), with its
 * tooltip shown over the 18th as a finger on the last hole would show it.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('recharts', async (importOriginal) => {
  const real = await importOriginal<typeof import('recharts')>()
  return {
    ...real,
    ResponsiveContainer: ({ children }: { children: ReactNode }) => (isValidElement(children) ? cloneElement(children as ReactElement<{ width?: number; height?: number }>, { width: 800, height: 280 }) : null),
    Tooltip: (props: Record<string, unknown>) => <real.Tooltip {...props} defaultIndex={17} active />,
  }
})

import { getFixture } from '../../dev/fixtures'
import { dataFromSnapshot, useTournament } from '../../data/tournamentStore'
import type { TournamentSettings } from '../../engine/settings/schema'
import type { Snapshot } from '../../engine/types'
import { StatsScreen } from './StatsScreen'
import { TournamentContext } from './TournamentGate'

function stats(edit?: (s: Snapshot) => void) {
  const fx = getFixture('stroke8')!
  const snap = structuredClone(fx.snapshot)
  edit?.(snap)
  useTournament.setState({ tournamentId: 'fixture:stroke8', data: dataFromSnapshot(snap), loading: false, error: null, realtime: 'off' })
  render(
    <MemoryRouter>
      <TournamentContext.Provider value={{ tournamentId: snap.tournament.id, slug: '_/stroke8', lookup: fx.lookup, me: fx.me, refresh: async () => undefined, leave: async () => undefined }}>
        <StatsScreen />
      </TournamentContext.Provider>
    </MemoryRouter>,
  )
}
/** The tooltip's lines over the 18th, «name : value». */
async function tooltip() {
  await screen.findByText('Hoyo 18')
  return Array.from(document.querySelectorAll('.recharts-tooltip-item')).map((li) => li.textContent)
}

afterEach(() => cleanup())

describe('the race charts under stroke play (STRAT-03)', () => {
  it("the players' race reads each running total against par", async () => {
    // stroke8 is net stroke play: Elías finished +3, Fabián −11, Hugo I. level.
    stats()
    expect(await tooltip()).toEqual(expect.arrayContaining(['Elías : +3', 'Fabián : −11', 'Hugo I. : E']))
  })

  it("the pairs race adds both partners' Stableford points, written as points", async () => {
    // Fore! is Elías (33 points) and Matías (36): 69 at the 18th.
    stats((s) => {
      const st = s.tournament.settings as TournamentSettings
      s.tournament.settings = { ...st, modules: { ...st.modules, pairs: { ...st.modules.pairs, enabled: true, label: 'Parejas' } } }
      s.pairs = [
        { id: 'pr1', name: 'Fore!', player1Id: 'p1', player2Id: 'p8', kind: null, pickedByHonoree: false, drawnAt: null },
        { id: 'pr2', name: 'Los Bogey', player1Id: 'p2', player2Id: 'p7', kind: null, pickedByHonoree: false, drawnAt: null },
        { id: 'pr3', name: 'Los Cuñados', player1Id: 'p3', player2Id: 'p6', kind: null, pickedByHonoree: false, drawnAt: null },
        { id: 'pr4', name: 'Par y Medio', player1Id: 'p4', player2Id: 'p5', kind: null, pickedByHonoree: false, drawnAt: null },
      ]
    })
    fireEvent.click(screen.getByRole('radio', { name: 'Parejas' }))
    expect(screen.getByRole('heading', { name: 'Carrera de parejas' })).toBeTruthy()
    expect((await tooltip()).sort()).toEqual(['Fore! : 69', 'Los Bogey : 75', 'Los Cuñados : 76', 'Par y Medio : 77'])
  })
})
