/**
 * COPY-25: Comité labels that asked for the wrong thing. «Nombre del
 * homenajeado» got the honoree's name typed in, and En vivo, which prints
 * «{label}: {name}», read «Nacho: Nacho»; «A partir de (puntos)» invited the
 * cut a point early (it starts above the threshold); «Reglas de pareja (A-D,
 * B-C)» named the first tournament's tiers; and Grupos said «parejas 5 y 6
 * salen primero» whatever the number of pairs.
 */
import { describe, expect, it } from 'vitest'
import { generateGroupsFromStandings } from '../../engine/modules/pairs'
import { t } from '../../i18n/es-MX'

const A = t.admin.tournament
const G = t.admin.groups
const order = (pairs: number, perGroup = 2) =>
  generateGroupsFromStandings(
    Array.from({ length: pairs }, (_, i) => String(i + 1)),
    perGroup,
  ).map((g) => g.map(Number))

describe('the Comité’s labels ask for what the setting is (COPY-25)', () => {
  it('the honoree’s and last place’s labels ask for a role and a prize, each with an example', () => {
    expect(A.honoreeLabel).not.toMatch(/^Nombre/)
    expect(A.honoreeHint).toMatch(/no su nombre/)
    expect(A.lastPlaceLabel).toMatch(/[Pp]remio/)
    expect(A.lastPlaceHint).toContain('«La Cuchara de Palo»')
  })

  it('the cut’s threshold says «más de», and the pairing rule names no tiers', () => {
    expect(A.cutThreshold).toContain('más de')
    expect(A.pairingRules).not.toMatch(/\b[A-D]-[A-D]\b/)
    expect(A.honoreePicks('El novio')).toBe('El novio escoge pareja')
  })

  it('the next-day groups hint counts this tournament’s pairs', () => {
    expect(G.standingsHint(order(6))).toBe(
      'Por la tabla de parejas: salen primero las parejas 5.ª y 6.ª, luego 3.ª y 4.ª, y cierran 1.ª y 2.ª.',
    )
    expect(G.standingsHint(order(4))).toBe(
      'Por la tabla de parejas: salen primero las parejas 3.ª y 4.ª, y cierran 1.ª y 2.ª.',
    )
    expect(G.standingsHint(order(5))).toBe(
      'Por la tabla de parejas: salen primero las parejas 4.ª y 5.ª, luego 2.ª y 3.ª, y cierra la 1.ª.',
    )
    expect(G.standingsHint(order(2))).toBe('Por la tabla de parejas: las parejas 1.ª y 2.ª salen juntas.')
  })
})
