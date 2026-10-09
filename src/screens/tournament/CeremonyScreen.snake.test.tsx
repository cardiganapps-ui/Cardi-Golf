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

describe('the Ceremonia shows what the Comité gave from the other lines too (round 3)', () => {
  it('best round, fewest putts and the placings each get a step with the Comité’s awards from their line', () => {
    const fx = getFixture('full12-live')!
    const snap = structuredClone(fx.snapshot)
    // Both days rained out: every line's money is the Comité's to decide.
    for (const r of snap.rounds) r.status = 'cancelled'
    snap.scores = []
    const settings = snap.tournament.settings as TournamentSettings
    const before = dataFromSnapshot(snap).state.money.unassigned.buckets
    // A part of each line to someone (the Comité gives a consolation, say).
    const lines: Array<[string, string, number]> = [
      ['bestRound', 'p3', 1200],
      ['individual', 'p7', 5000],
      ['fewestPutts', 'p5', 1000],
    ]
    snap.moneyAdjustments = lines.map(([key, to, amount], i) => {
      expect(before.find((x) => x.key === key)!.remaining).toBeGreaterThanOrEqual(amount)
      return { id: `a${i}`, callId: `c${i}`, sourceKey: key, kind: 'award' as const, toPlayerId: to, amount, reason: 'Decidido', createdAt: `2027-04-11T20:0${i}:00+00:00`, createdBy: 'org', voidedAt: null, voidReason: null }
    })
    const data = dataFromSnapshot(snap)
    expect(data.state.money.unassigned.assignments.every((a) => a.status === 'applied')).toBe(true)
    useTournament.setState({ tournamentId: 'fixture:full12-live', data, loading: false, error: null, realtime: 'off' })
    render(
      <MemoryRouter>
        <TournamentContext.Provider value={{ tournamentId: snap.tournament.id, slug: '_/full12-live', lookup: fx.lookup, me: fx.me, refresh: async () => undefined, leave: async () => undefined }}>
          <CeremonyScreen />
        </TournamentContext.Provider>
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByRole('button', { name: C.start }))
    const seen: string[] = []
    const counts: Record<string, number> = {}
    for (let i = 0; i < 60; i++) {
      const region = screen.getByRole('region')
      const title = region.getAttribute('aria-label') ?? ''
      if (!seen.includes(title)) {
        seen.push(title)
        // Revealed, its list has one row per person the Comité paid from that line (happy-dom lays out no page, but counts them).
        fireEvent.click(screen.getByRole('button', { name: C.next }))
        const text = screen.getByRole('region').textContent ?? ''
        const line = snap.moneyAdjustments.find((a) => title === C.steps.byComite((settings.modules as Record<string, { label: string }>)[a.sourceKey]!.label))
        if (line) counts[line.sourceKey] = Number(/de (\d+)$/.exec(text.slice(text.lastIndexOf(title)))?.[1])
      }
      const next = screen.queryByRole('button', { name: C.next })
      if (!next) break
      fireEvent.click(next)
    }
    for (const a of snap.moneyAdjustments) expect(seen).toContain(C.steps.byComite((settings.modules as Record<string, { label: string }>)[a.sourceKey]!.label))
    expect(counts).toEqual({ fewestPutts: 1, bestRound: 1, individual: 1 })
    // The placings' step comes before the champion's, who closes the night.
    expect(seen.indexOf(C.steps.byComite(settings.modules.individual.label))).toBeLessThan(seen.indexOf(C.steps.place(1)))
  })
})
