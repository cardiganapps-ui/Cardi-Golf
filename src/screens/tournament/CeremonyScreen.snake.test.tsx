// @vitest-environment happy-dom
/**
 * The Ceremonia's snake totals (MONEY-05, round 2): what each player takes
 * from the snake's line, its own prizes and what the Comité gave back from
 * it (a rained-out day refunded to the twelve), so the night's totals are the
 * money Dinero pays.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('canvas-confetti', () => ({ default: vi.fn() }))

import { getFixture } from '../../dev/fixtures'
import { dataFromSnapshot, useTournament } from '../../data/tournamentStore'
import { proRata } from '../../engine/core/unassigned'
import type { TournamentSettings } from '../../engine/settings/schema'
import { t } from '../../i18n/es-MX'
import { CeremonyScreen } from './CeremonyScreen'
import { TournamentContext } from './TournamentGate'

const C = t.ceremony
afterEach(() => cleanup())

describe('the Ceremonia’s snake totals', () => {
  it('count the Comité’s refund of a rained-out day with the snake’s own prizes', () => {
    const fx = getFixture('full12-live')!
    const snap = structuredClone(fx.snapshot)
    const [d1, d2] = [...snap.rounds].sort((a, b) => a.number - b.number)
    d1!.status = 'finished'
    d2!.status = 'cancelled'
    snap.scores = snap.scores.filter((x) => x.roundId !== d2!.id)
    const before = dataFromSnapshot(snap)
    const bucket = before.state.money.unassigned.buckets.find((b) => b.key === 'snake')!
    const refund = proRata(bucket.remaining, bucket.contributors!)
    snap.moneyAdjustments = refund.map((r, i) => ({ id: `ref-${i}`, callId: 'ref', sourceKey: 'snake', kind: 'refund' as const, toPlayerId: r.playerId, amount: r.amount, reason: 'Día 2 cancelado', createdAt: '2027-04-11T20:00:00+00:00', createdBy: 'org', voidedAt: null, voidReason: null }))
    const data = dataFromSnapshot(snap)
    expect(data.state.money.unassigned.assignments.map((a) => a.status)).toEqual(['applied'])
    useTournament.setState({ tournamentId: 'fixture:full12-live', data, loading: false, error: null, realtime: 'off' })
    render(
      <MemoryRouter>
        <TournamentContext.Provider value={{ tournamentId: snap.tournament.id, slug: '_/full12-live', lookup: fx.lookup, me: fx.me, refresh: async () => undefined, leave: async () => undefined }}>
          <CeremonyScreen />
        </TournamentContext.Provider>
      </MemoryRouter>,
    )
    const title = C.steps.snake((snap.tournament.settings as TournamentSettings).modules.snake.label)
    fireEvent.click(screen.getByRole('button', { name: C.start }))
    for (let i = 0; i < 40 && screen.getByRole('region').getAttribute('aria-label') !== title; i++) fireEvent.click(screen.getByRole('button', { name: C.next }))
    expect(screen.getByRole('region').getAttribute('aria-label')).toBe(title)
    fireEvent.click(screen.getByRole('button', { name: C.next }))
    const text = screen.getByRole('region').textContent ?? ''
    // The list's rows (a list too long for the screen pages: «1–n de N»; happy-dom lays out no page, but counts them).
    const rows = Number(/de (\d+)$/.exec(text.slice(text.lastIndexOf(title)))?.[1])
    // Some of the twelve won nothing from the snake itself (its holders, a group whose tiebreak waits)...
    const own = new Set(data.state.prizes.filter((x) => x.moduleId === 'snake' && x.amount > 0).map((x) => x.playerId))
    expect(own.size).toBeLessThan(snap.players.length)
    // ...yet all twelve took part of the refund from its line: all twelve are on the night's totals.
    expect(rows).toBe(snap.players.length)
  })
})
