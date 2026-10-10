// @vitest-environment happy-dom
/**
 * REL-05: a hole someone else saved first is said in words on the Tarjeta,
 * whose value stands and what this phone had, with the two ways out. Every
 * question this phone holds for the tournament, whatever day or group
 * (REL-08: the Comité's list never shows a conflict, so a question hidden
 * here was lost from everyone's sight).
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
  key: `conflict:${over.round_id ?? 'r1'}:${over.player_id ?? 'p3'}:${over.hole ?? 12}`,
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
  const snapshot = structuredClone(fx.snapshot)
  // A second day, finished: a question left on it is still this phone's to answer.
  snapshot.rounds.push({ ...snapshot.rounds[0]!, id: 'r2', number: 2, status: 'finished' })
  useTournament.setState({ tournamentId: fx.snapshot.tournament.id, data: dataFromSnapshot(snapshot), loading: false, error: null })
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
      ],
    })
    render(<HoleConflicts roundId="r1" myPlayerId="p1" />)
    expect(screen.getByText(S.conflictTitle)).toBeTruthy()
    const lines = screen.getAllByText(/^Hoyo \d+:/).map((el) => el.textContent)
    expect(lines).toEqual([
      S.conflictLine(12, name('p2'), name('p3'), '6', '5', false),
      S.conflictLine(13, null, name('p1'), '7 con 1 putt', 'levantó con 0 putts', false),
      S.conflictLine(14, name('p4'), name('p4'), '1 putt', '3 putts', true),
    ])
    // The day on screen is live: nothing to say about where «Guardar el mío» goes.
    expect(screen.queryByText(S.conflictClosedHint)).toBeNull()
  })

  it('every one of the tournament’s, whatever the day or the group: another day’s names its day, and a closed day says where «Guardar el mío» goes', () => {
    useOutbox.setState({ conflicts: [conflict({ round_id: 'r2', hole: 3 }), conflict({ player_id: 'p9', hole: 5 })] })
    render(<HoleConflicts roundId="r1" myPlayerId="p1" />)
    expect(screen.getByText(S.conflictLine(3, name('p2'), name('p3'), '6', '5', false, 2))).toBeTruthy()
    // A player of another group (one this phone's boards do not name): still asked.
    expect(screen.getByText(S.conflictLine(5, name('p2'), '?', '6', '5', false))).toBeTruthy()
    expect(screen.getByText(S.conflictClosedHint)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: S.conflictAction(S.keepMine, 3, name('p3'), 2) }))
    expect(sendMineAgain).toHaveBeenCalledWith('conflict:r2:p3:3', 'p1')
  })

  it('with no day on screen, each line names its day', () => {
    useOutbox.setState({ conflicts: [conflict({})] })
    render(<HoleConflicts roundId={null} myPlayerId="p1" />)
    expect(screen.getByText(S.conflictLine(12, name('p2'), name('p3'), '6', '5', false, 1))).toBeTruthy()
  })

  it('a day deleted since says so: «Hoyo N (día borrado)», never a bare «Hoyo N» that reads as the day on screen', () => {
    useOutbox.setState({ conflicts: [conflict({ round_id: 'r-deleted', hole: 7 })] })
    render(<HoleConflicts roundId="r1" myPlayerId="p1" />)
    const line = S.conflictLine(7, name('p2'), name('p3'), '6', '5', false, 'gone')
    expect(line.startsWith('Hoyo 7 (día borrado): ')).toBe(true)
    expect(screen.getByText(line)).toBeTruthy()
    expect(screen.queryByText(S.conflictLine(7, name('p2'), name('p3'), '6', '5', false))).toBeNull()
    const action = S.conflictAction(S.keepMine, 7, name('p3'), 'gone')
    expect(action).toBe(`${S.keepMine}: hoyo 7 (día borrado), ${name('p3')}`)
    fireEvent.click(screen.getByRole('button', { name: action }))
    expect(sendMineAgain).toHaveBeenCalledWith('conflict:r-deleted:p3:7', 'p1')
  })

  it('«Guardar el mío» sends it again as this phone’s player; «Dejar el suyo» keeps theirs', () => {
    useOutbox.setState({ conflicts: [conflict({})] })
    render(<HoleConflicts roundId="r1" myPlayerId="p1" />)
    fireEvent.click(screen.getByRole('button', { name: S.conflictAction(S.keepMine, 12, name('p3')) }))
    expect(sendMineAgain).toHaveBeenCalledWith('conflict:r1:p3:12', 'p1')
    fireEvent.click(screen.getByRole('button', { name: S.conflictAction(S.keepTheirs, 12, name('p3')) }))
    expect(keepTheirs).toHaveBeenCalledWith('conflict:r1:p3:12')
  })

  it('shows nothing without a conflict', () => {
    const { container } = render(<HoleConflicts roundId="r1" myPlayerId="p1" />)
    expect(container.innerHTML).toBe('')
  })
})
