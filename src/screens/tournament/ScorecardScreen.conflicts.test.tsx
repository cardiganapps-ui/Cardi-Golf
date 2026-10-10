// @vitest-environment happy-dom
/**
 * REL-08 (PR 108, round 3, N1): a typed conflict the player has not answered
 * when the day closes. The Comité's «Pendientes de revisar» never lists a
 * conflict, so the question on this phone is the only place the value is.
 * It stays on every state of the Tarjeta: the live card, the day finished,
 * another day, no day at all; and «Guardar el mío» there goes out as a typed
 * value (refused on a closed day, it reaches the Comité: outbox.hole.test.ts,
 * «a conflict left unanswered when the day closes»). On `full12-live`, as
 * Camilo (p3), with the outbox's two answers recorded instead of sent.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../data/quick', () => ({ roundRivalries: vi.fn(async () => []) }))
vi.mock('canvas-confetti', () => ({ default: vi.fn() }))
vi.mock('../../data/outbox', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../data/outbox')>()),
  sendMineAgain: vi.fn(async () => undefined),
  keepTheirs: vi.fn(async () => undefined),
}))

import { keepTheirs, sendMineAgain, useOutbox, type ConflictItem } from '../../data/outbox'
import { getFixture } from '../../dev/fixtures'
import { dataFromSnapshot, useTournament } from '../../data/tournamentStore'
import type { Snapshot } from '../../engine/types'
import { t } from '../../i18n/es-MX'
import { ScorecardScreen } from './ScorecardScreen'
import { TournamentContext } from './TournamentGate'

const S = t.card
const CAMILO = 'p3'
const conflict = (roundId: string, hole: number): ConflictItem => ({
  key: `conflict:${roundId}:${CAMILO}:${hole}`,
  tournamentId: 'fx-full',
  round_id: roundId,
  hole,
  player_id: CAMILO,
  fields: { strokes: 5, putts: 2 },
  base: {},
  clash: ['strokes'],
  server: { strokes: 6, putts: 2, picked_up: false, entered_by: 'p1' },
  at: 1,
})

function mount(edit: ((s: Snapshot) => void) | null, conflicts: ConflictItem[]) {
  const fx = getFixture('full12-live')!
  const snapshot = structuredClone(fx.snapshot)
  edit?.(snapshot)
  useTournament.setState({ tournamentId: 'fx-full', data: dataFromSnapshot(snapshot) })
  const me = { playerId: CAMILO, isOrganizer: false, isAdmin: false }
  render(
    <MemoryRouter>
      <TournamentContext.Provider value={{ tournamentId: 'fx-full', slug: 'viaje', lookup: fx.lookup, me, refresh: async () => undefined, leave: async () => undefined }}>
        <ScorecardScreen />
      </TournamentContext.Provider>
    </MemoryRouter>,
  )
  act(() => useOutbox.setState({ conflicts, queueRead: true }))
}
const finishDay2 = (s: Snapshot) => void (s.rounds.find((r) => r.id === 'r2')!.status = 'finished')
const camilo = () => getFixture('full12-live')!.snapshot.players.find((p) => p.id === CAMILO)!.displayName

afterEach(() => {
  cleanup()
  useOutbox.setState({ conflicts: [], rejected: [] })
  vi.mocked(sendMineAgain).mockClear()
  vi.mocked(keepTheirs).mockClear()
})

describe('an unanswered conflict, once its day is closed (N1)', () => {
  it('day 2 live: the Tarjeta asks about it', () => {
    mount(null, [conflict('r2', 10)])
    expect(screen.queryByText(S.conflictTitle)).not.toBeNull()
  })

  it('day 2 finished: the closed day still asks, says «Guardar el mío» goes to the Comité, and sends it as this phone’s player', () => {
    mount(finishDay2, [conflict('r2', 10)])
    expect(screen.getByText(S.roundFinished(2))).toBeTruthy()
    expect(screen.queryByText(S.conflictTitle)).not.toBeNull()
    expect(screen.getByText(S.conflictClosedHint)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: S.conflictAction(S.keepMine, 10, camilo()) }))
    expect(sendMineAgain).toHaveBeenCalledWith('conflict:r2:p3:10', CAMILO)
  })

  it('day 2 finished: «Dejar el suyo» settles it on the phone', () => {
    mount(finishDay2, [conflict('r2', 10)])
    fireEvent.click(screen.getByRole('button', { name: S.conflictAction(S.keepTheirs, 10, camilo()) }))
    expect(keepTheirs).toHaveBeenCalledWith('conflict:r2:p3:10')
  })

  it('a day-1 conflict while day 2 is live: shown on day 2’s card, with its day', () => {
    mount(null, [conflict('r1', 10)])
    expect(screen.queryByText(S.conflictTitle)).not.toBeNull()
    expect(screen.getByRole('button', { name: S.conflictAction(S.keepMine, 10, camilo(), 1) })).toBeTruthy()
  })

  it('no day at all: still asked', () => {
    mount((s) => void (s.rounds = []), [conflict('r1', 10)])
    expect(screen.getByText(t.live.noRounds)).toBeTruthy()
    expect(screen.queryByText(S.conflictTitle)).not.toBeNull()
  })

  it('a phone whose player is in no group of the day: still asked', () => {
    mount((s) => void (s.groups = s.groups.filter((g) => !(g.roundId === 'r2' && g.playerIds.includes(CAMILO)))), [conflict('r2', 10)])
    expect(screen.queryByText(S.conflictTitle)).not.toBeNull()
  })
})
