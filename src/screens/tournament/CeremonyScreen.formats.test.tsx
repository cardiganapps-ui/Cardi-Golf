// @vitest-environment happy-dom
/**
 * STRAT-03: the Ceremonia reveals last place only where the tournament gave
 * it a name of its own (a trophy, a roast). «Último lugar», the platform's
 * default label, is no prize, so a stroke-play night opens on its podium.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('canvas-confetti', () => ({ default: vi.fn() }))

import { getFixture } from '../../dev/fixtures'
import { dataFromSnapshot, useTournament } from '../../data/tournamentStore'
import type { TournamentSettings } from '../../engine/settings/schema'
import type { Snapshot } from '../../engine/types'
import { t } from '../../i18n/es-MX'
import { CeremonyScreen } from './CeremonyScreen'
import { TournamentContext } from './TournamentGate'

const C = t.ceremony

/** stroke8's ceremony, started: the first step on screen. */
function ceremony(edit?: (s: Snapshot) => void) {
  const fx = getFixture('stroke8')!
  const snap = structuredClone(fx.snapshot)
  edit?.(snap)
  useTournament.setState({ tournamentId: 'fixture:stroke8', data: dataFromSnapshot(snap), loading: false, error: null, realtime: 'off' })
  render(
    <MemoryRouter>
      <TournamentContext.Provider value={{ tournamentId: snap.tournament.id, slug: '_/stroke8', lookup: fx.lookup, me: fx.me, refresh: async () => undefined, leave: async () => undefined }}>
        <CeremonyScreen />
      </TournamentContext.Provider>
    </MemoryRouter>,
  )
  fireEvent.click(screen.getByRole('button', { name: C.start }))
  return { step: screen.getByRole('region').getAttribute('aria-label'), progress: document.querySelector('[class*="progress"]')?.textContent }
}

afterEach(() => cleanup())

describe('the Ceremonia and last place (STRAT-03)', () => {
  it('a last place with the default name is no step: the night opens on 2nd place', () => {
    // Two prizes (60/40): 2nd place, the champion, the money summary.
    expect(ceremony()).toEqual({ step: C.steps.place(2), progress: '1 / 3' })
  })

  it('a last place with a name of its own opens the night', () => {
    const named = (s: Snapshot) => {
      const st = s.tournament.settings as TournamentSettings
      s.tournament.settings = { ...st, labels: { ...st.labels, lastPlace: 'La Cuchara de Palo' } }
    }
    expect(ceremony(named)).toEqual({ step: 'La Cuchara de Palo', progress: '1 / 4' })
  })
})
