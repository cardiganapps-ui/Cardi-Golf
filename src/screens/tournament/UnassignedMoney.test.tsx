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
import { formatMoney, formatSignedMoney } from '../../lib/money'
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
    // Snake money a tiebreak holds is listed too, with what to answer and no «Decidir».
    expect(u.held.length).toBeGreaterThan(0)
    for (const h of u.held) {
      expect(list().getByText(h.label)).toBeTruthy()
      expect(list().getAllByText(h.note).length).toBeGreaterThan(0)
    }
    expect(list().getAllByRole('button', { name: t.money.howCalculated })).toHaveLength(u.buckets.length + u.held.length)
    expect(list().queryByRole('button', { name: new RegExp(`^${U.decide}`) })).toBeNull()
  })

  it('while a day is open again, what the Comité already decided still shows, marked as waiting', () => {
    mount(false, (s) => {
      const d2 = [...s.rounds].sort((a, b) => a.number - b.number)[1]!
      d2.status = 'live'
      s.moneyAdjustments = [{ id: 'adj-w', callId: 'call-w', sourceKey: 'bestRound', kind: 'award', toPlayerId: s.players[0]!.id, amount: 100, reason: 'Antes de reabrir', createdAt: '2027-04-11T20:00:00+00:00', createdBy: 'org', voidedAt: null, voidReason: null }]
    })
    expect(list().getByText(U.waitingIntro)).toBeTruthy()
    expect(list().getByText('Antes de reabrir')).toBeTruthy()
    expect(list().getByText(U.statusWaiting)).toBeTruthy()
  })

  it('when only snake money a tiebreak holds is left, the verdict says it waits for the answer, not «por asignar» nor a bank that does not square', () => {
    const data = mount(false, (s) => {
      // Every line the Comité can decide, decided (to the house): only the held money stays in the bank.
      const before = dataFromSnapshot(structuredClone(s)).state.money.unassigned
      s.moneyAdjustments = before.buckets.map((b, i) => ({ id: `h${i}`, callId: `h${i}`, sourceKey: b.key, kind: 'house' as const, toPlayerId: null, amount: b.remaining, reason: 'Para la cena', createdAt: `2027-04-11T20:${String(i).padStart(2, '0')}:00+00:00`, createdBy: 'org', voidedAt: null, voidReason: null }))
    })
    const u = data.state.money.unassigned
    expect([u.closing, u.total]).toEqual([true, 0])
    expect(u.heldTotal).toBeGreaterThan(0)
    expect(data.state.money.banker.difference).toBe(u.heldTotal)
    expect(screen.getByText(U.heldTotal(formatMoney(u.heldTotal)))).toBeTruthy()
    expect(screen.queryByText(t.moneyScreen.bankOff(formatSignedMoney(u.heldTotal)))).toBeNull()
    expect(screen.queryByText(U.total(formatMoney(0)))).toBeNull()
  })

  it('Terminado with day 2 still open (an older app, a restored backup): a notice names the day, no bare total, and what the Comité decided still counts', () => {
    const data = mount(false, (s) => {
      const d2 = [...s.rounds].sort((a, b) => a.number - b.number)[1]!
      d2.status = 'scheduled'
      s.tournament.status = 'finished'
      s.moneyAdjustments = [{ id: 'adj-f', callId: 'call-f', sourceKey: 'bestRound', kind: 'award', toPlayerId: s.players[0]!.id, amount: 100, reason: 'Día 2 cancelado', createdAt: '2027-04-11T20:00:00+00:00', createdBy: 'org', voidedAt: null, voidReason: null }]
    })
    const { money } = data.state
    expect(money.unassigned.openDays).toEqual({ open: [2], missing: [] })
    expect(money.banker.difference).toBeGreaterThan(0)
    expect(screen.getByText(U.finalOpenVerdict)).toBeTruthy()
    expect(screen.getAllByText(U.finalOpen([2], [])).length).toBeGreaterThan(0)
    expect(screen.queryByText(t.moneyScreen.bankPending(formatMoney(money.banker.difference)))).toBeNull()
    expect(screen.queryByText(t.moneyScreen.provisional)).toBeNull()
    expect(list().getByText('Día 2 cancelado')).toBeTruthy()
    expect(list().queryByText(U.statusWaiting)).toBeNull()
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

  it('a line another Comité phone assigned meanwhile: the sheet reads it again before sending, and sends nothing', async () => {
    const data = mount(true)
    const best = data.state.money.unassigned.buckets.find((b) => b.key === 'bestRound')!
    fireEvent.click(list().getByRole('button', { name: `${U.decide}: ${best.label}, ${formatMoney(best.remaining)}` }))
    const sheet = within(screen.getByRole('dialog', { name: U.decideTitle(best.label) }))
    fireEvent.click(sheet.getByRole('radio', { name: U.house }))
    fireEvent.change(sheet.getByRole('textbox', { name: new RegExp(U.reason) }), { target: { value: 'Para la cena' } })
    // The other phone's $100 on the same line reaches this one on the fetch the sheet makes before sending.
    const other = structuredClone(data.snapshot)
    other.moneyAdjustments = [{ id: 'adj-o', callId: 'call-o', sourceKey: 'bestRound', kind: 'award', toPlayerId: other.players[0]!.id, amount: 100, reason: 'Otro teléfono', createdAt: '2027-04-11T20:00:00+00:00', createdBy: 'org2', voidedAt: null, voidReason: null }]
    act(() => useTournament.setState({ reload: vi.fn(async () => void useTournament.setState({ data: dataFromSnapshot(other) })) }))
    fireEvent.click(sheet.getByRole('button', { name: U.confirm }))
    await settle()
    expect(api.assigned).toEqual([])
    expect(sheet.getByText(U.stale)).toBeTruthy()
  })

  /** Another Comité phone's $100 award on `bestRound`, as the live channel lands it under the open sheet. */
  const otherPhoneAward = (data: ReturnType<typeof mount>) => {
    const other = structuredClone(data.snapshot)
    other.moneyAdjustments = [{ id: 'adj-o', callId: 'call-o', sourceKey: 'bestRound', kind: 'award', toPlayerId: other.players[0]!.id, amount: 100, reason: 'Otro teléfono', createdAt: '2027-04-11T20:00:00+00:00', createdBy: 'org2', voidedAt: null, voidReason: null }]
    act(() => useTournament.setState({ data: dataFromSnapshot(other) }))
  }
  type Call = [string, string, Array<{ kind: string; to_player_id: string | null; amount: number }>, string]

  it('a refund whose line another phone’s decision changed over the channel while the sheet was open: «Asignar» says so and sends nothing; a second tap sends the new amount', async () => {
    const data = mount(true)
    const best = data.state.money.unassigned.buckets.find((b) => b.key === 'bestRound')!
    expect(best.remaining).toBe(1200)
    expect(best.contributors?.length).toBeGreaterThan(0)
    fireEvent.click(list().getByRole('button', { name: `${U.decide}: ${best.label}, ${formatMoney(best.remaining)}` }))
    const sheet = within(screen.getByRole('dialog', { name: U.decideTitle(best.label) }))
    fireEvent.click(sheet.getByRole('radio', { name: U.refund }))
    fireEvent.change(sheet.getByRole('textbox', { name: new RegExp(U.reason) }), { target: { value: 'Se devuelve' } })
    // The other phone's decision lands live (no fetch): the pro-rata split now covers $1,100, not the $1,200 the Comité looked at.
    otherPhoneAward(data)
    fireEvent.click(sheet.getByRole('button', { name: U.confirm }))
    await settle()
    expect(api.assigned).toEqual([])
    expect(sheet.getByText(U.stale)).toBeTruthy()
    // Once the Comité has seen it, a second tap sends the refund of what the line holds now.
    fireEvent.click(sheet.getByRole('button', { name: U.confirm }))
    await settle()
    const [call] = api.assigned as [Call]
    expect(api.assigned).toHaveLength(1)
    expect(call[1]).toBe('bestRound')
    expect(call[2].every((e) => e.kind === 'refund')).toBe(true)
    expect(call[2].reduce((s, e) => s + e.amount, 0)).toBe(1100)
  })

  it('«a la casa» of the whole line, changed under the sheet the same way: nothing is sent, then the whole new line', async () => {
    const data = mount(true)
    const best = data.state.money.unassigned.buckets.find((b) => b.key === 'bestRound')!
    fireEvent.click(list().getByRole('button', { name: `${U.decide}: ${best.label}, ${formatMoney(best.remaining)}` }))
    const sheet = within(screen.getByRole('dialog', { name: U.decideTitle(best.label) }))
    fireEvent.click(sheet.getByRole('radio', { name: U.house }))
    fireEvent.change(sheet.getByRole('textbox', { name: new RegExp(U.reason) }), { target: { value: 'Para la cena' } })
    otherPhoneAward(data)
    fireEvent.click(sheet.getByRole('button', { name: U.confirm }))
    await settle()
    expect(api.assigned).toEqual([])
    expect(sheet.getByText(U.stale)).toBeTruthy()
    fireEvent.click(sheet.getByRole('button', { name: U.confirm }))
    await settle()
    expect(api.assigned).toEqual([[TID, 'bestRound', [{ kind: 'house', to_player_id: null, amount: 1100 }], 'Para la cena']])
  })

  it('a decision already taken is listed with its reason, and «Anular» voids it with a reason', async () => {
    mount(true, (s) => {
      s.moneyAdjustments = [{ id: 'adj-1', callId: 'call-adj-1', sourceKey: 'bestRound', kind: 'award', toPlayerId: s.players[0]!.id, amount: 100, reason: 'Mejor ronda del día 1', createdAt: '2027-04-11T20:00:00+00:00', createdBy: 'org', voidedAt: null, voidReason: null }]
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
