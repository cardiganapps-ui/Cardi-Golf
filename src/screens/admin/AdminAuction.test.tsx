// @vitest-environment happy-dom
/**
 * UX-13: at a loud dinner the auctioneer tapped «+$250» for the next shout
 * without picking again, and the high bidder raised himself; a stray
 * «¡Vendido!» sold the lot at once; «Reabrir» was an unlabelled icon with no
 * question. Now the bidder is picked for every bid, the one on top can't be
 * picked, and the hammer and a reopen each ask first.
 */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getFixture } from '../../dev/fixtures'
import { dataFromSnapshot, useTournament } from '../../data/tournamentStore'
import { formatMoney } from '../../lib/money'
import { t } from '../../i18n/es-MX'
import { Toaster } from '../../components/ui'

const api = vi.hoisted(() => ({
  placeBid: vi.fn(async () => undefined),
  sellLot: vi.fn(async () => undefined),
  reopenLot: vi.fn(async () => undefined),
  deleteBid: vi.fn(async () => undefined),
  setBuyback: vi.fn(async () => undefined),
  setLotStatus: vi.fn(async () => undefined),
  createLots: vi.fn(async () => undefined),
  resetAuction: vi.fn(async () => undefined),
  updateTournament: vi.fn(async () => undefined),
}))
vi.mock('../../data/api', () => api)
vi.mock('../tournament/TournamentGate', () => ({ useTournamentCtx: () => ({ tournamentId: 'fx-auction', slug: 'fixture-auction12' }) }))

const { AdminAuction } = await import('./AdminAuction')
const A = t.auction

function mount() {
  const fx = getFixture('auction12')!
  useTournament.setState({ tournamentId: 'fx-auction', data: dataFromSnapshot(structuredClone(fx.snapshot)), reload: async () => undefined } as never)
  render(
    <MemoryRouter>
      <AdminAuction />
    </MemoryRouter>,
  )
  const state = useTournament.getState().data!.state.modules.auction!
  const open = state.lots.find((l) => l.status === 'open')!
  const leader = open.currentBid?.bidderId ?? open.playerId
  const name = (id: string) => fx.snapshot.players.find((p) => p.id === id)!.displayName
  return { open, leader, name, players: fx.snapshot.players }
}
const tiles = () => within(screen.getByRole('radiogroup', { name: A.bidder }))
const plus = () => screen.getByRole('button', { name: A.bid(formatMoney(250)) })

beforeEach(() => Object.values(api).forEach((f) => f.mockClear()))
afterEach(() => cleanup())

