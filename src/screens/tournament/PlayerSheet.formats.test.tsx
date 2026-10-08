// @vitest-environment happy-dom
/**
 * STRAT-03: the player sheet speaks the main event's own figure. A team
 * player's day is his own card under his team's figure; a match's day says
 * whose it was («ganó 4&3»), a fourball side's included; the pairs game's
 * label shows only when that game is on, never for the pairs a team format
 * is made of. And the card's gross totals count what the event counts: in a
 * strokes event a pick-up is the net double bogey the board charges, while
 * under Stableford, where a pick-up has no strokes, a nine with one shows no
 * gross total at all.
 */
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../data/profiles', async (importOriginal) => ({ ...(await importOriginal<typeof import('../../data/profiles')>()), useTournamentProfiles: () => [[], () => undefined] }))

import { getFixture } from '../../dev/fixtures'
import { dataFromSnapshot, useTournament } from '../../data/tournamentStore'
import type { TournamentSettings } from '../../engine/settings/schema'
import { score } from '../../engine/testing/fixtures'
import type { Snapshot } from '../../engine/types'
import { PlayerSheet } from './PlayerSheet'
import { TournamentContext } from './TournamentGate'

type Individual = TournamentSettings['modules']['individual']

/** One player's sheet on a design fixture, edited first; returns the open sheet. */
function sheet(fixture: string, playerId: string, edit?: (s: Snapshot) => void) {
  const fx = getFixture(fixture)!
  const snap = structuredClone(fx.snapshot)
  edit?.(snap)
  useTournament.setState({ tournamentId: `fixture:${fixture}`, data: dataFromSnapshot(snap), loading: false, error: null, realtime: 'off' })
  render(
    <MemoryRouter>
      <TournamentContext.Provider value={{ tournamentId: snap.tournament.id, slug: `_/${fixture}`, lookup: fx.lookup, me: fx.me, refresh: async () => undefined, leave: async () => undefined }}>
        <PlayerSheet playerId={playerId} onClose={() => undefined} />
      </TournamentContext.Provider>
    </MemoryRouter>,
  )
  return within(screen.getByRole('dialog'))
}

const settingsOf = (s: Snapshot) => s.tournament.settings as TournamentSettings
/** The fixture's main event played in another format, or with other options. */
function playAs(s: Snapshot, format: Individual['format'], options: Partial<Individual['formatOptions']> = {}) {
  const st = settingsOf(s)
  s.tournament.settings = { ...st, modules: { ...st.modules, individual: { ...st.modules.individual, format, formatOptions: { ...st.modules.individual.formatOptions, ...options } } } }
}
const pickUp = (s: Snapshot, playerId: string, hole: number) => {
  s.scores = s.scores.map((x) => (x.roundId === 'r1' && x.playerId === playerId && x.hole === hole ? score('r1', playerId, hole, null, 2, true) : x))
}
const days = (d: ReturnType<typeof sheet>) => d.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)
const headLine = (d: ReturnType<typeof sheet>) => d.getByText(/, por el /).textContent
/** The gross total of each nine (the last cell of the player's row) and the round's total line. */
function grossTotals(d: ReturnType<typeof sheet>, player: string) {
  const nines = d.getAllByRole('table').map((table) => {
    const row = within(table).getAllByRole('row').find((r) => r.firstElementChild?.textContent === player)!
    return row.lastElementChild!.textContent
  })
  return { nines, total: d.getByText(/^Total: .* gross$/).textContent }
}

afterEach(() => cleanup())

