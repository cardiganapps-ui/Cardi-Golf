// @vitest-environment happy-dom
/**
 * COPY-04: on the course, with one bar of signal, a PIN that could not reach
 * the server printed «TypeError: Failed to fetch» under the field. The real
 * screen, with claim_player failing the way supabase-js reports it.
 */
import 'fake-indexeddb/auto'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../data/api', async (importOriginal) => ({ ...(await importOriginal<typeof import('../../data/api')>()), claimPlayer: vi.fn() }))

import { ApiError, claimPlayer, type LookupResult } from '../../data/api'
import { useAuth } from '../../data/auth'
import { _outboxTest } from '../../data/outbox'
import { t } from '../../i18n/es-MX'
import { EnterScreen } from './EnterScreen'

const lookup: LookupResult = {
  id: 't1',
  slug: 'bachelor',
  name: 'Invitacional',
  tagline: null,
  logoUrl: null,
  accentColor: null,
  status: 'live',
  joinCode: 'ABC123',
  players: [{ id: 'p1', displayName: 'Mauricio', fullName: 'Mauricio Lozano', tier: 'B', avatarUrl: null, isHonoree: false, hasPin: true }],
}

async function typePin(error: unknown) {
  vi.mocked(claimPlayer).mockRejectedValueOnce(error)
  render(
    <MemoryRouter>
      <EnterScreen lookup={lookup} onEntered={vi.fn()} />
    </MemoryRouter>,
  )
  fireEvent.click(screen.getByRole('button', { name: /Mauricio/ }))
  fireEvent.change(screen.getByLabelText(t.enter.pin), { target: { value: '1234' } })
}

afterEach(cleanup)

describe('EnterScreen PIN error', () => {
  it.each([
    ['Chrome', 'TypeError: Failed to fetch'],
    ['Safari', 'TypeError: Load failed'],
  ])('%s with no signal says so in Spanish, not the browser text', async (_browser, raw) => {
    // What claimPlayer throws when postgrest-js reports a fetch that never got an answer.
    await typePin(new ApiError(raw, ''))
    expect(await screen.findByText(t.errors.network)).toBeTruthy()
    expect(screen.queryByText(new RegExp(raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))).toBeNull()
    expect(document.body.textContent).not.toContain('TypeError')
  })

  it('a refusal from the database shows copy, not the policy text', async () => {
    await typePin(new ApiError('permission denied for function claim_player', '42501'))
    expect(await screen.findByText(t.errors.permission)).toBeTruthy()
    expect(document.body.textContent).not.toContain('permission denied')
  })
})

/**
 * A PIN in another tournament (joined by its link or its code): the device
 * keeps one PIN claim, so entering here made the phone nobody in the one
 * before, and that one's holes still on the phone went out and were refused
 * for good. The PIN waits for them, like a sign-out or a change of account.
 */
describe('entering with a PIN while another tournament\'s writes are still on the phone', () => {
  /** A hole of `tournamentId` this phone saved (as itself, unless `actingUid`), waiting for signal. */
  const hole = (tournamentId: string, n: number, extra: Record<string, unknown> = {}) =>
    _outboxTest.enqueue({
      key: `score:${tournamentId}:p9:${n}`,
      kind: 'score',
      tournamentId,
      payload: { round_id: `r-${tournamentId}`, player_id: 'p9', hole: n, strokes: 5, putts: 2, picked_up: false, entered_by: 'p9', client_ts: 'x' },
      attempts: 0,
      createdAt: n,
      ...extra,
    })
  function typeThePin() {
    render(
      <MemoryRouter>
        <EnterScreen lookup={lookup} onEntered={vi.fn()} />
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByRole('button', { name: /Mauricio/ }))
    fireEvent.change(screen.getByLabelText(t.enter.pin), { target: { value: '1234' } })
  }
  beforeEach(async () => {
    useAuth.setState({ user: { id: 'uid-a' } as never })
    _outboxTest.reset()
    await _outboxTest.clearStored()
    // No signal for them: whatever is queued stays queued.
    _outboxTest.setPush(async () => {
      throw new Error('TypeError: Failed to fetch')
    })
    vi.mocked(claimPlayer).mockReset()
    vi.mocked(claimPlayer).mockResolvedValue({ ok: true, playerId: 'p1', tournamentId: 't1' })
  })

  it('is refused, naming that tournament and saying what sends them, and the phone keeps its PIN there', async () => {
    await hole('t-ensayo', 7, { tournamentName: 'Ensayo' })
    typeThePin()
    expect(await screen.findByText(t.account.unsentSignal('Ensayo', 'enter'))).toBeTruthy()
    expect(claimPlayer).not.toHaveBeenCalled()
    expect(_outboxTest.queue().map((x) => x.key)).toEqual(['score:t-ensayo:p9:7'])
  })

  it('goes ahead when what waits is this tournament\'s (the PIN sends it) or held for a PIN elsewhere (it waits for that one either way)', async () => {
    await hole('t1', 3, { actingUid: 'uid-viejo' })
    await hole('t-ensayo', 7, { tournamentName: 'Ensayo', actingUid: 'uid-viejo' })
    typeThePin()
    await vi.waitFor(() => expect(claimPlayer).toHaveBeenCalledWith('p1', '1234'))
    expect(screen.queryByText(t.account.unsentSignal('Ensayo', 'enter'))).toBeNull()
  })
})
