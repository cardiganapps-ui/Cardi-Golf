// @vitest-environment happy-dom
/**
 * REL-08: «Pendientes de revisar» in Comité › Tarjetas. Each hole the server
 * kept says whose it is, what the phone sent and from whose phone, why the
 * server did not take it, what the card holds and what applying would leave.
 * «Aplicar» and «Descartar» ask for a reason and send it; the row leaves the
 * list. Rows the card already matches go in one tap. On `full12-live`, whose
 * fixture inbox the store holds as a fixture's (no server to read).
 */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const server = vi.hoisted(() => ({ calls: [] as Array<[string, string, string]>, fail: null as Error | null }))
vi.mock('../../data/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../data/api')>()),
  resolveRejectedWrite: vi.fn(async (id: string, action: string, reason: string) => {
    server.calls.push([id, action, reason])
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

beforeEach(() => {
  const fx = getFixture('full12-live')!
  const snapshot = structuredClone(fx.snapshot)
  useTournament.setState({ tournamentId: 'fixture:full12-live', data: dataFromSnapshot(snapshot), reload })
  useRejectedInbox.setState({ tournamentId: snapshot.tournament.id, items: structuredClone(fx.inbox!), status: 'ready', error: null, fixture: true })
  render(
    <MemoryRouter>
      <TournamentContext.Provider value={{ tournamentId: snapshot.tournament.id, slug: 'viaje', lookup: fx.lookup, me: fx.me, refresh: async () => undefined, leave: async () => undefined }}>
        <RejectedInbox />
      </TournamentContext.Provider>
    </MemoryRouter>,
  )
})
afterEach(() => {
  cleanup()
  server.calls.length = 0
  server.fail = null
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

  it('a conflict says what the other phone had saved', () => {
    const text = box().getByText('Damián, día 2, hoyo 4').closest('div')!.textContent
    expect(text).toContain(SI.conflictWith('7 golpes, 2 putts'))
    expect(text).toContain(SI.wouldBe('3 golpes, 2 putts'))
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
    expect(server.calls).toEqual([['fx-rw-2', 'apply', 'Damián confirma el 3']])
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
})
