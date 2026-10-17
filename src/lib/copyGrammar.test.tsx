// @vitest-environment happy-dom
/**
 * COPY-23: shipped strings a native speaker reads as machine-assembled. «1 pts» on the Tarjeta, the feed,
 * the Comité's tiles, Estadísticas, the hole's explanation and the Day 2 cut's; «Iván J. y Julián gana 1
 * arriba» (in the press line and in the row's own figure); every hole of 4 points or more called «águila
 * neta», a gross eagle and a 5-point hole too; «en los hoyos 14» for one hole; «en green de salida en par 3»
 * with no verb; «Comprarse cuenta en el máximo»; the Comité's «Base 6, día 1 28 pts, ajuste del comité»; the
 * Reglamento's «por cada 1 puntos»; and the Ceremonia's list of Calcutta owners with nothing saying what it was.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('canvas-confetti', () => ({ default: vi.fn() }))

import { FIXTURE_NAMES, getFixture } from '../dev/fixtures'
import { dataFromSnapshot, useTournament } from '../data/tournamentStore'
import { computeTournament } from '../engine/computeTournament'
import { holeWhy } from '../engine/core/compute'
import { nextRoundCut } from '../engine/core/handicap'
import { GAME_ENTRIES } from '../engine/games/catalog'
import { describeGame } from '../engine/games/describe'
import { msg, type Msg } from '../engine/messages'
import { parseSettings, type TournamentSettings } from '../engine/settings/schema'
import type { GameConfig } from '../engine/settings/games'
import { ptsText, t } from '../i18n/es-MX'
import { CeremonyScreen } from '../screens/tournament/CeremonyScreen'
import { TournamentContext } from '../screens/tournament/tournamentContext'
import { feedText } from './figureText'
import { words } from '../engine/testing/words'

afterEach(() => cleanup())

describe('a count of points agrees with its number', () => {
  it('«1 pt», «−1 pt», «0 pts», «34 pts»', () => {
    expect(ptsText(1)).toBe('1 pt')
    expect(ptsText(-1, '−1')).toBe('−1 pt')
    expect(ptsText(0)).toBe('0 pts')
    expect(ptsText(34)).toBe('34 pts')
    expect(ptsText(1.5)).toBe('1.5 pts')
  })

  it('on the Tarjeta, the feed, the boards, Estadísticas and the Comité', () => {
    expect(t.card.ptsLine(1, 'bogey neto')).toBe('1 pt, bogey neto')
    expect(t.games.pointsFigure(1)).toBe('1 pt')
    for (const line of t.feed.honoreeHole('Nacho', 3, 1, 'El novio')) expect(line).toMatch(/ 1 pt(?!s)/)
    expect(t.common.figure('1', 1, 'points')).toBe('1 pt')
    expect(t.live.spotlight('3', 1, null, 18, 1)).toBe('3.º con 1 pt, hoyo 18: 1 pt')
    expect(t.stats.unit('points', 1)).toBe('+1 pt')
    expect(t.stats.unit('points', -1)).toBe('−1 pt')
    expect(t.stats.momentText('Nacho', 7, 1, 1)).toBe('Nacho, hoyo 7 del día 1: 1 punto.')
    expect(t.stats.cursedText(7, 1, 1)).toBe('Hoyo 7 del día 1: 1 pt promedio.')
    expect(t.admin.handicaps.prevDay(28, 1)).toBe('28 pts el día 1')
    expect(t.admin.handicaps.overrideInLine).toBe('ajuste del Comité')
  })

  it('in the hole’s own explanation', () => {
    const bogey = words(holeWhy({ par: 4, strokeIndex: 7, strokesReceived: 0, gross: 5, net: 5, points: 1, pickedUp: false, played: true }))
    expect(bogey.title).toBe('1 pt')
    expect(bogey.steps[0]).toBe('5 golpes en un par 4, sin golpes de ventaja en este hoyo (índice de golpe 7): 5 neto, bogey neto, 1 pt')
    expect(bogey.steps.at(-1)).toBe('Un par neto vale 2 pts y cada golpe de diferencia suma o resta uno: 4 + 0 − 5 + 2 = 1 pt')
  })
})

describe('the words agree with what happened', () => {
  const base = { at: null, roundNumber: 1, hole: 7, playerId: 'p4', scoring: 'points' } as const
  const line = (points: number, grossUnder: number) => feedText({ ...base, kind: 'birdie', points, grossUnder, under: points - 2 }, () => 'Nacho')

  it('four points is an eagle, five or more an albatross; «neto» only when a stroke made it', () => {
    expect(line(3, 1)).toBe('Nacho: birdie en el 7, +3 pts')
    expect(line(3, 0)).toBe('Nacho: birdie neto en el 7, +3 pts')
    expect(line(4, 2)).toBe('Nacho: águila en el 7, +4 pts')
    expect(line(4, 1)).toBe('Nacho: águila neta en el 7, +4 pts')
    expect(line(5, 3)).toBe('Nacho: albatros en el 7, +5 pts')
    expect(line(5, 2)).toBe('Nacho: albatros neto en el 7, +5 pts')
  })

  it('on every fixture, a Stableford line says «neto» exactly when the player got a stroke there', () => {
    let seen = 0
    for (const name of FIXTURE_NAMES) {
      const snap = getFixture(name)!.snapshot
      const st = computeTournament(snap, parseSettings(snap.tournament.settings))
      for (const e of st.feed) {
        if (e.kind !== 'birdie' || e.scoring !== 'points') continue
        const h = st.core.rounds[snap.rounds.find((r) => r.number === e.roundNumber)!.id]![e.playerId]!.holes.find((x) => x.hole === e.hole)!
        // Every line the event can be read as (COPY-15).
        for (const v of [0, 1, 2, 3]) {
          const text = feedText(e, () => 'X', undefined, v)
          expect(/net[oa][ !,]/.test(text), `${name}: ${text}, ${h.strokesReceived} golpes`).toBe(h.strokesReceived > 0)
        }
        seen++
      }
    }
    expect(seen).toBeGreaterThan(10)
  })

  it('the Day 2 cut counts one point as «1 pt», and the Reglamento says «por cada punto»', () => {
    const cut = { threshold: 36, pointsPerStroke: 1, maxStrokes: 4, mode: 'previous' as const }
    expect(words(nextRoundCut(37, cut).why).steps[0]).toBe('hizo 37 pts: 37 − 36 = 1 pt de más')
    expect(words(nextRoundCut(37, cut).why).steps[1]).toBe('se recorta 1 golpe por cada punto de más: 1 ÷ 1 = 1 golpe')
    expect(words(nextRoundCut(1, cut).why).steps[0]).toBe('hizo 1 pt, no más de 36: sin recorte')
    const rules = words(msg('rules.cut', { days: 2, threshold: 1, per: 1, max: 4, cumulative: false, points: true }))
    expect(rules).toContain('más de 1 punto, para el día 2 se te recorta 1 golpe por cada punto por encima')
    expect(words(msg('rules.cut', { days: 2, threshold: 36, per: 2, max: 4, cumulative: false, points: false }))).toContain(
      'más de 36 puntos Stableford, para el día 2 se te recorta 1 golpe por cada 2 puntos por encima',
    )
  })

  it('a side of two wins in the plural, one player in the singular', () => {
    const snap = getFixture('friends8')!.snapshot
    const st = computeTournament(snap, parseSettings(snap.tournament.settings))
    const lines: string[] = []
    // The board's texts are codes (ARCH-05): each in words, as Juegos shows it.
    const walk = (v: unknown): unknown => (typeof v === 'string' ? lines.push(v) : v && typeof v === 'object' ? ('code' in v && 'params' in v ? lines.push(words(v as Msg)) : Object.values(v).forEach(walk)) : undefined)
    for (const g of Object.values(st.games)) if (g.config.type === 'match') walk(g.board)
    const pairs = lines.filter((l) => / (y|e) [^,]+ ganan? \d/.test(l))
    expect(pairs.length).toBeGreaterThan(0)
    for (const l of pairs) expect(l, l).toMatch(/ ganan \d/)
    expect(lines.some((l) => /Damián gana \d/.test(l))).toBe(true)
    // The row's figure sits beside the side that leads: «Ganan 2 y 1» beside a pair, «Gana 2 y 1» beside one.
    const figures = Object.values(st.games)
      .filter((g) => g.config.type === 'match')
      .flatMap((g) => g.board.sections.flatMap((s) => s.rows))
      .filter((r) => /^Ganan? /.test(words(r.figure)))
    expect(new Set(figures.map((r) => r.playerIds.length))).toEqual(new Set([1, 2]))
    for (const r of figures) expect(words(r.figure), words(r.figure)).toMatch(r.playerIds.length > 1 ? /^Ganan / : /^Gana /)
  })

  it('a contest on one hole says «el hoyo»; the greenie has its verb', () => {
    const closest = GAME_ENTRIES.find((e) => e.key === 'closest')!.create('g1') as Extract<GameConfig, { type: 'contest' }>
    expect(words(describeGame({ ...closest, options: { ...closest.options, holes: [14] } })).join(' ')).toContain('en el hoyo 14.')
    expect(words(describeGame({ ...closest, options: { ...closest.options, holes: [3, 7] } })).join(' ')).toContain('en los hoyos 3 y 7.')
    const greenie = GAME_ENTRIES.find((e) => e.key === 'greenies')!
    expect(words(describeGame(greenie.create('g2'))).join(' ')).toContain('llega al green desde la salida en un par 3 y hace par o mejor')
    expect(t.setup.catalog.games[greenie.key]!.blurb).toBe('Llegar al green desde la salida en un par 3 (o salir de la trampa) y hacer par o mejor.')
    expect(t.admin.tournament.selfCounts).toBe('Comprarse a sí mismo cuenta para el máximo')
  })
})

describe('the Ceremonia’s Calcutta says whose the list is', () => {
  it('«Lo que cobra cada dueño» over the owners', () => {
    const fx = getFixture('full12-finished')!
    const snap = structuredClone(fx.snapshot)
    useTournament.setState({ tournamentId: 'fixture:full12-finished', data: dataFromSnapshot(snap), loading: false, error: null, realtime: 'off' })
    render(
      <MemoryRouter>
        <TournamentContext.Provider value={{ tournamentId: snap.tournament.id, slug: '_/full12-finished', lookup: fx.lookup, me: fx.me, refresh: async () => undefined, leave: async () => undefined }}>
          <CeremonyScreen />
        </TournamentContext.Provider>
      </MemoryRouter>,
    )
    const C = t.ceremony
    const title = C.steps.auction((snap.tournament.settings as TournamentSettings).modules.auction.label)
    fireEvent.click(screen.getByRole('button', { name: C.start }))
    for (let i = 0; i < 40 && screen.getByRole('region').getAttribute('aria-label') !== title; i++) fireEvent.click(screen.getByRole('button', { name: C.next }))
    expect(screen.getByRole('region').getAttribute('aria-label')).toBe(title)
    fireEvent.click(screen.getByRole('button', { name: C.next }))
    expect(screen.getByRole('heading', { level: 3, name: C.auctionOwners })).toBeTruthy()
  })
})
