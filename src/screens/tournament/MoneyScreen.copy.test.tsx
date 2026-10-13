// @vitest-environment happy-dom
/**
 * COPY-03: Dinero said «Pagó $4,750» for money nobody had handed over (the
 * figure is everything a person puts in, paid or not), and the WhatsApp text
 * friends settle from said the same. Now it reads «Pone», and what is still
 * due today («debe $X», the accounts «Quién debe qué» lists) shows beside it.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

const shared = vi.hoisted(() => ({ text: '' }))
vi.mock('../../components/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../components/ui')>()),
  ShareButton: ({ text }: { text: string }) => {
    shared.text = text
    return null
  },
}))

import { getFixture } from '../../dev/fixtures'
import { dataFromSnapshot, useTournament } from '../../data/tournamentStore'
import { collectible, stillOwes } from '../../engine/core/money'
import type { Snapshot } from '../../engine/types'
import { formatMoney } from '../../lib/money'
import { t } from '../../i18n/es-MX'
import { MoneyScreen } from './MoneyScreen'
import { TournamentContext } from './TournamentGate'

const TID = 'fixture:full12-live'
function mount(edit?: (s: Snapshot) => void) {
  const fx = getFixture('full12-live')!
  const snapshot = structuredClone(fx.snapshot)
  edit?.(snapshot)
  useTournament.setState({ tournamentId: TID, data: dataFromSnapshot(snapshot) })
  render(
    <MemoryRouter>
      <TournamentContext.Provider value={{ tournamentId: TID, slug: 'viaje', lookup: fx.lookup, me: { playerId: 'p9', isOrganizer: false, isAdmin: true }, refresh: async () => undefined, leave: async () => undefined }}>
        <MoneyScreen />
      </TournamentContext.Provider>
    </MemoryRouter>,
  )
  return useTournament.getState().data!.state.money
}
/** Nothing marked paid: no payments on record, no buyback paid. */
const nothingPaid = (s: Snapshot) => {
  s.payments = []
  s.calcuttaBuybacks = s.calcuttaBuybacks.map((b) => ({ ...b, paid: false }))
}

afterEach(() => cleanup())

describe('Dinero says what is put in and what is still due (COPY-03)', () => {
  it('with nothing marked paid, no line says «Pagó»; each says «Pone» and what it still owes', () => {
    const money = mount(nothingPaid)
    expect(document.body.textContent).not.toMatch(/Pagó \$/)
    const someone = Object.values(money.people).find((p) => stillOwes(money.accounts, p.playerId) > 0)!
    const due = stillOwes(money.accounts, someone.playerId)
    // Nobody has paid anything, so what each still owes today is at least his entry.
    expect(due).toBeGreaterThan(0)
    expect(screen.getAllByText(`, ${t.money.owes(formatMoney(due))}`).length).toBeGreaterThan(0)
    expect(document.body.textContent).toContain(`${t.money.puts} ${formatMoney(someone.paid)}`)
  })

  it('the WhatsApp text says «pone» and «debe», never «pagó»', () => {
    const money = mount(nothingPaid)
    expect(shared.text).not.toMatch(/pagó/i)
    const someone = Object.values(money.people).find((p) => stillOwes(money.accounts, p.playerId) > 0)!
    expect(shared.text).toContain(`${t.money.puts.toLowerCase()} ${formatMoney(someone.paid)} (${t.money.owes(formatMoney(stillOwes(money.accounts, someone.playerId)))})`)
  })

  it('a person with everything due today marked paid has no «debe» on his line', () => {
    const money = mount()
    const fx = getFixture('full12-live')!
    const nameOf = (id: string) => fx.snapshot.players.find((p) => p.id === id)!.displayName
    const clear = Object.values(money.people).filter((p) => p.paid > 0 && stillOwes(money.accounts, p.playerId) === 0)
    const owing = Object.values(money.people).filter((p) => stillOwes(money.accounts, p.playerId) > 0)
    expect(clear.length + owing.length).toBeGreaterThan(0)
    for (const p of clear) expect(shared.text).toContain(`${nameOf(p.playerId)}: ${t.money.puts.toLowerCase()} ${formatMoney(p.paid)}, `)
    for (const p of owing) expect(shared.text).toContain(`${nameOf(p.playerId)}: ${t.money.puts.toLowerCase()} ${formatMoney(p.paid)} (${t.money.owes(formatMoney(stillOwes(money.accounts, p.playerId)))}), `)
  })

  it('«Quién debe qué» says how many debts are still out and how much (COPY-07)', () => {
    const money = mount(nothingPaid)
    fireEvent.click(screen.getByRole('radio', { name: t.moneyScreen.final }))
    const owed = money.accounts.filter(collectible)
    expect(owed.length).toBeGreaterThan(0)
    const heading = screen.getByRole('heading', { name: new RegExp(`^${t.moneyScreen.checklist}`) })
    expect(heading.textContent).toBe(`${t.moneyScreen.checklist}: ${t.moneyScreen.checklistCount(owed.length, formatMoney(owed.reduce((n, a) => n + a.due, 0)))}`)
  })
})
