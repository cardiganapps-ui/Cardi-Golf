// @vitest-environment happy-dom
/**
 * STRAT-03: Comité › Datos, the results CSV. In a team format the board's
 * row is the team's, so the file has one line per player: his team in the
 * «equipo» column, the team's place and figures, and his own money (his
 * share of the prize, what he paid). An individual event has no «equipo».
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../data/backup', async (importOriginal) => ({ ...(await importOriginal<typeof import('../../data/backup')>()), downloadText: vi.fn() }))

import { downloadText } from '../../data/backup'
import { getFixture } from '../../dev/fixtures'
import { dataFromSnapshot, useTournament } from '../../data/tournamentStore'
import { t } from '../../i18n/es-MX'
import { TournamentContext } from '../tournament/TournamentGate'
import { AdminData } from './AdminData'

/** The results file «Tarjetas y resultados CSV» downloads for a design fixture. */
function resultsCsv(fixture: string) {
  const fx = getFixture(fixture)!
  const snap = structuredClone(fx.snapshot)
  useTournament.setState({ tournamentId: `fixture:${fixture}`, data: dataFromSnapshot(snap), loading: false, error: null, realtime: 'off' })
  render(
    <MemoryRouter>
      <TournamentContext.Provider value={{ tournamentId: snap.tournament.id, slug: fixture, lookup: fx.lookup, me: fx.me, refresh: async () => undefined, leave: async () => undefined }}>
        <AdminData />
      </TournamentContext.Provider>
    </MemoryRouter>,
  )
  fireEvent.click(screen.getByRole('button', { name: t.admin.data.exportCsv }))
  const call = vi.mocked(downloadText).mock.calls.find(([name]) => name.startsWith(`${fixture}-resultados-`))!
  return call[1].trimEnd().split('\n')
}

afterEach(() => {
  cleanup()
  vi.mocked(downloadText).mockClear()
})

describe('the results CSV (STRAT-03)', () => {
  it("a team format: one line per player, with his team, the team's place and figures, and his own money", () => {
    // team8: four teams of two; the 60/40 pot ($4,800) goes $2,880 to Los Compadres and $1,920 to Los del Fondo, half to each member.
    expect(resultsCsv('team8')).toEqual([
      'pos,jugador,equipo,categoria,dia1,total,premios,pago,recibe,neto',
      '1,Elías Fuentes,Los Compadres,,53,53,1440,600,1440,840',
      '1,Fabián Galindo,Los Compadres,,53,53,1440,600,1440,840',
      '2,Iván Jáuregui,Los del Fondo,,55,55,960,600,960,360',
      '2,Julián Lara,Los del Fondo,,55,55,960,600,960,360',
      '3,Leonel Mireles,Tres Marías,,57,57,0,600,0,-600',
      '3,Matías Navarro,Tres Marías,,57,57,0,600,0,-600',
      '4,Gael Hinojosa,Las Palmas,,60,60,0,600,0,-600',
      '4,Hugo Iturbide,Las Palmas,,60,60,0,600,0,-600',
    ])
  })

  it('an individual event: one line per player and no «equipo» column', () => {
    const lines = resultsCsv('stroke8')
    expect(lines[0]).toBe('pos,jugador,categoria,dia1,total,premios,pago,recibe,neto')
    expect(lines[1]).toBe('1,Fabián Galindo,,61,61,2880,600,2880,2280')
    expect(lines).toHaveLength(9)
  })
})
