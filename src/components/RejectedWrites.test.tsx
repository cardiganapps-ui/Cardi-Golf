// @vitest-environment happy-dom
/**
 * REL-08: a player's phone out of signal when the Comité finished the day
 * had its last holes refused into a list nobody could see. The Tarjeta
 * showed only «El día 2 ya terminó» (the list mounted inside the card, which
 * a player never reaches on a closed day), the reason was the server's
 * generic refusal, the copy promised the Comité could resend from its own
 * phone (the list lives on this one), and «Terminar ronda» never mentioned
 * phones still holding holes. The second half pins what the PR's verifier
 * found: two players called «Diego», reasons said as fact about the past,
 * a reopened day, a deleted one, the list hidden when not in a group, and
 * «Descartar» deleting the only copy in one tap.
 */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../data/quick', () => ({ roundRivalries: vi.fn(async () => []) }))
vi.mock('canvas-confetti', () => ({ default: vi.fn() }))
const toasts = vi.hoisted(() => [] as string[])
vi.mock('./ui', async (importOriginal) => ({ ...(await importOriginal<typeof import('./ui')>()), toast: vi.fn((msg: string) => void toasts.push(msg)) }))
const outbox = vi.hoisted(() => ({ discarded: [] as string[], resent: [] as string[] }))
vi.mock('../data/outbox', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../data/outbox')>()),
  discardRejected: vi.fn(async (key: string) => void outbox.discarded.push(key)),
  retryRejected: vi.fn(async (key: string) => void outbox.resent.push(key)),
}))

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
const HOLE11 = 'Camilo, día 2, hoyo 11: 5 golpes, 2 putts'

/** Camilo's hole 11 on day 2, refused by the server. */
const hole11: RejectedItem = {
  key: 'score:r2:p3:11',
  kind: 'score',
  tournamentId: 'fx-full',
  payload: { round_id: 'r2', player_id: CAMILO, hole: 11, strokes: 5, putts: 2, picked_up: false, entered_by: CAMILO, client_ts: '2027-04-10T15:00:00Z' },
  message: t.sync.errDenied,
  at: 1,
}

function mount(ui: 'tarjeta' | 'list', opts: { edit?: (s: Snapshot) => void; isAdmin?: boolean; rejected?: RejectedItem[]; me?: string } = {}) {
  const fx = getFixture('full12-live')!
  const snapshot = structuredClone(fx.snapshot)
  opts.edit?.(snapshot)
  useTournament.setState({ tournamentId: 'fx-full', data: dataFromSnapshot(snapshot) })
  const me = { playerId: opts.me ?? CAMILO, isOrganizer: false, isAdmin: opts.isAdmin ?? false }
  const view = render(
    <MemoryRouter>
      <TournamentContext.Provider value={{ tournamentId: 'fx-full', slug: 'viaje', lookup: fx.lookup, me, refresh: async () => undefined, leave: async () => undefined }}>
        {ui === 'tarjeta' ? <ScorecardScreen /> : <RejectedWrites canResend={me.isAdmin} playerId={me.playerId} />}
      </TournamentContext.Provider>
    </MemoryRouter>,
  )
  act(() => useOutbox.setState({ rejected: opts.rejected ?? [hole11] }))
  return view
}
const finishDay2 = (s: Snapshot) => void (s.rounds.find((r) => r.id === 'r2')!.status = 'finished')
const signCamilo = (s: Snapshot) => {
  const pair = s.pairs.find((p) => p.player1Id === CAMILO || p.player2Id === CAMILO)!
  s.cardSignatures.push({ roundId: 'r2', pairId: pair.id, signedBy: CAMILO, signedAt: '2027-04-10T15:00:00Z' })
}
const list = () => within(screen.getByRole('region', { name: IB.rejectedTitle }))
const send = () => act(async () => fireEvent.click(list().getByRole('button', { name: IB.sendToComite })))

afterEach(() => {
  cleanup()
  useOutbox.setState({ rejected: [] })
  toasts.length = 0
  outbox.discarded.length = 0
  outbox.resent.length = 0
  vi.unstubAllGlobals()
})

