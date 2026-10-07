// @vitest-environment happy-dom
/**
 * STRAT-03: En vivo's honoree card speaks the main event's own figure: its
 * total with its unit («E neto», «+15 gross», «0 puntos»), today's figure
 * (a match day with its side, «perdió 1 abajo»; in a team event the team's
 * day, beside the team's total) and his last hole named on the score the
 * event counts («triple bogey» on a gross card). The board's match-play row
 * reads the day with its side too.
 */
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import { getFixture } from '../../dev/fixtures'
import { dataFromSnapshot, useTournament } from '../../data/tournamentStore'
import type { TournamentSettings } from '../../engine/settings/schema'
import { fillRound, makeGroup, makeRound, PAR_72, score } from '../../engine/testing/fixtures'
import type { Snapshot } from '../../engine/types'
import { LiveScreen } from './LiveScreen'
import { TournamentContext } from './TournamentGate'

type Individual = TournamentSettings['modules']['individual']

function live(fixture: string, edit?: (s: Snapshot) => void) {
  const fx = getFixture(fixture)!
  const snap = structuredClone(fx.snapshot)
  edit?.(snap)
  useTournament.setState({ tournamentId: `fixture:${fixture}`, data: dataFromSnapshot(snap), loading: false, error: null, realtime: 'off' })
  render(
    <MemoryRouter>
      <TournamentContext.Provider value={{ tournamentId: snap.tournament.id, slug: `_/${fixture}`, lookup: fx.lookup, me: fx.me, refresh: async () => undefined, leave: async () => undefined }}>
        <LiveScreen />
      </TournamentContext.Provider>
    </MemoryRouter>,
  )
}

const settingsOf = (s: Snapshot) => s.tournament.settings as TournamentSettings
function playAs(s: Snapshot, format: Individual['format'], options: Partial<Individual['formatOptions']> = {}) {
  const st = settingsOf(s)
  s.tournament.settings = { ...st, modules: { ...st.modules, individual: { ...st.modules.individual, format, formatOptions: { ...st.modules.individual.formatOptions, ...options } } } }
}
const honoree = (s: Snapshot, playerId: string) => void (s.players = s.players.map((p) => ({ ...p, isHonoree: p.id === playerId })))
const finish = (s: Snapshot) => {
  s.tournament.status = 'finished'
  s.rounds = s.rounds.map((r) => ({ ...r, status: 'finished' }))
}
/** One player's whole card: his gross on each hole. */
function card(s: Snapshot, playerId: string, strokes: number[]) {
  s.scores = s.scores.filter((x) => !(x.roundId === 'r1' && x.playerId === playerId))
  strokes.forEach((g, i) => s.scores.push(score('r1', playerId, i + 1, g, 2)))
}
const PARS = PAR_72.map(([par]) => par)
const spotlight = () => document.querySelector('[class*="spotlightLine"]')?.textContent

afterEach(() => cleanup())

describe("En vivo: the honoree's card in each format (STRAT-03)", () => {
  it('net stroke play: the total with its unit, today, and the last hole on the net score', () => {
    // stroke8: Hugo I. is the honoree, level on net, a net double bogey on the 18th.
    live('stroke8')
    expect(spotlight()).toBe('4.º con E neto, hoy E, hoyo 18: doble bogey neto')
  })

  it('gross stroke play: the last hole named on the gross score', () => {
    // Hugo I.'s 8 on the par-5 18th is a triple bogey; with his stroke there it would be a net double.
    live('stroke8', (s) => playAs(s, 'strokePlay', { scoring: 'gross' }))
    expect(spotlight()).toBe('5.º con +15 gross, hoy +15, hoyo 18: triple bogey')
  })

  it('match play: the day with its side, and a match lost on the 18th reads «perdió 1 abajo»', () => {
    // Gross singles, Gael H. (the groom) against Julián off the 10th: halved until Gael H. bogeys the 18th.
    // His last hole played is the 9th, a par (with his stroke there it would be a net birdie).
    live('match8', (s) => {
      playAs(s, 'matchPlay', { matchMode: 'singles', scoring: 'gross' })
      finish(s)
      honoree(s, 'p3')
      s.tournament.settings = { ...settingsOf(s), labels: { ...settingsOf(s).labels, honoree: 'El novio' } }
      s.groups = [makeGroup('r1', 1, ['p1', 'p8'], 1), makeGroup('r1', 2, ['p2', 'p7'], 1), makeGroup('r1', 3, ['p3', 'p6'], 10), makeGroup('r1', 4, ['p4', 'p5'], 10)]
      for (const p of ['p1', 'p2', 'p4', 'p6', 'p7']) card(s, p, PARS)
      card(s, 'p8', PARS.map((par, i) => (i < 3 ? par + 1 : par)))
      card(s, 'p3', PARS.map((par, i) => (i === 17 ? par + 1 : par)))
      card(s, 'p5', PARS.map((par, i) => (i < 8 ? par + 1 : par)))
    })
    expect(document.querySelector('[class*="spotlightName"]')?.textContent).toBe('El novio: Gael H.')
    expect(spotlight()).toBe('6.º con 0 puntos, hoy perdió 1 abajo, hoyo 9: par')
    // His row on the board says it the same way, and so does the winner's.
    expect(screen.getByRole('button', { name: /^6\.º, Gael H\., / }).getAttribute('aria-label')).toBe('6.º, Gael H., hoy perdió 1 abajo, hoyo F, 0')
    expect(screen.getByRole('button', { name: /, Julián, / }).getAttribute('aria-label')).toBe('3.º, Julián, hoy ganó 1 arriba, hoyo F, 1')
  })

  it("team Stableford: «hoy» is the team's day, beside the team's total", () => {
    // Day 2 of two: Las Palmas (Gael H. and Hugo I.) have 92 points, 44 of them today; Gael H.'s own card today is 35.
    live('team8', (s) => {
      playAs(s, 'team', { teamScoring: 'stableford' })
      honoree(s, 'p3')
      s.rounds = [{ ...s.rounds[0]!, status: 'finished' }, makeRound(2, { status: 'live', date: '2027-06-13' })]
      s.tournament.currentRoundId = 'r2'
      s.groups.push(makeGroup('r2', 1, ['p1', 'p2', 'p3', 'p4'], 1), makeGroup('r2', 2, ['p5', 'p6', 'p7', 'p8'], 10))
      fillRound(s, 'r2', 41)
      s.tournament.settings = { ...settingsOf(s), rounds: 2 }
    })
    expect(useTournament.getState().data!.state.core.rounds.r2!.p3!.points).toBe(35)
    expect(spotlight()).toBe('4.º con 92 pts, hoy 44, hoyo 18: 4 pts')
  })
})
