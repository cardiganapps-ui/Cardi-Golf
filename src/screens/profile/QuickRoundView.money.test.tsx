// @vitest-environment happy-dom
/**
 * COPY-21: «Con dinero» committed everyone to each game's stake (Skins $200,
 * Tres putts $20 to each rival…) and the screen never said a figure. Now each
 * chosen game says what it asks, and the total each one puts in up front.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GAME_ENTRIES } from '../../engine/games/catalog'
import { quickSettings, quickStakes, quickUpfront } from '../../engine/games/quick'
import { t } from '../../i18n/es-MX'
import { formatMoney } from '../../lib/money'
import { QuickRoundView } from './QuickRoundScreen'

const Q = t.quick
afterEach(cleanup)

async function mount() {
  render(
    <MemoryRouter>
      <QuickRoundView
        me={{ displayName: 'Ana', avatarUrl: null, index: 10 }}
        friends={[]}
        courses={[{ id: 'c1', name: 'Campo' } as never]}
        loadTees={async () => [{ id: 't1', name: 'Azules', rating: 72, slope: 113, holes: 18 }]}
        onStart={vi.fn(async () => undefined)}
      />
    </MemoryRouter>,
  )
  await act(async () => undefined)
}

describe('Ronda rápida «Con dinero» says what each game asks (COPY-21)', () => {
  it('each chosen game with its figure, and what everyone puts in before the first hole', async () => {
    await mount()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: Q.game.threePutts })))
    await act(async () => fireEvent.click(screen.getByRole('checkbox', { name: new RegExp(`^${Q.money}`) })))
    // Skins is on by default: $200 each, a pot of $200 for one player; Tres putts is paid player to player.
    expect(screen.getByText(Q.stakeBuyIn(Q.game.skins!, formatMoney(200), formatMoney(200)))).toBeTruthy()
    expect(screen.getByText(Q.stakeThreePutts(formatMoney(20)))).toBeTruthy()
    // The entry ($200 by default) and the Skins buy-in, before the first hole.
    expect(screen.getByText(Q.upfront(1, formatMoney(400), true))).toBeTruthy()
    expect(screen.getByText(Q.potLine(formatMoney(200), null))).toBeTruthy()
  })

  it('without money, no figure', async () => {
    await mount()
    expect(screen.queryByText(/por jugador, bote de/)).toBeNull()
  })
})

describe('quickStakes (COPY-21)', () => {
  it('reads the same money the round is created with', () => {
    const games = ['skins', 'closest', 'birdies', 'threePutts', 'lowNet'] as const
    const created = quickSettings({ games: [...games], money: true, entryFee: 300, players: 4 }).games
    for (const s of quickStakes([...games])) {
      const g = created.find((x) => x.id === s.game.toLowerCase())!
      expect(s.buyIn).toBe(g.money.source === 'side' ? g.money.buyIn : null)
      expect(s.perEvent).toBe(g.money.source === 'direct' ? g.money.stake : null)
    }
    expect(quickUpfront(300, [...games])).toBe(300 + 200 + 100 + 100)
    expect(GAME_ENTRIES.length).toBeGreaterThan(0)
  })
})
