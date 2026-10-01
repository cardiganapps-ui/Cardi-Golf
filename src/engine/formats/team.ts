/**
 * Team golf: scramble, best ball and shamble.
 *
 * All three take the team's best ball on each hole — that is literally the
 * rule for best ball and shamble, and in a scramble every member plays the
 * same ball, so their cards agree and "the best of them" is that ball. One
 * rule serves the three; what changes between them is how the team got there,
 * which is the players' business, not the scorer's.
 *
 * A team is a pair the Comité drew. Larger teams arrive with the auto draw.
 */
import type { TournamentSettings } from '../settings/schema'
import type { Explanation, Id } from '../types'
import { countbackFrom, emptyCountback, teamEntrants } from './entrants'
import { toParFigure, type Entrant, type Figure, type FormatContext, type FormatStandings, type MainFormat } from './format'
import { holeStrokes } from './strokePlay'

type Mode = 'scramble' | 'bestBall' | 'shamble'

const MODE_NAME: Record<Mode, string> = { scramble: 'Scramble', bestBall: 'Mejor bola', shamble: 'Shamble' }

/** The team's ball on one hole: fewest strokes, or most points. */
function teamHole(ctx: FormatContext, roundId: Id, team: Entrant, hole: number, net: boolean, points: boolean): { strokes: number; par: number } | { points: number } | null {
  const strokes: number[] = []
  const pts: number[] = []
  let par = 0
  for (const playerId of team.playerIds) {
    const h = ctx.core.rounds[roundId]?.[playerId]?.holes.find((x) => x.hole === hole)
    if (!h?.played) continue
    par = h.par
    if (points) pts.push(h.points)
    else {
      const s = holeStrokes(h, net)
      if (s != null) strokes.push(s)
    }
  }
  if (points) return pts.length ? { points: Math.max(...pts) } : null
  return strokes.length ? { strokes: Math.min(...strokes), par } : null
}

export const teamFormat: MainFormat = {
  id: 'team',
  defaultLabel: 'Por equipos',
  // Points count up, strokes count down.
  higherIsBetter: (s) => s.modules.individual.formatOptions.teamScoring === 'stableford',
  figureLabel: (s) => (s.modules.individual.formatOptions.teamScoring === 'stableford' ? 'Puntos' : s.modules.individual.formatOptions.scoring === 'gross' ? 'Gross' : 'Neto'),

  describe(settings: TournamentSettings): Explanation {
    const o = settings.modules.individual.formatOptions
    const mode = (o.teamMode ?? 'bestBall') as Mode
    const points = o.teamScoring === 'stableford'
    const how: Record<Mode, string> = {
      scramble: 'Todos tiran, el equipo escoge la mejor bola y desde ahí vuelven a tirar todos.',
      bestBall: 'Cada quien juega su propia bola; en cada hoyo cuenta la mejor del equipo.',
      shamble: 'Todos tiran de salida, el equipo escoge el mejor drive y de ahí cada quien juega su bola.',
    }
    return {
      title: MODE_NAME[mode],
      steps: [
        how[mode],
        points ? 'Cada hoyo cuenta los puntos Stableford de la mejor bola del equipo.' : 'Cada hoyo cuenta los golpes de la mejor bola del equipo.',
        o.scoring === 'gross' ? 'Sin hándicap.' : 'Con los golpes de ventaja de cada quien.',
        points ? 'Gana el equipo con más puntos.' : 'Gana el equipo con menos golpes contra el par.',
        ...(points ? [] : ['Al cierre, un equipo con hoyos sin capturar queda después de los que completaron la tarjeta.']),
      ],
    }
  },

  standings(ctx: FormatContext): FormatStandings {
    const o = ctx.settings.modules.individual.formatOptions
    const points = o.teamScoring === 'stableford'
    const net = o.scoring !== 'gross'
    const entrants = teamEntrants(ctx)
    const warnings: string[] = []
    if (entrants.length === 0) warnings.push('Este torneo juega por equipos y todavía no hay equipos sorteados. El Comité los arma en Parejas.')

    const totals: FormatStandings['totals'] = {}
    const perRound: FormatStandings['perRound'] = {}
    const thru: FormatStandings['thru'] = {}
    const countback: FormatStandings['countback'] = {}
    const lastRound = ctx.core.roundIds.at(-1)

    for (const e of entrants) {
      let total = 0
      let par = 0
      let played = 0
      const byRound: Record<string, Figure> = {}
      const lastHoles: Array<{ hole: number; value: number }> = []

      for (const rid of ctx.core.roundIds) {
        const round = ctx.snapshot.rounds.find((r) => r.id === rid)
        let rTotal = 0
        let rPar = 0
        let rPlayed = 0
        for (let hole = 1; hole <= (round?.holes ?? 18); hole++) {
          const h = teamHole(ctx, rid, e, hole, net, points)
          if (!h) continue
          rPlayed++
          if ('points' in h) rTotal += h.points
          else {
            rTotal += h.strokes
            rPar += h.par
          }
          if (rid === lastRound) lastHoles.push({ hole, value: 'points' in h ? h.points : h.strokes })
        }
        byRound[rid] = rPlayed === 0 ? { value: 0, text: '—', empty: true } : points ? { value: rTotal, text: String(rTotal) } : toParFigure(rTotal, rPar)
        total += rTotal
        par += rPar
        played += rPlayed
      }

      perRound[e.id] = byRound
      thru[e.id] = played
      totals[e.id] = played === 0 ? { value: 0, text: '—', empty: true } : points ? { value: total, text: String(total) } : toParFigure(total, par)
      countback[e.id] = lastHoles.length ? countbackFrom(lastHoles, 18, points) : emptyCountback()
    }

    return { entrants, totals, perRound, thru, countback, warnings }
  },
}
