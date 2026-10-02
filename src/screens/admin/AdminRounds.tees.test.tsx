// @vitest-environment happy-dom
/**
 * N2: a tee chosen for a day stays when the day's course changes, and the
 * engine plays it. «Para empezar» says «Cambia los tees de otro campo» and
 * opens Rondas, so Rondas must show «Tee de cada jugador» for that day even on
 * a one-tee course, with the stray tee in the list, so it can be put back to
 * «Por defecto».
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({ setRoundTee: vi.fn(async () => undefined) }))
vi.mock('../../data/api', async (importOriginal) => ({ ...(await importOriginal<typeof import('../../data/api')>()), setRoundTee: api.setRoundTee }))
vi.mock('./useCourses', () => ({ useCourses: () => ({ courses: [], loading: false, error: null, refresh: () => undefined }) }))

import { getFixture } from '../../dev/fixtures'
import { dataFromSnapshot, useTournament } from '../../data/tournamentStore'
import { makeCourse, makeRound, makeTee } from '../../engine/testing/fixtures'
import type { Snapshot } from '../../engine/types'
import { t } from '../../i18n/es-MX'
import { TournamentContext } from '../tournament/TournamentGate'
import { AdminRounds } from './AdminRounds'

const R = t.admin.rounds
const fx = getFixture('minimal4-setup')!
const p3 = fx.snapshot.players.find((p) => p.id === 'p3')!

function mount(edit: (s: Snapshot) => void) {
  const snapshot = structuredClone(fx.snapshot)
  edit(snapshot)
  useTournament.setState({ tournamentId: 't-rounds', data: dataFromSnapshot(snapshot) })
  return render(
    <MemoryRouter>
      <TournamentContext.Provider value={{ tournamentId: 't-rounds', slug: 'viaje', lookup: fx.lookup, me: { playerId: null, isOrganizer: true, isAdmin: true }, refresh: async () => undefined, leave: async () => undefined }}>
        <AdminRounds />
      </TournamentContext.Provider>
    </MemoryRouter>,
  )
}

afterEach(() => {
  cleanup()
  api.setRoundTee.mockClear()
})

describe('Rondas: a tee of another course can be put back', () => {
  it('a one-tee course with nobody\'s tee chosen: nothing to choose, no «Tee de cada jugador»', () => {
    mount(() => undefined)
    expect(screen.queryByRole('button', { name: R.tees })).toBeNull()
  })

  it('a one-tee course with a tee of an unloaded course chosen for the day: the button shows, the tee is listed, and «Por defecto» clears it', async () => {
    mount((s) => {
      s.roundTees = [{ roundId: 'r1', playerId: 'p3', teeId: 'rojas' }]
    })
    await act(async () => fireEvent.click(screen.getByRole('button', { name: R.tees })))
    const select = screen.getByRole('combobox', { name: `${R.tees}, ${p3.displayName}` }) as HTMLSelectElement
    expect(select.value).toBe('rojas')
    expect(select.selectedOptions[0]!.textContent).toBe(R.teeOtherCourse(null))
    await act(async () => fireEvent.change(select, { target: { value: '' } }))
    expect(api.setRoundTee).toHaveBeenCalledWith('r1', 'p3', null)
  })

  it('a tee of another loaded course is named', async () => {
    mount((s) => {
      s.courses.push(makeCourse('quivira', [makeTee('rojas', 'quivira', { name: 'Rojas' }), makeTee('negras', 'quivira', { name: 'Negras' })]))
      s.rounds.push(makeRound(2, { status: 'scheduled', courseId: 'quivira' }))
      s.roundTees = [{ roundId: 'r1', playerId: 'p3', teeId: 'rojas' }]
    })
    await act(async () => fireEvent.click(screen.getAllByRole('button', { name: R.tees })[0]!))
    const select = screen.getByRole('combobox', { name: `${R.tees}, ${p3.displayName}` }) as HTMLSelectElement
    expect(select.selectedOptions[0]!.textContent).toBe('Rojas, de otro campo')
  })
})
