/**
 * COPY-19: «¿Cómo se calculó?» read as algebra («Par 4, SI 3: 1 golpe de
 * ventaja», «4 + 1 − 5 + 2 = 2 pts», «Día 1: 37 − 36 = 1 pts de más; 1 ÷ 2
 * = 0.5, 0 golpes») and a $10,000 prize said only «1.º lugar: $10,000».
 * Each explanation now leads with a sentence in words, then the arithmetic,
 * and money is the one formatter's. The numbers are the engine's, unchanged:
 * the §6 cases (handicap.test.ts, compute.test.ts and the rest) still hold.
 */
import { describe, expect, it } from 'vitest'
import { FIXTURE_NAMES, getFixture } from '../../dev/fixtures'
import { computeTournament } from '../computeTournament'
import { FIRST_TOURNAMENT_SETTINGS } from '../settings/presets'
import { parseSettings } from '../settings/schema'
import { fillRound, makeFirstTournament } from '../testing/fixtures'
import { holeWhy } from './compute'
import { nextRoundCut, playingHandicap } from './handicap'
import type { Msg } from '../messages'
import { words } from '../testing/words'

describe('explanations read as sentences (COPY-19)', () => {
  it('a hole: what was played, in words, then the points’ arithmetic with its «+ 2» said', () => {
    // §6: par 4, SI 3, PH 16 (1 stroke): gross 5 → 2 pts.
    const why = words(
      holeWhy({
        par: 4,
        strokeIndex: 3,
        strokesReceived: 1,
        gross: 5,
        net: 4,
        points: 2,
        pickedUp: false,
        played: true,
      }),
    )
    expect(why.title).toBe('2 pts')
    expect(why.steps).toEqual([
      '5 golpes en un par 4, con 1 golpe de ventaja en este hoyo (índice de golpe 3): 4 neto, par neto, 2 pts',
      '5 − 1 = 4 neto',
      'Un par neto vale 2 pts y cada golpe de diferencia suma o resta uno: 4 + 1 − 5 + 2 = 2 pts',
    ])
    expect(
      words(
        holeWhy({
          par: 4,
          strokeIndex: 3,
          strokesReceived: 1,
          gross: null,
          net: null,
          points: 0,
          pickedUp: true,
          played: true,
        }),
      ).steps,
    ).toEqual(['Levantó (dejó el hoyo sin terminarlo): cuenta 0 pts'])
  })

  it('the handicap chain: each step says what it does', () => {
    // §6: base 20 → 80% = 16; base 60 → capped at 54 → 43.
    expect(words(playingHandicap(20, FIRST_TOURNAMENT_SETTINGS.handicap).why).steps).toEqual([
      'Se juega con el 80%: 80% de 20 = 16',
    ])
    expect(words(playingHandicap(60, FIRST_TOURNAMENT_SETTINGS.handicap).why).steps).toEqual([
      'Hándicap 60; el tope es 54, así que cuenta 54',
      'Se juega con el 80%: 80% de 54 = 43.2',
      'Redondeado al entero: 43',
    ])
  })

  it('the day-2 cut: what he made and what it costs, after «El día 1»', () => {
    const cut = FIRST_TOURNAMENT_SETTINGS.day2Cut
    expect(words(nextRoundCut(37, cut).why).steps).toEqual([
      'hizo 37 pts: 37 − 36 = 1 pt de más',
      'se recorta 1 golpe por cada 2 puntos de más: 1 ÷ 2 = 0.5, 0 golpes',
    ])
    expect(words(nextRoundCut(47, cut).why).steps.at(-1)).toBe('el máximo es 4')
    expect(words(nextRoundCut(35, cut).why).steps).toEqual(['hizo 35 pts, no más de 36: sin recorte'])
    // §6: PH1 16, P1 42 → PH2 13, in the playing handicap's own explanation.
    const snap = makeFirstTournament()
    fillRound(snap, 'r1', 11)
    const st = computeTournament(snap, FIRST_TOURNAMENT_SETTINGS)
    const day2 = Object.values(st.core.rounds.r2!).find((pr) => pr.cut > 0)!
    expect(
      words(day2.playingHcpWhy).steps.some((s) =>
        /^El día 1 hizo \d+ pts: \d+ − 36 = \d+ pts? de más; se recorta 1 golpe por cada 2 puntos de más: /.test(s),
      ),
    ).toBe(true)
    expect(words(day2.playingHcpWhy).steps.some((s) => s.startsWith('Con el recorte: '))).toBe(true)
  })

  it('a prize: who, where and with what, «si el torneo terminara ahora» while it runs, then what the place pays', () => {
    const snap = makeFirstTournament()
    fillRound(snap, 'r1', 11)
    fillRound(snap, 'r2', 12)
    const live = computeTournament(snap, FIRST_TOURNAMENT_SETTINGS)
    const first = live.prizes.find((p) => p.moduleId === 'individual' && p.amount === 10000)!
    expect(words(first.why).steps[0]).toMatch(/^.+ va 1\.º con \d+ pts, si el torneo terminara ahora$/)
    expect(words(first.why).steps[1]).toBe('El 1.º lugar paga $10,000')
    snap.rounds.forEach((r) => (r.status = 'finished'))
    snap.tournament.status = 'finished'
    const final = computeTournament(snap, FIRST_TOURNAMENT_SETTINGS)
    const prizes = final.prizes.filter((p) => p.moduleId === 'individual')
    expect(prizes.length).toBeGreaterThan(0)
    for (const p of prizes) {
      expect(words(p.why).steps[0]).toMatch(/^.+ terminó (empatado en )?\d\.º con \d+ pts$/)
      expect(words(p.why).steps.slice(1).join(' ')).toMatch(/El \d\.º lugar paga \$\d|Empataron \d en el \d\.º lugar/)
    }
  })

  it('money is the one formatter’s on every fixture: never «$10000», never «c/u»', () => {
    const COPY = new Set(['title', 'steps', 'label', 'text', 'detail', 'notes', 'warnings', 'sub'])
    const walk = (v: unknown, copy: boolean, out: string[]): string[] => {
      // What the engine says is codes (ARCH-05): each in words, as the screens show it.
      if (v && typeof v === 'object' && 'code' in v && 'params' in v) out.push(words(v as Msg))
      else if (typeof v === 'string') {
        if (copy) out.push(v)
      } else if (Array.isArray(v)) v.forEach((x) => walk(x, copy, out))
      else if (v && typeof v === 'object')
        for (const [k, x] of Object.entries(v)) if (k !== 'settings') walk(x, copy || COPY.has(k), out)
      return out
    }
    for (const name of FIXTURE_NAMES) {
      const snap = getFixture(name)!.snapshot
      for (const s of walk(computeTournament(snap, parseSettings(snap.tournament.settings)), false, [])) {
        expect(s, name).not.toMatch(/\$\d{4,}|c\/u/)
      }
    }
  })
})