describe('Calcutta console at a loud dinner (UX-13)', () => {
  it('the bidder is picked for every bid: after «+$250» nobody stays picked', async () => {
    const { leader, players } = mount()
    const other = players.find((p) => p.id !== leader)!
    fireEvent.click(tiles().getByRole('radio', { name: other.displayName }))
    await act(async () => fireEvent.click(plus()))
    expect(api.placeBid).toHaveBeenCalledTimes(1)
    expect(tiles().queryAllByRole('radio', { checked: true })).toHaveLength(0)
    expect(plus()).toHaveProperty('disabled', true)
    expect(screen.getByText(A.pickBidder)).toBeTruthy()
  })

  it('the one on top cannot be picked to raise himself', () => {
    const { leader, name } = mount()
    const tile = tiles().getByRole('radio', { name: A.leadingLabel(name(leader)) })
    expect(tile).toHaveProperty('disabled', true)
    expect(within(tile).getByText(A.leading)).toBeTruthy()
  })

  it('«¡Vendido!» asks first, naming the player, the buyer and the price; «Cancelar» sells nothing', async () => {
    const { open, leader, name } = mount()
    fireEvent.click(screen.getByRole('button', { name: A.sold }))
    expect(api.sellLot).not.toHaveBeenCalled()
    const ask = screen.getByRole('dialog', { name: A.hammerTitle })
    const price = formatMoney(open.currentBid?.amount ?? 250)
    expect(within(ask).getByText(leader === open.playerId ? A.hammerSelf(name(open.playerId), price) : A.hammerBody(name(open.playerId), name(leader), price))).toBeTruthy()
    fireEvent.click(within(ask).getByRole('button', { name: t.common.cancel }))
    expect(api.sellLot).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: A.sold }))
    await act(async () => fireEvent.click(within(screen.getByRole('dialog', { name: A.hammerTitle })).getByRole('button', { name: A.sold })))
    expect(api.sellLot).toHaveBeenCalledWith(open.lotId, leader, open.currentBid?.amount ?? 250)
  })

  it('«Reabrir lote» is labelled, waits while another lot is open, and asks first', async () => {
    mount()
    const reopen = screen.getAllByRole('button', { name: new RegExp(A.reopen) })
    expect(reopen.length).toBeGreaterThan(0)
    // Lot 10 is open: a sold lot can't be reopened beside it.
    expect(reopen.every((b) => (b as HTMLButtonElement).disabled)).toBe(true)
    // With no lot open, the first sold one asks before it reopens.
    cleanup()
    const fx = getFixture('auction12')!
    const snap = structuredClone(fx.snapshot)
    for (const l of snap.calcuttaLots) if (l.status === 'open') l.status = 'pending'
    useTournament.setState({ tournamentId: 'fx-auction', data: dataFromSnapshot(snap), reload: async () => undefined } as never)
    render(
      <MemoryRouter>
        <AdminAuction />
      </MemoryRouter>,
    )
    fireEvent.click(screen.getAllByRole('button', { name: new RegExp(A.reopen) })[0]!)
    expect(api.reopenLot).not.toHaveBeenCalled()
    const ask = screen.getByRole('dialog')
    expect(within(ask).getByText(/Se deshace la venta de/)).toBeTruthy()
    await act(async () => fireEvent.click(within(ask).getByRole('button', { name: A.reopen })))
    expect(api.reopenLot).toHaveBeenCalledTimes(1)
  })
})

describe('a custom bid goes up in the increment (MONEY-19)', () => {
  /** The console with its toasts, a bidder picked who is not on top, and the bid standing on the open lot. */
  function ready() {
    const fx = getFixture('auction12')!
    useTournament.setState({ tournamentId: 'fx-auction', data: dataFromSnapshot(structuredClone(fx.snapshot)), reload: async () => undefined } as never)
    render(
      <MemoryRouter>
        <AdminAuction />
        <Toaster />
      </MemoryRouter>,
    )
    const open = useTournament.getState().data!.state.modules.auction!.lots.find((l) => l.status === 'open')!
    const leader = open.currentBid?.bidderId ?? open.playerId
    const other = fx.snapshot.players.find((p) => p.id !== leader)!
    fireEvent.click(tiles().getByRole('radio', { name: other.displayName }))
    return { open, other, standing: open.currentBid?.amount ?? 250 }
  }
  const custom = async (amount: number) => {
    fireEvent.change(screen.getByRole('textbox', { name: A.customAmount }), { target: { value: String(amount) } })
    await act(async () => fireEvent.click(screen.getByRole('button', { name: A.custom })))
  }

  it('a fat finger off the step is refused, naming the next bid, and nothing is sent', async () => {
    const { standing } = ready()
    await custom(standing + 120)
    expect(api.placeBid).not.toHaveBeenCalled()
    expect(screen.getByText(A.offStep(formatMoney(250), [formatMoney(standing + 250)]))).toBeTruthy()
  })

  it('between two steps further up, both are offered', async () => {
    const { standing } = ready()
    await custom(standing + 850)
    expect(api.placeBid).not.toHaveBeenCalled()
    expect(screen.getByText(A.offStep(formatMoney(250), [formatMoney(standing + 750), formatMoney(standing + 1000)]))).toBeTruthy()
  })

  it('on the step, the bid goes as typed', async () => {
    const { open, other, standing } = ready()
    await custom(standing + 750)
    expect(api.placeBid).toHaveBeenCalledWith(open.lotId, other.id, standing + 750)
  })
})
