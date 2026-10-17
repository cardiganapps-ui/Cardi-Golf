// @vitest-environment happy-dom
/**
 * Calcutta night's other two moments, for the room (UX-17, MOT-05). The TV kept
 * the finished auction on screen while the pairs were drawn on one phone, and
 * the lot order out of the hat was never on it. Now a draw saved while the TV
 * is on comes out a pair at a time once the last sale has had its stamp, and
 * before the first lot opens the TV shows the order out of the hat.
 */
import { act, cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getFixture } from '../../dev/fixtures'
import { dataFromSnapshot, useTournament } from '../../data/tournamentStore'
import { DRAW_STEP } from '../../design/motion'
import type { Snapshot } from '../../engine/types'
import { t } from '../../i18n/es-MX'
import { formatMoney } from '../../lib/money'
import { TournamentContext } from './tournamentContext'
import { TvScreen } from './TvScreen'

// happy-dom rejects a running animation's `finished` when the test unmounts it; nothing here waits on it.
const cancelAnimation = Animation.prototype.cancel
Animation.prototype.cancel = function (this: Animation) {
  this.finished.catch(() => undefined)
  cancelAnimation.call(this);
}

let snap: Snapshot
const load = () => useTournament.setState({ tournamentId: 'fixture:draw', data: dataFromSnapshot(structuredClone(snap)), loading: false, error: null, realtime: 'off' })
/** The TV on a fixture, changed first; `land` changes the boards as a realtime reload would. */
function tv(fixture: string, change?: (s: Snapshot) => void) {
  const fx = getFixture(fixture)!
  snap = structuredClone(fx.snapshot)
  change?.(snap)
  load()
  render(
    <MemoryRouter>
      <TournamentContext.Provider value={{ tournamentId: snap.tournament.id, slug: `_/${fixture}`, lookup: fx.lookup, me: fx.me, refresh: async () => undefined, leave: async () => undefined }}>
        <TvScreen />
      </TournamentContext.Provider>
    </MemoryRouter>,
  )
}
function land(change: (s: Snapshot) => void) {
  act(() => {
    change(snap)
    load()
  })
}
const pairsOnScreen = () => [...document.querySelectorAll('[data-pair]')].map((el) => el.getAttribute('data-pair'))
const drawn = () => structuredClone(getFixture('draw12')!.snapshot.pairs)
const label = () => useTournament.getState().data!.settings.modules.pairs.label
const nameOf = (id: string) => snap.players.find((p) => p.id === id)!.displayName

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] })
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('the pairs draw on the TV (UX-17)', () => {
  it('after the last sale, a draw saved while the TV is on comes out a pair at a time, the groom\'s pick first', () => {
    tv('draw12', (s) => void (s.pairs = []))
    expect(screen.getByText(t.auction.allSold)).toBeTruthy()
    // A draw is saved nameless; the pairs name themselves after.
    land((s) => void (s.pairs = drawn().map((p) => ({ ...p, name: null }))))
    expect(screen.getByText(t.tv.drawTitle(label()))).toBeTruthy()
    expect(pairsOnScreen()).toEqual(['dp4'])
    expect(document.querySelector('[data-pair="dp4"]')!.textContent).toContain(t.tv.drawPicked(nameOf('p4')))
    act(() => void vi.advanceTimersByTime(DRAW_STEP * 1000))
    expect(pairsOnScreen()).toEqual(['dp4', 'dp1'])
    act(() => void vi.advanceTimersByTime(DRAW_STEP * 1000 * 4))
    // The A with D pairs, then the B with C ones.
    expect(pairsOnScreen()).toEqual(['dp4', 'dp1', 'dp2', 'dp3', 'dp5', 'dp6'])
  })

  it('a redraw while the TV is on comes out from the start again', () => {
    tv('draw12')
    expect(pairsOnScreen()).toHaveLength(6)
    land((s) => void (s.pairs = drawn().map((p) => ({ ...p, id: `re-${p.id}`, name: null }))))
    expect(pairsOnScreen()).toEqual(['re-dp4'])
  })

  it('opened after the draw, the TV shows every pair at once, with the names they gave themselves', () => {
    tv('draw12')
    expect(pairsOnScreen()).toHaveLength(6)
    expect(screen.getByText('Los Cuñados')).toBeTruthy()
    // Named, the groom's pair still says he picked.
    expect(document.querySelector('[data-pair="dp4"]')!.textContent).toContain(`${t.common.andList([nameOf('p4'), nameOf('p7')])}, ${t.tv.drawPicked(nameOf('p4'))}`)
    // An unnamed pair reads as its two players, and their categories under them.
    const row = document.querySelector('[data-pair="dp2"]')!
    expect(row.textContent).toContain(t.common.andList([nameOf('p2'), nameOf('p11')]))
    expect(row.textContent).toContain(t.tv.drawKind('A', 'D'))
  })

  it('a name typed on the phone lands on the TV, with no new reveal', () => {
    tv('draw12')
    land((s) => void (s.pairs = s.pairs.map((p) => (p.id === 'dp2' ? { ...p, name: 'Los Bogey' } : p))))
    expect(screen.getByText('Los Bogey')).toBeTruthy()
    expect(pairsOnScreen()).toHaveLength(6)
  })

  it('the last sale keeps its stamp before the draw takes the board', () => {
    // The pairs were drawn before the auction ended; lot 10 is the last one open.
    tv('auction12', (s) => {
      s.pairs = drawn()
      for (const l of s.calcuttaLots) if (l.lotNumber > 10) Object.assign(l, { status: 'sold', price: 500, ownerId: l.playerId, soldAt: '2027-04-08T21:30:00.000Z' })
    })
    expect(screen.getByText(t.auction.lot(10))).toBeTruthy()
    land((s) => {
      const lot = s.calcuttaLots.find((l) => l.lotNumber === 10)!
      Object.assign(lot, { status: 'sold', price: 750, ownerId: lot.playerId, soldAt: '2027-04-08T21:40:00.000Z' })
    })
    expect(screen.getByText(t.auction.stampSelf)).toBeTruthy()
    expect(pairsOnScreen()).toEqual([])
    act(() => void vi.advanceTimersByTime(4000))
    expect(pairsOnScreen()).toHaveLength(6)
  })
})

describe('the order out of the hat (MOT-05)', () => {
  it('before the first lot opens, the TV shows every lot in order', () => {
    tv('hat12')
    const lots = [...snap.calcuttaLots].sort((a, b) => a.lotNumber - b.lotNumber)
    const items = [...document.querySelectorAll('[class*="_hatItem_"]')].map((li) => li.textContent)
    expect(items).toEqual(lots.map((l) => `${l.lotNumber}${nameOf(l.playerId)}`))
    expect(screen.getByRole('heading', { level: 2 }).textContent).toContain(t.tv.hatTitle)
  })

  it('opening the first lot takes the board to its card', () => {
    tv('hat12')
    land((s) => void Object.assign(s.calcuttaLots.find((l) => l.lotNumber === 1)!, { status: 'open' }))
    expect(document.querySelector('[class*="_hatItem_"]')).toBeNull()
    expect(screen.getByText(t.auction.lot(1))).toBeTruthy()
  })
})

describe('the pot (MOT-05)', () => {
  it('opens on its figure, never counting up from $0', () => {
    tv('auction12')
    const pot = useTournament.getState().data!.state.modules.auction!.pot
    expect(pot).toBeGreaterThan(0)
    const shown = document.querySelector('[class*="_pot_"] [aria-hidden="true"]')!.textContent
    expect(shown).toBe(formatMoney(pot, 'MXN'))
  })
})