describe('the player sheet in each format (STRAT-03)', () => {
  it("a team player's day is his own card, under his team's figure", () => {
    // team8: Elías and Fabián are Los Compadres, −19 net as a team; Elías's own day is +3 net.
    const d = sheet('team8', 'p1')
    expect(headLine(d)).toBe('1.º con Los Compadres, −19 neto, por el F')
    expect(days(d)).toEqual(['Día 1: +3 neto'])
  })

  it('a match day says whose it was', () => {
    // match8, group 1 (off the 1st tee): Fabián beat Elías 4&3.
    expect(days(sheet('match8', 'p2'))).toEqual(['Día 1: ganó 4&3'])
    cleanup()
    expect(days(sheet('match8', 'p1'))).toEqual(['Día 1: perdió 4&3'])
  })

  it("under fourball a player's day is his side's match, not his own strokes", () => {
    const fourball = (s: Snapshot) => playAs(s, 'matchPlay', { matchMode: 'fourball', scoring: 'net' })
    // Los Compadres (Elías, Fabián) beat Las Palmas (Gael H., Hugo I.) 4&3; Elías's own card was +3 net. Tres
    // Marías won 2&1 off the 10th, so Los Compadres are 1st alone.
    const d = sheet('team8', 'p1', fourball)
    expect(headLine(d)).toBe('1.º con Los Compadres, 1 punto, por el F')
    expect(days(d)).toEqual(['Día 1: ganó 4&3'])
    cleanup()
    expect(days(sheet('team8', 'p3', fourball))).toEqual(['Día 1: perdió 4&3'])
  })

  it("a team format's pairs are teams, never shown under the pairs game's label", () => {
    // team8 keeps its two-player teams in `pairs`, with the pairs game («Parejas») off.
    const d = sheet('team8', 'p1')
    expect(d.queryByText('Parejas')).toBeNull()
    expect(d.queryByText(/pareja:/)).toBeNull()
  })

  it("with the pairs game on, the sheet names his pair under the game's own label", () => {
    const d = sheet('stroke8', 'p1', (s) => {
      const st = settingsOf(s)
      s.tournament.settings = { ...st, modules: { ...st.modules, pairs: { ...st.modules.pairs, enabled: true, label: 'Los Matrimonios' } } }
      s.pairs = [
        { id: 'pr1', name: 'Fore!', player1Id: 'p1', player2Id: 'p8', kind: null, pickedByHonoree: false, drawnAt: null },
        { id: 'pr2', name: 'Los Bogey', player1Id: 'p2', player2Id: 'p7', kind: null, pickedByHonoree: false, drawnAt: null },
      ]
    })
    const pairLine = d.getByText('Fore!, pareja:')
    expect(within(pairLine).getByText('Los Matrimonios')).toBeTruthy()
    expect(within(pairLine).getByText('Matías')).toBeTruthy()
  })

  it('in a strokes event a pick-up counts in the gross totals as the net double bogey the board charges', () => {
    // Fabián picks up on the 5th (par 4, stroke index 1, one stroke received): 4 + 1 + 2 = 7.
    // His other front-nine holes add up to 33, so the nine is 40 and the round 73, the board's +1.
    const d = sheet('stroke8', 'p2', (s) => {
      playAs(s, 'strokePlay', { scoring: 'gross' })
      pickUp(s, 'p2', 5)
    })
    expect(headLine(d)).toBe('1.º, +1 gross, por el F')
    expect(grossTotals(d, 'Fabián')).toEqual({ nines: ['40', '33'], total: 'Total: 73 gross' })
  })

  it('under Stableford a nine with a pick-up shows no gross total, and the round reads «–»', () => {
    const d = sheet('stroke8', 'p2', (s) => {
      playAs(s, 'stableford')
      pickUp(s, 'p2', 5)
    })
    expect(grossTotals(d, 'Fabián')).toEqual({ nines: ['', '33'], total: 'Total: – gross' })
  })
})

describe('the sheet and Estadísticas count alike (#91 round 3, P3-d)', () => {
  it('under gross, «Pares», «Bogeys» and «Doble o peor» are the engine’s counts, on the gross score', () => {
    const gross = (s: Snapshot) => playAs(s, 'strokePlay', { scoring: 'gross' })
    const snap = structuredClone(getFixture('stroke8')!.snapshot)
    gross(snap)
    const st = dataFromSnapshot(snap).state.stats.players['p2']!
    const d = sheet('stroke8', 'p2', gross)
    const stat = (label: string) => Number(d.getByText(label, { exact: true }).previousElementSibling!.textContent)
    expect([stat('Pares'), stat('Bogeys'), stat('Doble o peor')]).toEqual([st.pars, st.bogeys, st.doubleOrWorse])
    expect(d.queryByText('Pares netos')).toBeNull()
  })

  it('every count on the sheet is its own: birdies gross and net, doubles, pick-ups', () => {
    // stroke8's p2 under gross with a pick-up on the 4th: 8 gross birdies, 11 net, 4 doubles, 1 pick-up.
    const edit = (s: Snapshot) => {
      playAs(s, 'strokePlay', { scoring: 'gross' })
      pickUp(s, 'p2', 4)
    }
    const snap = structuredClone(getFixture('stroke8')!.snapshot)
    edit(snap)
    const st = dataFromSnapshot(snap).state.stats.players['p2']!
    const d = sheet('stroke8', 'p2', edit)
    const stat = (label: string) => Number(d.getByText(label, { exact: true }).previousElementSibling!.textContent)
    expect([stat('Birdies gross'), stat('Birdies netos'), stat('Doble o peor'), stat('Levantó')]).toEqual([st.grossBirdies, st.netBirdies, st.doubleOrWorse, st.pickUps])
    expect(new Set([st.grossBirdies, st.netBirdies, st.doubleOrWorse, st.pickUps]).size).toBe(4)
  })
})
