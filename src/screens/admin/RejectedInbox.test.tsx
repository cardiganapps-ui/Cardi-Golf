// @vitest-environment happy-dom
/**
 * REL-08: «Pendientes de revisar» in Comité › Tarjetas. Each hole the server
 * kept says whose it is, what the phone sent and from whose phone, why the
 * server did not take it, what the card holds and what applying would leave.
 * «Aplicar» and «Descartar» ask for a reason and send it (an apply with the
 * hole as the row showed it); the row leaves the list. A hole that changed
 * meanwhile is refused and the boards are read again. Rows the card already
 * matches go in one tap, the ones that match when it is confirmed. On
 * `full12-live`, whose fixture inbox the store holds as a fixture's (no
 * server to read).
 */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const server = vi.hoisted(() => ({ calls: [] as unknown[][], fail: null as Error | null, failFor: {} as Record<string, Error> }))
vi.mock('../../data/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../data/api')>()),
  resolveRejectedWrite: vi.fn(async (id: string, action: string, reason: string, seen?: unknown) => {
    server.calls.push(seen === undefined ? [id, action, reason] : [id, action, reason, seen])
    if (server.failFor[id]) throw server.failFor[id]
    if (server.fail) throw server.fail
  }),
}))

import { ApiError } from '../../data/api'
import { useRejectedInbox } from '../../data/rejectedInbox'
import { getFixture } from '../../dev/fixtures'
import { dataFromSnapshot, useTournament } from '../../data/tournamentStore'
import { t } from '../../i18n/es-MX'
import { TournamentContext } from '../tournament/TournamentGate'
import { RejectedInbox } from './RejectedInbox'

const SI = t.admin.serverInbox
const reload = vi.fn(async () => undefined)

function renderInbox() {
  const fx = getFixture('full12-live')!
  const snapshot = fx.snapshot
  render(
    <MemoryRouter>
      <TournamentContext.Provider value={{ tournamentId: snapshot.tournament.id, slug: 'viaje', lookup: fx.lookup, me: fx.me, refresh: async () => undefined, leave: async () => undefined }}>
        <RejectedInbox />
      </TournamentContext.Provider>
    </MemoryRouter>,
  )
}
beforeEach(() => {
  const fx = getFixture('full12-live')!
  const snapshot = structuredClone(fx.snapshot)
  useTournament.setState({ tournamentId: 'fixture:full12-live', data: dataFromSnapshot(snapshot), reload })
  useRejectedInbox.setState({ tournamentId: snapshot.tournament.id, items: structuredClone(fx.inbox!), status: 'ready', error: null, fixture: true })
  renderInbox()
})
afterEach(() => {
  cleanup()
  server.calls.length = 0
  server.fail = null
  server.failFor = {}
  reload.mockClear()
})

const box = () => within(screen.getByRole('region', { name: SI.title }))
const sheet = () => within(screen.getByRole('dialog'))
const type = (text: string) => fireEvent.change(sheet().getByRole('textbox'), { target: { value: text } })
const confirm = (label: string) => act(async () => fireEvent.click(sheet().getByRole('button', { name: label })))
const ids = () => useRejectedInbox.getState().items.map((x) => x.id)

