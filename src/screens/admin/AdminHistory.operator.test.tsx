// @vitest-environment happy-dom
/**
 * TRUST-22: the Admin de Polo's visits and unlocks were in a log only he reads, so a Comité never knew he had opened
 * its tournament. tournament_audit merges them in at their moment (0068), and Historial says each one with its
 * reason, never who he is; the list still pages by the history's own rows.
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getFixture } from '../../dev/fixtures'
import { dataFromSnapshot, useTournament } from '../../data/tournamentStore'
import type { AuditEntry, AuditFilter } from '../../data/api'
import { t } from '../../i18n/es-MX'
import { localWhen } from '../../lib/localWhen'
import { TournamentContext } from '../tournament/tournamentContext'

const audit = vi.hoisted(() => ({
  answer: (_f: unknown, _before: unknown): Promise<AuditEntry[]> => Promise.resolve([]),
}))
const tournamentAudit = vi.hoisted(() =>
  vi.fn((_tid: string, before?: number, _limit?: number, filter?: AuditFilter) => audit.answer(filter ?? {}, before)),
)
vi.mock('../../data/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../data/api')>()),
  tournamentAudit,
}))
const { AdminHistory } = await import('./AdminHistory')

const H = t.admin.history
const fx = getFixture('full12-live')!
const ana = fx.snapshot.players[0]!
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

function mount() {
  useTournament.setState({
    tournamentId: 't-history',
    data: dataFromSnapshot(structuredClone(fx.snapshot)),
    reload: async () => undefined,
  })
  return render(
    <MemoryRouter>
      <TournamentContext.Provider
        value={{
          tournamentId: 't-history',
          slug: 'nacho',
          lookup: fx.lookup,
          me: { playerId: null, isOrganizer: true, isComite: true },
          refresh: async () => undefined,
          leave: async () => undefined,
        }}
      >
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

const O = H.operator

describe('what the Admin de Polo did, in the Comité’s Historial (TRUST-22)', () => {
  it('a visit from his panel says it with his reason; one by the link says he typed none; an unlock says until when', async () => {
    audit.answer = () =>
      Promise.resolve([
        entry({
          id: -3,
          table: 'platform_audit_log',
          action: 'unlock',
          platform: true,
          actor: null,
          reason: 'Corregir el hoyo 7',
          after: { until: '2027-04-09T17:30:00Z' },
        }),
        entry({ id: 41, after: { player_id: ana.id, round_id: round.id, hole: 7, strokes: 5 } }),
        entry({
          id: -2,
          table: 'platform_audit_log',
          action: 'view',
          platform: true,
          actor: null,
          reason: 'Soporte: no ve su marcador',
        }),
        entry({
          id: -1,
          table: 'platform_audit_log',
          action: 'view',
          platform: true,
          actor: null,
          reason: null,
          after: { via: 'link' },
        }),
      ])
    mount()
    expect(
      await screen.findByText(`${O.line.unlock}, ${O.until(localWhen('2027-04-09T17:30:00Z', 'America/Mazatlan'))}`),
    ).toBeTruthy()
    expect(screen.getByText(O.line.view!)).toBeTruthy()
    expect(screen.getByText(new RegExp(H.reason('Soporte: no ve su marcador')))).toBeTruthy()
    expect(screen.getByText(O.viewLink)).toBeTruthy()
    // His lines are no rows of the tournament: nothing to open.
    expect(screen.queryByRole('button', { name: new RegExp(O.line.view!) })).toBeNull()
  })

  it('«Ver más» pages from the last history row, not from his lines', async () => {
    const page = [
      ...Array.from({ length: 50 }, (_, i) =>
        entry({ id: 1000 - i, after: { player_id: ana.id, round_id: round.id, hole: 1 + (i % 18), strokes: 4 } }),
      ),
      entry({ id: -9, table: 'platform_audit_log', action: 'view', platform: true, actor: null, reason: 'Revisión' }),
    ]
    audit.answer = (_f, before) => Promise.resolve(before ? [] : page)
    mount()
    const more = await screen.findByRole('button', { name: H.more })
    await act(async () => fireEvent.click(more))
    expect(tournamentAudit.mock.calls.at(-1)![1]).toBe(951)
  })

  it('a page of fewer than fifty history rows is the last, whatever his lines add', async () => {
    audit.answer = () =>
      Promise.resolve([
        ...Array.from({ length: 49 }, (_, i) => entry({ id: 500 - i })),
        ...Array.from({ length: 3 }, (_, i) =>
          entry({
            id: -(i + 1),
            table: 'platform_audit_log',
            action: 'view',
            platform: true,
            actor: null,
            reason: 'Revisión',
          }),
        ),
      ])
    mount()
    await waitFor(() => expect(screen.getAllByText(O.line.view!)).toHaveLength(3))
    expect(screen.queryByRole('button', { name: H.more })).toBeNull()
  })
})
