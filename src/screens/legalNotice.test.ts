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
    expect(all).not.toMatch(/solo lo ves tú/i)
  })

  it('says every member of a tournament sees its money, and can share it', () => {
    const money = sections['El dinero de un torneo']!
    expect(money).toContain('lo ven todos los que están en él')
    expect(money).toContain('Cualquiera de ellos puede compartirlo')
  })

  it('says the operator can read any tournament, money included', () => {
    expect(sections['Quién opera Polo']).toContain('dinero incluido')
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

describe('the privacy notice says what the operator sees and can do (TRUST-17)', () => {
  it('any tournament, seen and corrected with its Comité\'s rights; a Protegido one only after an unlock (0021)', () => {
    const op = sections['Quién opera Polo']!
    expect(op).toContain('puede ver cualquier torneo, dinero incluido, y corregirlo con los mismos permisos que su Comité')
    expect(op).toContain('si el torneo está Protegido, primero lo desbloquea por un rato y anota el motivo')
  })

  it('the accounts: email, how they sign in, sign-up and last sign-in, the profile, crews and friend counts (0022, 0023)', () => {
    const op = sections['Quién opera Polo']!
    for (const what of ['su correo', 'si entran con correo o con Google', 'cuándo se crearon y cuándo entraron por última vez', 'el nombre, la foto, el club, la ciudad y el índice de su perfil', 'sus crews con sus miembros', 'cuántos amigos tienen', 'los teléfonos que entraron sin cuenta']) {
      expect(op).toContain(what)
    }
    expect(op).toContain('Puede bloquear o borrar una cuenta y mandar avisos a todos o a una persona.')
  })

  it('«the others only see your card» no longer leaves him out', () => {
    const profile = sections['Quién ve tu perfil']!
    expect(profile).toContain('Cualquier otra persona con cuenta, salvo quien opera Polo, solo ve tu tarjeta')
    expect(profile).not.toContain('Los demás solo ven tu tarjeta')
  })
})

describe('the privacy notice names who receives data', () => {
  it('Anthropic, with what it receives (the scorecard image) and why (api/scorecard-extract.ts)', () => {
    const where = sections['Dónde viven']!
    expect(where).toContain('Si subes la foto o el PDF de la tarjeta de un campo, se la mandamos a Anthropic para que Claude, su modelo, lea')
    expect(where).toContain('recibe esa imagen y nada más')
  })
})

/** The verifier's list of false or missing sentences (PR #88), by its numbers. */
describe('the rest of the verifier\'s list', () => {
  const money = () => sections['El dinero de un torneo']!

  it('1. money: every screen it shows on, and the Comité members who do not play', () => {
    expect(money()).toContain('lo ven todos los que están en él, jugadores y Comité: en Dinero, En vivo, Juegos y la hoja de cada jugador, y en las pantallas de TV y Ceremonia')
  })

  it('2. the profile summary is only on the profile, but each figure stays in its tournament\'s Dinero', () => {
    expect(money()).toContain('ese resumen solo sale en tu perfil, pero cada cifra sigue a la vista de su torneo en Dinero')
    expect(all).not.toMatch(/solo lo ves tú/i)
  })

  it('3. the app\'s notices carry no amounts; the operator\'s are free text (platform_broadcast)', () => {
    expect(money()).toContain('Los avisos que manda la app nunca llevan montos; los que escribe quien opera Polo son texto libre.')
  })

  it('5. a tournament\'s link or code shows every player\'s full name, photo, category and honoree flag (lookup_tournament)', () => {
    expect(sections['Lo que se ve de un torneo']).toContain(
      'cualquiera que abra su enlace o escriba su código de seis caracteres ve, sin cuenta, el nombre y el logo del torneo y el nombre completo, la foto, la categoría y si es el homenajeado de cada jugador',
    )
  })

  it('6. backups are plain gzipped JSON that only Cloudflare encrypts at rest; Microsoft is among the push services', () => {
    const where = sections['Dónde viven']!
    expect(where).not.toContain('cifrados')
    expect(where).toContain('Cada noche, una copia de los datos de la app va a Cloudflare R2 en un archivo JSON comprimido: nosotros no la ciframos; Cloudflare cifra lo que guarda.')
    expect(where).toContain('(el de Apple, Google, Microsoft o Mozilla)')
  })

  it('7. deletion keeps the player rows (TRUST-03) and the mailbox does not receive yet (TRUST-01): said as it is', () => {
    const rights = sections['Tus derechos']!
    expect(all).not.toContain('sin tu nombre')
    expect(rights).toContain('borrar una cuenta solo lo puede hacer quien opera Polo, y el correo golf@cardigan.mx todavía no recibe mensajes')
    expect(rights).toContain('tu nombre, tu foto, tus golpes y tu dinero como jugador se quedan en los torneos que jugaste, en su historial de cambios y en los respaldos')
    expect(sections['Quiénes somos']).not.toContain('golf@cardigan.mx')
    expect(t.legal.contact).toContain('todavía no recibe mensajes')
  })

  it('9. the terms: a scorecard photo may go to Anthropic, and the operator can correct a Comité', () => {
    const terms = Object.fromEntries(t.legal.terms.sections)
    expect(terms['Tu contenido']).toContain('si es la foto o el PDF de la tarjeta de un campo, de mandarlo a Anthropic para leerlo')
    expect(terms['El dinero']).not.toContain('última palabra')
    expect(terms['El dinero']).toContain('quien opera Polo también puede corregir un error en cualquier torneo')
  })

  it('10. each document carries its own date and version', () => {
    expect(t.legal.privacy.updated).toBe('Última actualización: 1 de octubre de 2026')
    expect(t.legal.terms.updated).toBe('Última actualización: 1 de octubre de 2026')
    expect(t.legal.privacy.version).toBe('2026-10-01')
    expect(t.legal.terms.version).toBe('2026-10-01')
  })
})
