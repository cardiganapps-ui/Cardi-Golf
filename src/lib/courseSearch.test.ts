/**
 * GET /api/course-search (§13b-A, QA-14), end to end with the network and Supabase stubbed: the gate
 * (src/server/auth.ts: a session that may manage courses, a per-address limit) answers before any provider
 * is asked; both providers are asked at once, each with its own key, and one that fails, stalls or answers
 * something unreadable drops out; with neither, the Spanish line the UI shows and a 503; the keys never
 * reach the answer or the logs.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { callRoute, leaked, type RouteRequest } from './testing/route'

/** Who the database says each token is: a Comité account may manage courses, a player may not. */
const db = vi.hoisted(() => ({ clients: [] as Array<{ url: string; key: string; token: string | undefined }>, down: false }))
vi.mock('@supabase/supabase-js', () => ({
  createClient: (url: string, key: string, opts: { global?: { headers?: Record<string, string> } }) => {
    const token = opts.global?.headers?.Authorization
    db.clients.push({ url, key, token })
    return {
      rpc: async (fn: string) => {
        if (fn !== 'can_manage_courses') return { data: null, error: { message: `unexpected ${fn}` } }
        if (db.down) return { data: null, error: { message: 'FetchError: fetch failed' } }
        if (token === 'Bearer comite-token') return { data: true, error: null }
        if (token === 'Bearer player-token') return { data: false, error: null }
        return { data: null, error: { message: 'JWT expired' } }
      },
    }
  },
}))

const ENV = { VITE_SUPABASE_URL: 'https://db.invalid', VITE_SUPABASE_ANON_KEY: 'anon-key-public', GOLFCOURSE_API_KEY: 'gca-secret-key-111', OPENGOLF_API_KEY: 'oga-secret-key-222' }
const SECRETS = [ENV.GOLFCOURSE_API_KEY, ENV.OPENGOLF_API_KEY, 'comite-token']

type Upstream = (url: string, headers: Record<string, string>, signal: AbortSignal | undefined) => Promise<Response> | Response
let upstream: Upstream
const asked: Array<{ url: string; headers: Record<string, string> }> = []

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } })
const QUIVIRA_GCA = { id: 'mz9gqcpj', club_name: 'Quivira Golf Club', course_name: 'Quivira', location: { city: 'Cabo San Lucas', country: 'Mexico', latitude: 22.87, longitude: -109.95 }, tees: { male: 5, female: 0 } }
const QUIVIRA_OGA = { id: '7166efab', name: 'Quivira Golf Club', course_name: 'Quivira', city: 'Cabo San Lucas', latitude: 22.871, longitude: -109.951 }
const SOLMAR_OGA = { id: '79fb43c9', name: 'Solmar Golf Links', city: 'Cabo San Lucas', latitude: 22.88, longitude: -109.92 }
/** Both providers up: GolfCourseAPI has Quivira with a card, OpenGolfAPI has Quivira and Solmar, location only. */
const BOTH_UP: Upstream = (url) => {
  if (url.startsWith('https://api.golfcourseapi.com/v1/search')) return json({ courses: [QUIVIRA_GCA] })
  if (url.startsWith('https://api.opengolfapi.org/v1/courses/search')) return json({ courses: [QUIVIRA_OGA, SOLMAR_OGA], total: 2 })
  return json({ error: 'not found' }, 404)
}

beforeEach(() => {
  for (const [k, v] of Object.entries(ENV)) vi.stubEnv(k, v)
  upstream = BOTH_UP
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const headers = (init?.headers ?? {}) as Record<string, string>
    asked.push({ url, headers })
    return upstream(url, headers, init?.signal ?? undefined)
  })
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.useRealTimers()
  vi.resetModules()
  asked.length = 0
  db.clients = []
  db.down = false
})

/** A fresh copy of the route each time, so one test's calls never count toward another's limit. */
async function search(query: Record<string, unknown>, init: RouteRequest = {}) {
  const { default: handler } = await import('../../api/course-search')
  return callRoute(handler, { headers: { authorization: 'Bearer comite-token' }, query, ...init })
}

