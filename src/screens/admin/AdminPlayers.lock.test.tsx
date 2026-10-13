// @vitest-environment happy-dom
/**
 * UX-28: the base handicaps were never fixed. The brief fixes them before the
 * Calcutta, the runbook said «bloqueado», and the player sheet changed one at
 * any moment with no reason and nobody seeing it. Now the Comité fixes them
 * («Fijar hándicaps», or the auction opening does), and a change after that
 * asks for a reason and goes through update_player (0046), which keeps the
 * record everyone sees.
 */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getFixture } from '../../dev/fixtures'
import { dataFromSnapshot, useTournament } from '../../data/tournamentStore'
import type { Snapshot } from '../../engine/types'
import { t } from '../../i18n/es-MX'
import { TournamentContext } from '../tournament/TournamentGate'

const api = vi.hoisted(() => ({
  upsertPlayer: vi.fn(async () => ({ id: 'x' })),
  updatePlayer: vi.fn(async () => undefined),
  lockHandicaps: vi.fn(async () => '2027-04-08T03:14:00Z'),
  unlockHandicaps: vi.fn(async () => undefined),
  playersWithPin: vi.fn(async () => new Set<string>()),
}))
vi.mock('../../data/api', async (importOriginal) => ({ ...(await importOriginal<typeof import('../../data/api')>()), ...api }))
vi.mock('../../data/profiles', async (importOriginal) => ({ ...(await importOriginal<typeof import('../../data/profiles')>()), useTournamentProfiles: () => [[], () => undefined] }))
const { AdminPlayers } = await import('./AdminPlayers')

const P = t.admin.players
const L = t.admin.players.lock

function mount(change: (s: Snapshot) => void = () => undefined) {
  const snap = structuredClone(getFixture('full12-live')!.snapshot)
  change(snap)
  useTournament.setState({ tournamentId: 't-lock', data: dataFromSnapshot(snap), reload: async () => undefined })
  render(
    <MemoryRouter>
      <TournamentContext.Provider value={{ tournamentId: 't-lock', slug: 'nacho', lookup: getFixture('full12-live')!.lookup, me: { playerId: null, isOrganizer: true, isAdmin: true }, refresh: async () => undefined, leave: async () => undefined }}>
        <AdminPlayers />
      </TournamentContext.Provider>
    </MemoryRouter>,
  )
  return snap
}
const inSetup = (s: Snapshot, lockedAt: string | null = null) => {
  s.tournament.status = 'setup'
  s.tournament.handicapsLockedAt = lockedAt
}
const click = (el: HTMLElement) => act(async () => fireEvent.click(el))
const type = (el: HTMLElement, value: string) => act(async () => fireEvent.change(el, { target: { value } }))
const editSheet = () => screen.getByRole('dialog', { name: t.common.edit })
async function open(fullName: string) {
  await click(screen.getByRole('button', { name: new RegExp(fullName) }))
  return editSheet()
}

afterEach(() => {
  cleanup()
  for (const f of Object.values(api)) f.mockClear()
})

describe('«Fijar hándicaps» (UX-28)', () => {
  it('before they are fixed, the Comité fixes them from Jugadores', async () => {
    mount((s) => inSetup(s))
    expect(screen.getByText(L.open)).toBeTruthy()
    await click(screen.getByRole('button', { name: L.fix }))
    const confirm = screen.getByRole('dialog', { name: L.fixTitle })
    expect(within(confirm).getByText(L.fixBody)).toBeTruthy()
    await click(within(confirm).getByRole('button', { name: L.fix }))
    expect(api.lockHandicaps).toHaveBeenCalledWith('t-lock')
  })

  it('fixed in setup, «Liberar» asks for a reason', async () => {
    mount((s) => inSetup(s, '2027-04-08T03:14:00Z'))
    expect(screen.getByText(/^Fijados el /)).toBeTruthy()
    expect(screen.queryByRole('button', { name: L.fix })).toBeNull()
    await click(screen.getByRole('button', { name: L.free }))
    const sheet = screen.getByRole('dialog', { name: L.freeTitle })
    await type(within(sheet).getByLabelText(t.platform.reason), 'Los fijé antes de tiempo')
    await click(within(sheet).getByRole('button', { name: L.free }))
    expect(api.unlockHandicaps).toHaveBeenCalledWith('t-lock', 'Los fijé antes de tiempo')
  })

  it('once the tournament is under way they are fixed, and nobody frees them', async () => {
    mount()
    expect(screen.getByText(L.fixed(null))).toBeTruthy()
    expect(screen.queryByRole('button', { name: L.free })).toBeNull()
    expect(screen.queryByRole('button', { name: L.fix })).toBeNull()
  })
})

