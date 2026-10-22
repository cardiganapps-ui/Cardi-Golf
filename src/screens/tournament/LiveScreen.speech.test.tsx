// @vitest-environment happy-dom
/**
 * A11Y-11: on En vivo each row's spoken name carries what the row shows: the
 * player's money «si terminara ahora», «(tú)» on my own row and, there only, its
 * Calcutta owners by name (VIS-22), the figure's unit.
 */
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import { getFixture } from '../../dev/fixtures'
import { dataFromSnapshot, useTournament } from '../../data/tournamentStore'
import { LiveScreen } from './LiveScreen'
import { TournamentContext } from './tournamentContext'
import { shownText, spokenName } from '../testing/spoken'

function mount(fixture: string) {
  const fx = getFixture(fixture)!
  const snap = structuredClone(fx.snapshot)
  useTournament.setState({
    tournamentId: `fixture:${fixture}`,
    data: dataFromSnapshot(snap),
    loading: false,
    error: null,
    realtime: 'off',
  })
  render(
    <MemoryRouter>
      <TournamentContext.Provider
        value={{
          tournamentId: snap.tournament.id,
          slug: `_/${fixture}`,
          lookup: fx.lookup,
          me: fx.me,
          refresh: async () => undefined,
          leave: async () => undefined,
        }}
      >
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
    const labels = screen
      .getAllByRole('button')
      .map((b) => spokenName(b))
      .filter((l) => /^(empatado en )?\d+\.º, /.test(l))
    expect(labels.length).toBeGreaterThan(5)
    // Someone wins money if it ended now, and the board says how much.
    expect(labels.some((l) => /, ganaría \$[\d,]+/.test(l))).toBe(true)
    // VIS-22: the owners are on my own row only, by name (every row carried their initials), and the category
    // is not on the board while the tournament is under way.
    const me = data.snapshot.players.find((p) => p.id === fx.me.playerId)!
    const myLot = data.state.modules.auction!.lots.find((l) => l.playerId === me.id && l.status === 'sold')!
    const owner = data.snapshot.players.find((p) => p.id === myLot.owners[0]!.ownerId)!.displayName
    const mine = labels.find((l) => l.includes(`${me.displayName} (tú)`))!
    expect(mine).toMatch(new RegExp(`dueños?: [^,]*${owner}`))
    expect(labels.filter((l) => /dueños?: /.test(l))).toEqual([mine])
    expect(labels.filter((l) => /categoría/.test(l))).toEqual([])
    const shown = screen.getAllByRole('button').find((b) => spokenName(b) === mine)!
    expect(shownText(shown)).toMatch(/dueños?: /)
    expect(document.querySelectorAll('.tierBadge')).toHaveLength(0)
    // Points are said as points.
    expect(labels.every((l) => !/, \d+$/.test(l))).toBe(true)
  })
})
