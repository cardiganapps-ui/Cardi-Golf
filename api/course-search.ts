/**
 * GET /api/course-search?q=Quivira                 → { hits: ProviderSearchHit[], providers: string[] }
 * GET /api/course-search?id=<provider>:<externalId> → { course: ProviderCourse }
 * Queries GolfCourseAPI and OpenGolfAPI in parallel (§13b-A), merges by
 * name + distance, and labels each hit with whether a full card exists.
 * A missing key or a failing provider just drops out; with neither key the
 * route answers 503 with the Spanish copy the UI shows.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import * as gca from '../src/lib/courseProviders/golfcourseapi.js'
import * as oga from '../src/lib/courseProviders/opengolfapi.js'
import { mergeHits, parseRef, type ProviderSearchHit } from '../src/lib/courseProviders/types.js'
import {
  golfCourseHeaders,
  golfCourseSearchUrl,
  golfCourseUrl,
  openGolfCourseUrl,
  openGolfHeaders,
  openGolfSearchUrl,
} from '../src/lib/courseProviders/endpoints.js'
import { rateLimited, requireCourseManager } from '../src/server/auth.js'

/** Longer than any course's name: a longer search is not one, and goes to no provider. */
export const MAX_QUERY = 100
/** Longer than any provider's id with its prefix. */
const MAX_REF = 120

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = Record<string, any>

async function getJson(url: string, headers: Record<string, string>): Promise<Any | null> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), 8000)
  try {
    const r = await fetch(url, { headers, signal: ctl.signal })
    if (!r.ok) return null
    return (await r.json()) as Any
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/**
 * A provider's hits, or null when its answer can't be read (`courses` not a list, a hit the adapter can't
 * map): that provider drops out like one that is down, instead of failing the whole search.
 */
function hitsOf(body: Any | null, map: (c: Any) => ProviderSearchHit): ProviderSearchHit[] | null {
  if (!body) return null
  const courses: unknown = body.courses ?? []
  if (!Array.isArray(courses)) return null
  try {
    return courses.slice(0, 25).map(map)
  } catch {
    return null
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store')
  if (rateLimited(req, 'course-search', 30, 60_000)) {
    res.status(429).json({ error: 'Muchas búsquedas seguidas; espera un minuto.' })
    return
  }
  if (!(await requireCourseManager(req, res))) return
  const gcaKey = process.env.GOLFCOURSE_API_KEY
  const ogaKey = process.env.OPENGOLF_API_KEY
  const ogaHeaders = openGolfHeaders(ogaKey)
  // OpenGolfAPI reads work keyless (the key raises limits), so search is available even without GOLFCOURSE_API_KEY.
  const providers = [gcaKey ? 'golfcourseapi' : null, 'opengolfapi'].filter(Boolean) as string[]

  const q = typeof req.query.q === 'string' ? req.query.q.trim() : ''
  const id = typeof req.query.id === 'string' ? req.query.id.trim() : ''

  if (id) {
    const ref = id.length <= MAX_REF ? parseRef(id) : null
    if (!ref) {
      res.status(400).json({ error: 'Referencia inválida.' })
      return
    }
    if (ref.provider === 'golfcourseapi') {
      if (!gcaKey) {
        res.status(503).json({ error: 'Búsqueda no disponible; sube una foto o captúralo a mano.', code: 'no_key' })
        return
      }
      const body = await getJson(golfCourseUrl(ref.externalId), golfCourseHeaders(gcaKey))
      if (!body) {
        res.status(502).json({ error: 'El proveedor no respondió.' })
        return
      }
      res.status(200).json({ course: gca.mapCourse(body.course ?? body) })
      return
    }
    const body = await getJson(openGolfCourseUrl(ref.externalId), ogaHeaders)
    if (!body) {
      res.status(502).json({ error: 'El proveedor no respondió.' })
      return
    }
    res.status(200).json({ course: oga.mapCourse(body.course ?? body) })
    return
  }

  if (q.length < 2) {
    res.status(400).json({ error: 'Escribe al menos 2 letras.' })
    return
  }
  if (q.length > MAX_QUERY) {
    res.status(400).json({ error: `Escribe un nombre más corto: hasta ${MAX_QUERY} letras.` })
    return
  }
  const [g, o] = await Promise.all([
    gcaKey ? getJson(golfCourseSearchUrl(q), golfCourseHeaders(gcaKey)) : Promise.resolve(null),
    getJson(openGolfSearchUrl(q), ogaHeaders),
  ])
  const gHits = hitsOf(g, gca.mapSearchHit)
  const oHits = hitsOf(o, oga.mapSearchHit)
  if (!gHits && !oHits) {
    res
      .status(503)
      .json({ error: 'Búsqueda no disponible; sube una foto o captúralo a mano.', code: gcaKey ? 'down' : 'no_key' })
    return
  }
  res.status(200).json({ hits: mergeHits([gHits ?? [], oHits ?? []]).slice(0, 30), providers })
}
