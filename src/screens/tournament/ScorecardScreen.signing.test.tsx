// @vitest-environment happy-dom
/**
 * UX-23: who signs a card on the Tarjeta, by the tournament's rule. The
 * `minimal4-live` fixture (individual Stableford only, no pairs game) with day
 * 1 played to the last hole, and this phone holding p1 (not the Comité):
 *   - a marker's rule: «Firmar la tarjeta de …» for each other player whose card
 *     is complete, never his own; the signature is a player's; a signed card
 *     locks that player's row only;
 *   - no rule (as every tournament stored without one, the pairs game off) and
 *     «none»: nothing to sign, as before.
 */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../data/outbox', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../data/outbox')>()
  return { ...real, enqueueSignature: vi.fn(async () => undefined), enqueueHole: vi.fn(async () => undefined), enqueueScore: vi.fn(async () => undefined) }
})
vi.mock('../../data/quick', () => ({ roundRivalries: vi.fn(async () => []) }))
vi.mock('canvas-confetti', () => ({ default: vi.fn() }))
vi.mock('../../components/toast', async (importOriginal) => ({ ...(await importOriginal<typeof import('../../components/toast')>()), toast: vi.fn() }))

import { enqueueSignature, useOutbox } from '../../data/outbox'
import { dataFromSnapshot, useTournament } from '../../data/tournamentStore'
import { getFixture } from '../../dev/fixtures'
import { score } from '../../engine/testing/fixtures'
import type { Snapshot } from '../../engine/types'
import type { TournamentSettings } from '../../engine/settings/schema'
import { t } from '../../i18n/es-MX'
import { ScorecardScreen } from './ScorecardScreen'
import { MarkerSigningPanel } from './scorecard/SigningPanel'
import { TournamentContext } from './tournamentContext'

const S = t.card
afterEach(() => {
  cleanup()
  vi.mocked(enqueueSignature).mockClear()
})

function mount(edit: (s: Snapshot) => void, opts: { isComite?: boolean } = {}) {
  const fx = getFixture('minimal4-live')!
  const snap = structuredClone(fx.snapshot)
  const round = snap.rounds.find((r) => r.status === 'live')!
  // Every hole of the day for the four.
  for (const pid of ['p1', 'p2', 'p3', 'p4'])
    for (let h = 1; h <= round.holes; h++) if (!snap.scores.some((s) => s.roundId === round.id && s.playerId === pid && s.hole === h)) snap.scores.push(score(round.id, pid, h, 4, 2))
  edit(snap)
  useOutbox.setState({ queueRead: true })
  useTournament.setState({ tournamentId: snap.tournament.id, data: dataFromSnapshot(snap), loading: false, error: null, realtime: 'off' })
  const me = { ...fx.me, isComite: opts.isComite ?? false }
  render(
    <MemoryRouter>
      <TournamentContext.Provider value={{ tournamentId: snap.tournament.id, slug: '_/minimal4-live', lookup: fx.lookup, me, refresh: async () => undefined, leave: async () => undefined }}>
        <ScorecardScreen />
      </TournamentContext.Provider>
    </MemoryRouter>,
  )
  const grid = screen.queryByRole('button', { name: S.grid })
  if (grid) fireEvent.click(grid)
  return { snap, round }
}
const rule = (cardSigning?: TournamentSettings['cardSigning']) => (s: Snapshot) => {
  const { cardSigning: _drop, ...rest } = s.tournament.settings as TournamentSettings
  s.tournament.settings = cardSigning ? { ...rest, cardSigning } : rest
}
const nameOf = (s: Snapshot, id: string) => s.players.find((p) => p.id === id)!.displayName

