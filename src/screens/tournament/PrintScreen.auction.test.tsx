// @vitest-environment happy-dom
/**
 * DB-19: the auction console needs the server for every bid, so a Calcutta night without it had no way on.
 * The printable page has the night on paper: the lots in the order drawn (the players when nothing is drawn yet),
 * what is sold already filled in, the tournament's own rules, and how to enter it afterwards.
 */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import { getFixture } from '../../dev/fixtures'
import { dataFromSnapshot, useTournament } from '../../data/tournamentStore'
import { parseSettings } from '../../engine/settings/schema'
import { t } from '../../i18n/es-MX'
import { formatMoney } from '../../lib/money'
import { PrintScreen } from './PrintScreen'
import { TournamentContext } from './tournamentContext'

afterEach(() => cleanup())
const P = t.print

function show(name: string, search = '?hoja=calcutta') {
  const fx = getFixture(name)!
  useTournament.setState({
    tournamentId: `fixture:${name}`,
    data: dataFromSnapshot(structuredClone(fx.snapshot)),
    loading: false,
    error: null,
    realtime: 'off',
  })
  render(
    <MemoryRouter initialEntries={[`/t/x/imprimir${search}`]}>
      <TournamentContext.Provider
        value={{
          tournamentId: fx.snapshot.tournament.id,
          slug: 'x',
          lookup: fx.lookup,
          me: fx.me,
          refresh: async () => undefined,
          leave: async () => undefined,
        }}
      >
        <Routes>
          <Route path="/t/x/imprimir" element={<PrintScreen />} />
        </Routes>
      </TournamentContext.Provider>
    </MemoryRouter>,
  )
  return fx.snapshot
}
const bodyRows = () => within(screen.getByRole('table')).getAllByRole('row').slice(1)

describe('the Calcutta on paper (DB-19)', () => {
  it('mid-auction: the lots in their order, the sold ones with buyer and price, the rest blank', () => {
    const snap = show('auction12')
    const name = (id: string | null) => snap.players.find((p) => p.id === id)?.displayName ?? ''
    const lots = [...snap.calcuttaLots].sort((a, b) => a.lotNumber - b.lotNumber)
    const rows = bodyRows()
    expect(rows).toHaveLength(lots.length)
    lots.forEach((l, i) => {
      const cells = within(rows[i]!).getAllByRole('cell')
      expect(cells[0]!.textContent).toBe(String(l.lotNumber))
      expect(cells[1]!.textContent).toContain(name(l.playerId))
      expect(cells[2]!.textContent).toBe(l.status === 'sold' ? name(l.ownerId) : '')
      expect(cells[3]!.textContent).toBe(l.status === 'sold' ? formatMoney(l.price!, 'MXN') : '')
    })
    expect(lots.filter((l) => l.status !== 'sold').length).toBeGreaterThan(0)
    // Its own rules, and how the console takes it afterwards; no scorecards under it.
    const a = parseSettings(snap.tournament.settings).auction
    expect(
      screen.getByText(
        P.auctionRules(
          formatMoney(a.openingBid, 'MXN'),
          formatMoney(a.increment, 'MXN'),
          a.maxPlayersPerOwner,
          a.selfOwnedCountsTowardMax,
          a.buybackMaxPct,
        ),
      ),
    ).toBeTruthy()
    expect(screen.getByText(P.auctionAfter)).toBeTruthy()
    expect(screen.queryByText(new RegExp(P.sign))).toBeNull()
  })

  it('before the hat: every player in order, the lot left to write', () => {
    const snap = show('calcutta12')
    const rows = bodyRows()
    expect(rows).toHaveLength(snap.players.length)
    const order = [...snap.players].sort((a, b) => a.sortOrder - b.sortOrder)
    rows.forEach((r, i) => {
      const cells = within(r).getAllByRole('cell')
      expect(cells[0]!.textContent).toBe('')
      expect(cells[1]!.textContent).toContain(order[i]!.displayName)
    })
  })

  it('the page switches between the cards and the sheet; without the Calcutta there is no sheet', () => {
    show('auction12', '')
    expect(screen.queryByText(P.auctionAfter)).toBeNull()
    fireEvent.click(screen.getByRole('radio', { name: P.auctionSheet }))
    expect(screen.getByText(P.auctionAfter)).toBeTruthy()
    cleanup()
    show('minimal4-live')
    expect(screen.queryByText(P.auctionAfter)).toBeNull()
    expect(screen.queryByRole('radio', { name: P.auctionSheet })).toBeNull()
  })
})