describe('the gate', () => {
  it('no session: 401 in Spanish, and nobody is asked, not the database nor a provider', async () => {
    const tries: Array<Record<string, string>> = [{}, { authorization: 'comite-token' }, { authorization: 'Basic comite-token' }, { authorization: 'Bearer ' }]
    for (const headers of tries) {
      const r = await search({ q: 'Quivira' }, { headers })
      expect(r.status).toBe(401)
      expect(r.body).toEqual({ error: 'Inicia sesión para usar esta función.', code: 'unauthorized' })
    }
    expect(db.clients).toEqual([])
    expect(asked).toEqual([])
  })

  it('a deploy without the Supabase settings refuses everyone the same way', async () => {
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '')
    const r = await search({ q: 'Quivira' })
    expect(r.status).toBe(401)
    expect(asked).toEqual([])
  })

  it('a session that may not manage courses, an expired one, or a database that does not answer: 403, no provider asked', async () => {
    for (const token of ['player-token', 'expired-token']) {
      const r = await search({ q: 'Quivira' }, { headers: { authorization: `Bearer ${token}` } })
      expect(r.status).toBe(403)
      expect(r.body).toEqual({ error: 'Solo el Comité puede cargar campos.', code: 'forbidden' })
    }
    db.down = true
    expect((await search({ q: 'Quivira' })).status).toBe(403)
    expect(asked).toEqual([])
  })

  it('asks the database as the caller: the anon key and the caller’s own token, never another key', async () => {
    await search({ q: 'Quivira' })
    expect(db.clients).toEqual([{ url: 'https://db.invalid', key: 'anon-key-public', token: 'Bearer comite-token' }])
  })

  it('thirty searches a minute from one address; the next is 429, before the database is asked; another address goes on', async () => {
    const { default: handler } = await import('../../api/course-search')
    const call = (ip: string) => callRoute(handler, { headers: { authorization: 'Bearer comite-token' }, query: { q: 'Quivira' }, ip })
    for (let i = 0; i < 30; i++) expect((await call('203.0.113.7')).status).toBe(200)
    const clients = db.clients.length
    const over = await call('203.0.113.7, 10.0.0.1')
    expect(over.status).toBe(429)
    expect(over.body).toEqual({ error: 'Muchas búsquedas seguidas; espera un minuto.' })
    expect(db.clients.length).toBe(clients)
    expect((await call('198.51.100.2')).status).toBe(200)
  })

  it('the limit is a minute long', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const { default: handler } = await import('../../api/course-search')
    const call = () => callRoute(handler, { headers: { authorization: 'Bearer comite-token' }, query: { q: 'Quivira' }, ip: '203.0.113.8' })
    for (let i = 0; i < 30; i++) await call()
    expect((await call()).status).toBe(429)
    vi.setSystemTime(Date.now() + 60_001)
    expect((await call()).status).toBe(200)
  })
})

