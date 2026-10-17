/**
 * scripts/seed-courses.mjs (STRAT-14), with the network stubbed: it asks both providers what api/course-search.ts
 * asks, through the same adapters, and imports only complete cards (every tee kept has par and stroke index on all 18
 * holes as the provider gave them, a rating and a slope), leaving out short tees and naming them; it leaves alone
 * what the catalog has (by the same duplicate key as course_dupe_key, whose cases supabase/tests/course_catalog.sql
 * holds the database to); a dry run writes nothing; it goes only to production or a local Supabase named with --url;
 * no key reaches its log or its report.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { completeTees, dupeKey, findInCatalog, keysMatch, PRODUCTION_URL, samePlace, seed, targetOf } from '../../scripts/seed-courses.mjs'
import { mapCourse } from './courseProviders/golfcourseapi'

const KEYS = { GOLFCOURSE_API_KEY: 'gca-secret-key-111', OPENGOLF_API_KEY: 'oga-secret-key-222', SUPABASE_SECRET_KEY: 'sb_secret_333' }
const PARS = [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 3, 4, 5, 4, 4, 3, 4, 5]
const SIS = [7, 11, 17, 3, 1, 13, 15, 9, 5, 8, 18, 2, 12, 4, 10, 16, 6, 14]
const gcaTee = (name: string, opts: { rating?: number | null; slope?: number | null; noSi?: boolean } = {}) => ({
  tee_name: name,
  course_rating: opts.rating === undefined ? 74.1 : opts.rating,
  slope_rating: opts.slope === undefined ? 142 : opts.slope,
  par_total: 72,
  holes: PARS.map((par, i) => ({ par, yardage: 400 + i, handicap: opts.noSi ? null : SIS[i] })),
})
/** Quivira at GolfCourseAPI: a complete Black tee, a Gold tee with no slope, a Red one with no stroke indexes. */
const QUIVIRA = {
  id: 'mz9gqcpj',
  club_name: 'Quivira Golf Club',
  course_name: 'Quivira Golf Club',
  location: { city: 'Cabo San Lucas', state: 'BCS', country: 'Mexico' },
  tees: { male: [gcaTee('Black'), gcaTee('Gold', { slope: null })], female: [gcaTee('Red', { noSi: true })] },
}
const QUIVIRA_HIT = { ...QUIVIRA, tees: { male: 2, female: 1 } }
/** Hacienda San Gaspar at GolfCourseAPI, in Cuernavaca: its key (`haciendasangaspar`) extends La Hacienda's (`hacienda`). */
const SAN_GASPAR = {
  id: 'gca-sangaspar',
  club_name: 'Club de Golf Hacienda San Gaspar',
  course_name: 'Club de Golf Hacienda San Gaspar',
  location: { city: 'Cuernavaca', state: 'Morelos', country: 'Mexico' },
  tees: { male: [gcaTee('Azul')] },
}
/** Solmar at OpenGolfAPI: listed, with no card. */
const SOLMAR_HIT = { id: '79fb43c9', name: 'Solmar Golf Links', course_name: 'Solmar Golf Links', city: 'Cabo San Lucas', latitude: 22.88, longitude: -109.92 }

