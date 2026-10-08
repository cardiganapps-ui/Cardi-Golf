// @vitest-environment happy-dom
/**
 * STRAT-03: in a strokes event with no points game beside it, the Tarjeta
 * speaks strokes, never Stableford points. A hole is named on the score the
 * event counts («triple bogey» on a gross card, «doble bogey neto» on a net
 * one) and highlighted only for a birdie or better on that score. The grid's
 * small figure is the net score (none on a gross card), and the nines add up
 * net and gross strokes under a caption that says so.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../data/outbox', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../data/outbox')>()),
  enqueueScore: vi.fn(async () => undefined),
  enqueueAward: vi.fn(async () => undefined),
  enqueueTiebreak: vi.fn(async () => undefined),
  enqueueSignature: vi.fn(async () => undefined),
}))
vi.mock('../../data/quick', () => ({ roundRivalries: vi.fn(async () => []) }))
vi.mock('canvas-confetti', () => ({ default: vi.fn() }))

import { getFixture } from '../../dev/fixtures'
import { dataFromSnapshot, useTournament } from '../../data/tournamentStore'
import type { TournamentSettings } from '../../engine/settings/schema'
import type { Snapshot } from '../../engine/types'
import { t } from '../../i18n/es-MX'
import { ScorecardScreen } from './ScorecardScreen'
import { TournamentContext } from './TournamentGate'

const S = t.card

/** stroke8's card for group 1 (Elías, Fabián, Gael H., Hugo I.), all 18 holes in: it opens on the 18th. */
function tarjeta(edit?: (s: Snapshot) => void) {
  const fx = getFixture('stroke8')!
  const snap = structuredClone(fx.snapshot)
  edit?.(snap)
  useTournament.setState({ tournamentId: 'fixture:stroke8', data: dataFromSnapshot(snap), loading: false, error: null, realtime: 'off' })
  render(
    <MemoryRouter>
      <TournamentContext.Provider value={{ tournamentId: snap.tournament.id, slug: '_/stroke8', lookup: fx.lookup, me: fx.me, refresh: async () => undefined, leave: async () => undefined }}>
        <ScorecardScreen />
      </TournamentContext.Provider>
    </MemoryRouter>,
  )
}
const gross = (s: Snapshot) => {
  const st = s.tournament.settings as TournamentSettings
  s.tournament.settings = { ...st, modules: { ...st.modules, individual: { ...st.modules.individual, formatOptions: { ...st.modules.individual.formatOptions, scoring: 'gross' } } } }
}
/** A player's line on the hole: what the hole is called, and whether it is highlighted. */
function holeLine(player: string) {
  const badge = screen.getByRole('group', { name: player }).querySelector('[class*="_pts_"]')!
  return { text: badge.textContent, highlighted: badge.className.includes('ptsHigh') }
}
function showGrid() {
  fireEvent.click(screen.getByRole('button', { name: S.grid }))
  const rows = screen.getAllByRole('row')
  const players = Array.from(rows[0]!.children).map((c) => c.textContent)
  /** A player's cell in the row for a hole («5») or a subtotal («Ida»): its big figure and the small one beside it. */
  const cell = (row: string, player: string) => {
    const tr = rows.find((r) => (/^\d+$/.test(row) ? r.firstElementChild?.textContent === row : r.firstElementChild?.textContent?.startsWith(row)))!
    const box = tr.children[players.indexOf(player)]!.querySelector('[class*="_cell_"]')!
    return [box.firstElementChild!.textContent, box.querySelector('[class*="cellPts"]')!.textContent]
  }
  const captions = Array.from(document.querySelectorAll('[class*="subCaption"]')).map((c) => c.textContent)
  return { cell, captions }
}

afterEach(() => cleanup())

describe('the Tarjeta in stroke play (STRAT-03)', () => {
  it('a hole is named on the score the event counts: net on a net card, gross on a gross one', () => {
    // Hugo I. makes 8 on the par-5 18th with a stroke there.
    tarjeta()
    expect(holeLine('Hugo I.')).toEqual({ text: 'doble bogey neto', highlighted: false })
    cleanup()
    tarjeta(gross)
    expect(holeLine('Hugo I.')).toEqual({ text: 'triple bogey', highlighted: false })
    expect(holeLine('Fabián')).toEqual({ text: 'birdie', highlighted: true })
  })

  it('on a gross card a par with a stroke received is a par, not highlighted', () => {
    // The three Stableford points of a net birdie are not what a gross event counts.
    tarjeta((s) => {
      gross(s)
      s.scores = s.scores.map((x) => (x.playerId === 'p4' && x.hole === 18 ? { ...x, strokes: 5 } : x))
    })
    expect(holeLine('Hugo I.')).toEqual({ text: 'par', highlighted: false })
  })

  it('the grid shows the net score beside the gross under net strokes, and nothing beside it under gross', () => {
    // Elías's 3 on the 5th (par 4, stroke index 1, one stroke received): net 2, worth 4 Stableford points.
    tarjeta()
    expect(showGrid().cell('5', 'Elías')).toEqual(['3', '2'])
    cleanup()
    tarjeta(gross)
    expect(showGrid().cell('5', 'Elías')).toEqual(['3', ''])
  })

  it('the nines add up net and gross strokes, under a caption that says so', () => {
    // Elías's front nine: 33 net, 35 gross (21 Stableford points).
    tarjeta()
    let grid = showGrid()
    expect(grid.captions).toEqual([S.netGrossCaption, S.netGrossCaption, S.netGrossCaption])
    expect(grid.cell('Ida', 'Elías')).toEqual(['33', '35'])
    expect(grid.cell('Total', 'Elías')).toEqual(['75', '79'])
    cleanup()
    tarjeta(gross)
    grid = showGrid()
    expect(grid.captions).toEqual([S.grossCaption, S.grossCaption, S.grossCaption])
    expect(grid.cell('Ida', 'Elías')).toEqual(['', '35'])
  })
})
