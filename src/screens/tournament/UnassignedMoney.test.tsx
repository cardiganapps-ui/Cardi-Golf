// @vitest-environment happy-dom
/**
 * «Por asignar» on Dinero (MONEY-05, COPY-09), on the real screen and the
 * `full12-live` fixture with day 2 cancelled: the money the rules leave to
 * the Comité is a list everyone reads (where it comes from, how much, why,
 * and that the Comité decides), never a bare red number; the Comité decides
 * each line in a sheet (to someone, back to who paid it, to the house) with
 * a reason, and voids a decision with a reason. Calls are recorded, not sent.
 */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({ assigned: [] as unknown[][], voided: [] as unknown[][] }))
vi.mock('../../data/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../data/api')>()),
  assignUnassigned: vi.fn(async (...args: unknown[]) => void api.assigned.push(args)),
  voidAdjustment: vi.fn(async (...args: unknown[]) => void api.voided.push(args)),
}))

import { getFixture } from '../../dev/fixtures'
import { dataFromSnapshot, useTournament } from '../../data/tournamentStore'
import type { Snapshot } from '../../engine/types'
import { t } from '../../i18n/es-MX'
import { formatMoney } from '../../lib/money'
import { MoneyScreen } from './MoneyScreen'
import { TournamentContext } from './TournamentGate'

const U = t.unassigned
const TID = 'fixture:full12-live'

/** Day 1 finished, day 2 rained out: its prizes are the Comité's to decide. */
function rainedOut(s: Snapshot) {
  const [d1, d2] = [...s.rounds].sort((a, b) => a.number - b.number)
  d1!.status = 'finished'
  d2!.status = 'cancelled'
  s.scores = s.scores.filter((x) => x.roundId !== d2!.id)
}

function mount(isAdmin: boolean, edit?: (s: Snapshot) => void) {
  const fx = getFixture('full12-live')!
  const snapshot = structuredClone(fx.snapshot)
  rainedOut(snapshot)
  edit?.(snapshot)
  const data = dataFromSnapshot(snapshot)
  useTournament.setState({ tournamentId: TID, data, reload: vi.fn(async () => undefined) })
  render(
    <MemoryRouter>
      <TournamentContext.Provider value={{ tournamentId: TID, slug: 'viaje', lookup: fx.lookup, me: { playerId: 'p9', isOrganizer: false, isAdmin }, refresh: async () => undefined, leave: async () => undefined }}>
        <MoneyScreen />
      </TournamentContext.Provider>
    </MemoryRouter>,
  )
  return data
}
const list = () => within(screen.getByRole('region', { name: U.heading }))
const settle = () => act(async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve()
})

beforeEach(() => {
  api.assigned = []
  api.voided = []
})
afterEach(cleanup)

describe('everyone reads what is «por asignar» and why (COPY-09)', () => {
  it('each line names its source, its amount, its «¿Cómo se calculó?» and that the Comité decides; no actions for a player', () => {
    const data = mount(false)
    const u = data.state.money.unassigned
    expect(u.closing).toBe(true)
    expect(u.buckets.map((b) => b.key)).toContain('bestRound')
    expect(screen.getByText(U.total(formatMoney(u.total)))).toBeTruthy()
    expect(screen.getByText(U.totalHint)).toBeTruthy()
    for (const b of u.buckets) {
      expect(list().getByText(b.label)).toBeTruthy()
      expect(list().getAllByText(formatMoney(b.remaining)).length).toBeGreaterThan(0)
    }
    expect(list().getAllByText(U.decides)).toHaveLength(u.buckets.length)
    expect(list().getAllByRole('button', { name: t.money.howCalculated })).toHaveLength(u.buckets.length)
    expect(list().queryByRole('button', { name: new RegExp(`^${U.decide}`) })).toBeNull()
  })

  it('nothing is listed while a day is still to play', () => {
    mount(false, (s) => {
      const d2 = [...s.rounds].sort((a, b) => a.number - b.number)[1]!
      d2.status = 'live'
    })
    expect(screen.queryByRole('region', { name: U.heading })).toBeNull()
  })
})