describe('«Pendientes de revisar»', () => {
  it('says whose hole, what was sent and from whose phone, why, what the card holds and what applying leaves', () => {
    const text = box().getByText('Bruno, día 1, hoyo 16').closest('div')!.textContent
    expect(text).toContain(SI.sent('9 golpes, 3 putts', 'Arturo'))
    expect(text).toContain(SI.why.round_not_live)
    expect(text).toContain(SI.now('4 golpes, 2 putts'))
    expect(text).toContain(SI.wouldBe('9 golpes, 3 putts'))
  })

  it('a capture sent onto a signed card says so, and what applying its strokes would leave', () => {
    const text = box().getByText('Damián, día 2, hoyo 4').closest('div')!.textContent
    expect(text).toContain(SI.why.card_signed)
    expect(text).toContain(SI.now('7 golpes, 2 putts'))
    expect(text).toContain(SI.wouldBe('3 golpes, 2 putts'))
  })

  it('what the card holds is the server\'s row, not a write this phone still has to send', () => {
    cleanup()
    const fx = getFixture('full12-live')!
    const base = structuredClone(fx.snapshot)
    const shown = structuredClone(fx.snapshot)
    shown.scores = shown.scores.map((x) => (x.roundId === 'r2' && x.playerId === 'p4' && x.hole === 4 ? { ...x, strokes: 8 } : x))
    useTournament.setState({ data: { ...dataFromSnapshot(base), snapshot: shown } })
    renderInbox()
    expect(box().getByText('Damián, día 2, hoyo 4').closest('div')!.textContent).toContain(SI.now('7 golpes, 2 putts'))
  })

  it('a hole the card already matches only needs dismissing; one that cannot be applied says so', () => {
    expect(box().queryByRole('button', { name: `${SI.apply}: Elías, día 2, hoyo 2` })).toBeNull()
    expect(box().getByText('Elías, día 2, hoyo 2').closest('div')!.textContent).toContain(SI.matches)
    expect(box().queryByRole('button', { name: `${SI.apply}: Arturo, día 2, hoyo 18` })).toBeNull()
    expect(box().getByText('Arturo, día 2, hoyo 18').closest('div')!.textContent).toContain(SI.cannotApply)
  })

  it('«Aplicar» asks for a reason, sends it, reads the boards again, and the row leaves the list', async () => {
    fireEvent.click(box().getByRole('button', { name: `${SI.apply}: Damián, día 2, hoyo 4` }))
    expect(sheet().getByText(SI.applyBody('Damián, día 2, hoyo 4', '3 golpes, 2 putts'))).toBeTruthy()
    await confirm(SI.apply)
    expect(server.calls).toEqual([])
    type('  Damián confirma el 3  ')
    await confirm(SI.apply)
    expect(server.calls).toEqual([['fx-rw-2', 'apply', 'Damián confirma el 3', { strokes: 7, putts: 2, picked_up: false }]])
    expect(ids()).not.toContain('fx-rw-2')
    expect(box().queryByText('Damián, día 2, hoyo 4')).toBeNull()
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('«Descartar» asks for a reason too, and the card is not read again', async () => {
    fireEvent.click(box().getByRole('button', { name: `${SI.dismiss}: Bruno, día 1, hoyo 16` }))
    type('Se equivocó de día')
    await confirm(SI.dismiss)
    expect(server.calls).toEqual([['fx-rw-1', 'dismiss', 'Se equivocó de día']])
    expect(ids()).not.toContain('fx-rw-1')
    expect(reload).not.toHaveBeenCalled()
  })

  it('a refusal stays in the sheet in the server\'s words, and the row stays', async () => {
    server.fail = new ApiError('Esa captura ya estaba resuelta', '22023')
    fireEvent.click(box().getByRole('button', { name: `${SI.dismiss}: Bruno, día 1, hoyo 16` }))
    type('Se equivocó de día')
    await confirm(SI.dismiss)
    expect(sheet().getByText('Esa captura ya estaba resuelta')).toBeTruthy()
    expect(ids()).toContain('fx-rw-1')
  })

  it('the rows the card already matches go in one tap, with a reason already written', async () => {
    fireEvent.click(box().getByRole('button', { name: SI.dismissMatching(2) }))
    expect((sheet().getByRole('textbox') as HTMLInputElement).value).toBe(SI.matchingReason)
    await confirm(SI.dismiss)
    expect(server.calls).toEqual([
      ['fx-rw-3', 'dismiss', SI.matchingReason],
      ['fx-rw-4', 'dismiss', SI.matchingReason],
    ])
  })
  it('a hole that changed since the row showed it: refused in the server\'s words, the boards read again, nothing left as applied', async () => {
    server.fail = new ApiError('El hoyo cambió mientras lo revisabas; vuelve a mirarlo', '22023')
    fireEvent.click(box().getByRole('button', { name: `${SI.apply}: Damián, día 2, hoyo 4` }))
    type('Damián confirma el 3')
    await confirm(SI.apply)
    expect(sheet().getByText('El hoyo cambió mientras lo revisabas; vuelve a mirarlo')).toBeTruthy()
    expect(reload).toHaveBeenCalledTimes(1)
    expect(ids()).toContain('fx-rw-2')
  })

  it('the reason sheet reads a reason as the server does: three tabs are blank, two golfers are too short', async () => {
    fireEvent.click(box().getByRole('button', { name: `${SI.dismiss}: Bruno, día 1, hoyo 16` }))
    type('\t\t\t')
    await confirm(SI.dismiss)
    type('\u{1F3CC}\u{1F3CC}')
    await confirm(SI.dismiss)
    expect(server.calls).toEqual([])
    type('\n\t Se equivocó de día \t')
    await confirm(SI.dismiss)
    expect(server.calls).toEqual([['fx-rw-1', 'dismiss', 'Se equivocó de día']])
  })

  it('…and sends it as the server keeps it: a no-break space is no whitespace there, so it stays and counts', async () => {
    fireEvent.click(box().getByRole('button', { name: `${SI.dismiss}: Bruno, día 1, hoyo 16` }))
    type('\u00a0ab')
    await confirm(SI.dismiss)
    expect(server.calls).toEqual([['fx-rw-1', 'dismiss', '\u00a0ab']])
  })

  it('«Descartar los que ya coinciden» that fails partway says so; the retry sends only what still matches, and one another phone resolved counts as done', async () => {
    server.failFor['fx-rw-4'] = new ApiError('No hay señal', 'XX000')
    fireEvent.click(box().getByRole('button', { name: SI.dismissMatching(2) }))
    await confirm(SI.dismiss)
    expect(sheet().getByText(SI.partly(1, 2))).toBeTruthy()
    expect(ids()).not.toContain('fx-rw-3')
    expect(ids()).toContain('fx-rw-4')
    // The sheet stays open; meanwhile another Comité phone dismissed fx-rw-4.
    server.failFor['fx-rw-4'] = new ApiError('Esa captura ya estaba resuelta', '22023')
    server.calls.length = 0
    await confirm(SI.dismiss)
    expect(server.calls).toEqual([['fx-rw-4', 'dismiss', SI.matchingReason]])
    expect(ids()).not.toContain('fx-rw-4')
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