describe('a fixed handicap changes only with a reason (UX-28)', () => {
  it('a new base asks why, says from what to what, and saves with the reason', async () => {
    const snap = mount()
    const p = snap.players[0]!
    const sheet = await open(p.fullName)
    expect(within(sheet).getByText(L.fixedHint)).toBeTruthy()
    await type(within(sheet).getByLabelText(P.baseHcp), String(p.baseHcp + 2))
    await click(within(sheet).getByRole('button', { name: t.common.save }))
    expect(api.upsertPlayer).not.toHaveBeenCalled()
    const ask = screen.getByRole('dialog', { name: L.reasonTitle })
    expect(within(ask).getByText(L.reasonBody(p.displayName, `de ${p.baseHcp} a ${p.baseHcp + 2}`))).toBeTruthy()
    await type(within(ask).getByLabelText(t.platform.reason), '  Error de captura ')
    await click(within(ask).getByRole('button', { name: L.reasonConfirm }))
    expect(api.updatePlayer).toHaveBeenCalledWith(expect.objectContaining({ id: p.id, base_hcp: p.baseHcp + 2, handicap_source: 'manual' }), 'Error de captura')
    expect(screen.queryByRole('dialog', { name: t.common.edit })).toBeNull()
  })

  it('without a reason nothing is sent, and the sheet keeps what was typed', async () => {
    const snap = mount()
    const p = snap.players[0]!
    const sheet = await open(p.fullName)
    await type(within(sheet).getByLabelText(P.baseHcp), String(p.baseHcp + 2))
    await click(within(sheet).getByRole('button', { name: t.common.save }))
    const ask = screen.getByRole('dialog', { name: L.reasonTitle })
    await type(within(ask).getByLabelText(t.platform.reason), 'no')
    await click(within(ask).getByRole('button', { name: L.reasonConfirm }))
    expect(api.updatePlayer).not.toHaveBeenCalled()
    await click(within(ask).getByRole('button', { name: t.common.cancel }))
    expect((within(editSheet()).getByLabelText(P.baseHcp) as HTMLInputElement).value).toBe(String(p.baseHcp + 2))
  })

  it('a change that leaves the handicap alone needs nothing', async () => {
    const snap = mount()
    const p = snap.players[1]!
    const sheet = await open(p.fullName)
    await type(within(sheet).getByLabelText(P.displayName), 'Otro')
    await click(within(sheet).getByRole('button', { name: t.common.save }))
    expect(screen.queryByRole('dialog', { name: L.reasonTitle })).toBeNull()
    expect(api.upsertPlayer).toHaveBeenCalledWith('t-lock', expect.objectContaining({ id: p.id, display_name: 'Otro' }))
  })

  it('a base no rule reads, under an index, is no change: the sheet saves as before', async () => {
    const snap = mount((s) => {
      s.players[2] = { ...s.players[2]!, handicapSource: 'index', handicapIndex: 12.3, baseHcp: 18 }
    })
    const p = snap.players[2]!
    const sheet = await open(p.fullName)
    await type(within(sheet).getByLabelText(P.displayName), 'Otro')
    await click(within(sheet).getByRole('button', { name: t.common.save }))
    expect(screen.queryByRole('dialog', { name: L.reasonTitle })).toBeNull()
    expect(api.upsertPlayer).toHaveBeenCalledWith('t-lock', expect.objectContaining({ id: p.id, base_hcp: 12.3, handicap_index: 12.3 }))
  })

  it('in setup with nothing fixed, a change saves as before', async () => {
    const snap = mount((s) => inSetup(s))
    const p = snap.players[0]!
    const sheet = await open(p.fullName)
    expect(within(sheet).queryByText(L.fixedHint)).toBeNull()
    await type(within(sheet).getByLabelText(P.baseHcp), String(p.baseHcp + 2))
    await click(within(sheet).getByRole('button', { name: t.common.save }))
    expect(screen.queryByRole('dialog', { name: L.reasonTitle })).toBeNull()
    expect(api.upsertPlayer).toHaveBeenCalledWith('t-lock', expect.objectContaining({ id: p.id, base_hcp: p.baseHcp + 2 }))
  })

  it('a handicap changed after they were fixed says so on its row and in its sheet, with the reason', async () => {
    const snap = mount((s) => {
      const p = s.players[0]!
      s.players[0] = {
        ...p,
        handicapNote: {
          from: { handicapSource: 'manual', baseHcp: p.baseHcp + 3, handicapIndex: null, estimateInputs: null },
          changes: [{ at: '2027-04-09T16:30:00Z', reason: 'Trajo su tarjeta', to: { handicapSource: 'manual', baseHcp: p.baseHcp, handicapIndex: null, estimateInputs: null } }],
        },
      }
    })
    const p = snap.players[0]!
    expect(screen.getByRole('button', { name: new RegExp(`${p.fullName}.*${L.changed}`) })).toBeTruthy()
    const sheet = await open(p.fullName)
    expect(within(sheet).getByText(t.player.hcpChanged(`de ${p.baseHcp + 3} a ${p.baseHcp}`))).toBeTruthy()
    expect(within(sheet).getByText(/«Trajo su tarjeta»$/)).toBeTruthy()
  })
})
