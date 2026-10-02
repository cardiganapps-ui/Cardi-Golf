// @vitest-environment happy-dom
/**
 * REL-08: «Terminar ronda» closed the day with no word about phones still
 * holding holes. Nothing on the Comité's phone knows what another phone has
 * not sent yet, so the confirmation asks for every group to show
 * «Sincronizado» first: after the day closes, their holes are refused.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactElement } from 'react'
import { MemoryRouter } from 'react-router'
import { afterEach, expect, it, vi } from 'vitest'

vi.mock('./useCourses', async () => {
  const { getFixture } = await import('../../dev/fixtures')
  return { useCourses: () => ({ courses: getFixture('full12-live')!.snapshot.courses, loading: false, reload: async () => undefined }) }
})

import { getFixture } from '../../dev/fixtures'
import { dataFromSnapshot, useTournament } from '../../data/tournamentStore'
import type { Snapshot } from '../../engine/types'
import { t } from '../../i18n/es-MX'
import { QuickFinish } from '../tournament/QuickFinish'
import { TournamentContext } from '../tournament/TournamentGate'
import { AdminRounds } from './AdminRounds'

const R = t.admin.rounds

afterEach(() => cleanup())

function mount(ui: ReactElement, name = 'full12-live', edit?: (s: Snapshot) => void, me?: { playerId: string | null; isOrganizer: boolean; isAdmin: boolean }) {
  const fx = getFixture(name)!
  const snapshot = structuredClone(fx.snapshot)
  edit?.(snapshot)
  useTournament.setState({ tournamentId: snapshot.tournament.id, data: dataFromSnapshot(snapshot) })
  return render(
    <MemoryRouter>
      <TournamentContext.Provider value={{ tournamentId: snapshot.tournament.id, slug: 'viaje', lookup: fx.lookup, me: me ?? fx.me, refresh: async () => undefined, leave: async () => undefined }}>
        {ui}
      </TournamentContext.Provider>
    </MemoryRouter>,
  )
}

it('«Terminar ronda» asks that every phone has sent its holes first', () => {
  mount(<AdminRounds />)
  fireEvent.click(screen.getByRole('button', { name: R.finish }))
  const dialog = screen.getByRole('dialog', { name: R.finish })
  expect(dialog.textContent).toContain(R.finishConfirm(2))
  expect(dialog.textContent).toContain(R.phonesBeforeFinish)
})

it('…also when Tarjetas has nothing pending: that is when a phone\'s unsent holes are easiest to miss', () => {
  mount(<AdminRounds />, 'full12-live', (s) => {
    // No tiebreak waiting, no disputed hole, every card of the day signed.
    for (const x of s.scores) {
      x.disputed = false
      if (x.roundId === 'r2' && x.hole === 5 && (x.playerId === 'p1' || x.playerId === 'p4')) x.putts = 2
    }
    for (const pair of s.pairs) s.cardSignatures.push({ roundId: 'r2', pairId: pair.id, signedBy: pair.player1Id, signedAt: '2027-04-10T14:30:00Z' })
    // An answer can bring up the next question in the group: answer until none is left.
    for (let open = dataFromSnapshot(s).state.flags.pendingSnakeTiebreaks; open.length; open = dataFromSnapshot(s).state.flags.pendingSnakeTiebreaks) {
      for (const q of open) s.snakeTiebreaks.push({ roundId: q.roundId, groupId: q.groupId, hole: q.hole, lastHoledPlayerId: q.candidates[0]! })
    }
  })
  fireEvent.click(screen.getByRole('button', { name: R.finish }))
  const dialog = screen.getByRole('dialog', { name: R.finish })
  expect(dialog.textContent).not.toMatch(/Hay \d+ pendientes?/)
  expect(dialog.textContent).toContain(R.phonesBeforeFinish)
})

it('«Terminar y publicar» on a Ronda rápida asks the same', () => {
  mount(<QuickFinish />, 'minimal4-live', (s) => void (s.tournament.quick = true), { playerId: 'p1', isOrganizer: true, isAdmin: true })
  fireEvent.click(screen.getByRole('button', { name: t.quick.finishTitle }))
  expect(screen.getByRole('dialog', { name: t.quick.finishTitle }).textContent).toContain(R.phonesBeforeFinish)
})
