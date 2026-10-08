// @vitest-environment happy-dom
/**
 * STRAT-03: the TV's main board under match play. A decided match reads the
 * same for both sides («4&3»), so each row's day says whose it was: «Hoyo F,
 * ganó 4&3» beside the winner's point, «Hoyo F, perdió 4&3» beside the loser's.
 */
import { cleanup, render } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import { getFixture } from '../../dev/fixtures'
import { dataFromSnapshot, useTournament } from '../../data/tournamentStore'
import { TournamentContext } from './TournamentGate'
import { TvScreen } from './TvScreen'

function tv(fixture: string) {
  const fx = getFixture(fixture)!
  const snap = structuredClone(fx.snapshot)
  useTournament.setState({ tournamentId: `fixture:${fixture}`, data: dataFromSnapshot(snap), loading: false, error: null, realtime: 'off' })
  render(
    <MemoryRouter>
      <TournamentContext.Provider value={{ tournamentId: snap.tournament.id, slug: `_/${fixture}`, lookup: fx.lookup, me: fx.me, refresh: async () => undefined, leave: async () => undefined }}>
        <TvScreen />
      </TournamentContext.Provider>
    </MemoryRouter>,
  )
}
/** A player's row on the board: where he is and his day, then his figure. */
const tvRow = (playerId: string) => {
  const row = document.querySelector(`[data-player="${playerId}"]`)!
  return [row.querySelector('[class*="_small_"]')!.textContent, row.querySelector('[class*="_big_"]')!.textContent]
}

afterEach(() => cleanup())

describe('the TV board under match play (STRAT-03)', () => {
  it("each row's day says whose it was", () => {
    // match8, group 1 (off the 1st tee): Fabián beat Elías 4&3.
    tv('match8')
    expect(tvRow('p2')).toEqual(['Hoyo F, ganó 4&3', '1'])
    expect(tvRow('p1')).toEqual(['Hoyo F, perdió 4&3', '0'])
  })
})
