// @vitest-environment happy-dom
/**
 * REL-08: «Terminar ronda» closed the day with no word about phones still
 * holding holes. Nothing on the Comité's phone knows what another phone has
 * not sent yet, so the confirmation asks for every group to show
 * «Sincronizado» first: after the day closes, their holes are refused.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, expect, it, vi } from 'vitest'

vi.mock('./useCourses', async () => {
  const { getFixture } = await import('../../dev/fixtures')
  return { useCourses: () => ({ courses: getFixture('full12-live')!.snapshot.courses, loading: false, reload: async () => undefined }) }
})

import { getFixture } from '../../dev/fixtures'
import { dataFromSnapshot, useTournament } from '../../data/tournamentStore'
import { t } from '../../i18n/es-MX'
import { TournamentContext } from '../tournament/TournamentGate'
import { AdminRounds } from './AdminRounds'

const R = t.admin.rounds

afterEach(() => cleanup())

it('«Terminar ronda» asks that every phone has sent its holes first', () => {
  const fx = getFixture('full12-live')!
  useTournament.setState({ tournamentId: 'fx-full', data: dataFromSnapshot(structuredClone(fx.snapshot)) })
  render(
    <MemoryRouter>
      <TournamentContext.Provider value={{ tournamentId: 'fx-full', slug: 'viaje', lookup: fx.lookup, me: fx.me, refresh: async () => undefined, leave: async () => undefined }}>
        <AdminRounds />
      </TournamentContext.Provider>
    </MemoryRouter>,
  )
  fireEvent.click(screen.getByRole('button', { name: R.finish }))
  const dialog = screen.getByRole('dialog', { name: R.finish })
  expect(dialog.textContent).toContain(R.finishConfirm(2))
  expect(dialog.textContent).toContain(R.phonesBeforeFinish)
})