describe('the search', () => {
  it('asks both providers, each with its own key and the name encoded, and merges what they found', async () => {
    const r = await search({ q: '  Quivira & Co ' })
    expect(r.status).toBe(200)
    expect(r.headers['cache-control']).toBe('no-store')
    expect(asked).toEqual([
      { url: 'https://api.golfcourseapi.com/v1/search?search_query=Quivira%20%26%20Co', headers: { Authorization: 'Key gca-secret-key-111' } },
      { url: 'https://api.opengolfapi.org/v1/courses/search?q=Quivira%20%26%20Co', headers: { Authorization: 'Bearer oga-secret-key-222' } },
    ])
    const body = r.body as { hits: Array<{ provider: string; name: string; hasCard: boolean | null }>; providers: string[] }
    expect(body.providers).toEqual(['golfcourseapi', 'opengolfapi'])
    // Quivira once, from the provider with the card; Solmar, location only.
    expect(body.hits.map((h) => [h.provider, h.name, h.hasCard])).toEqual([
      ['golfcourseapi', 'Quivira', true],
      ['opengolfapi', 'Solmar Golf Links', null],
    ])
    expect(leaked(r, SECRETS)).toEqual([])
  })

  it('fewer than two letters, or a name longer than any course’s: 400 and no provider asked', async () => {
    for (const q of [undefined, '', ' Q ', ['Quivira', 'Solmar']]) {
      const r = await search({ q })
      expect(r.status).toBe(400)
      expect(r.body).toEqual({ error: 'Escribe al menos 2 letras.' })
    }
    const long = await search({ q: 'Q'.repeat(101) })
    expect(long.status).toBe(400)
    expect(long.body).toEqual({ error: 'Escribe un nombre más corto: hasta 100 letras.' })
    expect((await search({ q: 'Q'.repeat(100) })).status).toBe(200)
    expect(asked.filter((a) => a.url.includes('Q'.repeat(101)))).toEqual([])
  })

  it('without GolfCourseAPI’s key, OpenGolfAPI alone answers (its reads need no key)', async () => {
    vi.stubEnv('GOLFCOURSE_API_KEY', '')
    vi.stubEnv('OPENGOLF_API_KEY', '')
    const r = await search({ q: 'Quivira' })
    expect(r.status).toBe(200)
    expect(asked).toEqual([{ url: 'https://api.opengolfapi.org/v1/courses/search?q=Quivira', headers: {} }])
    expect((r.body as { providers: string[] }).providers).toEqual(['opengolfapi'])
  })

  it('a provider that fails drops out, and the other’s hits stand', async () => {
    upstream = (url) => (url.includes('golfcourseapi') ? json({ message: 'down' }, 500) : BOTH_UP(url, {}, undefined))
    const r = await search({ q: 'Quivira' })
    expect(r.status).toBe(200)
    expect((r.body as { hits: Array<{ provider: string }> }).hits.map((h) => h.provider)).toEqual(['opengolfapi', 'opengolfapi'])
  })

  it('a provider that answers something unreadable drops out too, never a 500', async () => {
    for (const bad of [{ courses: 'Quivira' }, { courses: [null] }, 'not json at all']) {
      upstream = (url) => (url.includes('golfcourseapi') ? new Response(typeof bad === 'string' ? bad : JSON.stringify(bad)) : BOTH_UP(url, {}, undefined))
      const r = await search({ q: 'Quivira' })
      expect(r.status).toBe(200)
      expect((r.body as { hits: Array<{ provider: string }> }).hits.map((h) => h.provider)).toEqual(['opengolfapi', 'opengolfapi'])
    }
    upstream = () => json({ courses: { 0: QUIVIRA_GCA } })
    const both = await search({ q: 'Quivira' })
    expect(both.status).toBe(503)
    expect(both.body).toEqual({ error: 'Búsqueda no disponible; sube una foto o captúralo a mano.', code: 'down' })
  })

  it('a provider that stalls is given up after 8 seconds', async () => {
    const { default: handler } = await import('../../api/course-search')
    vi.useFakeTimers()
    upstream = (url, _h, signal) =>
      url.includes('golfcourseapi') ? new Promise((_, reject) => signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))) : BOTH_UP(url, {}, undefined)
    const pending = callRoute(handler, { headers: { authorization: 'Bearer comite-token' }, query: { q: 'Quivira' } })
    await vi.advanceTimersByTimeAsync(8_000)
    const r = await pending
    expect(r.status).toBe(200)
    expect((r.body as { hits: unknown[] }).hits).toHaveLength(2)
  })

  it('both providers down: 503 with the line the UI shows, «down» with a key and «no_key» without', async () => {
    upstream = () => {
      throw new TypeError('fetch failed')
    }
    const down = await search({ q: 'Quivira' })
    expect(down.status).toBe(503)
    expect(down.body).toEqual({ error: 'Búsqueda no disponible; sube una foto o captúralo a mano.', code: 'down' })
    vi.stubEnv('GOLFCOURSE_API_KEY', '')
    expect((await search({ q: 'Quivira' })).body).toEqual({ error: 'Búsqueda no disponible; sube una foto o captúralo a mano.', code: 'no_key' })
  })

  it('both answer with nothing found: 200 and no hits', async () => {
    upstream = () => json({})
    const r = await search({ q: 'Nowhere' })
    expect(r.status).toBe(200)
    expect(r.body).toEqual({ hits: [], providers: ['golfcourseapi', 'opengolfapi'] })
  })

  it('at most 25 hits from each provider and 30 in all', async () => {
    // Names that never contain one another, so none merge.
    const many = (prefix: string) => Array.from({ length: 40 }, (_, i) => ({ id: `${prefix}${i}`, course_name: `${prefix}${i}x` }))
    upstream = (url) => json({ courses: many(url.includes('golfcourseapi') ? 'Alfa' : 'Beta') })
    const hits = ((await search({ q: 'campo' })).body as { hits: Array<{ provider: string }> }).hits
    expect(hits).toHaveLength(30)
    expect(hits.filter((h) => h.provider === 'golfcourseapi')).toHaveLength(25)
  })
})

