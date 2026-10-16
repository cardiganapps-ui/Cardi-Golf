// @vitest-environment happy-dom
/**
 * ARCH-14: the card read its first player with a non-null assertion (`players[0]!.id`), so a group with nobody
 * on the boards (an empty group the Comité made, or its players deleted meanwhile) threw a TypeError that
 * reached the root error screen. It draws an empty card now, in both views, and «Guardar hoyo» saves nobody.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../data/outbox', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../data/outbox')>()),
  enqueueHole: vi.fn(async () => undefined),
  enqueueScore: vi.fn(async () => undefined),
}))
vi.mock('../../data/quick', () => ({ roundRivalries: vi.fn(async () => []) }))
vi.mock('canvas-confetti', () => ({ default: vi.fn() }))

import { enqueueHole, enqueueScore, useOutbox } from '../../data/outbox'
import { getFixture } from '../../dev/fixtures'
import { dataFromSnapshot, useTournament } from '../../data/tournamentStore'
import { t } from '../../i18n/es-MX'
import { ScorecardScreen } from './ScorecardScreen'
import { TournamentContext } from './tournamentContext'

const S = t.card

beforeEach(() => {
  useOutbox.setState({ queueRead: true })
  vi.spyOn(performance, 'now').mockImplementation(() => 100_000)
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

/** The Comité, who plays nobody, opens the Tarjeta on a group with nobody in it (or nobody left on the boards). */
function mountEmptyGroup(playerIds: string[]) {
  const fx = getFixture('minimal4-live')!
  const snap = structuredClone(fx.snapshot)
  const round = snap.rounds.find((r) => r.status === 'live')!
  snap.groups.push({ id: 'g-empty', roundId: round.id, number: 9, teeTime: null, startHole: 1, playerIds })
  useTournament.setState({ tournamentId: 'fixture:minimal4-live', data: dataFromSnapshot(snap), loading: false, error: null, realtime: 'off' })
  render(
    <MemoryRouter>
      <TournamentContext.Provider value={{ tournamentId: snap.tournament.id, slug: '_/minimal4-live', lookup: fx.lookup, me: { playerId: null, isOrganizer: true, isComite: true }, refresh: async () => undefined, leave: async () => undefined }}>
        <ScorecardScreen />
      </TournamentContext.Provider>
    </MemoryRouter>,
  )
  fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${S.group} 9`) }))
}

describe('a group with nobody on the boards (ARCH-14)', () => {
  for (const [what, ids] of [
    ['an empty group', []],
    ['a group whose players were deleted', ['gone-1', 'gone-2']],
  ] as const) {
    it(`${what}: the card draws, both views, and a save writes nobody`, async () => {
      mountEmptyGroup([...ids])
      expect(screen.getByText(S.groupLine(1, 9))).toBeTruthy()
      expect(screen.queryAllByRole('group', { name: /./ }).filter((g) => g.querySelector('[class*="stepValue"]'))).toHaveLength(0)
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: new RegExp(`^(${S.save}|${S.saveLast})$`) }))
      })
      expect(enqueueHole).not.toHaveBeenCalled()
      expect(enqueueScore).not.toHaveBeenCalled()
      fireEvent.click(screen.getByRole('button', { name: S.grid }))
      expect(screen.getByRole('table')).toBeTruthy()
    })
  }
})
