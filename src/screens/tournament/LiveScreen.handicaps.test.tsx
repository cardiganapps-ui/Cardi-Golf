// @vitest-environment happy-dom
/**
 * UX-28: a handicap changed after they were fixed is everyone's business. En
 * vivo says whose and from what to what, and a tap opens the player's sheet,
 * where each change reads with its moment and the Comité's reason. A change
 * undone says nothing.
 */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getFixture } from '../../dev/fixtures'
import { dataFromSnapshot, useTournament } from '../../data/tournamentStore'
import type { HandicapInputs, Snapshot } from '../../engine/types'
import { t } from '../../i18n/es-MX'
import { TournamentContext } from './tournamentContext'

vi.mock('../../data/profiles', async (importOriginal) => ({ ...(await importOriginal<typeof import('../../data/profiles')>()), useTournamentProfiles: () => [[], () => undefined] }))
const { LiveScreen } = await import('./LiveScreen')

const manual = (baseHcp: number): HandicapInputs => ({ handicapSource: 'manual', baseHcp, handicapIndex: null, estimateInputs: null })

function live(edit: (s: Snapshot) => void) {
  const fx = getFixture('full12-live')!
  const snap = structuredClone(fx.snapshot)
  edit(snap)
  useTournament.setState({ tournamentId: 'fixture:full12-live', data: dataFromSnapshot(snap), loading: false, error: null, realtime: 'off' })
  render(
    <MemoryRouter>
      <TournamentContext.Provider value={{ tournamentId: snap.tournament.id, slug: '_/full12-live', lookup: fx.lookup, me: fx.me, refresh: async () => undefined, leave: async () => undefined }}>
        <LiveScreen />
      </TournamentContext.Provider>
    </MemoryRouter>,
  )
  return snap
}

afterEach(() => cleanup())

describe('En vivo: a handicap changed after they were fixed (UX-28)', () => {
  it('says whose and from what to what; a tap opens his sheet with the reason', async () => {
    const snap = live((s) => {
      const p = s.players[4]!
      s.players[4] = {
        ...p,
        baseHcp: p.baseHcp - 2,
        handicapNote: { from: manual(p.baseHcp), changes: [{ at: '2027-04-09T16:30:00Z', reason: 'Trajo su tarjeta del club', to: manual(p.baseHcp - 2) }] },
      }
    })
    const p = snap.players[4]!
    const line = screen.getByRole('button', { name: t.live.hcpChanged(p.displayName, `de ${p.baseHcp + 2} a ${p.baseHcp}`) })
    await act(async () => fireEvent.click(line))
    const sheet = screen.getByRole('dialog', { name: p.fullName })
    expect(within(sheet).getByText(t.player.hcpChanged(`de ${p.baseHcp + 2} a ${p.baseHcp}`))).toBeTruthy()
    // In the tournament's own time (America/Mazatlan, UTC−7): 16:30 UTC is 09:30 there.
    expect(within(sheet).getByText('9 abr 2027, 09:30: «Trajo su tarjeta del club»')).toBeTruthy()
  })

  it('a change undone, or no record at all, says nothing', () => {
    live((s) => {
      const p = s.players[4]!
      s.players[4] = { ...p, handicapNote: { from: manual(p.baseHcp), changes: [{ at: '2027-04-09T16:30:00Z', reason: 'Me equivoqué', to: manual(p.baseHcp + 5) }, { at: '2027-04-09T16:40:00Z', reason: 'Ya quedó', to: manual(p.baseHcp) }] } }
    })
    expect(screen.queryByText(/cambió después de fijarlos/)).toBeNull()
  })
})
