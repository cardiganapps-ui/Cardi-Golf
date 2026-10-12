// @vitest-environment happy-dom
/**
 * MONEY-07 on the real Dinero screen (`full12-finished`): every settlement
 * amount, vía banco and sin banco, the bank's figures and each «Por juego»
 * amount open their «¿Cómo se calculó?», and the sheet says what the engine
 * says. Before, the settlement rows had no tap target at all.
 */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getFixture } from '../../dev/fixtures'
import { dataFromSnapshot, useTournament } from '../../data/tournamentStore'
import { t } from '../../i18n/es-MX'
import { formatMoney } from '../../lib/money'
import { MoneyScreen } from './MoneyScreen'
import { TournamentContext } from './TournamentGate'

const M = t.moneyScreen
const H = t.money.howCalculated
const TID = 'fixture:full12-finished'

function mount() {
  const fx = getFixture('full12-finished')!
  useTournament.setState({ tournamentId: TID, data: dataFromSnapshot(structuredClone(fx.snapshot)) })
  render(
    <MemoryRouter>
      <TournamentContext.Provider value={{ tournamentId: TID, slug: 'viaje', lookup: fx.lookup, me: { playerId: 'p9', isOrganizer: false, isAdmin: false }, refresh: async () => undefined, leave: async () => undefined }}>
        <MoneyScreen />
      </TournamentContext.Provider>
    </MemoryRouter>,
  )
}
const state = () => useTournament.getState().data!.state
const name = (id: string | null) => (id ? useTournament.getState().data!.snapshot.players.find((p) => p.id === id)!.displayName : M.bank)
const lineName = (from: string | null, to: string | null, amount: number) => (amount === 0 ? M.squared(name(from), name(to)) : M.pays(name(from), name(to), formatMoney(amount)))
/** Opens the trigger and returns the steps the sheet lists. */
function open(button: HTMLElement) {
  fireEvent.click(button)
  const sheet = screen.getByRole('dialog')
  return within(sheet).getAllByRole('listitem').map((li) => li.textContent)
}

beforeEach(() => mount())
afterEach(() => {
  cleanup()
  useTournament.setState({ tournamentId: null, data: null })
})

describe('Dinero › Liquidación: every amount opens its «¿Cómo se calculó?» (MONEY-07)', () => {
  it('vía banco: each line, with what it is made of', () => {
    fireEvent.click(screen.getByRole('radio', { name: M.final }))
    const lines = state().money.viaBank
    expect(lines.length).toBeGreaterThan(0)
    for (const tr of lines) {
      const steps = open(screen.getByRole('button', { name: `${H} ${lineName(tr.from, tr.to, tr.amount)}` }))
      expect(steps).toEqual(tr.why[0]!.steps)
      fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })
      cleanup()
      mount()
      fireEvent.click(screen.getByRole('radio', { name: M.final }))
    }
  })

  it('sin banco: a transfer shows both positions and the share between them', () => {
    fireEvent.click(screen.getByRole('radio', { name: M.final }))
    fireEvent.click(screen.getByRole('radio', { name: M.p2p }))
    const tr = state().money.peerToPeer[0]!
    const steps = open(screen.getByRole('button', { name: `${H} ${lineName(tr.from, tr.to, tr.amount)}` }))
    expect(steps).toEqual(tr.why.flatMap((w) => w.steps))
  })

  it('the bank: what comes in, what goes out, and what is left', () => {
    const steps = open(screen.getByRole('button', { name: `${H} ${M.bank}` }))
    expect(steps).toEqual(state().money.banker.why.steps)
    expect(steps).toContain(t.settleWhy.bankInTotal(formatMoney(state().money.banker.receives)))
  })

  it('Por juego: each amount opens the prize’s own explanation', () => {
    fireEvent.click(screen.getByRole('radio', { name: M.byGame }))
    // The bank's own trigger stays above every mode.
    const triggers = screen.getAllByRole('button', { name: new RegExp(`^${H.replace(/[?¿]/g, '\\$&')} `) }).filter((b) => b.getAttribute('aria-label') !== `${H} ${M.bank}`)
    expect(triggers.length).toBe(state().prizes.length)
    const steps = open(triggers[0]!)
    expect(state().prizes.some((pr) => JSON.stringify(pr.why.steps) === JSON.stringify(steps))).toBe(true)
  })
})
