// @vitest-environment happy-dom
/**
 * STRAT-03: Comité › Tarjetas shows a card in the event's own figure. The
 * summary reads the day as the event counts it («+3 neto», «+7 gross»,
 * «33 pts»), and a hole tile shows Stableford points only where something
 * counts them (Stableford, or a points game such as the best round beside a
 * strokes event); otherwise it shows the hole's par.
 */
import { cleanup, render } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import { getFixture } from '../../dev/fixtures'
import { dataFromSnapshot, useTournament } from '../../data/tournamentStore'
import type { TournamentSettings } from '../../engine/settings/schema'
import type { Snapshot } from '../../engine/types'
import { TournamentContext } from '../tournament/TournamentGate'
import { AdminScores } from './AdminScores'

type Individual = TournamentSettings['modules']['individual']

/** stroke8's Tarjetas, open on Elías's card for day 1. */
function adminCard(edit?: (s: Snapshot) => void) {
  const fx = getFixture('stroke8')!
  const snap = structuredClone(fx.snapshot)
  edit?.(snap)
  useTournament.setState({ tournamentId: 'fixture:stroke8', data: dataFromSnapshot(snap), loading: false, error: null, realtime: 'off' })
  render(
    <MemoryRouter>
      <TournamentContext.Provider value={{ tournamentId: snap.tournament.id, slug: '_/stroke8', lookup: fx.lookup, me: fx.me, refresh: async () => undefined, leave: async () => undefined }}>
        <AdminScores />
      </TournamentContext.Provider>
    </MemoryRouter>,
  )
  return {
    summary: document.querySelector('[class*="_summary_"] [class*="rowTitle"]')?.textContent,
    /** Each hole tile's first small line: its points or its par. */
    tiles: Array.from(document.querySelectorAll('[class*="_holes_"] button')).map((b) => b.querySelector('[class*="holeSub"]')?.textContent),
  }
}
function playAs(s: Snapshot, format: Individual['format'], options: Partial<Individual['formatOptions']> = {}) {
  const st = s.tournament.settings as TournamentSettings
  s.tournament.settings = { ...st, modules: { ...st.modules, individual: { ...st.modules.individual, format, formatOptions: { ...st.modules.individual.formatOptions, ...options } } } }
}

afterEach(() => cleanup())

describe("Comité › Tarjetas in the event's figure (STRAT-03)", () => {
  // Elías's first three holes: 6 on a par 4 (0 points), 2 on a par 4 (4), 4 on a par 3 (1).
  it('net stroke play: the day against par, net, and each hole its par', () => {
    const { summary, tiles } = adminCard()
    expect(summary).toBe('+3 neto')
    expect(tiles.slice(0, 3)).toEqual(['Par 4', 'Par 4', 'Par 3'])
    expect(tiles.filter((x) => x?.endsWith(' pts'))).toEqual([])
  })

  it('gross stroke play: the day against par, gross', () => {
    const { summary, tiles } = adminCard((s) => playAs(s, 'strokePlay', { scoring: 'gross' }))
    expect(summary).toBe('+7 gross')
    expect(tiles.slice(0, 3)).toEqual(['Par 4', 'Par 4', 'Par 3'])
  })

  it('a points game beside the strokes event puts the points on the holes', () => {
    const { summary, tiles } = adminCard((s) => {
      const st = s.tournament.settings as TournamentSettings
      s.tournament.settings = { ...st, modules: { ...st.modules, bestRound: { enabled: true, label: 'Mejor ronda' } } }
    })
    expect(summary).toBe('+3 neto')
    expect(tiles.slice(0, 3)).toEqual(['0 pts', '4 pts', '1 pts'])
  })

  it('Stableford: the day in points, and the points on the holes', () => {
    const { summary, tiles } = adminCard((s) => playAs(s, 'stableford'))
    expect(summary).toBe('33 pts')
    expect(tiles.slice(0, 3)).toEqual(['0 pts', '4 pts', '1 pts'])
  })
})
