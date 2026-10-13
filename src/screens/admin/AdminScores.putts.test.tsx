// @vitest-environment happy-dom
/**
 * MONEY-18: a hole saved with strokes and no putts reads as 0 putts nowhere.
 * Comité › Tarjetas lists whose holes they are, under «Pendientes», with the
 * games that wait for them, and «Ver» opens that card with the holes marked.
 */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import { getFixture } from '../../dev/fixtures'
import { dataFromSnapshot, useTournament } from '../../data/tournamentStore'
import { puttingGames } from '../../engine/core/putts'
import type { TournamentSettings } from '../../engine/settings/schema'
import { t } from '../../i18n/es-MX'
import { TournamentContext } from '../tournament/TournamentGate'
import { AdminScores } from './AdminScores'

const IB = t.admin.inbox

/** full12-live, the snake and Menos putts on, one player's holes 3 and 7 of day 1 saved without putts. */
function mount() {
  const fx = getFixture('full12-live')!
  const snap = structuredClone(fx.snapshot)
  const st = snap.tournament.settings as TournamentSettings
  snap.tournament.settings = { ...st, modules: { ...st.modules, snake: { ...st.modules.snake, enabled: true }, fewestPutts: { ...st.modules.fewestPutts, enabled: true } } }
  const round = snap.rounds.find((r) => r.number === 1)!
  const pid = snap.players[5]!.id
  for (const hole of [3, 7]) {
    const sc = snap.scores.find((x) => x.roundId === round.id && x.playerId === pid && x.hole === hole)
    if (sc) sc.putts = null
    else snap.scores.push({ roundId: round.id, playerId: pid, hole, strokes: 5, putts: null, pickedUp: false, enteredBy: pid, updatedAt: '2027-04-09T16:00:00Z' })
  }
  useTournament.setState({ tournamentId: 'fixture:full12-live', data: dataFromSnapshot(snap), loading: false, error: null, realtime: 'off', reload: async () => undefined } as never)
  render(
    <MemoryRouter>
      <TournamentContext.Provider value={{ tournamentId: snap.tournament.id, slug: '_/full12-live', lookup: fx.lookup, me: fx.me, refresh: async () => undefined, leave: async () => undefined }}>
        <AdminScores />
      </TournamentContext.Provider>
    </MemoryRouter>,
  )
  const name = (id: string) => snap.players.find((p) => p.id === id)!.displayName
  return { pid, name, settings: snap.tournament.settings as TournamentSettings }
}

afterEach(() => cleanup())

describe('Comité › Tarjetas: holes without putts (MONEY-18)', () => {
  it('«Pendientes» names the player and the holes, and the games that wait', () => {
    const { pid, name, settings } = mount()
    const row = screen.getByText(IB.missingPutts(name(pid), [3, 7])).closest('div')!
    expect(within(row).getByText(`${t.round.day(1)}. ${IB.missingPuttsWhy(puttingGames(settings))}`)).toBeTruthy()
    expect(puttingGames(settings)).toEqual(['La Víbora', 'Menos putts'])
  })

  it('«Ver» opens his card, where the two holes say «sin putts»', () => {
    const { pid, name } = mount()
    const row = screen.getByText(IB.missingPutts(name(pid), [3, 7])).closest('div')!
    fireEvent.click(within(row).getByRole('button', { name: IB.view }))
    expect((screen.getByRole('combobox', { name: t.admin.scores.player }) as HTMLSelectElement).value).toBe(pid)
    expect(screen.getAllByText(t.admin.scores.noPutts)).toHaveLength(2)
  })
})