const json = (b: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json', ...headers } })

interface CatalogRow { id: string; name: string; source: string; external_id: string | null; location?: string | null }
function world(catalog: CatalogRow[] = []) {
  const asked: Array<{ url: string; method: string; headers: Record<string, string>; body: unknown }> = []
  const fetch = (async (input: string | URL, init: RequestInit = {}) => {
    const url = String(input)
    const headers = Object.fromEntries(Object.entries((init.headers ?? {}) as Record<string, string>))
    asked.push({ url, method: init.method ?? 'GET', headers, body: init.body ? JSON.parse(String(init.body)) : null })
    const u = new URL(url)
    if (u.host === 'api.golfcourseapi.com') {
      const q = u.searchParams.get('search_query') ?? ''
      if (u.pathname === '/v1/search') return json({ courses: q.includes('Quivira') ? [QUIVIRA_HIT] : q.includes('San Gaspar') ? [{ ...SAN_GASPAR, tees: { male: 1 } }] : [] })
      if (u.pathname === '/v1/courses/mz9gqcpj') return json({ course: QUIVIRA })
      if (u.pathname === '/v1/courses/gca-sangaspar') return json({ course: SAN_GASPAR })
      return json({}, 404)
    }
    if (u.host === 'api.opengolfapi.org') {
      if (u.pathname === '/v1/courses/search') return json({ courses: u.searchParams.get('q')!.includes('Solmar') ? [SOLMAR_HIT] : [], total: 1 })
      if (u.pathname === '/api/v1/courses/79fb43c9') return json({ ...SOLMAR_HIT, tees: [], holes_data: [] })
      return json({}, 404)
    }
    if (u.pathname === '/rest/v1/courses') {
      // The script asks for each course's location with the rest (0077 compares it).
      expect(u.searchParams.get('select')).toBe('id,name,source,external_id,location')
      return json(catalog, 200, { 'content-range': `0-${catalog.length - 1}/${catalog.length}` })
    }
    if (u.pathname === '/rest/v1/rpc/catalog_import_course') return json({ status: 'created', id: 'new-course', tees: 1 })
    throw new Error(`unexpected request ${url}`)
  }) as typeof globalThis.fetch
  return { fetch, asked }
}

const LIST = [
  { region: 'Los Cabos', name: 'Solmar Golf Links', city: 'Cabo San Lucas' },
  { region: 'Los Cabos', name: 'Quivira Golf Club', city: 'Cabo San Lucas' },
  { region: 'Ciudad de México y su zona', name: 'Club de Golf México', city: 'Ciudad de México' },
  { region: 'Querétaro', name: 'Zibatá Golf', city: 'El Marqués' },
]
const local = { url: 'http://127.0.0.1:54321', kind: 'local' }
const noSleep = async () => undefined

describe('scripts/seed-courses.mjs (STRAT-14)', () => {
  it('goes only to production or a local Supabase named explicitly', () => {
    expect(targetOf(undefined)).toEqual({ url: PRODUCTION_URL, kind: 'production' })
    expect(targetOf(`${PRODUCTION_URL}/`)).toEqual({ url: PRODUCTION_URL, kind: 'production' })
    expect(targetOf('http://127.0.0.1:54321')).toEqual({ url: 'http://127.0.0.1:54321', kind: 'local' })
    expect(targetOf('http://localhost:54321/')).toEqual({ url: 'http://localhost:54321', kind: 'local' })
    // Cardigan's project, Angus's, a production look-alike, anything else.
    for (const url of ['https://axyuqfkmifcaupwhzfuw.supabase.co', 'https://xbpvqvlomrnuxydyqyqj.supabase.co', 'http://gmohwledjejlhcwqjnhd.supabase.co', 'https://gmohwledjejlhcwqjnhd.supabase.co.evil.test', 'https://example.com', 'nada']) {
      expect(() => targetOf(url), url).toThrow()
    }
  })

  it('reduces a name as course_dupe_key does', () => {
    // The same strings supabase/tests/course_catalog.sql gives the database.
    expect(dupeKey('Club de Golf Chapultepec')).toBe('chapultepec')
    expect(dupeKey('Quivira Golf Club')).toBe('quivira')
    expect(dupeKey('Querétaro Country Club')).toBe('queretaro')
    expect(dupeKey('Campo de Golf Ñandú')).toBe('nandu')
    expect(dupeKey('El Camaleón Mayakoba')).toBe('camaleonmayakoba')
    expect(dupeKey('The Links at Cabo')).toBe('atcabo')
    expect(keysMatch(dupeKey('Quivira'), dupeKey('Quivira Los Cabos'))).toBe(true)
    expect(keysMatch(dupeKey('Solmar'), dupeKey('Quivira'))).toBe(false)
  })

  it('keeps only the tees whose card is complete as the provider gave it', () => {
    const { complete, dropped } = completeTees(mapCourse(QUIVIRA).tees)
    expect(complete.map((t) => t.name)).toEqual(['Black'])
    expect(dropped).toEqual([
      { tee: 'Gold', why: 'no slope' },
      { tee: 'Red', why: 'a par or stroke index missing' },
    ])
  })

  it('a dry run says what it would import, what the catalog has and what is missing, and writes nothing', async () => {
    const { fetch, asked } = world([{ id: 'c1', name: 'Club de Golf México', source: 'manual', external_id: null }])
    const lines: string[] = []
    const r = await seed({ list: LIST, fetch, env: KEYS, apply: false, target: local, log: (l) => lines.push(l), sleep: noSleep })
    expect(r.courses.map((c) => [c.name, c.status, c.why ?? null])).toEqual([
      ['Solmar Golf Links', 'missing', 'location only: no card'],
      ['Quivira Golf Club', 'would-import', null],
      ['Club de Golf México', 'exists', null],
      ['Zibatá Golf', 'missing', 'no provider has it'],
    ])
    expect(r.courses[1]).toMatchObject({ provider: 'golfcourseapi', externalId: 'mz9gqcpj', tees: ['Black'], dropped: [{ tee: 'Gold', why: 'no slope' }, { tee: 'Red', why: 'a par or stroke index missing' }] })
    expect(r.totals).toEqual({ imported: 0, wouldImport: 1, exists: 1, missing: 2, failed: 0 })
    expect(asked.some((a) => a.method === 'POST')).toBe(false)
    // The catalog's course is never asked about.
    expect(asked.some((a) => a.url.includes('Club%20de%20Golf%20M%C3%A9xico'))).toBe(false)
    // Each provider with its own key, as the route sends it; none of them in the log or the report.
    expect(asked.find((a) => a.url.startsWith('https://api.golfcourseapi.com/'))!.headers.Authorization).toBe(`Key ${KEYS.GOLFCOURSE_API_KEY}`)
    expect(asked.find((a) => a.url.startsWith('https://api.opengolfapi.org/'))!.headers.Authorization).toBe(`Bearer ${KEYS.OPENGOLF_API_KEY}`)
    const said = `${lines.join('\n')}\n${JSON.stringify(r)}`
    for (const k of Object.values(KEYS)) expect(said).not.toContain(k)
  })

  it('--apply imports each complete card in one call, with its provenance and only its complete tees', async () => {
    const { fetch, asked } = world()
    const r = await seed({ list: LIST.slice(0, 2), fetch, env: KEYS, apply: true, target: local, sleep: noSleep })
    const posts = asked.filter((a) => a.method === 'POST')
    expect(posts.map((a) => a.url)).toEqual(['http://127.0.0.1:54321/rest/v1/rpc/catalog_import_course'])
    expect(posts[0]!.headers.apikey).toBe(KEYS.SUPABASE_SECRET_KEY)
    const p = (posts[0]!.body as { p: { name: string; source: string; external_id: string; location: string; tees: Array<{ name: string; rating: number; slope: number; holes: Array<{ number: number; par: number; stroke_index: number }> }> } }).p
    expect(p).toMatchObject({ name: 'Quivira Golf Club', source: 'golfcourseapi', external_id: 'mz9gqcpj', location: 'Cabo San Lucas, BCS, Mexico' })
    expect(p.tees.map((t) => [t.name, t.rating, t.slope, t.holes.length])).toEqual([['Black', 74.1, 142, 18]])
    expect(p.tees[0]!.holes.map((h) => [h.par, h.stroke_index])).toEqual(PARS.map((par, i) => [par, SIS[i]]))
    expect(r.totals).toMatchObject({ imported: 1, missing: 1 })
  })

  it('tells two clubs of the same name apart by their place, as catalog_import_course does (0077)', async () => {
    // The same cases as supabase/tests/catalog_import_places.sql. Production's run skipped Hacienda San Gaspar
    // (Cuernavaca) as La Hacienda (Atizapán): its key extends the other's, which course_keys_match takes.
    expect(keysMatch(dupeKey('Club de Golf Hacienda San Gaspar'), dupeKey('Club de Golf La Hacienda'))).toBe(true)
    const hacienda = { id: 'c1', name: 'Club de Golf La Hacienda', source: 'golfcourseapi', external_id: 'gca-hacienda', location: 'Atizapán de Zaragoza, Estado de México, Mexico' }
    const { fetch, asked } = world([hacienda])
    const r = await seed({ list: [{ name: 'Club de Golf Hacienda San Gaspar', city: 'Cuernavaca' }], fetch, env: KEYS, apply: true, target: local, sleep: noSleep })
    expect(r.courses[0]).toMatchObject({ status: 'imported', externalId: 'gca-sangaspar' })
    const post = asked.find((a) => a.method === 'POST')!
    expect((post.body as { p: { city: string; location: string } }).p).toMatchObject({ city: 'Cuernavaca', location: 'Cuernavaca, Morelos, Mexico' })

    // The same club in the same city, however each says it: the catalog's, and nothing is asked of a provider.
    const quivira = { id: 'c2', name: 'Quivira Golf Club', source: 'golfcourseapi', external_id: 'mz9gqcpj', location: 'Cabo San Lucas, BCS, Mexico' }
    const same = world([quivira])
    const r2 = await seed({ list: [{ name: 'Quivira', city: 'Cabo San Lucas' }], fetch: same.fetch, env: KEYS, apply: true, target: local, sleep: noSleep })
    expect(r2.courses[0]).toMatchObject({ status: 'exists', existing: 'Quivira Golf Club' })
    expect(same.asked.some((a) => !a.url.startsWith(local.url))).toBe(false)

    // No place on either side contradicts nothing.
    const bare = world([{ ...quivira, location: null }])
    const r3 = await seed({ list: [{ name: 'Quivira' }], fetch: bare.fetch, env: KEYS, apply: true, target: local, sleep: noSleep })
    expect(r3.courses[0]).toMatchObject({ status: 'exists', existing: 'Quivira Golf Club' })

    // The rule itself: folded, one place holding the other; blank is unknown; a provider id wins over any place.
    expect(samePlace('ATIZAPAN DE ZARAGOZA', hacienda.location)).toBe(true)
    expect(samePlace('Cuernavaca', hacienda.location)).toBe(false)
    expect(samePlace('  ', hacienda.location)).toBe(true)
    expect(samePlace('Mérida', null)).toBe(true)
    expect(findInCatalog([hacienda, quivira], { name: 'Otro Nombre', place: 'Cuernavaca', source: 'golfcourseapi', ext: 'gca-hacienda' })).toBe(hacienda)
    expect(findInCatalog([hacienda, quivira], { name: 'Hacienda Norte', place: 'Monterrey' })).toBeNull()
    expect(findInCatalog(null, { name: 'Quivira' })).toBeNull()
  })

  it('takes the server’s word that a course exists, and refuses to apply without a key', async () => {
    const { fetch } = world()
    const exists = (async (input: string | URL, init?: RequestInit) =>
      String(input).endsWith('/rpc/catalog_import_course') ? json({ status: 'exists', id: 'c9', name: 'Quivira Los Cabos' }) : fetch(input, init)) as typeof globalThis.fetch
    const r = await seed({ list: LIST.slice(1, 2), fetch: exists, env: KEYS, apply: true, target: local, sleep: noSleep })
    expect(r.courses[0]).toMatchObject({ status: 'exists', existing: 'Quivira Los Cabos' })
    await expect(seed({ list: LIST, fetch, env: { ...KEYS, SUPABASE_SECRET_KEY: undefined }, apply: true, target: local, sleep: noSleep })).rejects.toThrow(/SUPABASE_SECRET_KEY/)
  })

  it('stops asking a provider that says its limit is reached, and says so', async () => {
    const { fetch } = world()
    let oga = 0
    const limited = (async (input: string | URL, init?: RequestInit) => {
      if (!String(input).startsWith('https://api.opengolfapi.org/')) return fetch(input, init)
      oga++
      return json({ error: 'Daily anonymous limit reached.' }, 429)
    }) as typeof globalThis.fetch
    const lines: string[] = []
    const r = await seed({ list: [LIST[0]!, LIST[3]!], fetch: limited, env: { ...KEYS, GOLFCOURSE_API_KEY: undefined }, apply: false, target: local, log: (l) => lines.push(l), sleep: noSleep })
    expect(r.limited).toEqual(['opengolfapi'])
    expect(r.courses.map((c) => c.why)).toEqual(['provider limit reached: run it again tomorrow', 'provider limit reached: run it again tomorrow'])
    // Asked once, for the first course; never again.
    expect(oga).toBe(1)
    expect(lines.some((l) => l.includes('limit is reached'))).toBe(true)
  })

  it('the list is Mexico’s courses by the plan’s regions, in its order, names and cities only', () => {
    const list = JSON.parse(readFileSync(join(__dirname, '../../docs/strategy/courses-mx.json'), 'utf8')) as { courses: Array<Record<string, string>> }
    const order = ['Los Cabos', 'Ciudad de México y su zona', 'Monterrey', 'Guadalajara', 'Vallarta y Punta Mita', 'Riviera Maya y Cancún', 'San Miguel de Allende', 'Querétaro']
    const regions = list.courses.map((c) => c.region!)
    expect([...new Set(regions)]).toEqual(order)
    expect(regions.map((x) => order.indexOf(x))).toEqual([...regions.map((x) => order.indexOf(x))].sort((a, b) => a - b))
    expect(list.courses.every((c) => Object.keys(c).sort().join() === 'city,name,region' && c.name!.trim() && c.city!.trim())).toBe(true)
    expect(new Set(list.courses.map((c) => dupeKey(c.name))).size).toBe(list.courses.length)
    for (const name of ['Solmar Golf Links', 'Quivira Golf Club', 'Club de Golf Chapultepec', 'Bosque Real Country Club']) expect(list.courses.map((c) => c.name)).toContain(name)
  })
})
