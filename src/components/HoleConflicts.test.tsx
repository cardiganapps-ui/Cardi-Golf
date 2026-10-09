// @vitest-environment happy-dom
/**
 * REL-05: a hole someone else saved first is said in words on the Tarjeta,
 * whose value stands and what this phone had, with the two ways out.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../data/outbox', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../data/outbox')>()),
  sendMineAgain: vi.fn(async () => undefined),
  keepTheirs: vi.fn(async () => undefined),
}))

import { keepTheirs, sendMineAgain, useOutbox, type ConflictItem } from '../data/outbox'
import { dataFromSnapshot, useTournament } from '../data/tournamentStore'
import { getFixture } from '../dev/fixtures'
import { t } from '../i18n/es-MX'
import { HoleConflicts } from './HoleConflicts'

const S = t.card
const fx = getFixture('minimal4-live')!
const name = (id: string) => fx.snapshot.players.find((p) => p.id === id)!.displayName
const conflict = (over: Partial<ConflictItem>): ConflictItem => ({
  key: `conflict:r1:${over.player_id ?? 'p3'}:${over.hole ?? 12}`,
  tournamentId: fx.snapshot.tournament.id,
  round_id: 'r1',
  hole: 12,
  player_id: 'p3',
  fields: { strokes: 5, putts: 2 },
  base: {},
  clash: ['strokes'],
  server: { strokes: 6, putts: 2, picked_up: false, entered_by: 'p2' },
  at: 1,
  ...over,
})

beforeEach(() => {
  useTournament.setState({ tournamentId: fx.snapshot.tournament.id, data: dataFromSnapshot(structuredClone(fx.snapshot)), loading: false, error: null })
})
afterEach(() => {
  cleanup()
  useOutbox.setState({ conflicts: [] })
  vi.mocked(sendMineAgain).mockClear()
  vi.mocked(keepTheirs).mockClear()
})

describe('HoleConflicts', () => {
  it('says who saved first, their value and this phone’s, hole by hole', () => {
    useOutbox.setState({
      conflicts: [
        conflict({ hole: 14, player_id: 'p4', clash: ['putts'], fields: { putts: 3 }, base: { strokes: 5, putts: 2, picked_up: false }, server: { strokes: 5, putts: 1, picked_up: false, entered_by: 'p4' } }),
        conflict({}),
        conflict({ hole: 13, player_id: 'p1', clash: ['strokes', 'putts'], fields: { picked_up: true }, base: {}, server: { strokes: 7, putts: 1, picked_up: false, entered_by: 'unknown' } }),
        // Another round's, and a player of another group: not this card's.
        conflict({ round_id: 'r2' }),
      ],
    })
    render(<HoleConflicts roundId="r1" playerIds={['p1', 'p2', 'p3', 'p4']} myPlayerId="p1" />)
    expect(screen.getByText(S.conflictTitle)).toBeTruthy()
    const lines = screen.getAllByText(/^Hoyo \d+:/).map((el) => el.textContent)
    expect(lines).toEqual([
      S.conflictLine(12, name('p2'), name('p3'), '6', '5', false),
      S.conflictLine(13, null, name('p1'), '7 con 1 putt', 'levantó con 0 putts', false),
      S.conflictLine(14, name('p4'), name('p4'), '1 putt', '3 putts', true),
    ])
  })

  it('«Guardar el mío» sends it again as this phone’s player; «Dejar el suyo» keeps theirs', () => {
    useOutbox.setState({ conflicts: [conflict({})] })
    render(<HoleConflicts roundId="r1" playerIds={['p1', 'p2', 'p3', 'p4']} myPlayerId="p1" />)
    fireEvent.click(screen.getByRole('button', { name: S.conflictAction(S.keepMine, 12, name('p3')) }))
    expect(sendMineAgain).toHaveBeenCalledWith('conflict:r1:p3:12', 'p1')
    fireEvent.click(screen.getByRole('button', { name: S.conflictAction(S.keepTheirs, 12, name('p3')) }))
    expect(keepTheirs).toHaveBeenCalledWith('conflict:r1:p3:12')
  })

  it('shows nothing without a conflict on this card', () => {
    useOutbox.setState({ conflicts: [conflict({ player_id: 'p9' })] })
    const { container } = render(<HoleConflicts roundId="r1" playerIds={['p1', 'p2', 'p3', 'p4']} myPlayerId="p1" />)
    expect(container.innerHTML).toBe('')
  })
})
