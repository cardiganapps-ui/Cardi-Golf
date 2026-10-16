// @vitest-environment happy-dom
/**
 * A11Y-11: on En vivo each row's spoken name carries what the row shows: the
 * player's money «si terminara ahora», his Calcutta owners by name, «(tú)» on
 * my own row, the figure's unit.
 */
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import { getFixture } from '../../dev/fixtures'
import { dataFromSnapshot, useTournament } from '../../data/tournamentStore'
import { LiveScreen } from './LiveScreen'
import { TournamentContext } from './tournamentContext'

function mount(fixture: string) {
  const fx = getFixture(fixture)!
  const snap = structuredClone(fx.snapshot)
  useTournament.setState({ tournamentId: `fixture:${fixture}`, data: dataFromSnapshot(snap), loading: false, error: null, realtime: 'off' })
  render(
    <MemoryRouter>
      <TournamentContext.Provider value={{ tournamentId: snap.tournament.id, slug: `_/${fixture}`, lookup: fx.lookup, me: fx.me, refresh: async () => undefined, leave: async () => undefined }}>
        <LiveScreen />
      </TournamentContext.Provider>
    </MemoryRouter>,
  )
  return { fx, data: useTournament.getState().data! }
}

afterEach(() => cleanup())

describe('En vivo rows say what they show (A11Y-11)', () => {
  it('money, owners by name, my row and the unit', () => {
    const { fx, data } = mount('full12-live')
    const labels = screen.getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? '').filter((l) => /^(empatado en )?\d+\.º, /.test(l))
    expect(labels.length).toBeGreaterThan(5)
    // Someone wins money if it ended now, and the board says how much.
    expect(labels.some((l) => /, ganaría \$[\d,]+/.test(l))).toBe(true)
    // A sold lot's owners are named, never their initials.
    const sold = data.state.modules.auction!.lots.find((l) => l.status === 'sold')!
    const owner = data.snapshot.players.find((p) => p.id === sold.owners[0]!.ownerId)!.displayName
    expect(labels.some((l) => l.includes(owner) && /dueños?: /.test(l))).toBe(true)
    // My row says it is mine.
    const me = data.snapshot.players.find((p) => p.id === fx.me.playerId)!
    expect(labels.some((l) => l.includes(`${me.displayName} (tú)`))).toBe(true)
    // Points are said as points.
    expect(labels.every((l) => !/, \d+$/.test(l))).toBe(true)
  })
})
