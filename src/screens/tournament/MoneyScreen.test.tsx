// @vitest-environment happy-dom
/**
 * «Marcar pagado» and «Ya pagaron» at their edges, on the real Dinero screen
 * and the `full12-live` fixture, with each write recorded instead of sent.
 * The PR #86 verifier found these with nothing pinning them:
 *
 * - A payment made in parts. Leonel paid his first lot ($750) on Calcutta
 *   night and then bought two more. «Ya pagaron» lists the $750; taking it
 *   back puts the whole $2,250 in «Quién debe qué», and «Deshacer» records
 *   the $750 again, not the $2,250 (which would forgive $1,500).
 * - Writes go one at a time, in the order they were tapped, and the buttons
 *   wait for the last one. A «Deshacer» tapped mid-write ran alongside it.
 * - A «Deshacer» older than a later tap on the same payment would bring back
 *   the older value; it says so instead.
 * - The row that held focus leaves its list: focus goes to the button now in
 *   its place, not to the top of the page.
 */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Write = { from_player_id: string | null; to_player_id: string | null; amount: number; kind: string; paid: boolean }
const api = vi.hoisted(() => ({ writes: [] as Write[], gate: null as Promise<void> | null }))
vi.mock('../../data/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../data/api')>()),
  setPaymentPaid: vi.fn(async (_tid: string, p: Write) => {
    api.writes.push(p)
    await api.gate
  }),
  setBuybackPaid: vi.fn(async () => undefined),
}))
const toasts = vi.hoisted(() => [] as Array<{ msg: string; action?: { label: string; onClick: () => void } }>)
vi.mock('../../components/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../components/ui')>()),
  toast: vi.fn((msg: string, action?: { label: string; onClick: () => void }) => void toasts.push({ msg, action })),
}))

import { getFixture } from '../../dev/fixtures'
import { dataFromSnapshot, useTournament } from '../../data/tournamentStore'
import type { Snapshot } from '../../engine/types'
import { t } from '../../i18n/es-MX'
import { MoneyScreen } from './MoneyScreen'
import { TournamentContext } from './TournamentGate'

const M = t.moneyScreen
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
  fireEvent.click(screen.getByRole('radio', { name: M.final }))
}

/** Leonel paid his first lot ($750) before buying two more ($500 and $1,000). */
const paidFirstLot = (s: Snapshot) => void s.payments.push({ id: 'pay-cal-p11', fromPlayerId: 'p11', toPlayerId: null, amount: 750, kind: 'calcutta', paid: true, note: null })

const owedList = () => within(screen.getByRole('heading', { name: M.checklist }).closest('section')!)
function paidList() {
  const summary = screen.getByText(/^Ya pagaron \(\d+\)$/)
  const details = summary.closest('details')!
  if (!details.open) fireEvent.click(summary)
  return within(details)
}
const markButtons = () => owedList().getAllByRole('button', { name: new RegExp(`^${M.markPaid}: `) })
const leonelOwes = (amount: string) => owedList().queryByRole('button', { name: new RegExp(`^${M.markPaid}: Leonel ${M.paysTo} ${M.bank}, .*: \\${amount}$`) })
/** Every promise the screen chained, settled. */
const settle = () => act(async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve()
})
const lastToast = (msg: string) => [...toasts].reverse().find((x) => x.msg === msg)!

beforeEach(() => {
  api.writes.length = 0
  api.gate = null
  toasts.length = 0
})
afterEach(() => cleanup())

