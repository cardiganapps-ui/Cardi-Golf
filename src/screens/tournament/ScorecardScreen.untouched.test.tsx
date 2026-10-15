// @vitest-environment happy-dom
/**
 * COPY-10: before anyone typed anything, the Tarjeta's badge scored every player from the defaults. The
 * steppers start at par, so a player with a stroke on the hole read «3 pts, birdie neto» (one with two,
 * «4 pts, águila neta») on a hole nobody had played, and a tired scorer could save believing it. A row nobody
 * has changed on a hole he hasn't played now says «Sin capturar»; a change, or a hole he has saved, says the
 * points.
 *
 * `minimal4-live` opens on hole 10: p1, p3 and p4 haven't played it, p2 has.
 */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../data/outbox', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../data/outbox')>()),
  enqueueHole: vi.fn(async () => undefined),
  enqueueScore: vi.fn(async () => undefined),
}))
vi.mock('../../data/quick', () => ({ roundRivalries: vi.fn(async () => []) }))
vi.mock('canvas-confetti', () => ({ default: vi.fn() }))

import { useOutbox } from '../../data/outbox'
import { getFixture } from '../../dev/fixtures'
import { dataFromSnapshot, useTournament } from '../../data/tournamentStore'
import { computeTournament } from '../../engine/computeTournament'
import { netScoreName, stablefordPoints } from '../../engine/core/stableford'
import { parseSettings } from '../../engine/settings/schema'
import { t } from '../../i18n/es-MX'
import { ScorecardScreen } from './ScorecardScreen'
import { TournamentContext } from './TournamentGate'

const S = t.card
const fx = getFixture('minimal4-live')!
const snap = fx.snapshot
const state = computeTournament(snap, parseSettings(snap.tournament.settings))
const nameOf = (id: string) => snap.players.find((p) => p.id === id)!.displayName
const holeOf = (id: string) => state.core.rounds.r1![id]!.holes[9]!
/** A player's row, found by his name as a screen reader finds it (a string name matches the whole name). */
const row = (id: string) => within(screen.getByRole('group', { name: nameOf(id) }))

beforeEach(() => {
  useOutbox.setState({ queueRead: true })
  vi.spyOn(performance, 'now').mockImplementation(() => 100_000)
  useTournament.setState({ tournamentId: 'fixture:minimal4-live', data: dataFromSnapshot(structuredClone(snap)), loading: false, error: null, realtime: 'off' })
  render(
    <MemoryRouter>
      <TournamentContext.Provider value={{ tournamentId: snap.tournament.id, slug: '_/minimal4-live', lookup: fx.lookup, me: fx.me, refresh: async () => undefined, leave: async () => undefined }}>
        <ScorecardScreen />
      </TournamentContext.Provider>
    </MemoryRouter>,
  )
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('a player nobody has changed reads «Sin capturar» (COPY-10)', () => {
  it('no score name before anything is typed; the saved player keeps his points', () => {
    expect(Number(document.querySelector('[class*="holeNum"]')?.textContent)).toBe(10)
    // Someone gets a stroke here: under the old badge his par default read as a net birdie.
    expect(['p1', 'p3', 'p4'].some((id) => holeOf(id).strokesReceived > 0)).toBe(true)
    for (const id of ['p1', 'p3', 'p4']) {
      expect(row(id).getByText(S.notCaptured, { exact: false })).toBeTruthy()
      expect(row(id).queryByText(/pts/)).toBeNull()
    }
    const saved = holeOf('p2')
    expect(saved.played).toBe(true)
    expect(row('p2').getByText(S.ptsLine(saved.points, saved.points > 0 ? netScoreName(saved.points) : null), { exact: false })).toBeTruthy()
    expect(screen.getAllByText(S.notCaptured, { exact: false })).toHaveLength(3)
  })

  it('a change scores him; back to the default, he is uncaptured again', () => {
    const h = holeOf('p1')
    const up = screen.getByRole('button', { name: `${S.strokesOf(nameOf('p1'))}: ${t.common.stepUp}` })
    act(() => fireEvent.click(up))
    const pts = stablefordPoints(h.par, h.strokesReceived, h.par + 1, false)
    expect(row('p1').getByText(S.ptsLine(pts, pts > 0 ? netScoreName(pts) : null), { exact: false })).toBeTruthy()
    expect(row('p1').queryByText(S.notCaptured, { exact: false })).toBeNull()
    const down = screen.getByRole('button', { name: `${S.strokesOf(nameOf('p1'))}: ${t.common.stepDown}` })
    act(() => fireEvent.click(down))
    expect(row('p1').getByText(S.notCaptured, { exact: false })).toBeTruthy()
  })
})
