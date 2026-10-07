// @vitest-environment happy-dom
/**
 * STRAT-03: the share cards speak the main event's own figure. On the
 * leaderboard card the days add up only where points do («41 + 41»); strokes
 * and matches list the days played («−11, +1», «ganó 4&3») and leave out a day
 * not played yet. On a player's round card, a team player's day is his own
 * card under his team's figure, and a match's day, a fourball side's
 * included, is its result with its side.
 */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

// The card stays on the page while its image is «being made».
vi.mock('./shareAction', () => ({ shareCard: vi.fn(() => new Promise(() => undefined)) }))

import { getFixture } from '../dev/fixtures'
import { dataFromSnapshot, useTournament } from '../data/tournamentStore'
import type { TournamentSettings } from '../engine/settings/schema'
import { fillRound, makeGroup, makeRound } from '../engine/testing/fixtures'
import type { Round, Snapshot } from '../engine/types'
import { TournamentContext } from '../screens/tournament/TournamentGate'
import { ShareCardButton, type ShareKind } from './ShareCard'

type Individual = TournamentSettings['modules']['individual']

/** Taps the share button for `what` on a design fixture, edited first; returns the card it draws. */
function shareCard(fixture: string, what: ShareKind, edit?: (s: Snapshot) => void) {
  const fx = getFixture(fixture)!
  const snap = structuredClone(fx.snapshot)
  edit?.(snap)
  useTournament.setState({ tournamentId: `fixture:${fixture}`, data: dataFromSnapshot(snap), loading: false, error: null, realtime: 'off' })
  render(
    <MemoryRouter>
      <TournamentContext.Provider value={{ tournamentId: snap.tournament.id, slug: `_/${fixture}`, lookup: fx.lookup, me: fx.me, refresh: async () => undefined, leave: async () => undefined }}>
        <ShareCardButton what={what} />
      </TournamentContext.Provider>
    </MemoryRouter>,
  )
  fireEvent.click(screen.getByRole('button'))
  return within(document.querySelector<HTMLElement>(`[data-share-card="${what.kind}"]`)!)
}

const settingsOf = (s: Snapshot) => s.tournament.settings as TournamentSettings
function playAs(s: Snapshot, format: Individual['format'], options: Partial<Individual['formatOptions']> = {}) {
  const st = settingsOf(s)
  s.tournament.settings = { ...st, modules: { ...st.modules, individual: { ...st.modules.individual, format, formatOptions: { ...st.modules.individual.formatOptions, ...options } } } }
}
/** A second day on the 8-player format fixtures, same groups; `players` have scores (all of them unless said). */
function secondDay(s: Snapshot, status: Round['status'], players?: string[]) {
  s.rounds = [{ ...s.rounds[0]!, status: 'finished' }, makeRound(2, { status, date: '2027-06-13' })]
  s.tournament.currentRoundId = 'r2'
  s.groups.push(makeGroup('r2', 1, ['p1', 'p2', 'p3', 'p4'], 1), makeGroup('r2', 2, ['p5', 'p6', 'p7', 'p8'], 10))
  fillRound(s, 'r2', 41, players ? { playerIds: players } : {})
  s.tournament.settings = { ...settingsOf(s), rounds: 2 }
}
/** A leaderboard card's row by its name: position, name, days, figure, money. */
const row = (card: ReturnType<typeof shareCard>, name: string) => Array.from(card.getByText(name).parentElement!.children).map((c) => c.textContent)
const dayLine = (card: ReturnType<typeof shareCard>) => card.getByText(/^Día 1, /).textContent

afterEach(() => cleanup())

describe('the leaderboard card (STRAT-03)', () => {
  it('a match day says whose it was', () => {
    // match8, group 1 (off the 1st tee): Fabián beat Elías 4&3.
    const card = shareCard('match8', { kind: 'leaderboard' })
    expect(row(card, 'Fabián')).toEqual(['T2', 'Fabián', 'ganó 4&3', '1', '$960'])
    expect(row(card, 'Elías')).toEqual(['T6', 'Elías', 'perdió 4&3', '0', ''])
  })

  it('stroke days are listed, not added: «−11, +1»', () => {
    const card = shareCard('stroke8', { kind: 'leaderboard' }, (s) => secondDay(s, 'finished'))
    expect(row(card, 'Fabián')).toEqual(['2', 'Fabián', '−11, +1', '−10', '$1,920'])
    expect(row(card, 'Julián')).toEqual(['4', 'Julián', '−10, +10', 'E', ''])
  })

  it('a day not played yet is left out, not shown as «—»', () => {
    // Day 2 under way: group 1 has played it, group 2 (Iván J. and the rest) has not started.
    const card = shareCard('stroke8', { kind: 'leaderboard' }, (s) => secondDay(s, 'live', ['p1', 'p2', 'p3', 'p4']))
    expect(row(card, 'Iván J.')).toEqual(['3', 'Iván J.', '−5', '−5', ''])
    expect(row(card, 'Fabián')).toEqual(['2', 'Fabián', '−11, +1', '−10', '$1,920'])
  })

  it('points days add up: «41 + 41»', () => {
    const card = shareCard('stroke8', { kind: 'leaderboard' }, (s) => {
      playAs(s, 'stableford')
      secondDay(s, 'finished')
    })
    expect(row(card, 'Iván J.')).toEqual(['1', 'Iván J.', '41 + 41', '82', '$2,880'])
  })
})

describe("a player's round card (STRAT-03)", () => {
  it("a team player's day is his own card, under his team's figure", () => {
    const card = shareCard('team8', { kind: 'player', playerId: 'p1' })
    expect(card.getByText(/^Elías Fuentes, /).textContent).toBe('Elías Fuentes, 1.º con Los Compadres, −19 neto')
    expect(dayLine(card)).toBe('Día 1, hándicap de juego 4, +3 neto, 33 putts')
  })

  it('a match day says whose it was', () => {
    expect(dayLine(shareCard('match8', { kind: 'player', playerId: 'p2' }))).toBe('Día 1, hándicap de juego 9, ganó 4&3, 29 putts')
    cleanup()
    expect(dayLine(shareCard('match8', { kind: 'player', playerId: 'p1' }))).toBe('Día 1, hándicap de juego 4, perdió 4&3, 33 putts')
  })

  it("under fourball the day is his side's match, not his own strokes", () => {
    // Los Compadres (Elías, Fabián) beat Las Palmas 4&3; Elías's own card was +3 net.
    const card = shareCard('team8', { kind: 'player', playerId: 'p1' }, (s) => playAs(s, 'matchPlay', { matchMode: 'fourball', scoring: 'net' }))
    expect(card.getByText(/^Elías Fuentes, /).textContent).toBe('Elías Fuentes, empatado en 1.º con Los Compadres, 1 punto')
    expect(dayLine(card)).toBe('Día 1, hándicap de juego 4, ganó 4&3, 33 putts')
  })
})