describe('the Comité decides each line (MONEY-05)', () => {
  it('to the house, with a reason: one call with the line’s key', async () => {
    const data = mount(true)
    const best = data.state.money.unassigned.buckets.find((b) => b.key === 'bestRound')!
    fireEvent.click(list().getByRole('button', { name: `${U.decide}: ${best.label}, ${formatMoney(best.remaining)}` }))
    const sheet = within(screen.getByRole('dialog', { name: U.decideTitle(best.label) }))
    fireEvent.click(sheet.getByRole('radio', { name: U.house }))
    // No reason yet: nothing is sent.
    fireEvent.click(sheet.getByRole('button', { name: U.confirm }))
    await settle()
    expect(api.assigned).toEqual([])
    expect(sheet.getByText(U.reasonShort)).toBeTruthy()
    fireEvent.change(sheet.getByRole('textbox', { name: new RegExp(U.reason) }), { target: { value: 'Para la cena del domingo' } })
    fireEvent.click(sheet.getByRole('button', { name: U.confirm }))
    await settle()
    expect(api.assigned).toEqual([[TID, 'bestRound', [{ kind: 'house', to_player_id: null, amount: best.remaining }], 'Para la cena del domingo']])
  })

  it('back to who paid it: the pro-rata split is shown before it is sent, and sent as shown', async () => {
    const data = mount(true)
    const b = data.state.money.unassigned.buckets.find((x) => x.contributors?.length)!
    fireEvent.click(list().getByRole('button', { name: `${U.decide}: ${b.label}, ${formatMoney(b.remaining)}` }))
    const sheet = within(screen.getByRole('dialog', { name: U.decideTitle(b.label) }))
    fireEvent.click(sheet.getByRole('radio', { name: U.refund }))
    expect(sheet.getByText(U.refundHint)).toBeTruthy()
    fireEvent.change(sheet.getByRole('textbox', { name: new RegExp(U.reason) }), { target: { value: 'Se devuelve' } })
    fireEvent.click(sheet.getByRole('button', { name: U.confirm }))
    await settle()
    const [call] = api.assigned as [[string, string, Array<{ kind: string; amount: number }>, string]]
    expect(call[1]).toBe(b.key)
    expect(call[2].every((e) => e.kind === 'refund')).toBe(true)
    expect(call[2].reduce((s, e) => s + e.amount, 0)).toBe(b.remaining)
  })

  it('to someone: more than the line holds is refused before anything is sent', async () => {
    const data = mount(true)
    const best = data.state.money.unassigned.buckets.find((b) => b.key === 'bestRound')!
    fireEvent.click(list().getByRole('button', { name: `${U.decide}: ${best.label}, ${formatMoney(best.remaining)}` }))
    const sheet = within(screen.getByRole('dialog', { name: U.decideTitle(best.label) }))
    const [first, second] = data.snapshot.players
    // Each box stops at what the line holds; two of them together go over.
    for (const p of [first!, second!]) {
      const box = sheet.getByRole('textbox', { name: U.amountFor(p.displayName) })
      fireEvent.focus(box)
      fireEvent.change(box, { target: { value: String(best.remaining) } })
    }
    fireEvent.change(sheet.getByRole('textbox', { name: new RegExp(U.reason) }), { target: { value: 'A los dos' } })
    fireEvent.click(sheet.getByRole('button', { name: U.confirm }))
    await settle()
    expect(api.assigned).toEqual([])
    expect(sheet.getAllByText(U.tooMuch(formatMoney(best.remaining))).length).toBeGreaterThan(0)
  })

  it('a decision already taken is listed with its reason, and «Anular» voids it with a reason', async () => {
    mount(true, (s) => {
      s.moneyAdjustments = [{ id: 'adj-1', sourceKey: 'bestRound', kind: 'award', toPlayerId: s.players[0]!.id, amount: 100, reason: 'Mejor ronda del día 1', createdAt: '2027-04-11T20:00:00+00:00', createdBy: 'org', voidedAt: null, voidReason: null }]
    })
    expect(list().getByText(U.applied)).toBeTruthy()
    expect(list().getByText('Mejor ronda del día 1')).toBeTruthy()
    fireEvent.click(list().getByRole('button', { name: new RegExp(`^${U.void}: `) }))
    const sheet = within(screen.getByRole('dialog', { name: U.voidTitle }))
    fireEvent.change(sheet.getByRole('textbox'), { target: { value: 'Era para otro' } })
    fireEvent.click(sheet.getByRole('button', { name: U.void }))
    await settle()
    expect(api.voided).toEqual([['adj-1', 'Era para otro']])
  })
})
