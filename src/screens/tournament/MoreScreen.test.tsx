// @vitest-environment happy-dom
/**
 * «Cambiar de jugador» with something still on the phone (the verifier of
 * #87): it counted only score holes, so a card signature (or a snake answer,
 * or a hole award) still queued went out after the release under an identity
 * no longer in the group, and the server refused it for good. Any write for
 * the tournament blocks the switch.
 */
import 'fake-indexeddb/auto'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const gate = vi.hoisted(() => ({ leave: vi.fn(async () => undefined) }))
vi.mock('../../data/auth', async () => {
  const { create } = await import('zustand')
  return { SESSION_TIMEOUT_MS: 8000, useAuth: create(() => ({ ready: true, user: { id: 'uid-a' }, isAnonymous: true })) }
})
vi.mock('../../lib/supabase', () => ({ supabaseConfigured: true, supabase: () => ({}), authSettings: async () => null }))
vi.mock('./TournamentGate', () => ({
  useTournamentCtx: () => ({
    me: { playerId: 'p1', isOrganizer: false, isAdmin: false, via: 'device' },
    slug: 'nacho',
    lookup: { id: 't1', slug: 'nacho', name: 'Nacho', joinCode: 'NACHO1' },
    leave: gate.leave,
    refresh: async () => undefined,
  }),
}))

import { _outboxTest } from '../../data/outbox'
import { t } from '../../i18n/es-MX'
import { MoreScreen } from './MoreScreen'

function open() {
  return render(
    <MemoryRouter initialEntries={['/t/nacho/mas']}>
      <MoreScreen />
    </MemoryRouter>,
  )
}
beforeEach(async () => {
  _outboxTest.reset()
  await _outboxTest.clearStored()
  // No signal: whatever is queued stays queued.
  _outboxTest.setPush(async () => {
    throw new Error('TypeError: Failed to fetch')
  })
})
afterEach(() => {
  cleanup()
  gate.leave.mockClear()
})

describe('«Cambiar de jugador» with writes still on the phone', () => {
  it('a card signature still queued blocks the switch, like a hole', async () => {
    await _outboxTest.enqueue({ key: 'signature:r1:pair1', kind: 'signature', tournamentId: 't1', payload: { round_id: 'r1', pair_id: 'pair1', signed_by: 'p1' }, attempts: 0, createdAt: Date.now() })
    open()
    fireEvent.click(screen.getByRole('button', { name: t.enter.switchPlayer }))
    expect(await screen.findByText(t.sync.unsentWritesBeforeSwitch)).toBeTruthy()
    expect(gate.leave).not.toHaveBeenCalled()
  })

  it('a hole says how many holes', async () => {
    await _outboxTest.enqueue({
      key: 'score:r1:p1:4',
      kind: 'score',
      tournamentId: 't1',
      payload: { round_id: 'r1', player_id: 'p1', hole: 4, strokes: 4, putts: 2, picked_up: false, entered_by: 'p1', client_ts: 'x' },
      attempts: 0,
      createdAt: Date.now(),
    })
    open()
    fireEvent.click(screen.getByRole('button', { name: t.enter.switchPlayer }))
    expect(await screen.findByText(t.sync.unsentBeforeSwitch(1))).toBeTruthy()
    expect(gate.leave).not.toHaveBeenCalled()
  })

  it('a write of another tournament does not block this one, and nothing queued lets the player go', async () => {
    await _outboxTest.enqueue({ key: 'signature:r9:pair9', kind: 'signature', tournamentId: 't-otro', payload: { round_id: 'r9', pair_id: 'pair9', signed_by: 'p1' }, attempts: 0, createdAt: Date.now() })
    open()
    fireEvent.click(screen.getByRole('button', { name: t.enter.switchPlayer }))
    expect(gate.leave).toHaveBeenCalledTimes(1)
  })
})
