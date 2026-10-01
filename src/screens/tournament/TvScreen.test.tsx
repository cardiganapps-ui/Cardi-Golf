// @vitest-environment happy-dom
/**
 * MOT-04: on Calcutta night the TV never showed a sale. At the hammer the lot
 * card jumped to the next player in the same frame, and the sold list added
 * the newest sale at the bottom, below the edge of the screen from the 8th on.
 */
import { act, cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getFixture } from '../../dev/fixtures'
import { dataFromSnapshot, useTournament } from '../../data/tournamentStore'
import type { Snapshot } from '../../engine/types'
import { t } from '../../i18n/es-MX'
import { formatMoney } from '../../lib/money'
import { TournamentContext } from './TournamentGate'
import { TvScreen } from './TvScreen'

let snap: Snapshot
const load = (s: Snapshot) => useTournament.setState({ tournamentId: 'fixture:auction12', data: dataFromSnapshot(structuredClone(s)), loading: false, error: null, realtime: 'off' })
const full = (id: string) => snap.players.find((p) => p.id === id)!.fullName
const short = (id: string) => snap.players.find((p) => p.id === id)!.displayName
const lot = (n: number) => snap.calcuttaLots.find((l) => l.lotNumber === n)!

function mount() {
  const fx = getFixture('auction12')!
  snap = structuredClone(fx.snapshot)
  load(snap)
  return render(
    <MemoryRouter>
      <TournamentContext.Provider value={{ tournamentId: snap.tournament.id, slug: '_/auction12', lookup: fx.lookup, me: fx.me, refresh: async () => undefined, leave: async () => undefined }}>
        <TvScreen />
      </TournamentContext.Provider>
    </MemoryRouter>,
  )
}

/** The auctioneer's «¡Vendido!» landing through Realtime: lot n goes to its high bidder. */
function hammer(n: number) {
  const l = lot(n)
  const top = snap.calcuttaBids.filter((b) => b.lotId === l.id).sort((a, b) => b.amount - a.amount)[0]
  Object.assign(l, { status: 'sold', ownerId: top?.bidderId ?? l.playerId, price: top?.amount ?? 250, soldAt: '2027-04-08T21:30:00Z' })
  act(() => load(snap))
  return { owner: top?.bidderId ?? l.playerId, price: top?.amount ?? 250 }
}

beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }))
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('Calcutta night on the TV (MOT-04)', () => {
  it('the sale stays on the card with «Vendido a …», then the next player comes up', () => {
    mount()
    expect(screen.getByRole('heading', { name: full(lot(10).playerId) })).toBeTruthy()
    const { owner, price } = hammer(10)
    // Same frame as the hammer: still the sold player, now with who bought him and for how much.
    expect(screen.getByRole('heading', { name: full(lot(10).playerId) })).toBeTruthy()
    const sale = owner === lot(10).playerId ? t.auction.stampSelf : t.auction.stampTo(short(owner))
    expect(screen.getByText(sale)).toBeTruthy()
    expect(screen.getByRole('status').textContent).toContain(formatMoney(price))
    act(() => void vi.advanceTimersByTime(4000))
    expect(screen.queryByText(sale)).toBeNull()
    expect(screen.getByRole('heading', { name: full(lot(11).playerId) })).toBeTruthy()
  })

  it('opening the next lot ends the sold card at once', () => {
    mount()
    hammer(10)
    Object.assign(lot(11), { status: 'open' })
    act(() => load(snap))
    expect(screen.getByRole('heading', { name: full(lot(11).playerId) })).toBeTruthy()
    expect(screen.queryByText(/^Vendido a /)).toBeNull()
  })

  it('the sold list puts the newest sale first', () => {
    mount()
    // Each row's own player: the owner follows it in small type.
    const rows = () => Array.from(document.querySelectorAll('[class*="soldRow"]')).map((r) => r.firstElementChild?.firstChild?.textContent?.trim())
    expect(rows()[0]).toBe(short(lot(9).playerId))
    hammer(10)
    expect(rows()[0]).toBe(short(lot(10).playerId))
    expect(rows()).toHaveLength(10)
  })
})
