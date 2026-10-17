// @vitest-environment happy-dom
/**
 * STRAT-03: the TV's main board under match play. A decided match reads the
 * same for both sides («4&3»), so each row's day says whose it was: «ganó
 * 4&3» beside the winner's point, «perdió 4&3» beside the loser's, under «hoy».
 */
import { cleanup, render } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import { getFixture } from '../../dev/fixtures'
import { dataFromSnapshot, useTournament } from '../../data/tournamentStore'
import { t } from '../../i18n/es-MX'
import { TournamentContext } from './tournamentContext'
import { TvScreen } from './TvScreen'

function tv(fixture: string) {
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
        <TvScreen />
      </TournamentContext.Provider>
    </MemoryRouter>,
  )
}
/** What a cell shows, without the words it carries for a screen reader (A11Y-22). */
const shown = (cell: Element) => {
  const copy = cell.cloneNode(true) as Element
  copy.querySelectorAll('.sr-only').forEach((n) => n.remove())
  return copy.textContent
}
/** A player's row on the board: where he is, his day, then his figure, each under its column (VIS-05). */
const tvRow = (playerId: string) => {
  const row = document.querySelector(`[data-player="${playerId}"]`)!
  return [...row.querySelectorAll('[class*="_mid_"]'), row.querySelector('[class*="_big_"]')!].map(shown)
}
/** What a screen reader hears for where he is on the course. */
const thruSaid = (playerId: string) =>
  document.querySelector(`[data-player="${playerId}"] [class*="_mid_"] .sr-only`)?.textContent

afterEach(() => cleanup())

describe('the TV board under match play (STRAT-03)', () => {
  it("each row's day says whose it was", () => {
    // match8, group 1 (off the 1st tee): Fabián beat Elías 4&3.
    tv('match8')
    expect(tvRow('p2')).toEqual(['F', 'ganó 4&3', '1'])
    expect(tvRow('p1')).toEqual(['F', 'perdió 4&3', '0'])
    // «F» is said as a word, never «efe» (A11Y-22).
    expect(thruSaid('p2')).toBe(t.round.thruSpoken(18, 18))
  })
})
