/**
 * Match play's tie explanations (STRAT-03 round 3), on match8 worked by hand in
 * play order, and on bracket8, whose last day isn't played yet. Suggested by
 * #91's third verifier: no test read these lines, and five one-line changes
 * to them passed the whole suite.
 */
import { expect, it } from 'vitest'
import { getFixture } from '../../../dev/fixtures'
import { computeTournament } from '../../computeTournament'
import { parseSettings } from '../../settings/schema'

const rowsOf = (name: string) => {
  const fx = getFixture(name)!
  return computeTournament(fx.snapshot, parseSettings(fx.snapshot.tournament.settings)).modules.individual!.rows
}

it('match8: a tie is «Empate», a countback win «Desempate», each told as the last day’s match', () => {
  const rows = rowsOf('match8')
  const why = (name: string) => rows.find((r) => r.entrant.name === name)!.countbackWhy
  // Fabián and Matías: both won 4 up, so they share 1st.
  expect(why('Matías')).toEqual({ title: 'Empate con Fabián', steps: ['Iguales en puntos de partido', 'Día 1, cómo terminó su partido: Fabián 4 arriba contra Matías 4 arriba', 'Iguales: se reparten los premios de los lugares que ocupan.'] })
  // Julián won 2 up: below Matías on the margin, alone in 3rd.
  expect(why('Julián')).toEqual({ title: 'Desempate con Matías', steps: ['Iguales en puntos de partido', 'Día 1, cómo terminó su partido: Matías 4 arriba contra Julián 2 arriba'] })
  // Elías lost 4 down: below Iván J. (2 down), and tied in 7th with Leonel, not with Iván J.
  expect(why('Elías')!.title).toBe('Desempate con Iván J.')
  expect(why('Leonel')!.title).toBe('Empate con Elías')
})

it('bracket8: a last day nobody has played yet is not told as a match that ended', () => {
  const steps = rowsOf('bracket8').flatMap((r) => r.countbackWhy?.steps ?? [])
  expect(steps.some((s) => s === 'Día 3: todavía no juegan su partido')).toBe(true)
  expect(steps.some((s) => /cómo terminó/.test(s))).toBe(false)
})
