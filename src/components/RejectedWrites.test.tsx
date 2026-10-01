// @vitest-environment happy-dom
/**
 * REL-08: a player's phone out of signal when the Comité finished the day
 * had its last holes refused into a list nobody could see. The Tarjeta
 * showed only «El día 2 ya terminó» (the list mounted inside the card, which
 * a player never reaches on a closed day), the reason was the server's
 * generic refusal, the copy promised the Comité could resend from its own
 * phone (the list lives on this one), and «Terminar ronda» never mentioned
 * phones still holding holes.
 */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../data/quick', () => ({ roundRivalries: vi.fn(async () => []) }))
vi.mock('canvas-confetti', () => ({ default: vi.fn() }))
const toasts = vi.hoisted(() => [] as string[])
vi.mock('./ui', async (importOriginal) => ({ ...(await importOriginal<typeof import('./ui')>()), toast: vi.fn((msg: string) => void toasts.push(msg)) }))

import { useOutbox, type RejectedItem } from '../data/outbox'
import { getFixture } from '../dev/fixtures'
import { dataFromSnapshot, useTournament } from '../data/tournamentStore'
import type { Snapshot } from '../engine/types'
import { t } from '../i18n/es-MX'
import { ScorecardScreen } from '../screens/tournament/ScorecardScreen'
import { TournamentContext } from '../screens/tournament/TournamentGate'
import { RejectedWrites } from './RejectedWrites'

const IB = t.admin.inbox
const CAMILO = 'p3'

/** Camilo's hole 11 on day 2, refused by the server. */
const hole11: RejectedItem = {
  key: 'score:r2:p3:11',
  kind: 'score',
  tournamentId: 'fx-full',
  payload: { round_id: 'r2', player_id: CAMILO, hole: 11, strokes: 5, putts: 2, picked_up: false, entered_by: CAMILO, client_ts: '2027-04-10T15:00:00Z' },
  message: t.sync.errDenied,
  at: 1,
}

function mount(ui: 'tarjeta' | 'list', opts: { edit?: (s: Snapshot) => void; isAdmin?: boolean; rejected?: RejectedItem[] } = {}) {
  const fx = getFixture('full12-live')!
  const snapshot = structuredClone(fx.snapshot)
  opts.edit?.(snapshot)
  useTournament.setState({ tournamentId: 'fx-full', data: dataFromSnapshot(snapshot) })
  const me = { playerId: CAMILO, isOrganizer: false, isAdmin: opts.isAdmin ?? false }
  const view = render(
    <MemoryRouter>
      <TournamentContext.Provider value={{ tournamentId: 'fx-full', slug: 'viaje', lookup: fx.lookup, me, refresh: async () => undefined, leave: async () => undefined }}>
        {ui === 'tarjeta' ? <ScorecardScreen /> : <RejectedWrites canResend={me.isAdmin} playerId={CAMILO} />}
      </TournamentContext.Provider>
    </MemoryRouter>,
  )
  act(() => useOutbox.setState({ rejected: opts.rejected ?? [hole11] }))
  return view
}
const finishDay2 = (s: Snapshot) => void (s.rounds.find((r) => r.id === 'r2')!.status = 'finished')
const list = () => within(screen.getByRole('region', { name: IB.rejectedTitle }))

afterEach(() => {
  cleanup()
  useOutbox.setState({ rejected: [] })
  toasts.length = 0
  vi.unstubAllGlobals()
})

describe('a player whose holes were refused when the day closed (REL-08)', () => {
  it('sees them on the Tarjeta of the closed day, with the day, the values and why', () => {
    mount('tarjeta', { edit: finishDay2 })
    expect(screen.getByText(t.card.roundFinished(2))).toBeTruthy()
    expect(list().getByText('Camilo, día 2, hoyo 11: 5 golpes, 2 putts')).toBeTruthy()
    expect(list().getByText(IB.reasonClosed(2))).toBeTruthy()
    // The truth about where the list lives, and what to do with it.
    expect(list().getByText(IB.rejectedHintPlayer)).toBeTruthy()
    expect(list().queryByRole('button', { name: new RegExp(`^${IB.resend}`) })).toBeNull()
    expect(list().getByRole('button', { name: `${IB.discard}: Camilo, día 2, hoyo 11: 5 golpes, 2 putts` })).toBeTruthy()
  })

  it('«Mandar al Comité» hands the values to the phone\'s share sheet', async () => {
    const share = vi.fn(async () => undefined)
    vi.stubGlobal('navigator', { ...navigator, share })
    mount('tarjeta', { edit: finishDay2 })
    await act(async () => fireEvent.click(list().getByRole('button', { name: IB.sendToComite })))
    expect(share).toHaveBeenCalledWith({ text: `${IB.sendHeader("Nacho's Bachelor Invitational", 'Camilo')}\nCamilo, día 2, hoyo 11: 5 golpes, 2 putts` })
  })

  it('without a share sheet, it copies them and says where to paste', async () => {
    const writeText = vi.fn(async () => undefined)
    vi.stubGlobal('navigator', { ...navigator, share: undefined, clipboard: { writeText } })
    mount('tarjeta', { edit: finishDay2 })
    await act(async () => fireEvent.click(list().getByRole('button', { name: IB.sendToComite })))
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('Camilo, día 2, hoyo 11: 5 golpes, 2 putts'))
    expect(toasts).toEqual([IB.sendCopied])
  })
})

describe('the refused list says why from the tournament, and who can send it again', () => {
  it('a signed card: the reason says so, and a player can\'t resend', () => {
    mount('list', {
      edit: (s) => {
        const pair = s.pairs.find((p) => p.player1Id === CAMILO || p.player2Id === CAMILO)!
        s.cardSignatures.push({ roundId: 'r2', pairId: pair.id, signedBy: CAMILO, signedAt: '2027-04-10T15:00:00Z' })
      },
    })
    expect(list().getByText(IB.reasonSigned)).toBeTruthy()
    expect(list().queryByRole('button', { name: new RegExp(`^${IB.resend}`) })).toBeNull()
  })

  it('the day back in play and the card unsigned: a player can send it again', () => {
    mount('list')
    expect(list().getByText(t.sync.errDenied)).toBeTruthy()
    expect(list().getByRole('button', { name: `${IB.resend}: Camilo, día 2, hoyo 11: 5 golpes, 2 putts` })).toBeTruthy()
  })

  it('a Comité device resends anything, and is not asked to send it to itself', () => {
    mount('list', { edit: finishDay2, isAdmin: true })
    expect(list().getByText(IB.rejectedHint)).toBeTruthy()
    expect(list().getByRole('button', { name: new RegExp(`^${IB.resend}`) })).toBeTruthy()
    expect(list().queryByRole('button', { name: IB.sendToComite })).toBeNull()
  })

  it('a hole picked up, and every kind of capture, names its day', () => {
    const picked: RejectedItem = { ...hole11, key: 'score:r1:p3:4', payload: { ...hole11.payload, round_id: 'r1', hole: 4, strokes: null, putts: 1, picked_up: true } as RejectedItem['payload'] }
    const tiebreak: RejectedItem = { ...hole11, key: 'tb', kind: 'tiebreak', payload: { round_id: 'r2', group_id: 'g1', hole: 5, last_holed_player_id: CAMILO, decided_by: CAMILO } }
    mount('list', { rejected: [picked, tiebreak] })
    expect(list().getByText('Camilo, día 1, hoyo 4: levantó, 1 putt')).toBeTruthy()
    expect(list().getByText(new RegExp(`^Víbora, día 2, grupo \\d+, hoyo 5: Camilo$`))).toBeTruthy()
  })
})
