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
import { BACKUP_TABLES, NOT_BACKED_UP } from '../lib/backupTables'

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
  privacy: { '2026-10-01': '9cac47a410219a93', '2026-10-02': '20af7e1925da41cd', '2026-10-12': 'd8dca65996f3195c', '2026-10-12.2': '0fd82354f53b6280', '2026-10-12.3': 'ff588cf816339e83', '2026-10-12.4': '629cab7be421377a', '2026-10-12.5': '260d053ca82e92fe', '2026-10-13.1': 'a288f2fb6a7bc144', '2026-10-13.2': '24e99ba92d980a2f', '2026-10-13.3': '5a50649a1b8b55ac', '2026-10-13.4': 'eca8bf2ab8940cfb', '2026-10-15': '79d502154cb0a4b1', '2026-10-15.2': 'b63ca2aa916e6d6e' },
  terms: { '2026-10-01': '2f2c15560894de1c' },
}

/** A version is its date, with «.2», «.3»… for a second text the same day. */
const longDate = (version: string) => new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${version.slice(0, 10)}T12:00:00Z`))

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
    expect(t.legal.privacy.updated).toBe('Última actualización: 15 de octubre de 2026')
    expect(t.legal.terms.updated).toBe('Última actualización: 1 de octubre de 2026')
    expect(t.legal).not.toHaveProperty('updated')
  })
})

describe('the integral notice (TRUST-04)', () => {
  it('names every processor and the country, and says none uses the data for itself', () => {
    const abroad = sections['Fuera de México']!
    for (const who of ['Supabase', 'Vercel', 'Resend', 'Cloudflare', 'Anthropic', 'Google', 'Estados Unidos']) expect(abroad).toContain(who)
    expect(abroad).toContain('Esos cinco hacen su parte por encargo de Polo y no usan tus datos para lo suyo')
    // Google and the browser's push service are not Polo's processors, and the notice doesn't say they are.
    expect(abroad).toContain('no trabajan para Polo')
  })

  it('says how to exercise the rights, how identity is checked, the answer time and the authority', () => {
    const arco = sections['Cómo pedir algo sobre tus datos']!
    expect(arco).toContain('acceso, rectificación, cancelación y oposición')
    expect(arco).toContain('retirar tu consentimiento o limitar su uso')
    // Never a sign-in code read back to the operator: that would hand him the account.
    expect(arco).toContain('que entres a tu cuenta frente a nosotros o, cuando golf@cardigan.mx ya reciba mensajes, que nos escribas desde el correo de tu cuenta')
    expect(arco).not.toContain('código')
    expect(arco).toContain('por medio del Comité de tu torneo')
    expect(arco).toContain('20 días hábiles')
    expect(arco).toContain('15 días hábiles')
    expect(arco).toContain('Secretaría Anticorrupción y Buen Gobierno')
    // The mailbox is not set up yet (TRUST-01): the notice never sends people to it as if it were.
    expect(arco).toContain('el correo golf@cardigan.mx todavía no recibe mensajes')
  })

  it('a deleted tournament\'s history stays, and so do anonymous users and sessions', () => {
    const kept = sections['Cuánto tiempo los guardamos']!
    expect(kept).toContain('si el torneo se borra, su historial de cambios se queda con una copia de todo lo que tenía')
    expect(kept).toContain('los usuarios anónimos que se crean al mandar un PIN')
    expect(kept).toContain('cerrar sesión no los apaga')
    expect(kept).toContain('tu lugar en tus crews')
  })

  it('a minor needs a parent\'s permission, and changes show in the date and version', () => {
    expect(sections['Menores de edad']).toContain('pensado para mayores de 18 años y no le pide la edad a nadie')
    expect(sections['Cambios a este aviso']).toContain('cambian la fecha y la versión de arriba')
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
      'Fuera de México',
      'Cuánto tiempo los guardamos',
      'Google',
      'Tus derechos',
      'Cómo pedir algo sobre tus datos',
      'Menores de edad',
      'Cambios a este aviso',
    ])
  })

  it('the terms', () => {
    expect(t.legal.terms.sections.map(([h]) => h)).toEqual(['El servicio', 'El dinero', 'Tu cuenta', 'Tu contenido', 'Privacidad'])
  })
})

/** The one thing about money only its owner sees: «Mi dinero» on his profile (ProfileScreen draws it for the owner only). */
const PROFILE_SUMMARY = 'ese resumen solo lo ves tú, pero cada cifra la ven en Dinero todos los que están en su torneo'

describe('who sees a tournament\'s money (TRUST-02)', () => {
  it('word for word: everyone in it on every screen it shows, anyone of them can share it, the profile summary, the notices', () => {
    expect(sections['El dinero de un torneo']).toBe(
      'Lo que cada quien paga, gana y debe en un torneo lo ven todos los que están en él, jugadores y Comité: en Dinero, En vivo, Juegos y la hoja de cada jugador, y en las pantallas de TV y Ceremonia que se ponen para el grupo; y, si el Comité crea un enlace para ver con dinero, también quien tenga ese enlace. Cualquiera de ellos puede compartirlo, por ejemplo por WhatsApp, como texto o como imagen. En tu perfil, Mi dinero junta lo que ganaste o pusiste en cada torneo terminado: ese resumen solo lo ves tú, pero cada cifra la ven en Dinero todos los que están en su torneo. Los avisos que manda la app nunca llevan montos; los que escribe quien opera Polo son texto libre.',
    )
  })

  it('promises nowhere that money is private: only the profile summary is yours alone, and the same sentence says who sees each figure', () => {
    expect(all.split(PROFILE_SUMMARY)).toHaveLength(2)
    for (const text of [all.replace(PROFILE_SUMMARY, ''), ...t.legal.terms.sections.map(([, x]) => x)]) {
      expect(text).not.toContain('solo los ve su Comité y cada quien el suyo')
      expect(text).not.toMatch(/(solo|nada más) (lo|los) ves tú|tu dinero solo/i)
    }
  })
})

describe('what the operator sees and can do (TRUST-17)', () => {
  it('word for word', () => {
    expect(sections['Quién opera Polo']).toBe(
      'Quien opera Polo puede ver cualquier torneo, dinero incluido, y corregirlo con los mismos permisos que su Comité; para corregir uno Protegido, primero lo desbloquea por un rato y anota el motivo. También ve las cuentas: su correo, si entran con correo o con Google, cuándo se crearon y cuándo entraron por última vez, el nombre, la foto, el club, la ciudad y el índice de su perfil, sus torneos, sus crews con sus miembros y cuántos amigos tienen; y los teléfonos que entraron sin cuenta, con el jugador que eligieron. También ve los datos técnicos que manda cada teléfono. Puede bloquear o borrar una cuenta y mandar avisos a todos o a una persona. Fuera de la app, como administra la base de datos y los respaldos, puede consultar todos los datos, también la dirección IP y el navegador de cada sesión. Lo usa para dar soporte y corregir errores.',
    )
  })

  it('an unlock is to correct a Protegido tournament, not to see it (P3: is_tournament_member vs platform_can_write, 0021)', () => {
    expect(sections['Quién opera Polo']).toContain('para corregir uno Protegido, primero lo desbloquea por un rato y anota el motivo')
    expect(all).not.toContain('si el torneo está Protegido, primero lo desbloquea')
    const rules = source('supabase/migrations/0021_platform_admin.sql')
    expect(rules).toContain('select public.is_tournament_participant(tid) or public.is_platform_admin()')
    expect(rules).toContain('select public.is_tournament_organizer_own(tid) or public.platform_can_write(tid)')
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
    // P3: the Comité picks the PIN and types it; only once it is saved can nobody read it in the app.
    expect(typed).toContain('El PIN lo escoge el Comité, que lo escribe y se lo pasa al jugador; se guarda como una huella (hash), así que después nadie puede leerlo en la app, ni el Comité, que solo puede cambiarlo.')
    expect(typed).not.toContain('nadie lo ve en la app')
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

  it('2. only you see the profile summary, but each figure stays in its tournament\'s Dinero (P3: «solo sale en tu perfil» read as anyone opening it)', () => {
    expect(money()).toContain(PROFILE_SUMMARY)
    expect(all).not.toContain('solo sale en tu perfil')
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
    expect(where).toContain('Cada noche, una copia de los datos de la app va a Cloudflare R2 en un archivo JSON comprimido')
    expect(where).toContain('también el identificador de su cuenta de Google; nunca su contraseña) y una copia de cada archivo subido: nosotros no la ciframos (Cloudflare cifra lo que guarda)')
    expect(where).toContain('(el de Apple, Google, Microsoft o Mozilla)')
  })

  it('7. deletion takes the name off the players the person confirmed (TRUST-03, 0031) and the mailbox does not receive yet (TRUST-01): said as it is', () => {
    const rights = sections['Tus derechos']!
    // «sin tu nombre» was a false promise until 0031; now it says exactly which players, and what stays.
    expect(rights).toContain('ese jugador queda como «Jugador borrado»: sin tu nombre, tu foto ni tu forma')
    expect(rights).toContain('borrar una cuenta solo lo puede hacer quien opera Polo, y el correo golf@cardigan.mx todavía no recibe mensajes')
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
    expect(t.legal.privacy.version).toBe('2026-10-15.2')
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
    expect(rights()).toContain('Al borrarla se quitan de la base de datos tu perfil, tus amistades, tus rivalidades, tus avisos, los navegadores donde los activaste y los datos técnicos de tus teléfonos, y sales de tus crews.')
    expect(rights()).not.toContain('se van tu perfil')
  })

  it('what stays: the players without the person, every profile photo, a fingerprint of the email, and all of it in the backups', () => {
    expect(rights()).toContain('En cada torneo donde confirmaste a un jugador como tuyo, ese jugador queda como «Jugador borrado»: sin tu nombre, tu foto ni tu forma, también en su historial de cambios; se quedan sus golpes, su hándicap y su dinero, para que los resultados de los demás sigan cuadrando.')
    expect(rights()).toContain('También queda así un jugador ligado a tu perfil que nunca confirmaste, si lleva tu nombre o tu foto: el que te agregó un amigo a una Ronda rápida, o la copia de un torneo duplicado; si el Comité le puso otro nombre, se queda con ese nombre, sin tu foto ni tu forma, también en su historial.')
    expect(rights()).toContain('cada foto que subiste, también las anteriores, como archivo público;')
    expect(rights()).toContain('de tu correo, los registros de quien opera Polo guardan solo una huella, que sirve para reconocerlo si alguien vuelve a escribirlo, no para leerlo;')
    expect(rights()).toContain('lo que alguien haya escrito a mano en un motivo o una nota, tal como lo escribió;')
    expect(rights()).toContain('y todo lo de antes del borrado, perfil y amistades incluidos, en los respaldos de cada noche, que hoy no se borran nunca.')
    // TRUST-03: before 0031 the notice said the name, the photo and the email stayed.
    expect(rights()).not.toContain('Se quedan tu nombre, tu foto')
    expect(rights()).not.toContain('tu correo, en el registro del borrado')
  })

  it('the deletion it describes (0031 to 0035): the person\'s players and their copies renamed, their audit images redacted, the email fingerprinted', () => {
    const latest = (fn: string) => {
      const all = filesUnder('supabase/migrations', (n) => n.endsWith('.sql')).map((f) => source(f)).filter((x) => x.includes(`create or replace function public.${fn}(`))
      const body = all.at(-1)!
      return body.slice(body.lastIndexOf(`create or replace function public.${fn}(`)).split('\n$$;')[0]!
    }
    const del = latest('platform_delete_account')
    expect(del).toContain('perform public.anonymize_person(p_user_id);')
    expect(del).toContain("'emailHash', public.email_fingerprint(u.email")
    expect(del).not.toMatch(/'email',\s*u\.email/)
    const anon = latest('anonymize_person')
    expect(anon).toContain('public.person_player_ids(p_user_id)')
    expect(anon).toContain("set full_name = 'Jugador borrado', display_name = 'Borrado', avatar_url = null, form_guide = null")
    // The handicap and the holes stay: the results are made of them.
    expect(anon).not.toMatch(/base_hcp|handicap_index|estimate_inputs|public\.scores/)
    expect(anon).toContain('update public.audit_log')
    // Every operator-log row that names the account or holds its email, not just the deletion's (0033).
    expect(anon).toContain("l.payload ->> 'userId' = me or l.target_id = me")
    // Whose players: confirmed, or pending and carrying the person's name (a Ronda rápida's, a duplicate's)…
    const ids = latest('person_player_ids')
    expect(ids).toContain("p.profile_status = 'confirmed'")
    expect(ids).toContain("p.profile_status = 'pending' and lower(btrim(p.full_name)) = any (public.person_names(p_user_id))")
    // Her names are one list for both (0036): the profile's and her confirmed players', full and short.
    const names = latest('person_names')
    expect(names).toContain("p.display_name), '') from public.players p where p.profile_id = p_user_id and p.profile_status = 'confirmed'")
    expect(anon).toContain('names text[] := public.person_names(p_user_id)')
    // …and a copy under the Comité's name that carries the photo loses only the photo.
    // Every other pending copy loses what of it is hers, its history too (0035): her photo, form guide and short name.
    expect(anon).toContain("p.profile_status = 'pending' and not p.id = any (ids)")
    expect(anon).toContain("set avatar_url = case when nullif(btrim(avatar_url), '') = any (photos) then null else avatar_url end")
    expect(anon).toContain('form_guide = case when form_guide = any (forms) then null else form_guide end')
    expect(anon).toContain('set before = public.redact_copy(before, names, forms, photos), after = public.redact_copy(after, names, forms, photos)')
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

/**
 * PR #88's second verifier, P2: «se guardan como archivos que abre
 * cualquiera que tenga su enlace» understated it: the bucket is public and
 * its read policy has no role, so a file needs no link from Polo to be
 * opened. The notice says they are public files anyone can open. How the
 * bucket can be listed is not spelled out in a public page: that policy is
 * removed with TRUST-07 (a migration), and this test then fails and asks
 * for the sentence to be read again.
 */
describe('uploaded files: public by their link, never deleted (a public bucket; 0061 took the listing away)', () => {
  const where = () => sections['Dónde viven']!

  it('they are public files: anyone, without an account, can open them', () => {
    expect(where()).toContain('Las fotos que se suben a Polo (de perfil, de jugadores, logos y tarjetas) son archivos públicos: cualquiera, aun sin cuenta, puede abrirlos.')
    expect(all).not.toContain('que abre cualquiera que tenga su enlace')
  })

  it('no file is ever deleted, and no backup either', () => {
    expect(where()).toContain('La app nunca borra un archivo: ni tus fotos de perfil anteriores ni los de una cuenta, un torneo o un campo que se borra.')
    expect(where()).toContain('nosotros no la ciframos (Cloudflare cifra lo que guarda) y hoy esas copias no se borran nunca.')
  })

  it('the rules it rests on: a public bucket, so a file opens by its link with no policy; listing it is for those who may write there (TRUST-07)', () => {
    const migrations = filesUnder('supabase/migrations', (n) => n.endsWith('.sql'))
      .sort()
      .map(source)
      .join('\n')
    expect(migrations).toMatch(/values \('tournament-assets', 'tournament-assets', true,/)
    const statements = migrations
      .replace(/--[^\n]*/g, '')
      .split(';')
      .filter((s) => /assets_(public|member)_read/.test(s))
      .map((s) => s.trim().replace(/\s+/g, ' '))
    expect(statements[0]).toBe("create policy assets_public_read on storage.objects for select using (bucket_id = 'tournament-assets')")
    expect(statements.slice(1, 3)).toEqual(['drop policy if exists assets_public_read on storage.objects', expect.stringMatching(/^create policy assets_member_read on storage\.objects for select to authenticated using \( bucket_id = 'tournament-assets' and auth\.uid\(\) is not null and/)])
    expect(statements).toHaveLength(3)
  })
})

/**
 * PR #88's second verifier, P3-6: what the notice left out. Each is data
 * collected or shared, so each is said, with what makes it true today:
 * Supabase keeps each session's IP address and browser; a tournament or
 * profile link creates an anonymous user before any line shows; Vercel
 * carries the backup, the notices and the scorecard images; a Google photo
 * is fetched from Google by everyone who sees it; and each browser that
 * enters a tournament keeps its last snapshot, money included.
 */
describe('what the notice left out (P3-6)', () => {
  it('Supabase keeps the IP address and the browser of every session, and the operator can read them', () => {
    expect(sections['Qué datos guardamos']).toContain('Supabase, donde viven las cuentas, guarda además la dirección IP y el navegador de cada sesión, con cuenta o sin ella.')
    expect(sections['Quién opera Polo']).toContain('Fuera de la app, como administra la base de datos y los respaldos, puede consultar todos los datos, también la dirección IP y el navegador de cada sesión.')
  })

  it('opening a tournament or a profile link creates no user: the PIN does, under its consent line', () => {
    expect(sections['Qué datos guardamos']).toContain(
      'Abrir el enlace de un torneo o de un perfil no crea ningún usuario: en un navegador sin sesión, el usuario anónimo (sin correo ni nombre) se crea cuando mandas un PIN, y queda ligado a tu jugador si el PIN es el correcto.',
    )
    // ensureSession is the one way an anonymous user starts, and only Entrar calls it, right before the PIN goes out.
    expect(source('src/data/auth.ts')).toMatch(/export (?:async )?function ensureSession\(\)[\s\S]*?signInAnonymously\(\)/)
    expect(source('src/screens/tournament/EnterScreen.tsx')).toMatch(/await ensureSession\(\)[\s\S]{0,200}claimPlayer\(/)
    // The gate and a profile link only ask for the session the browser already has.
    expect(source('src/screens/tournament/TournamentGate.tsx')).not.toContain('ensureSession()')
    expect(source('src/screens/tournament/TournamentGate.tsx')).toContain('sessionIfAny()')
    expect(source('src/screens/profile/ProfileScreen.tsx')).not.toContain('ensureSession()')
    // The faces come before any session: lookup_tournament answers anon (0040).
    expect(source('supabase/migrations/0040_lookup_without_session.sql')).toMatch(/grant execute on function public\.lookup_tournament\(text\) to anon, authenticated/)
  })

  it('Vercel serves the app and runs the nightly backup, the notices and the scorecard reading', () => {
    expect(sections['Dónde viven']).toContain(
      'Vercel (sirve la app, y por sus servidores pasan el respaldo de cada noche, los avisos y las fotos de tarjetas que van a Anthropic)',
    )
    for (const route of ['api/backup-cron.ts', 'api/push-dispatch.ts', 'api/scorecard-extract.ts']) expect(source(route).length).toBeGreaterThan(0)
    expect(JSON.parse(source('vercel.json')).crons).toEqual([expect.objectContaining({ path: '/api/backup-cron' })])
  })

  it('a Google photo stays on Google: whoever sees it fetches it from there', () => {
    expect(sections['Google']).toContain('Mientras no la cambies, esa foto se sigue cargando desde Google: cada quien que la ve se la pide a Google, que así recibe su dirección IP.')
    // The profile keeps Google's address for it, not a copy, and every face shows it straight from that address.
    expect(source('supabase/migrations/0014_profile_name_hint.sql')).toContain("coalesce(meta ->> 'avatar_url', meta ->> 'picture', '')")
    expect(source('src/components/ui.tsx')).toContain('<img src={url} alt="" loading="lazy" />')
  })

  it('each browser that enters a tournament keeps its last snapshot, money included, and what it has not sent yet', () => {
    expect(sections['Dónde viven']).toContain(
      'En cada navegador que entra a un torneo se queda una copia de lo último que cargó, dinero incluido, y de lo capturado que falte por mandar, para que funcione sin señal. La copia se borra al cambiar de jugador, al cerrar sesión o si el torneo ya no existe; lo capturado sin mandar se queda en el teléfono hasta que se manda.',
    )
    expect(source('src/engine/types.ts')).toMatch(/export interface Snapshot \{[^}]*\bpayments: Payment\[\]/)
    expect(source('src/data/tournamentStore.ts')).toContain('void saveSnapshot(tournamentId, snapshot)')
    // Who clears it (PR #87): «Cambiar de jugador» this tournament's, a sign-out every one, a link that no longer exists its own.
    expect(source('src/screens/tournament/TournamentGate.tsx')).toMatch(/const leave = useCallback\(async \(\) => \{[\s\S]*?await clearCached\(tournamentId\)/)
    // A sign-out every one, also when the session ends only after the phone said it was still there (both paths forget).
    expect(source('src/data/account.ts')).toMatch(/async function forgetSignedOut\(\) \{[^}]*await clearAllCached\(\)/)
    expect(source('src/data/account.ts')).toMatch(/export async function signOutSafely\(\)[\s\S]*?await forgetSignedOut\(\)[\s\S]*?await forgetSignedOut\(\)/)
    expect(source('src/screens/tournament/TournamentGate.tsx')).toContain('void clearCachedSlug(slug)')
    // What has not gone out is not part of that copy: sign-out and «Cambiar de jugador» wait for it.
    expect(source('src/data/snapshotCache.ts')).not.toMatch(/from '\.\/outbox'/)
  })
})

/**
 * TRUST-24 (0050): the phones that hold each player's PIN. The notice says
 * what is kept of each (since and until when, what kind) and what the Comité
 * sees of them (the phones per player, taking one off, which phone a change
 * came from), and the migration does no more than that.
 */
describe('the phones that hold a PIN (TRUST-24)', () => {
  it('what is kept of each phone, and what the Comité sees, as 0050 does it', () => {
    expect(sections['Qué datos guardamos']).toContain(
      'a qué jugador quedó ligado cada teléfono que entró con un PIN, desde cuándo y hasta cuándo, y si es iPhone, Android o computadora',
    )
    expect(sections['Lo que se ve de un torneo']).toContain(
      'También ve qué teléfonos entraron con el PIN de cada jugador, si son iPhone, Android o computadora y desde cuándo, y puede sacar a uno del torneo; en el historial de cambios, lo que hizo un jugador que entró en más de un teléfono dice desde cuál.',
    )
    const m = source('supabase/migrations/0050_pin_phones.sql')
    // The kind is all that is read of the phone: no user agent, model or version is kept.
    expect(m).toContain("platform text not null default 'other' check (platform in ('ios', 'android', 'desktop', 'other'))")
    expect(m).not.toMatch(/user_agent|ua text not null/)
    // The Comité only, and never an account id.
    expect(m).toMatch(/create or replace function public\.player_phones[\s\S]*?if not public\.is_tournament_organizer\(p_tournament_id\)/)
    expect(m).toMatch(/create or replace function public\.release_pin_claim[\s\S]*?not public\.is_tournament_organizer\(c\.tournament_id\)/)
    expect(m).toContain("'before', a.before - array['pin_hash', 'token_hash', 'p256dh', 'auth', 'endpoint', 'auth_user_id', 'released_by']")
    expect(m).toContain("'phone', case when not a.actor_platform and ph.total > 1")
  })
})

/**
 * STRAT-05 (0053): the link to watch a tournament without a PIN. The notice
 * says it starts off, who sees what through it (anyone who has it, no account,
 * no user made), what it never shows, the money choice, that the Comité can
 * change or switch it off, and how long it lasts; the migration and the page
 * do no more than that.
 */
describe('the link to watch a tournament (STRAT-05)', () => {
  const m = source('supabase/migrations/0053_spectator_link.sql')
  /** One function's body in the migration, up to its closing $$. */
  const fn = (name: string) => m.slice(m.indexOf(`create or replace function public.${name}(`)).split('\n$$;')[0]!

  it('who sees what, word for word', () => {
    expect(sections['Lo que se ve de un torneo']).toContain(
      'Si su Comité crea un enlace para ver (viene apagado), cualquiera que lo tenga ve, sin cuenta ni PIN, los tableros del torneo: su nombre y su logo; el nombre corto, la categoría y el hándicap de cada jugador, con el índice o las tres rondas de donde sale, el tee que juega cada día, el hándicap de juego que le fije el Comité (sin su motivo) y si es el homenajeado; el campo de cada día con sus tees y sus hoyos; sus golpes, putts y resultados, los grupos, las parejas, los equipos, quién firmó cada tarjeta y cuándo, y los juegos, con quién juega cada uno y quién ganó cada concurso. Nunca su nombre completo, su foto, su forma reciente ni su PIN, ni lo que el Comité escribe como motivo, nota o descripción de una apuesta; desde ahí nadie captura nada y no se crea ningún usuario. Sin dinero, como viene, no ve premios, pagos ni montos, ni la Calcutta, ni los juegos con bote aparte ni quién entró en ellos; con dinero ve también lo que cada quien paga, gana y debe, la Calcutta con sus precios y los botes aparte. El Comité puede cambiar el enlace, y el anterior deja de funcionar al instante, o apagarlo cuando quiera.',
    )
    expect(sections['El dinero de un torneo']).toContain('y, si el Comité crea un enlace para ver con dinero, también quien tenga ese enlace.')
    expect(sections['Lo que el Comité captura de cada jugador']).toContain('el nombre corto, la categoría, el tee, el hándicap (con el índice o las tres rondas) y si es el homenajeado, también quien tenga el enlace para ver, si el Comité lo crea.')
    expect(sections['Dónde viven']).toContain(
      'Un navegador que abre un enlace para ver no guarda nada del torneo: pide los tableros otra vez mientras los tiene en pantalla, y lo único que se queda en él es lo que se queda de cualquier página de Polo, la app misma y las imágenes que muestra (ahí, el logo del torneo), para abrir más rápido.',
    )
    expect(sections['Qué datos guardamos']).toContain('Un navegador que solo abre un enlace para ver no manda ninguno.')
    expect(sections['Cuánto tiempo los guardamos']).toContain(
      'El enlace para ver de un torneo dura hasta que su Comité lo cambia o lo apaga, o se borra el torneo, y no va en las copias de cada noche; el historial de cambios guarda cuándo se creó, se cambió o se apagó, nunca el enlace.',
    )
  })

  it('off until the Comité makes it, «Sin dinero» unless it says, and only the Comité manages it', () => {
    expect(m).toContain('money boolean not null default false')
    for (const name of ['spectator_link', 'save_spectator_link', 'delete_spectator_link']) expect(fn(name)).toMatch(/\nbegin\n {2}if not public\.is_tournament_organizer\(p_tournament_id\) then\n {4}raise exception '[^']+' using errcode = '42501';/)
    expect(m).toMatch(/revoke all on public\.spectator_links from public, anon, authenticated;/)
    expect(m).not.toMatch(/create policy [a-z_]+ on public\.spectator_links/)
    // Changed or switched off, a token answers null at once; the history never keeps one.
    expect(fn('save_spectator_link')).toContain('token = case when coalesce(p_new_token, false) then public.new_spectator_token() else token end')
    expect(fn('spectator_links_audit')).toContain("to_jsonb(new) - 'token'")
    expect(fn('spectator_links_audit')).toContain("to_jsonb(old) - 'token'")
    expect(NOT_BACKED_UP).toHaveProperty('spectator_links')
  })

  it('everything the link shows is in the notice: the course and its tees, the tee of each day, teams, signatures, overrides', () => {
    const board = fn('spectator_board')
    const said = sections['Lo que se ve de un torneo']!
    for (const [table, words] of [
      ["'courses'", 'el campo de cada día con sus tees y sus hoyos'],
      ["'tees'", 'el campo de cada día con sus tees y sus hoyos'],
      ["'holes'", 'el campo de cada día con sus tees y sus hoyos'],
      ["'round_tees'", 'el tee que juega cada día'],
      ["'teams'", 'los equipos'],
      ["'card_signatures'", 'quién firmó cada tarjeta y cuándo'],
      ["'handicap_overrides'", 'el hándicap de juego que le fije el Comité (sin su motivo)'],
      ["'game_entries'", 'con quién juega cada uno'],
      ["'hole_awards'", 'quién ganó cada concurso'],
    ] as const) {
      expect(board, table).toContain(table)
      expect(said, table).toContain(words)
    }
    // «Sin dinero» a side pot is not on it, nor who entered it (who paid in), as the notice says.
    expect(fn('spectator_settings')).toContain('where p_money or not public.spectator_side_pot(g)')
    expect(board).toContain('x.game_id <> all (hidden)')
    expect(said).toContain('ni los juegos con bote aparte ni quién entró en ellos')
  })

  it('«no guarda nada del torneo»: on a link the app opens no outbox, reads no session and sends no technical data', () => {
    const shell = source('src/app/AppShell.tsx')
    expect(shell).toMatch(/if \(linkPage\) return\n {4}void init\(\)\n {4}void startOutbox\(\)/)
    const telemetry = source('src/lib/telemetry.ts')
    expect(telemetry).toContain("location.pathname.startsWith('/admin/_') || onLinkPage()) return")
    expect(telemetry).toContain('if (!enabled || onLinkPage()) return')
    expect(source('src/lib/linkPage.ts')).toContain("const LINK_ROUTES = [{ path: '/v/:token/*' }]")
  })

  it('anyone with it, no account: the boards answer without a session, and the page never makes a user', () => {
    expect(m).toContain('grant execute on function public.spectator_board(text, text) to anon, authenticated;')
    const page = source('src/screens/spectator/SpectatorGate.tsx')
    expect(page).not.toMatch(/ensureSession|signInAnonymously|claimPlayer|sessionIfAny/)
    // It reads the boards and nothing else.
    expect(source('src/data/spectator.ts')).toMatch(/anonRpc<Row \| null>\('spectator_board'/)
  })

  it('what it never shows: the answer names the columns it carries, and none of these is one', () => {
    const board = fn('spectator_board')
    for (const column of ["'full_name'", "'avatar_url'", "'form_guide'", "'handicap_note'", "'pin_hash'", "'profile_id'", "'join_code'", "'slug'", "'reason'", "'note'", "'created_by'", "'entered_by'", "'decided_by'", "'is_admin'", "'void_reason'"]) {
      expect(board, column).not.toContain(column)
    }
    expect(board).toContain("'display_name', p.display_name")
    // The money, only inside «Con dinero».
    const [before, money] = board.split('if l.money then\n    answer := answer ||')
    for (const table of ['calcutta_lots', 'calcutta_bids', 'calcutta_buybacks', 'payments', 'money_adjustments']) {
      expect(before, table).not.toContain(`'${table}'`)
      expect(money, table).toContain(`'${table}'`)
    }
    expect(board).toContain("'settings', public.spectator_settings(t.settings, l.money)")
    // A custom bet's description, the Comité's free text, with money or without.
    expect(fn('spectator_settings')).toContain("then jsonb_build_object('options', (g -> 'options') || jsonb_build_object('description', ''))")
    expect(source('src/data/spectator.ts')).toContain("out.options = { ...g.options, description: '' }")
    // And the phone shows no more than the server sends, the design fixtures included.
    const page = source('src/data/spectator.ts')
    expect(page).toContain('fullName: p.displayName, avatarUrl: null, formGuide: null, isAdmin: false, handicapNote: null')
  })
})

/**
 * PWA-10 (0052): a PIN phone can turn on its tournament's notices. The notice
 * says what is kept (the address and the browser, tied to the phone's
 * anonymous user and its player, and which notices each player was sent),
 * what the notices say (never amounts, nor other players' names), and that
 * the address goes when the phone stops holding the player; the migration
 * does no more than that.
 */
describe('a PIN phone\'s tournament notices (PWA-10)', () => {
  const m = source('supabase/migrations/0052_push_players.sql')

  it('what is kept: the address and the browser, tied to the anonymous user and the player, and what each player was sent', () => {
    expect(sections['Qué datos guardamos']).toContain(
      'Si un teléfono que entró con un PIN activa los avisos del torneo, guardamos la dirección que su navegador da para mandarle notificaciones y qué navegador es, ligadas a su usuario anónimo y a su jugador; y, de cada torneo, qué avisos le mandó a cada jugador.',
    )
    expect(m).toMatch(/create table public\.pin_push_subscriptions \([\s\S]*?player_id uuid not null[\s\S]*?auth_user_id uuid not null[\s\S]*?endpoint text not null unique[\s\S]*?user_agent text,/)
    // The player is the phone's claim, never one it names.
    expect(m).toMatch(/create or replace function public\.save_pin_push[\s\S]*?select d\.player_id into holds from public\.device_sessions d\s+where d\.auth_user_id = auth\.uid\(\) and d\.tournament_id = p_tournament_id/)
    expect(m).toContain('create table public.player_notices (')
  })

  it('what the notices say: the day, the group, a card to sign, the snake\'s question, a place; never an amount nor another player\'s name', () => {
    expect(sections['Para qué los usamos']).toContain(
      'Los avisos de un torneo le dicen a cada jugador cuándo empieza un día y de qué hoyo y a qué hora sale su grupo, que le toca firmar una tarjeta, que su grupo tiene pendiente quién embocó al último en un hoyo y, al final, en qué lugar quedó: nunca llevan montos ni nombres de otros jugadores.',
    )
    expect(m).toContain("kind text not null check (kind in ('round_live', 'card_to_sign', 'snake_tiebreak', 'results'))")
    // What each notice says is built in these four places and no other (push_players.sql checks what is sent).
    const events = m.slice(m.indexOf('-- 3. The events'), m.indexOf('-- 4. restore_tournament'))
    for (const data of [
      "'tournament', t.name, 'slug', t.slug, 'round', new.number,\n        'group', x.group_no, 'startHole', x.start_hole, 'teeTime', to_char(x.tee_time, 'HH24:MI')",
      "base := jsonb_build_object('tournament', t.name, 'slug', t.slug, 'round', r.number, 'group', g.number);",
      "base || jsonb_build_object('hole', pending, 'game', ",
      "jsonb_build_object('tournament', t.name, 'slug', t.slug, 'rankLabel', n.rank_label, 'field', n.field)",
    ])
      expect(events).toContain(data)
    expect(events.match(/perform public\.notify_player\(/g)).toHaveLength(4)
    expect(events).not.toMatch(/display_name|full_name|amount|price|payments|calcutta/)
  })

  it('how long: until the phone stops holding the player, whatever ended it', () => {
    expect(sections['Cuánto tiempo los guardamos']).toContain(
      'La de un teléfono que entró con un PIN se borra además en cuanto el teléfono deja de entrar como ese jugador: al cambiar de jugador, al entrar con el PIN de otro, si el Comité lo saca del torneo o si se borra el jugador.',
    )
    expect(m).toContain('create trigger device_sessions_drop_push after update or delete on public.device_sessions')
    expect(m).toMatch(/player_id uuid not null references public\.players \(id\) on delete cascade,\n {2}auth_user_id uuid not null references auth\.users \(id\) on delete cascade,\n {2}endpoint/)
  })
})