describe('Dinero: a payment made in parts (UX-21)', () => {
  it('taking back the $750 puts the whole $2,250 back, and «Deshacer» records the $750, not the $2,250', async () => {
    mount(paidFirstLot)
    expect(leonelOwes('$1,500')).toBeTruthy()
    // «Ya pagaron» lists what he paid, even though he still owes the rest.
    const toggle = paidList().getByRole('button', { name: new RegExp(`^${M.paid}: Leonel ${M.paidTo} ${M.bank}, .*: \\$750$`) })
    fireEvent.click(toggle)
    await settle()
    expect(api.writes).toEqual([{ from_player_id: 'p11', to_player_id: null, amount: 750, kind: 'calcutta', paid: false }])
    expect(leonelOwes('$2,250')).toBeTruthy()

    act(() => lastToast(M.unmarkedPaid).action!.onClick())
    await settle()
    expect(api.writes[1]).toEqual({ from_player_id: 'p11', to_player_id: null, amount: 750, kind: 'calcutta', paid: true })
    expect(leonelOwes('$1,500')).toBeTruthy()
  })

  it('a «Marcar pagado» by mistake on the rest: «Deshacer» goes back to the $750 he had paid', async () => {
    mount(paidFirstLot)
    fireEvent.click(leonelOwes('$1,500')!)
    await settle()
    expect(api.writes).toEqual([{ from_player_id: 'p11', to_player_id: null, amount: 2250, kind: 'calcutta', paid: true }])
    expect(leonelOwes('$1,500')).toBeNull()
    act(() => lastToast(M.markedPaid).action!.onClick())
    await settle()
    expect(api.writes[1]).toEqual({ from_player_id: 'p11', to_player_id: null, amount: 750, kind: 'calcutta', paid: true })
    expect(leonelOwes('$1,500')).toBeTruthy()
  })
})

describe('Dinero: payment writes one at a time (UX-21)', () => {
  it('a «Deshacer» tapped while another write is on its way waits its turn, and the buttons wait for both', async () => {
    mount()
    const [first] = markButtons()
    const firstName = first!.getAttribute('aria-label')
    fireEvent.click(first!)
    await settle()
    expect(api.writes).toHaveLength(1)

    // The next write hangs on the network.
    let release: () => void = () => undefined
    api.gate = new Promise((resolve) => (release = resolve))
    fireEvent.click(markButtons()[0]!)
    await settle()
    expect(api.writes).toHaveLength(2)
    expect(markButtons().every((b) => (b as HTMLButtonElement).disabled)).toBe(true)

    // The first toast's «Deshacer», mid-write: nothing is sent until the write before it lands.
    act(() => toasts.find((x) => x.msg === M.markedPaid)!.action!.onClick())
    await settle()
    expect(api.writes).toHaveLength(2)
    expect(markButtons().every((b) => (b as HTMLButtonElement).disabled)).toBe(true)

    api.gate = null
    release()
    await settle()
    expect(api.writes).toHaveLength(3)
    // In the order tapped: the undo of the first goes last, back to unpaid.
    expect(api.writes[2]).toMatchObject({ ...api.writes[0], paid: false, amount: 0 })
    expect(markButtons().every((b) => !(b as HTMLButtonElement).disabled)).toBe(true)
    expect(owedList().getByRole('button', { name: firstName! })).toBeTruthy()
  })

  it('an older «Deshacer», after a later tap on the same payment, says so and writes nothing', async () => {
    mount()
    const name = markButtons()[0]!.getAttribute('aria-label')!
    fireEvent.click(markButtons()[0]!)
    await settle()
    // Taken back from «Ya pagaron»: a later tap on the same payment.
    const who = name.slice(`${M.markPaid}: `.length).split(` ${M.paysTo} `)[0]!
    fireEvent.click(paidList().getAllByRole('button', { name: new RegExp(`^${M.paid}: ${who} `) })[0]!)
    await settle()
    expect(api.writes).toHaveLength(2)

    act(() => lastToast(M.markedPaid).action!.onClick())
    await settle()
    expect(api.writes).toHaveLength(2)
    expect(toasts.at(-1)!.msg).toBe(M.undoStale)

    // The newer one still works.
    act(() => lastToast(M.unmarkedPaid).action!.onClick())
    await settle()
    expect(api.writes).toHaveLength(3)
    expect(api.writes[2]).toMatchObject({ paid: true })
  })
})

describe('Dinero: focus when a row leaves its list', () => {
  it('goes to the button now in its place', async () => {
    mount()
    const [first, second] = markButtons()
    const secondName = second!.getAttribute('aria-label')
    first!.focus()
    fireEvent.click(first!)
    await settle()
    expect(document.activeElement?.getAttribute('aria-label')).toBe(secondName)
  })

  it('a tap that never took focus (a phone) leaves focus alone', async () => {
    mount()
    ;(document.activeElement as HTMLElement | null)?.blur()
    fireEvent.click(markButtons()[0]!)
    await settle()
    expect(document.activeElement).toBe(document.body)
  })
})
