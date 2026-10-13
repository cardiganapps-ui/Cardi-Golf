// @vitest-environment happy-dom
/**
 * TRUST-24: a second phone with a player's PIN became him without a word, and
 * Historial showed what it wrote as his. Now each change a player made from
 * more than one phone says which («teléfono 2 de 2, iPhone»), and the claims
 * themselves are lines of the history: a phone entering with the PIN, letting
 * go, and the Comité taking it off (the only one with a reason).
 */
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getFixture } from '../../dev/fixtures'
import { dataFromSnapshot, useTournament } from '../../data/tournamentStore'
import type { AuditEntry } from '../../data/api'
import { t } from '../../i18n/es-MX'
import { TournamentContext } from '../tournament/TournamentGate'

const audit = vi.hoisted(() => ({ entries: [] as AuditEntry[] }))
vi.mock('../../data/api', async (importOriginal) => ({ ...(await importOriginal<typeof import('../../data/api')>()), tournamentAudit: vi.fn(async () => audit.entries) }))
const { AdminHistory } = await import('./AdminHistory')

const H = t.admin.history
const fx = getFixture('full12-live')!
const ana = fx.snapshot.players[0]!
const beto = fx.snapshot.players[1]!
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
  useTournament.setState({ tournamentId: 't-history', data: dataFromSnapshot(structuredClone(fx.snapshot)), reload: async () => undefined })
  return render(
    <MemoryRouter>
      <TournamentContext.Provider value={{ tournamentId: 't-history', slug: 'nacho', lookup: fx.lookup, me: { playerId: null, isOrganizer: true, isAdmin: true }, refresh: async () => undefined, leave: async () => undefined }}>
        <AdminHistory />
      </TournamentContext.Provider>
    </MemoryRouter>,
  )
}

afterEach(cleanup)

describe('Historial names the phone (TRUST-24)', () => {
  it('two phones holding one player: each change says which, and a change from the Comité says none', async () => {
    audit.entries = [
      entry({ after: { player_id: ana.id, round_id: round.id, hole: 1, strokes: 5 }, phone: { n: 1, of: 2, kind: 'other' } }),
      entry({ after: { player_id: beto.id, round_id: round.id, hole: 1, strokes: 9 }, phone: { n: 2, of: 2, kind: 'ios' } }),
      entry({ actor: null, after: { player_id: beto.id, round_id: round.id, hole: 2, strokes: 4 } }),
    ]
    mount()
    expect(await screen.findByText(new RegExp(`^${ana.displayName}, ${H.phone(1, 2, null)}, `))).toBeTruthy()
    expect(screen.getByText(new RegExp(`^${ana.displayName}, ${H.phone(2, 2, 'iPhone')}, `))).toBeTruthy()
    expect(screen.getByText(new RegExp(`^${H.byComite}, `))).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/teléfono 3/)
  })

  it('a phone taking a player, letting go of him, and the Comité taking it off, with its reason', async () => {
    audit.entries = [
      entry({ table: 'pin_claims', after: { player_id: ana.id, platform: 'ios', claimed_at: '2027-04-09T15:00:00Z', released_at: null }, phone: { n: 2, of: 2, kind: 'ios' } }),
      entry({ table: 'pin_claims', action: 'UPDATE', actor: null, before: { player_id: ana.id, released_at: null }, after: { player_id: ana.id, released_at: '2027-04-09T17:00:00Z' } }),
      entry({ table: 'pin_claims', action: 'UPDATE', actor: 'Diego', reason: 'No es de Ana', before: { player_id: beto.id, released_at: null }, after: { player_id: beto.id, released_at: '2027-04-09T18:00:00Z' } }),
      entry({ table: 'pin_claims', after: { player_id: beto.id, platform: 'desktop' } }),
    ]
    mount()
    expect(await screen.findByText(H.claim.took(ana.displayName, H.claim.from.ios!))).toBeTruthy()
    expect(screen.getByText(H.claim.left(ana.displayName))).toBeTruthy()
    expect(screen.getByText(H.claim.removed(beto.displayName))).toBeTruthy()
    expect(screen.getByText(/No es de Ana/)).toBeTruthy()
    expect(screen.getByText(H.claim.took(beto.displayName, H.claim.from.desktop!))).toBeTruthy()
  })
})
