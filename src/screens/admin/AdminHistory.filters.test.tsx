// @vitest-environment happy-dom
/**
 * TRUST-19: Historial was the whole tournament, newest first, fifty at a time, with one switch that filtered only
 * the pages already read, and a change's detail listed the database's columns with their raw values (a player as a
 * UUID). The history now narrows on the server (0063) by player, day, hole, the Comité's corrections or the Admin
 * de Polo; «Ver más» pages within the filters; a score's detail opens that hole's whole story; and the detail
 * reads in Spanish, each id as what it names.
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getFixture } from '../../dev/fixtures'
import { dataFromSnapshot, useTournament } from '../../data/tournamentStore'
import type { AuditEntry, AuditFilter } from '../../data/api'
import { t } from '../../i18n/es-MX'
import { localWhen } from '../../lib/localWhen'
import { TournamentContext } from '../tournament/tournamentContext'
import { parseSettings } from '../../engine/settings/schema'

const audit = vi.hoisted(() => ({ answer: (_f: unknown, _before: unknown): Promise<AuditEntry[]> => Promise.resolve([]) }))
const tournamentAudit = vi.hoisted(() => vi.fn((_tid: string, before?: number, _limit?: number, filter?: AuditFilter) => audit.answer(filter ?? {}, before)))
vi.mock('../../data/api', async (importOriginal) => ({ ...(await importOriginal<typeof import('../../data/api')>()), tournamentAudit }))
const { AdminHistory } = await import('./AdminHistory')

const H = t.admin.history
const F = H.filter
const fx = getFixture('full12-live')!
const [ana, beto] = fx.snapshot.players as [(typeof fx.snapshot.players)[0], (typeof fx.snapshot.players)[0]]
const round = fx.snapshot.rounds[0]!
let id = 0
const entry = (e: Partial<AuditEntry>): AuditEntry => ({
  id: ++id,
  at: '2027-04-09T16:00:00Z',
  table: 'scores',
  action: 'INSERT',
  rowId: `row-${id}`,
  platform: false,
  actor: ana.displayName,
  reason: null,
  before: null,
  after: null,
  ...e,
})
const lastFilter = () => tournamentAudit.mock.calls.at(-1)?.[3]

function mount() {
  useTournament.setState({ tournamentId: 't-history', data: dataFromSnapshot(structuredClone(fx.snapshot)), reload: async () => undefined })
  return render(
    <MemoryRouter>
      <TournamentContext.Provider value={{ tournamentId: 't-history', slug: 'nacho', lookup: fx.lookup, me: { playerId: null, isOrganizer: true, isComite: true }, refresh: async () => undefined, leave: async () => undefined }}>
        <AdminHistory />
      </TournamentContext.Provider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  tournamentAudit.mockClear()
  audit.answer = () => Promise.resolve([])
})
afterEach(cleanup)

describe('Historial narrows on the server (TRUST-19)', () => {
  it('a player, a day, a hole: each goes to the server, and the list is what it answers', async () => {
    const mine = entry({ after: { player_id: ana.id, round_id: round.id, hole: 7, strokes: 5 } })
    audit.answer = (f) => Promise.resolve((f as AuditFilter).player === ana.id ? [mine] : [])
    mount()
    await waitFor(() => expect(tournamentAudit).toHaveBeenCalled())
    expect(lastFilter()).toEqual({})
    await act(async () => fireEvent.change(screen.getByLabelText(F.player), { target: { value: ana.id } }))
    await waitFor(() => expect(lastFilter()).toEqual({ player: ana.id }))
    expect(await screen.findByText(H.scoreLine(ana.displayName, '7 (día 1)', null, '5'))).toBeTruthy()
    await act(async () => fireEvent.change(screen.getByLabelText(F.hole), { target: { value: '7' } }))
    await waitFor(() => expect(lastFilter()).toEqual({ player: ana.id, hole: 7 }))
    await act(async () => fireEvent.change(screen.getByLabelText(F.round), { target: { value: round.id } }))
    await waitFor(() => expect(lastFilter()).toEqual({ player: ana.id, hole: 7, round: round.id }))
    // Nothing for a filter says so, and «Quitar filtros» asks for everything again.
    audit.answer = (f) => Promise.resolve(Object.keys(f as object).length ? [] : [mine])
    await act(async () => fireEvent.change(screen.getByLabelText(F.hole), { target: { value: '8' } }))
    expect(await screen.findByText(F.none)).toBeTruthy()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: F.clear })))
    await waitFor(() => expect(lastFilter()).toEqual({}))
    expect(screen.queryByRole('button', { name: F.clear })).toBeNull()
  })

  it('the Comité’s corrections and the Admin de Polo are asked of the server, not picked from the pages read', async () => {
    mount()
    await waitFor(() => expect(tournamentAudit).toHaveBeenCalledTimes(1))
    await act(async () => fireEvent.click(screen.getByRole('checkbox', { name: F.corrections })))
    await waitFor(() => expect(lastFilter()).toEqual({ corrections: true }))
    await act(async () => fireEvent.click(screen.getByRole('checkbox', { name: H.platformOnly })))
    await waitFor(() => expect(lastFilter()).toEqual({ corrections: true, platform: true }))
  })

  it('«Ver más» pages within the filters, from the last line shown', async () => {
    const page = Array.from({ length: 50 }, (_, i) => entry({ id: 1000 - i, after: { player_id: ana.id, round_id: round.id, hole: 1 + (i % 18), strokes: 4 } }))
    audit.answer = (_f, before) => Promise.resolve(before ? [] : page)
    mount()
    await act(async () => fireEvent.change(screen.getByLabelText(F.player), { target: { value: ana.id } }))
    const more = await screen.findByRole('button', { name: H.more })
    await act(async () => fireEvent.click(more))
    const last = tournamentAudit.mock.calls.at(-1)!
    expect(last[1]).toBe(951)
    expect(last[3]).toEqual({ player: ana.id })
  })

  it('an answer for filters since changed never lands over the new list', async () => {
    let first: (v: AuditEntry[]) => void = () => undefined
    const stale = entry({ after: { player_id: beto.id, round_id: round.id, hole: 2, strokes: 9 } })
    const fresh = entry({ after: { player_id: ana.id, round_id: round.id, hole: 3, strokes: 4 } })
    audit.answer = (f) => ((f as AuditFilter).player ? Promise.resolve([fresh]) : new Promise((r) => (first = r)))
    mount()
    await act(async () => fireEvent.change(screen.getByLabelText(F.player), { target: { value: ana.id } }))
    expect(await screen.findByText(H.scoreLine(ana.displayName, '3 (día 1)', null, '4'))).toBeTruthy()
    await act(async () => first([stale]))
    expect(screen.queryByText(H.scoreLine(beto.displayName, '2 (día 1)', null, '9'))).toBeNull()
  })
})

describe('a change’s detail reads in Spanish (TRUST-19)', () => {
  it('names for ids, words for flags, the earlier value, and no bookkeeping', async () => {
    const correction = entry({
      action: 'UPDATE',
      actor: null,
      reason: 'Se apuntó mal',
      before: { id: 's1', player_id: ana.id, round_id: round.id, hole: 7, strokes: 6, putts: 2, picked_up: false, entered_by: beto.id, version: 1, device_id: 'd', disputed: false, previous: null, reason: null },
      after: {
        id: 's1',
        player_id: ana.id,
        round_id: round.id,
        hole: 7,
        strokes: 5,
        putts: 2,
        picked_up: false,
        entered_by: ana.id,
        version: 2,
        device_id: null,
        disputed: true,
        previous: { strokes: 6, putts: 2, picked_up: false, entered_by: beto.id },
        reason: 'Se apuntó mal',
      },
    })
    audit.answer = () => Promise.resolve([correction])
    mount()
    const line = await screen.findByRole('button', { name: new RegExp(H.scoreLine(ana.displayName, '7 (día 1)', '6', '5').replace(/[()]/g, '\\$&')) })
    await act(async () => fireEvent.click(line))
    const sheet = within(screen.getByRole('dialog', { name: H.detail }))
    const row = (label: string) => sheet.getByText(label).parentElement!.textContent
    expect(row(H.field.strokes!)).toBe(`${H.field.strokes}${H.change('6', '5')}`)
    expect(row(H.field.entered_by!)).toBe(`${H.field.entered_by}${H.change(beto.displayName, ana.displayName)}`)
    expect(row(H.field.disputed!)).toBe(`${H.field.disputed}${H.change('no', 'sí')}`)
    expect(row(H.field.previous!)).toBe(`${H.field.previous}${H.change('—', H.value.previous('6 golpes, 2 putts', beto.displayName))}`)
    expect(sheet.queryByText('version')).toBeNull()
    expect(sheet.queryByText('device_id')).toBeNull()
    expect(sheet.queryByText(/[0-9a-f]{8}-[0-9a-f]{4}-/)).toBeNull()
    // The moment, in the tournament's own time.
    expect(sheet.getByText(`${H.byComite}, ${localWhen(correction.at, parseSettings(fx.snapshot.tournament.settings).timezone)}`)).toBeTruthy()
  })

  it('«Ver la historia de este hoyo» narrows the history to that player, day and hole', async () => {
    const e = entry({ after: { player_id: ana.id, round_id: round.id, hole: 12, strokes: 4 } })
    audit.answer = () => Promise.resolve([e])
    mount()
    const line = await screen.findByRole('button', { name: new RegExp(H.scoreLine(ana.displayName, '12 (día 1)', null, '4').replace(/[()]/g, '\\$&')) })
    await act(async () => fireEvent.click(line))
    await act(async () => fireEvent.click(screen.getByRole('button', { name: F.holeStory })))
    await waitFor(() => expect(lastFilter()).toEqual({ player: ana.id, round: round.id, hole: 12 }))
    expect(screen.queryByRole('dialog', { name: H.detail })).toBeNull()
  })
})
