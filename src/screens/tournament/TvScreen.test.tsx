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
import { OfflineBanner } from '../../components/OfflineBanner'
import { TournamentContext } from './tournamentContext'
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
    expect(screen.getByRole('status').textContent).toContain(formatMoney(price, 'MXN'))
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

describe('«Lo que está en juego» shows the pesos each slot pays (MONEY-16)', () => {
  it('an odd pot: the champion’s slot carries the rounding peso and the five add up to the pot, never a peso short', () => {
    mount()
    expect(useTournament.getState().data!.settings.auction.payout.map((s) => s.share)).toEqual([0.55, 0.2, 0.1, 0.1, 0.05])
    // Nine lots sold: make the pot $11,750, so 55% is $6,462.50 and 5% $587.50.
    const pot = snap.calcuttaLots.filter((l) => l.status === 'sold').reduce((s, l) => s + (l.price ?? 0), 0)
    lot(1).price = (lot(1).price ?? 0) + 11750 - pot
    act(() => load(snap))
    const stakes = Array.from(document.querySelectorAll('[class*="stakeRow"]')).map((r) => r.lastElementChild?.textContent)
    // The TV floored pot × share itself: $6,462 and $587, a peso short of the pot.
    expect(stakes).toEqual(['$6,463', '$2,350', '$1,175', '$1,175', '$587'].map((x) => formatMoney(Number(x.replace(/[$,]/g, '')), 'MXN')))
  })
})

describe('the TV says how old its boards are while they may be behind (REL-10)', () => {
  function showTv(state: { error: string | null; minutesAgo: number }) {
    const fx = getFixture('full12-live')!
    useTournament.setState({ tournamentId: 't-real', data: dataFromSnapshot(structuredClone(fx.snapshot)), loading: false, source: 'server', realtime: 'live', error: state.error, updatedAt: Date.now() - state.minutesAgo * 60_000 })
    return render(
      <MemoryRouter>
        <TournamentContext.Provider value={{ tournamentId: 't-real', slug: 'nacho', lookup: fx.lookup, me: fx.me, refresh: async () => undefined, leave: async () => undefined }}>
          <TvScreen />
        </TournamentContext.Provider>
      </MemoryRouter>,
    )
  }
  const headerLine = () => document.querySelector('header')!.textContent ?? ''

  it('a fetch of them that failed: «Actualizado hace 7 min» under the event name, for the room', () => {
    showTv({ error: t.errors.network, minutesAgo: 7 })
    expect(headerLine()).toContain(t.sync.boardsAge('hace 7 min'))
  })

  it('live boards: no age', () => {
    showTv({ error: null, minutesAgo: 7 })
    expect(headerLine()).not.toContain(t.sync.boardsAge('hace 7 min'))
  })

  it('no signal: its own line says so, once, at the room’s size, and the app’s banner stays away (REL-21)', async () => {
    // It showed the phone's strip «Sin señal. Se guarda en el teléfono.» over the board, and the age under the name.
    const fx = getFixture('full12-live')!
    useTournament.setState({ tournamentId: 't-real', data: dataFromSnapshot(structuredClone(fx.snapshot)), loading: false, source: 'server', realtime: 'live', error: null, updatedAt: Date.now() - 3 * 60_000 })
    render(
      <MemoryRouter>
        <OfflineBanner />
        <TournamentContext.Provider value={{ tournamentId: 't-real', slug: 'nacho', lookup: fx.lookup, me: fx.me, refresh: async () => undefined, leave: async () => undefined }}>
          <TvScreen />
        </TournamentContext.Provider>
      </MemoryRouter>,
    )
    const onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    try {
      await act(async () => {
        window.dispatchEvent(new Event('offline'))
      })
      expect(headerLine()).toContain(`. ${t.sync.offlineShort}. ${t.sync.boardsAge('hace 3 min')}`)
      expect(document.body.textContent?.split(t.sync.offlineShort).length).toBe(2)
      expect(document.body.textContent).not.toContain(t.sync.offline)
    } finally {
      onLine.mockRestore()
      window.dispatchEvent(new Event('online'))
    }
  })
})

