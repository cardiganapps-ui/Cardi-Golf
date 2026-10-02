/**
 * The privacy notice and the terms (TRUST-02, TRUST-04, TRUST-05, TRUST-16,
 * TRUST-17). Every sentence was checked against the migrations, the API
 * routes and the screens on its version's date.
 *
 * The first version of this test looked for substrings, so a sentence could
 * be negated, or a false promise added next to it, and still pass. Now each
 * document's text is pinned to its version: an edit fails here until it gets
 * a new version, a new «Última actualización» and its fingerprint below, so
 * what a person accepted can always be told apart (TRUST-05 part 2). The
 * sections are listed, the sentences on money and on the operator are held
 * word for word, and each claim keeps its own test.
 */
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { t } from '../i18n/es-MX'
import { BACKUP_TABLES } from '../lib/backupTables'

type Doc = { title: string; version: string; updated: string; sections: Array<[string, string]> }

/** A file of the repo, read as text: what a sentence about the product rests on. */
const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')

function filesUnder(dir: string, keep: (name: string) => boolean, out: string[] = []): string[] {
  for (const name of readdirSync(join(process.cwd(), dir))) {
    const path = join(dir, name)
    if (statSync(join(process.cwd(), path)).isDirectory()) filesUnder(path, keep, out)
    else if (keep(name)) out.push(path)
  }
  return out
}

/** Every place the app, its routes or a migration deletes a stored file (Supabase Storage). */
function storageRemovals(): string[] {
  const code = [...filesUnder('src', (n) => /\.tsx?$/.test(n) && !/\.test\.tsx?$/.test(n)), ...filesUnder('api', (n) => n.endsWith('.ts'))]
  return [
    ...code.filter((f) => /\.storage\s*\.from\([^)]*\)\s*\.remove\(/.test(source(f))),
    ...filesUnder('supabase/migrations', (n) => n.endsWith('.sql')).filter((f) => /delete\s+from\s+storage\.objects/i.test(source(f))),
  ]
}

const fingerprint = (d: Doc) => createHash('sha256').update(JSON.stringify([d.title, d.sections])).digest('hex').slice(0, 16)

/** Every version of each document and the fingerprint of its text. A new text adds a line; a line is never edited. */
const VERSIONS: Record<'privacy' | 'terms', Record<string, string>> = {
  privacy: { '2026-10-01': '9cac47a410219a93', '2026-10-02': 'defa4ccb34c092a7' },
  terms: { '2026-10-01': '2f2c15560894de1c' },
}

