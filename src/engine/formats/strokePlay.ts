/**
 * Stroke play, gross or net: count every stroke, fewest wins.
 *
 * A pick-up has no score, and stroke play needs one, so a picked-up hole
 * counts as net double bogey — par plus the strokes that player receives
 * there, plus two. That is the "most likely score" cap WHS uses, and the same
 * one this app already applies when it computes a player's index, so a round
 * scores the same whether it is read here or by `refresh_round_results`.
 */
import type { HoleResult } from '../core/types'
import type { TournamentSettings } from '../settings/schema'
import type { Explanation, Id } from '../types'
import { countbackFrom, emptyCountback, playerEntrants, playerRound } from './entrants'
import { toParFigure, type Figure, type FormatContext, type FormatStandings, type MainFormat } from './format'

/** What a hole costs, with a pick-up capped at net double bogey. */
export function holeStrokes(h: HoleResult, net: boolean): number | null {
  if (!h.played) return null
  const gross = h.pickedUp ? h.par + h.strokesReceived + 2 : h.gross
  if (gross == null) return null
  return net ? gross - h.strokesReceived : gross
}

/**
 * A hole explained in strokes, for «¿Cómo se calculó?» where the event counts
 * strokes: the hole's own explanation (`HoleResult.why`) is in Stableford
 * points, which that event never shows.
 */
export function strokesWhy(h: HoleResult, net: boolean): Explanation {
  if (!h.played) return { title: 'Sin capturar', steps: ['Sin capturar'] }
  const counted = holeStrokes(h, net)!
  const d = counted - h.par
  const rel = d === 0 ? 'par' : d > 0 ? `${d} sobre par` : `${-d} bajo par`
  const strokes = (n: number) => `${n} golpe${n === 1 ? '' : 's'}`
  const steps: string[] = [`Par ${h.par}, SI ${h.strokeIndex}${net ? `: ${strokes(h.strokesReceived)} de ventaja` : ''}`]
  if (h.pickedUp) {
    steps.push(`Levantó: cuenta como doble bogey neto, par ${h.par} + ${strokes(h.strokesReceived)} de ventaja + 2 = ${h.par + h.strokesReceived + 2}`)
    if (net) steps.push(`${h.par + h.strokesReceived + 2} − ${h.strokesReceived} = ${counted} neto`)
  } else if (net) steps.push(`${h.gross} − ${h.strokesReceived} = ${counted} neto`)
  else steps.push(`${strokes(h.gross!)}`)
  steps.push(`${strokes(counted)}${net ? ' netos' : ''}: ${rel}`)
  return { title: `${strokes(counted)}${net ? ' netos' : ''}`, steps }
}

/** Strokes and par over the holes actually played. */
function tally(holes: HoleResult[], net: boolean): { strokes: number; par: number; played: number } {
  let strokes = 0
  let par = 0
  let played = 0
  for (const h of holes) {
    const s = holeStrokes(h, net)
    if (s == null) continue
    strokes += s
    par += h.par
    played++
  }
  return { strokes, par, played }
}

export const strokePlayFormat: MainFormat = {
  id: 'strokePlay',
  defaultLabel: 'Stroke play',
  // Fewest strokes wins, so the ranking runs the other way from Stableford.
  higherIsBetter: () => false,
  figureLabel: (s) => (s.modules.individual.formatOptions.scoring === 'gross' ? 'Gross' : 'Neto'),

  describe(settings: TournamentSettings): Explanation {
    const net = settings.modules.individual.formatOptions.scoring !== 'gross'
    const pct = Math.round(settings.handicap.allowance * 100)
    return {
      title: net ? 'Stroke play neto' : 'Stroke play gross',
      steps: [
        'Se cuentan todos los golpes de la vuelta. Gana quien menos haga.',
        net ? `Cada quien descuenta sus golpes de ventaja${pct === 100 ? '' : `, jugando al ${pct}% del hándicap`}.` : 'Sin hándicap: golpes tal cual, palo contra palo.',
        'Si levantas, el hoyo cuenta como doble bogey neto (par más tus golpes de ventaja, más dos).',
        'La tabla muestra cuántos golpes llevas sobre o bajo par, y ordena por eso: no importa en qué hoyo vaya cada quien.',
        'Al cierre, una tarjeta incompleta queda después de las completas.',
      ],
    }
  },

  standings(ctx: FormatContext): FormatStandings {
    const net = ctx.settings.modules.individual.formatOptions.scoring !== 'gross'
    const entrants = playerEntrants(ctx)
    const totals: FormatStandings['totals'] = {}
    const perRound: FormatStandings['perRound'] = {}
    const thru: FormatStandings['thru'] = {}
    const countback: FormatStandings['countback'] = {}
    const lastRound = ctx.core.roundIds.at(-1)

    for (const e of entrants) {
      const playerId: Id = e.playerIds[0]!
      let strokes = 0
      let par = 0
      let played = 0
      const byRound: Record<string, Figure> = {}

      for (const rid of ctx.core.roundIds) {
        const pr = playerRound(ctx, rid, playerId)
        const r = pr ? tally(pr.holes, net) : { strokes: 0, par: 0, played: 0 }
        byRound[rid] = r.played > 0 ? toParFigure(r.strokes, r.par) : { value: 0, text: '—', empty: true }
        strokes += r.strokes
        par += r.par
        played += r.played
      }
      perRound[e.id] = byRound
      thru[e.id] = played
      totals[e.id] = played > 0 ? toParFigure(strokes, par) : { value: 0, text: '—', empty: true }

      const pr = lastRound ? playerRound(ctx, lastRound, playerId) : undefined
      countback[e.id] = pr
        ? countbackFrom(
            pr.holes.flatMap((h) => {
              // To par, so a tie between cards of different lengths (live) or tees compares like with like.
              const s = holeStrokes(h, net)
              return s == null ? [] : [{ hole: h.hole, value: s - h.par }]
            }),
            pr.holes.length || 18,
            false,
          )
        : emptyCountback()
    }

    return { entrants, totals, perRound, thru, countback, warnings: [] }
  },
}
