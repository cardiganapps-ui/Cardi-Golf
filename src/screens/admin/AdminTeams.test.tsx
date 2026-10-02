// @vitest-environment happy-dom
/**
 * N1: under fourball match play «Para empezar» says «Arma las parejas del
 * fourball» and opens Equipos, so Equipos draws them: pairs only. Other
 * formats still read «Este torneo no se juega por equipos».
 */
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import { getFixture } from '../../dev/fixtures'
import { dataFromSnapshot, useTournament } from '../../data/tournamentStore'
import type { TournamentSettings } from '../../engine/settings/schema'
import type { Snapshot } from '../../engine/types'
import { t } from '../../i18n/es-MX'
import { TournamentContext } from '../tournament/TournamentGate'
import { AdminTeams } from './AdminTeams'

const E = t.teams

function mount(name: string, edit?: (s: Snapshot) => void) {
  const fx = getFixture(name)!
  const snapshot = structuredClone(fx.snapshot)
  edit?.(snapshot)
  useTournament.setState({ tournamentId: 't-teams', data: dataFromSnapshot(snapshot) })
  return render(
    <MemoryRouter>
      <TournamentContext.Provider value={{ tournamentId: 't-teams', slug: 'viaje', lookup: fx.lookup, me: { playerId: null, isOrganizer: true, isAdmin: true }, refresh: async () => undefined, leave: async () => undefined }}>
        <AdminTeams />
      </TournamentContext.Provider>
    </MemoryRouter>,
  )
}

afterEach(() => cleanup())

describe('Equipos', () => {
  it('fourball match play draws its pairs here: two per team, nothing else to pick', () => {
    mount('match8', (s) => {
      const settings = s.tournament.settings as TournamentSettings
      settings.modules.individual.formatOptions.matchMode = 'fourball'
    })
    expect(screen.queryByText(E.notTeamFormat)).toBeNull()
    expect(screen.getByRole('button', { name: E.draw })).toBeTruthy()
    const size = screen.getByRole('radiogroup', { name: E.size })
    expect(within(size).getAllByRole('radio').map((x) => x.textContent)).toEqual([E.sizeOption(2)])
  })

  it('singles match play has no teams', () => {
    mount('match8')
    expect(screen.getByText(E.notTeamFormat)).toBeTruthy()
  })

  it('a team format still offers teams of two, three or four', () => {
    mount('team8')
    const size = screen.getByRole('radiogroup', { name: E.size })
    expect(within(size).getAllByRole('radio')).toHaveLength(3)
  })
})