const longDate = (version: string) => new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${version}T12:00:00Z`))

const sections = Object.fromEntries(t.legal.privacy.sections)
const all = t.legal.privacy.sections.map(([, text]) => text).join(' ')

describe('each document is pinned to its own version and date', () => {
  for (const doc of ['privacy', 'terms'] as const) {
    it(`${doc}: the text is the one its version was given`, () => {
      const d: Doc = t.legal[doc]
      expect(VERSIONS[doc][d.version], `${doc} ${d.version} is not recorded`).toBeDefined()
      expect(fingerprint(d), `the ${doc} text changed: give it a new version and «Última actualización», and record its fingerprint in VERSIONS`).toBe(VERSIONS[doc][d.version])
      expect(d.updated).toBe(`Última actualización: ${longDate(d.version)}`)
    })
  }

  it('the two documents carry their own date (the terms used to take the notice\'s)', () => {
    expect(t.legal.privacy.updated).toBe('Última actualización: 2 de octubre de 2026')
    expect(t.legal.terms.updated).toBe('Última actualización: 1 de octubre de 2026')
    expect(t.legal).not.toHaveProperty('updated')
  })
})

describe('the sections, in order', () => {
  it('the notice', () => {
    expect(t.legal.privacy.sections.map(([h]) => h)).toEqual([
      'Quiénes somos',
      'Qué datos guardamos',
      'Para qué los usamos',
      'Quién ve tu perfil',
      'Lo que se ve de un torneo',
      'Lo que el Comité captura de cada jugador',
      'El dinero de un torneo',
      'Quién opera Polo',
      'Dónde viven',
      'Google',
      'Tus derechos',
    ])
  })

  it('the terms', () => {
    expect(t.legal.terms.sections.map(([h]) => h)).toEqual(['El servicio', 'El dinero', 'Tu cuenta', 'Tu contenido', 'Privacidad'])
  })
})

describe('who sees a tournament\'s money (TRUST-02)', () => {
  it('word for word: everyone in it on every screen it shows, anyone of them can share it, the profile summary, the notices', () => {
    expect(sections['El dinero de un torneo']).toBe(
      'Lo que cada quien paga, gana y debe en un torneo lo ven todos los que están en él, jugadores y Comité: en Dinero, En vivo, Juegos y la hoja de cada jugador, y en las pantallas de TV y Ceremonia que se ponen para el grupo. Cualquiera de ellos puede compartirlo, por ejemplo por WhatsApp, como texto o como imagen. En tu perfil, Mi dinero junta lo que ganaste o pusiste en cada torneo terminado: ese resumen solo sale en tu perfil, pero cada cifra sigue a la vista de su torneo en Dinero. Los avisos que manda la app nunca llevan montos; los que escribe quien opera Polo son texto libre.',
    )
  })

  it('promises nowhere that money is private', () => {
    for (const text of [all, ...t.legal.terms.sections.map(([, x]) => x)]) {
      expect(text).not.toContain('solo los ve su Comité y cada quien el suyo')
      expect(text).not.toMatch(/(solo|nada más) (lo|los) ves tú|tu dinero solo/i)
    }
  })
})

describe('what the operator sees and can do (TRUST-17)', () => {
  it('word for word', () => {
    expect(sections['Quién opera Polo']).toBe(
      'Quien opera Polo puede ver cualquier torneo, dinero incluido, y corregirlo con los mismos permisos que su Comité; si el torneo está Protegido, primero lo desbloquea por un rato y anota el motivo. También ve las cuentas: su correo, si entran con correo o con Google, cuándo se crearon y cuándo entraron por última vez, el nombre, la foto, el club, la ciudad y el índice de su perfil, sus torneos, sus crews con sus miembros y cuántos amigos tienen; y los teléfonos que entraron sin cuenta, con el jugador que eligieron. Puede bloquear o borrar una cuenta y mandar avisos a todos o a una persona. Lo usa para dar soporte y corregir errores.',
    )
  })

  it('«only your card» leaves him out, since he sees more (0022_platform_people.sql)', () => {
    const profile = sections['Quién ve tu perfil']!
    expect(profile).toContain('Cualquier otra persona con cuenta, salvo quien opera Polo, solo ve tu tarjeta')
    expect(profile).not.toContain('Los demás solo ven tu tarjeta')
  })
})

describe('what the Comité types about each player (TRUST-16)', () => {
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

describe('who receives data', () => {
  it('Anthropic, with what it receives (the scorecard image) and why (api/scorecard-extract.ts)', () => {
    const where = sections['Dónde viven']!
    expect(where).toContain('Si subes la foto o el PDF de la tarjeta de un campo, se la mandamos a Anthropic para que Claude, su modelo, lea')
    expect(where).toContain('recibe esa imagen y nada más')
  })
})

/** The rest of the PR #88 verifier's list of false or missing sentences, by its numbers. */
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
    expect(rights).toContain('Se quedan tu nombre, tu foto, tus golpes y tu dinero como jugador en los torneos que jugaste y en su historial de cambios')
    expect(sections['Quiénes somos']).not.toContain('golf@cardigan.mx')
    expect(t.legal.contact).toContain('todavía no recibe mensajes')
  })

  it('9. the terms: a scorecard photo may go to Anthropic, and the operator can correct a Comité', () => {
    const terms = Object.fromEntries(t.legal.terms.sections)
    expect(terms['Tu contenido']).toContain('si es la foto o el PDF de la tarjeta de un campo, de mandarlo a Anthropic para leerlo')
    expect(terms['El dinero']).not.toContain('última palabra')
    expect(terms['El dinero']).toContain('quien opera Polo también puede corregir un error en cualquier torneo')
  })

  it('10. each document carries its own version', () => {
    expect(t.legal.privacy.version).toBe('2026-10-02')
    expect(t.legal.terms.version).toBe('2026-10-01')
  })
})

/**
 * PR #88's second verifier, P2: «Al borrarla se van tu perfil, tus
 * amistades, tus rivalidades y tus avisos» was true of the database only.
 * Every nightly backup keeps them and none is ever deleted, and every profile
 * photo ever uploaded stays in the bucket.
 */
describe('what deleting an account takes and what it leaves (platform_delete_account, 0022)', () => {
  const rights = () => sections['Tus derechos']!

  it('what goes, and only from the database', () => {
    expect(rights()).toContain('Al borrarla se quitan de la base de datos tu perfil, tus amistades, tus rivalidades, tus avisos y los navegadores donde los activaste, y sales de tus crews.')
    expect(rights()).not.toContain('se van tu perfil')
  })

  it('what stays: the tournaments, every profile photo, the email in the log, and all of it in the backups', () => {
    expect(rights()).toContain('Se quedan tu nombre, tu foto, tus golpes y tu dinero como jugador en los torneos que jugaste y en su historial de cambios;')
    expect(rights()).toContain('cada foto de perfil que subiste, también las anteriores, como archivo público;')
    expect(rights()).toContain('tu correo, en el registro del borrado;')
    expect(rights()).toContain('y todo lo de antes del borrado, perfil y amistades incluidos, en los respaldos de cada noche, que hoy no se borran nunca.')
  })

  it('the facts it rests on: when one changes, so does the sentence', () => {
    // The nightly backup copies what the deletion removes from the database…
    for (const table of ['profiles', 'friendships', 'rivalries', 'notifications', 'push_subscriptions', 'crew_members']) expect(BACKUP_TABLES).toHaveProperty(table)
    // …and the route only ever writes its object: no backup is deleted.
    expect(source('api/backup-cron.ts')).not.toMatch(/method:\s*['"]DELETE/)
    // Each new profile photo is a new file, and no code removes a stored file.
    expect(source('src/data/profiles.ts')).toContain('`profiles/${id}/avatar-${Date.now()}.')
    expect(storageRemovals()).toEqual([])
  })
})
