// @vitest-environment happy-dom
/**
 * DB-13 (0064): the lines the history used to miss read in Spanish. A PIN set or changed (never the PIN), the
 * Comité's unlock as before, the results published, published again and withdrawn, and the team draw's rows
 * by their own names, never the table's.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getFixture } from '../../dev/fixtures'
import { dataFromSnapshot, useTournament } from '../../data/tournamentStore'
import type { AuditEntry } from '../../data/api'
import { t } from '../../i18n/es-MX'
import { TournamentContext } from '../tournament/tournamentContext'

const audit = vi.hoisted(() => ({ entries: [] as AuditEntry[] }))
vi.mock('../../data/api', async (importOriginal) => ({ ...(await importOriginal<typeof import('../../data/api')>()), tournamentAudit: vi.fn(async () => audit.entries) }))
const { AdminHistory } = await import('./AdminHistory')

const H = t.admin.history
const fx = getFixture('full12-live')!
const ana = fx.snapshot.players[0]!
const beto = fx.snapshot.players[1]!
let id = 0
const entry = (e: Partial<AuditEntry>): AuditEntry => ({
  id: ++id,
  at: '2027-04-09T16:00:00Z',
  table: 'scores',
  action: 'INSERT',
  rowId: `row-${id}`,
  platform: false,
  actor: null,
  reason: null,
  before: null,
  after: null,
  ...e,
})

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

afterEach(cleanup)

describe('Historial reads what 0064 adds (DB-13)', () => {
  it('a first PIN, a new one and an unlock are three different lines', async () => {
    audit.entries = [
      entry({ table: 'player_pins', after: { player_id: ana.id, pin: 'new' } }),
      entry({ table: 'player_pins', action: 'UPDATE', before: { player_id: beto.id, pin: 'old' }, after: { player_id: beto.id, pin: 'new' } }),
      entry({ table: 'player_pins', action: 'UPDATE', reason: 'PIN desbloqueado', before: { player_id: ana.id, locked: true }, after: { player_id: ana.id, locked: false } }),
    ]
    mount()
    expect(await screen.findByText(H.claim.pinSet(ana.displayName))).toBeTruthy()
    expect(screen.getByText(H.claim.pinChanged(beto.displayName))).toBeTruthy()
    expect(screen.getByText(H.claim.unlocked(ana.displayName))).toBeTruthy()
    fireEvent.click(screen.getByText(H.claim.pinChanged(beto.displayName)))
    expect(await screen.findByText(H.change(H.value.pin.old!, H.value.pin.new!))).toBeTruthy()
    expect(screen.getAllByText(H.field.pin!).length).toBeGreaterThan(0)
  })

  it('the results published, published again and withdrawn, by their counts', async () => {
    audit.entries = [
      entry({ table: 'tournament_results', rowId: 't-history', after: { players: 12, nets: 12 } }),
      entry({ table: 'tournament_results', rowId: 't-history', action: 'UPDATE', before: { players: 12, nets: 12 }, after: { players: 12, nets: 11 } }),
      entry({ table: 'tournament_results', rowId: 't-history', action: 'DELETE', before: { players: 12, nets: 11 } }),
    ]
    mount()
    expect(await screen.findByText(H.results.INSERT!)).toBeTruthy()
    expect(screen.getByText(H.results.DELETE!)).toBeTruthy()
    fireEvent.click(screen.getByText(H.results.UPDATE!))
    expect(await screen.findByText(H.field.nets!)).toBeTruthy()
    expect(screen.getByText(H.change('12', '11'))).toBeTruthy()
  })

  it('a team draw, a photo and the Comité’s money decision by their own names, never the table’s', async () => {
    audit.entries = [
      entry({ table: 'teams', after: { number: 1, name: 'Los de arriba' } }),
      entry({ table: 'team_members', after: { team_id: 'x', player_id: ana.id } }),
      entry({ table: 'photos', after: { player_id: beto.id, url: 'https://x.test/a.jpg' } }),
      entry({ table: 'money_adjustments', after: { amount: 600 } }),
    ]
    mount()
    await screen.findByText(new RegExp(`^${t.platform.tables.team_members} ${ana.displayName}, `))
    const text = document.body.textContent ?? ''
    for (const raw of ['teams', 'team_members', 'photos', 'money_adjustments']) expect(text).not.toMatch(new RegExp(`\\b${raw}\\b`))
    expect(text).toContain(`${t.platform.tables.photos} ${beto.displayName}`)
  })
})