describe('a player whose holes were refused when the day closed (REL-08)', () => {
  it('sees them on the Tarjeta of the closed day, with the day, the values and why', () => {
    mount('tarjeta', { edit: finishDay2 })
    expect(screen.getByText(t.card.roundFinished(2))).toBeTruthy()
    expect(list().getByText(HOLE11)).toBeTruthy()
    expect(list().getByText(IB.reasonClosed(2))).toBeTruthy()
    // The truth about where the list lives, and what to do with it.
    expect(list().getByText(IB.rejectedHintPlayer)).toBeTruthy()
    expect(list().queryByRole('button', { name: new RegExp(`^${IB.resend}`) })).toBeNull()
    expect(list().getByRole('button', { name: `${IB.discard}: ${HOLE11}` })).toBeTruthy()
  })

  it('«Mandar al Comité» hands the values to the phone\'s share sheet', async () => {
    const share = vi.fn(async () => undefined)
    vi.stubGlobal('navigator', { ...navigator, share })
    mount('tarjeta', { edit: finishDay2 })
    await send()
    expect(share).toHaveBeenCalledWith({ text: `${IB.sendHeader("Nacho's Bachelor Invitational", 'Camilo')}\n${HOLE11}` })
  })

  it('closing the share sheet is a choice: nothing is copied and nothing is said', async () => {
    const writeText = vi.fn(async () => undefined)
    vi.stubGlobal('navigator', { ...navigator, share: vi.fn(async () => Promise.reject(new DOMException('cancelled', 'AbortError'))), clipboard: { writeText } })
    mount('tarjeta', { edit: finishDay2 })
    await send()
    expect(writeText).not.toHaveBeenCalled()
    expect(toasts).toEqual([])
  })

  it('without a share sheet, it copies them and says where to paste', async () => {
    const writeText = vi.fn(async () => undefined)
    vi.stubGlobal('navigator', { ...navigator, share: undefined, clipboard: { writeText } })
    mount('tarjeta', { edit: finishDay2 })
    await send()
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining(HOLE11))
    expect(toasts).toEqual([IB.sendCopied])
  })

  it('when the phone can neither share nor copy, the text is on screen to copy by hand or show', async () => {
    vi.stubGlobal('navigator', { ...navigator, share: undefined, clipboard: { writeText: vi.fn(async () => Promise.reject(new Error('denied'))) } })
    mount('tarjeta', { edit: finishDay2 })
    await send()
    const sheet = screen.getByRole('dialog', { name: IB.sendToComite })
    expect(within(sheet).getByText(IB.sendManual)).toBeTruthy()
    expect(sheet.textContent).toContain(HOLE11)
  })

  it('on a live day, inside the card, the text says whose phone it came from', async () => {
    const share = vi.fn(async () => undefined)
    vi.stubGlobal('navigator', { ...navigator, share })
    mount('tarjeta', { edit: signCamilo })
    await send()
    expect(share).toHaveBeenCalledWith({ text: expect.stringContaining(IB.sendHeader("Nacho's Bachelor Invitational", 'Camilo')) })
  })

  it('a player in no group still sees them, and is not offered a resend the server would refuse', () => {
    mount('tarjeta', {
      edit: (s) => {
        for (const g of s.groups) g.playerIds = g.playerIds.filter((id) => id !== CAMILO)
      },
    })
    expect(screen.getByText(t.card.notInGroup)).toBeTruthy()
    expect(list().getByText(HOLE11)).toBeTruthy()
    expect(list().queryByRole('button', { name: new RegExp(`^${IB.resend}`) })).toBeNull()
    expect(list().getByText(IB.rejectedHintPlayer)).toBeTruthy()
  })

  it('a tournament with no days left at all still shows them on the Tarjeta (R15)', () => {
    mount('tarjeta', { edit: (s) => void (s.rounds = []) })
    expect(screen.getByText(t.live.noRounds)).toBeTruthy()
    expect(list().getByText('Camilo, hoyo 11 de un día que ya no existe: 5 golpes, 2 putts')).toBeTruthy()
  })

  it('«Descartar» asks first: it is the only copy', () => {
    mount('list', { edit: finishDay2 })
    fireEvent.click(list().getByRole('button', { name: `${IB.discard}: ${HOLE11}` }))
    expect(outbox.discarded).toEqual([])
    const ask = screen.getByRole('dialog', { name: IB.discardTitle })
    expect(ask.textContent).toContain(IB.discardBody)
    fireEvent.click(within(ask).getByRole('button', { name: IB.discard }))
    expect(outbox.discarded).toEqual([hole11.key])
  })
})