describe('Tarjeta: a marker signs each player’s card (UX-23)', () => {
  it('offers «Firmar la tarjeta de …» for each other player of the group, never his own', () => {
    const { snap } = mount(rule('marker'))
    const buttons = screen.getAllByRole('button', { name: /^Firmar la tarjeta de / })
    expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual(['p2', 'p3', 'p4'].map((id) => S.signPlayer(nameOf(snap, id))))
    expect(screen.queryByRole('button', { name: S.signPlayer(nameOf(snap, 'p1')) })).toBeNull()
    // No pair's card to sign: the pairs' panel is not there.
    expect(screen.queryByRole('button', { name: S.sign })).toBeNull()
  })

  it('asks first, then signs that player’s card as this phone’s player', async () => {
    const { snap, round } = mount(rule('marker'))
    fireEvent.click(screen.getByRole('button', { name: S.signPlayer(nameOf(snap, 'p3')) }))
    const dialog = screen.getByRole('dialog', { name: S.signPlayer(nameOf(snap, 'p3')) })
    expect(within(dialog).getByText(S.signPlayerConfirm)).toBeTruthy()
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: S.sign }))
    })
    expect(enqueueSignature).toHaveBeenCalledWith(snap.tournament.id, { round_id: round.id, player_id: 'p3', signed_by: 'p1' })
  })

  it('a signed card says so with its stamp and offers nothing; the rest of the group still signs', () => {
    const { snap } = mount((s) => {
      rule('marker')(s)
      s.cardSignatures.push({ roundId: 'r1', pairId: null, playerId: 'p2', signedBy: 'p3', signedAt: '2027-05-15T20:00:00Z' })
    })
    expect(screen.queryByRole('button', { name: S.signPlayer(nameOf(snap, 'p2')) })).toBeNull()
    expect(screen.getByText(S.stamp)).toBeTruthy()
    expect(screen.getAllByRole('button', { name: /^Firmar la tarjeta de / })).toHaveLength(2)
  })

  it('a signed card locks that player’s row only: the others still take a hole', () => {
    const { snap } = mount((s) => {
      rule('marker')(s)
      s.cardSignatures.push({ roundId: 'r1', pairId: null, playerId: 'p2', signedBy: 'p3', signedAt: '2027-05-15T20:00:00Z' })
    })
    fireEvent.click(screen.getByRole('button', { name: S.holeView }))
    const pickup = (id: string) => screen.getByRole('button', { name: S.pickedUpOf(nameOf(snap, id)) }) as HTMLButtonElement
    expect(pickup('p2').disabled).toBe(true)
    expect(pickup('p3').disabled).toBe(false)
    expect(within(screen.getAllByRole('group').find((g) => g.textContent?.includes(nameOf(snap, 'p2')))!).getByLabelText(S.cardSigned)).toBeTruthy()
    expect((screen.getByRole('button', { name: /^Guardar/ }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('the Comité signs any card, his own player’s too', () => {
    const { snap } = mount(rule('marker'), { isComite: true })
    expect(screen.getAllByRole('button', { name: /^Firmar la tarjeta de / }).map((b) => b.getAttribute('aria-label'))).toEqual(['p1', 'p2', 'p3', 'p4'].map((id) => S.signPlayer(nameOf(snap, id))))
  })
})

describe('Tarjeta: nothing to sign without a rule that signs', () => {
  it('a tournament stored without the rule and no pairs game: no signature asked, as before', () => {
    mount(rule(undefined))
    expect(screen.queryByRole('button', { name: /^Firmar/ })).toBeNull()
  })

  it('«none»: nothing to sign', () => {
    mount(rule('none'))
    expect(screen.queryByRole('button', { name: /^Firmar/ })).toBeNull()
  })
})

describe('MarkerSigningPanel on its own', () => {
  const players = [
    { id: 'a', name: 'Ana' },
    { id: 'b', name: 'Beto' },
  ]
  it('a phone outside the group sees each card’s state and signs none', () => {
    render(<MarkerSigningPanel roundId="r1" players={players} signatures={[]} pairs={[]} myPlayerId="z" inGroup={false} isComite={false} onSign={() => undefined} />)
    expect(screen.getAllByText(S.cardUnsigned)).toHaveLength(2)
    expect(screen.queryByRole('button')).toBeNull()
  })
  it('a card its pair signed before (another rule) reads as signed', () => {
    const pairs = [{ id: 'pa', name: null, player1Id: 'a', player2Id: 'x', kind: null, pickedByHonoree: false, drawnAt: null }]
    render(<MarkerSigningPanel roundId="r1" players={players} signatures={[{ roundId: 'r1', pairId: 'pa', signedBy: 'b', signedAt: '' }]} pairs={pairs} myPlayerId="b" inGroup isComite={false} onSign={() => undefined} />)
    expect(screen.getByText(S.cardSigned)).toBeTruthy()
    expect(screen.queryByRole('button', { name: S.signPlayer('Ana') })).toBeNull()
    expect(screen.queryByRole('button', { name: S.signPlayer('Beto') })).toBeNull()
  })
  it('no complete card yet: nothing at all', () => {
    const { container } = render(<MarkerSigningPanel roundId="r1" players={[]} signatures={[]} pairs={[]} myPlayerId="b" inGroup isComite={false} onSign={() => undefined} />)
    expect(container.textContent).toBe('')
  })
})
