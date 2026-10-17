/**
 * Stableford (§5.3): points per hole, most points wins.
 *
 * This is the format the engine used to assume. It reads the points the core
 * already scores on every hole, so a tournament on this format computes
 * exactly what it did before the seam existed.
 */
import type { TournamentSettings } from '../settings/schema'
import type { ExplanationText } from '../types'
import { countbackFrom, emptyCountback, playerEntrants, playerRound } from './entrants'
import type { Figure, FormatContext, FormatStandings, MainFormat } from './format'

export const stablefordFormat: MainFormat = {
  id: 'stableford',
  defaultLabel: 'Stableford',
  higherIsBetter: () => true,
  figureLabel: () => 'Puntos',

  describe(settings: TournamentSettings): ExplanationText {
    const pct = Math.round(settings.handicap.allowance * 100)
    return {
      title: 'Stableford',
      steps: [
        'Cada hoyo da puntos según lo que hagas contra el par, ya restados tus golpes de ventaja (eso es el neto).',
        // COPY-12: the whole table, albatross included (§5.3), and one hole worked through.
        'En neto, doble bogey o peor da 0 puntos, bogey 1, par 2, birdie 3, águila 4 y albatros 5.',
        'Por ejemplo: si haces 5 en un par 4 y tienes un golpe de ventaja en ese hoyo, cuentas 4, par neto: 2 puntos.',
        'Levantar (recoger la bola cuando ya no vas a sumar) cuenta 0 puntos, así que levantar no arruina la tarjeta.',
        `Gana quien más puntos sume${pct === 100 ? '' : `, jugando al ${pct}% del hándicap`}.`,
      ],
    }
  },

  standings(ctx: FormatContext): FormatStandings {
    const entrants = playerEntrants(ctx)
    const totals: FormatStandings['totals'] = {}
    const perRound: FormatStandings['perRound'] = {}
    const thru: FormatStandings['thru'] = {}
    const countback: FormatStandings['countback'] = {}
    const lastRound = ctx.core.roundIds.at(-1)

    for (const e of entrants) {
      const playerId = e.playerIds[0]!
      const t = ctx.core.totals[playerId]
      const played = (t?.thru ?? 0) > 0
      totals[e.id] = played ? { value: t!.points, text: String(t!.points) } : { value: 0, text: '—', empty: true }
      thru[e.id] = t?.thru ?? 0

      const byRound: Record<string, Figure> = {}
      for (const rid of ctx.core.roundIds) {
        const pr = playerRound(ctx, rid, playerId)
        byRound[rid] = pr && pr.thru > 0 ? { value: pr.points, text: String(pr.points) } : { value: 0, text: '—', empty: true }
      }
      perRound[e.id] = byRound

      const pr = lastRound ? playerRound(ctx, lastRound, playerId) : undefined
      countback[e.id] = pr
        ? countbackFrom(
            pr.holes.map((h) => ({ hole: h.hole, value: h.points })),
            pr.holes.length || 18,
            true,
          )
        : emptyCountback()
    }

    return { entrants, totals, perRound, thru, countback, warnings: [] }
  },
}
