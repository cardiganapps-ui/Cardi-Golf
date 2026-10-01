/**
 * TRUST-02: the privacy notice said a tournament's money was seen only by its
 * Comité and each person their own («Tu dinero solo lo ves tú»). In the
 * product every member sees everyone's money on Dinero and can share it, and
 * the operator can read any tournament. The notice now says what is true.
 */
import { describe, expect, it } from 'vitest'
import { t } from '../i18n/es-MX'

const sections = Object.fromEntries(t.legal.privacy.sections)
const all = t.legal.privacy.sections.map(([, text]) => text).join(' ')

describe('the privacy notice says who sees money', () => {
  it('no longer promises a tournament\'s money is private', () => {
    expect(all).not.toContain('solo los ve su Comité y cada quien el suyo')
    expect(all).not.toContain('Tu dinero solo lo ves tú.')
  })

  it('says every member of a tournament sees its money, and can share it', () => {
    const money = sections['El dinero de un torneo']!
    expect(money).toContain('lo ven todos los que juegan ese torneo')
    expect(money).toContain('puede compartirlo')
    // What stays private: the summary on your profile (yours, and that tournament's Comité), and the push notices.
    expect(money).toContain('solo lo ves tú')
    expect(money).toContain('Los avisos nunca llevan montos')
  })

  it('says the operator can read any tournament, money included', () => {
    expect(sections['Quién opera Polo']).toContain('dinero incluido')
  })

  it('is dated', () => {
    expect(t.legal.updated).toBe('Última actualización: 1 de octubre de 2026')
  })
})

describe('the privacy notice covers what the Comité types about each player (TRUST-16)', () => {
  it('says what it is and who sees it (players_read, lookup_tournament, player_pins)', () => {
    const typed = sections['Lo que el Comité captura de cada jugador']!
    for (const what of ['su nombre', 'su foto', 'su categoría', 'su tee', 'su hándicap', 'buen día, día normal y mal día', 'su forma reciente', 'homenajeado', 'su PIN']) expect(typed).toContain(what)
    expect(typed).toContain('Todo eso, salvo el PIN, lo ve quien está en el torneo')
    expect(typed).toContain('también quien tenga su enlace o su código')
    expect(typed).toContain('nadie lo ve en la app, ni el Comité')
  })

  it('the line on the Comité sheet says who sees it and points at that section', () => {
    expect(`${t.legal.othersData.start}${t.legal.othersData.privacy}${t.legal.othersData.end}`).toBe(
      'Lo que captures de cada jugador, salvo su PIN, lo ven todos en el torneo; quién más lo ve está en el Aviso de privacidad.',
    )
  })
})

describe('the privacy notice names who receives data', () => {
  it('Anthropic, with what it receives (the scorecard image) and why (api/scorecard-extract.ts)', () => {
    const where = sections['Dónde viven']!
    expect(where).toContain('Si subes la foto o el PDF de la tarjeta de un campo, se la mandamos a Anthropic para que Claude, su modelo, lea')
    expect(where).toContain('recibe esa imagen y nada más')
  })
})
