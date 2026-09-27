/**
 * GET /api/course-search?q=Quivira                 → { hits: ProviderSearchHit[], providers: string[] }
 * GET /api/course-search?id=<provider>:<externalId> → { course: ProviderCourse }
 * Queries GolfCourseAPI and OpenGolfAPI in parallel (§13b-A), merges by
 * name + distance, and labels each hit with whether a full card exists.
 * A missing key or a failing provider just drops out; with neither key the
 * route answers 503 with the Spanish copy the UI shows.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import * as gca from '../src/lib/courseProviders/golfcourseapi'
import * as oga from '../src/lib/courseProviders/opengolfapi'
import { mergeHits, parseRef, type ProviderSearchHit } from '../src/lib/courseProviders/types'

const GCA = 'https://api.golfcourseapi.com/v1'
const OGA = 'https://api.opengolfapi.org'

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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store')
  const gcaKey = process.env.GOLFCOURSE_API_KEY
  const ogaKey = process.env.OPENGOLF_API_KEY
  const ogaHeaders: Record<string, string> = ogaKey ? { Authorization: `Bearer ${ogaKey}` } : {}
  // OpenGolfAPI reads work keyless (the key raises limits), so search is available even without GOLFCOURSE_API_KEY.
  const providers = [gcaKey ? 'golfcourseapi' : null, 'opengolfapi'].filter(Boolean) as string[]

  const q = typeof req.query.q === 'string' ? req.query.q.trim() : ''
  const id = typeof req.query.id === 'string' ? req.query.id.trim() : ''

  if (id) {
    const ref = parseRef(id)
    if (!ref) {
      res.status(400).json({ error: 'Referencia inválida.' })
      return
    }
    if (ref.provider === 'golfcourseapi') {
      if (!gcaKey) {
        res.status(503).json({ error: 'Búsqueda no disponible; sube una foto o captúralo a mano.', code: 'no_key' })
        return
      }
      const body = await getJson(`${GCA}/courses/${encodeURIComponent(ref.externalId)}`, { Authorization: `Key ${gcaKey}` })
      if (!body) {
        res.status(502).json({ error: 'El proveedor no respondió.' })
        return
      }
      res.status(200).json({ course: gca.mapCourse(body.course ?? body) })
      return
    }
    const body = await getJson(`${OGA}/api/v1/courses/${encodeURIComponent(ref.externalId)}`, ogaHeaders)
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
  const [g, o] = await Promise.all([
    gcaKey ? getJson(`${GCA}/search?search_query=${encodeURIComponent(q)}`, { Authorization: `Key ${gcaKey}` }) : Promise.resolve(null),
    getJson(`${OGA}/v1/courses/search?q=${encodeURIComponent(q)}`, ogaHeaders),
  ])
  const gHits: ProviderSearchHit[] = ((g?.courses as Any[] | undefined) ?? []).slice(0, 25).map(gca.mapSearchHit)
  const oHits: ProviderSearchHit[] = ((o?.courses as Any[] | undefined) ?? []).slice(0, 25).map(oga.mapSearchHit)
  if (!g && !o) {
    res.status(503).json({ error: 'Búsqueda no disponible; sube una foto o captúralo a mano.', code: gcaKey ? 'down' : 'no_key' })
    return
  }
  res.status(200).json({ hits: mergeHits([gHits, oHits]).slice(0, 30), providers })
}