describe('a hole save_hole refused and kept for the Comité (REL-08, 0026)', () => {
  it('a player\'s phone says it went to the Comité\'s list', () => {
    mount('list', { edit: finishDay2, rejected: [{ ...hole11, atServer: true }] })
    expect(list().getByText(IB.leftForComite(11))).toBeTruthy()
    expect(list().getByText(IB.reasonClosed(2))).toBeTruthy()
  })

  it('a capture refused before the server kept it does not claim the Comité has it', () => {
    mount('list', { edit: finishDay2 })
    expect(list().queryByText(IB.leftForComite(11))).toBeNull()
  })

  it('on a Comité device the line is not said: it is the Comité', () => {
    mount('list', { edit: finishDay2, isAdmin: true, rejected: [{ ...hole11, atServer: true }] })
    expect(list().queryByText(IB.leftForComite(11))).toBeNull()
  })
})

describe('the refused list says what stands in the way now, and who can send it again', () => {
  it('a signed card: the reason says so, and a player can\'t resend', () => {
    mount('list', { edit: signCamilo })
    expect(list().getByText(IB.reasonSigned)).toBeTruthy()
    expect(list().queryByRole('button', { name: new RegExp(`^${IB.resend}`) })).toBeNull()
  })

  it('a closed day with a signed card: the day being closed is what stands in the way', () => {
    mount('list', {
      edit: (s) => {
        finishDay2(s)
        signCamilo(s)
      },
    })
    expect(list().getByText(IB.reasonClosed(2))).toBeTruthy()
    expect(list().queryByText(IB.reasonSigned)).toBeNull()
  })

  it('the day back in play and the card unsigned: a player can send it again, against what the card holds now', () => {
    mount('list', {
      edit: (s) => {
        const now = s.scores.find((x) => x.roundId === 'r2' && x.playerId === CAMILO && x.hole === 11)
        if (now) Object.assign(now, { strokes: 6, putts: 2, pickedUp: false })
        else s.scores.push({ roundId: 'r2', playerId: CAMILO, hole: 11, strokes: 6, putts: 2, pickedUp: false, enteredBy: 'p9', updatedAt: null })
      },
    })
    expect(list().getByText(IB.rejectedHintResend)).toBeTruthy()
    expect(list().getByText(t.sync.errDenied)).toBeTruthy()
    expect(list().getByText(IB.nowOnCard('6 golpes, 2 putts'))).toBeTruthy()
    fireEvent.click(list().getByRole('button', { name: `${IB.resend}: ${HOLE11}` }))
    expect(outbox.resent).toEqual([hole11.key])
  })

  it('a putts-only difference still shows what the card holds now: a resend would replace it (R8)', () => {
    mount('list', {
      edit: (s) => {
        const now = s.scores.find((x) => x.roundId === 'r2' && x.playerId === CAMILO && x.hole === 11)!
        Object.assign(now, { strokes: 5, putts: 3, pickedUp: false })
      },
    })
    expect(list().getByText(IB.nowOnCard('5 golpes, 3 putts'))).toBeTruthy()
  })

  it('a day that never closed, but this phone\'s player moved to another group: no resend, and the reason says so', () => {
    mount('list', {
      edit: (s) => {
        // The Comité swaps Camilo (group 3) with Arturo (group 1) on day 2; the day stays live.
        const g1 = s.groups.find((g) => g.id === 'r2g1')!
        const g3 = s.groups.find((g) => g.id === 'r2g3')!
        g1.playerIds = g1.playerIds.map((id) => (id === 'p1' ? CAMILO : id))
        g3.playerIds = g3.playerIds.map((id) => (id === CAMILO ? 'p1' : id))
      },
      rejected: [{ ...hole11, key: 'score:r2:p12:11', payload: { ...hole11.payload, player_id: 'p12' } as RejectedItem['payload'] }],
    })
    expect(list().queryByRole('button', { name: new RegExp(`^${IB.resend}`) })).toBeNull()
    expect(list().getByText(IB.reasonNotInGroup(2))).toBeTruthy()
    // Not «the day is back in play»: the Comité is who can capture it.
    expect(list().getByText(IB.rejectedHintPlayer)).toBeTruthy()
    expect(list().getByRole('button', { name: IB.sendToComite })).toBeTruthy()
  })

  it('his own hole, after a move to another group, can still go again: the server asks only that writer and player share a group', () => {
    mount('list', {
      edit: (s) => {
        for (const g of s.groups.filter((x) => x.roundId === 'r2')) g.playerIds = g.playerIds.filter((id) => id !== CAMILO)
        s.groups.push({ id: 'r2g4', roundId: 'r2', number: 4, teeTime: null, startHole: 1, playerIds: [CAMILO] })
      },
    })
    expect(list().queryByRole('button', { name: new RegExp(`^${IB.resend}`) })).toBeTruthy()
  })

  it('a mixed list keeps both instructions: resend what can go, send the rest to the Comité', () => {
    const day1: RejectedItem = { ...hole11, key: 'score:r1:p3:4', payload: { ...hole11.payload, round_id: 'r1', hole: 4 } as RejectedItem['payload'] }
    mount('list', { rejected: [hole11, day1] })
    expect(list().getByText(IB.rejectedHintMixed)).toBeTruthy()
    expect(list().getByRole('button', { name: `${IB.resend}: ${HOLE11}` })).toBeTruthy()
    expect(list().queryByRole('button', { name: `${IB.resend}: Camilo, día 1, hoyo 4: 5 golpes, 2 putts` })).toBeNull()
    expect(list().getByText(IB.reasonClosed(1))).toBeTruthy()
    expect(list().getByRole('button', { name: IB.sendToComite })).toBeTruthy()
  })

  it('a tiebreak or a contest goes again only from a phone in that group, naming players of that group', () => {
    const tiebreak = (group: string, last: string): RejectedItem => ({ ...hole11, key: `tb:${group}:${last}`, kind: 'tiebreak', payload: { round_id: 'r2', group_id: group, hole: 5, last_holed_player_id: last, decided_by: CAMILO } })
    const award: RejectedItem = { ...hole11, key: 'aw', kind: 'award', payload: { round_id: 'r2', group_id: 'r2g3', hole: 7, game_id: 'closest', player_ids: ['p6', 'p9'], decided_by: CAMILO } }
    mount('list', { rejected: [tiebreak('r2g3', 'p12'), tiebreak('r2g1', 'p1'), award] })
    const resend = list().getAllByRole('button', { name: new RegExp(`^${IB.resend}`) })
    expect(resend.map((b) => b.getAttribute('aria-label'))).toEqual([expect.stringMatching(/^Volver a mandar: Víbora, grupo 3,/), expect.stringMatching(/hoyo 7/)])
  })

  it('a signature goes again only for the other pair of his group: a pair never signs its own card', () => {
    const sig = (pair: string): RejectedItem => ({ ...hole11, key: `sig:${pair}`, kind: 'signature', payload: { round_id: 'r2', pair_id: pair, signed_by: CAMILO } })
    // Camilo's group on day 2: his pair (pair3, with p12) and pair6 (p6, p9); pair1 plays in another group.
    mount('list', { edit: (s) => void (s.cardSignatures = s.cardSignatures.filter((x) => x.roundId !== 'r2')), rejected: [sig('pair6'), sig('pair3'), sig('pair1')] })
    const resend = list().getAllByRole('button', { name: new RegExp(`^${IB.resend}`) })
    expect(resend).toHaveLength(1)
    const pair6 = getFixture('full12-live')!.snapshot.pairs.find((x) => x.id === 'pair6')!.name!
    expect(resend[0]!.getAttribute('aria-label')).toBe(`${IB.resend}: ${IB.rejectedSignature(pair6, 2)}`)
    expect(list().getAllByText(IB.reasonNotInGroup(2))).toHaveLength(2)
  })

  it('a Comité device resends anything, is not asked to send it to itself, and keeps the server\'s reason', () => {
    mount('list', { edit: finishDay2, isAdmin: true })
    expect(list().getByText(IB.rejectedHint)).toBeTruthy()
    expect(list().getByRole('button', { name: new RegExp(`^${IB.resend}`) })).toBeTruthy()
    expect(list().queryByRole('button', { name: IB.sendToComite })).toBeNull()
    expect(list().getByText(t.sync.errDenied)).toBeTruthy()
  })

  it('every kind of capture names its day; a tiebreak keeps the server\'s reason', () => {
    const picked: RejectedItem = { ...hole11, key: 'score:r1:p3:4', payload: { ...hole11.payload, round_id: 'r1', hole: 4, strokes: null, putts: 1, picked_up: true } as RejectedItem['payload'] }
    const tiebreak: RejectedItem = { ...hole11, key: 'tb', kind: 'tiebreak', payload: { round_id: 'r2', group_id: 'g1', hole: 5, last_holed_player_id: CAMILO, decided_by: CAMILO } }
    const award: RejectedItem = { ...hole11, key: 'aw', kind: 'award', payload: { round_id: 'r2', group_id: 'g1', hole: 7, game_id: 'closest', player_ids: [CAMILO], decided_by: CAMILO } }
    const signature: RejectedItem = { ...hole11, key: 'sig', kind: 'signature', payload: { round_id: 'r2', pair_id: 'pair1', signed_by: CAMILO } }
    mount('list', { edit: finishDay2, rejected: [picked, tiebreak, award, signature] })
    expect(list().getByText('Camilo, día 1, hoyo 4: levantó, 1 putt')).toBeTruthy()
    expect(list().getByText(/^Víbora, grupo \d+, día 2, hoyo 5: Camilo$/)).toBeTruthy()
    expect(list().getByText(/, día 2, hoyo 7: Camilo$/)).toBeTruthy()
    expect(list().getByText(/^Firma de .+, día 2$/)).toBeTruthy()
    // The server never refuses a tiebreak for a closed day: no claim that it did.
    const tbRow = list().getByText(/^Víbora,/).parentElement!
    expect(tbRow.textContent).toContain(t.sync.errDenied)
  })

  it('a capture from a day deleted since says so, instead of «día 0»', () => {
    mount('list', { edit: (s) => void (s.rounds = s.rounds.filter((r) => r.id !== 'r2')) })
    expect(list().getByText('Camilo, hoyo 11 de un día que ya no existe: 5 golpes, 2 putts')).toBeTruthy()
  })

  it('two players with one short name are told apart by their full names, in the list and in what is sent', async () => {
    const share = vi.fn(async () => undefined)
    vi.stubGlobal('navigator', { ...navigator, share })
    mount('list', {
      edit: (s) => {
        finishDay2(s)
        const camilo = s.players.find((p) => p.id === CAMILO)!
        Object.assign(camilo, { displayName: 'Diego', fullName: 'Diego Arámburu' })
        Object.assign(s.players.find((p) => p.id === 'p4')!, { displayName: 'Diego', fullName: 'Diego Ortiz Tirado' })
      },
    })
    expect(list().getByText('Diego Arámburu, día 2, hoyo 11: 5 golpes, 2 putts')).toBeTruthy()
    await send()
    expect(share).toHaveBeenCalledWith({ text: expect.stringContaining(IB.sendHeader("Nacho's Bachelor Invitational", 'Diego Arámburu')) })
  })
})