describe('a course’s card', () => {
  const GCA_CARD = { course: { id: 'mz9gqcpj', course_name: 'Quivira', club_name: 'Quivira Golf Club', tees: { male: [{ tee_name: 'Blue', course_rating: 69.4, slope_rating: 131, par_total: 72, holes: Array.from({ length: 18 }, (_, i) => ({ par: 4, yardage: 400, handicap: i + 1 })) }] } } }

  it('from GolfCourseAPI, with its key, the id encoded', async () => {
    upstream = (url) => (url === 'https://api.golfcourseapi.com/v1/courses/mz9gqcpj' ? json(GCA_CARD) : json({}, 404))
    const r = await search({ id: 'golfcourseapi:mz9gqcpj' })
    expect(r.status).toBe(200)
    expect(asked[0]!.headers).toEqual({ Authorization: 'Key gca-secret-key-111' })
    const course = (r.body as { course: { provider: string; tees: Array<{ name: string; holes: unknown[] }> } }).course
    expect(course.provider).toBe('golfcourseapi')
    expect(course.tees.map((t) => [t.name, t.holes.length])).toEqual([['Blue', 18]])
    expect(leaked(r, SECRETS)).toEqual([])
  })

  it('from OpenGolfAPI, with the licence it asks for', async () => {
    upstream = (url) => (url === 'https://api.opengolfapi.org/api/v1/courses/a%2Fb' ? json({ id: 'a/b', name: 'Solmar Golf Links' }) : json({}, 404))
    const r = await search({ id: 'opengolfapi:a/b' })
    expect(r.status).toBe(200)
    expect((r.body as { course: { attribution: string; tees: unknown[] } }).course).toMatchObject({ attribution: '© OpenStreetMap contributors (ODbL 1.0) via OpenGolfAPI', tees: [] })
  })

  it('a GolfCourseAPI card without its key: 503 «no_key», and nobody asked', async () => {
    vi.stubEnv('GOLFCOURSE_API_KEY', '')
    const r = await search({ id: 'golfcourseapi:mz9gqcpj' })
    expect(r.status).toBe(503)
    expect(r.body).toEqual({ error: 'Búsqueda no disponible; sube una foto o captúralo a mano.', code: 'no_key' })
    expect(asked).toEqual([])
  })

  it('a provider that does not answer the card: 502', async () => {
    upstream = () => json({}, 500)
    for (const id of ['golfcourseapi:x', 'opengolfapi:y']) {
      const r = await search({ id })
      expect(r.status).toBe(502)
      expect(r.body).toEqual({ error: 'El proveedor no respondió.' })
    }
  })

  it('a reference that is not one, or longer than any provider’s: 400, nobody asked', async () => {
    for (const id of ['mz9gqcpj', 'golfapi:mz9gqcpj', `golfcourseapi:${'x'.repeat(200)}`]) {
      const r = await search({ id })
      expect(r.status).toBe(400)
      expect(r.body).toEqual({ error: 'Referencia inválida.' })
    }
    expect(asked).toEqual([])
  })
})
