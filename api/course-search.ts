/**
 * GET /api/course-search?q=Quivira        → { hits: ProviderSearchHit[] }
 * GET /api/course-search?id=<externalId>  → { course: ProviderCourse }
 * Proxies GolfCourseAPI so the key never reaches the browser (§13b-A).
 * Without GOLFCOURSE_API_KEY it answers 503 with a Spanish message.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { mapCourse, mapSearchHit } from '../src/lib/courseProviders/golfcourseapi'

const BASE = 'https://api.golfcourseapi.com/v1'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store')
  const key = process.env.GOLFCOURSE_API_KEY
  if (!key) {
    res.status(503).json({ error: 'Búsqueda no disponible; sube una foto o captúralo a mano.', code: 'no_key' })
    return
  }
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : ''
  const id = typeof req.query.id === 'string' ? req.query.id.trim() : ''
  try {
    if (id) {
      const r = await fetch(`${BASE}/courses/${encodeURIComponent(id)}`, { headers: { Authorization: `Key ${key}` } })
      if (!r.ok) {
        res.status(r.status === 404 ? 404 : 502).json({ error: r.status === 404 ? 'Ese campo ya no está.' : 'El proveedor no respondió.' })
        return
      }
      const body = (await r.json()) as { course?: unknown }
      res.status(200).json({ course: mapCourse((body.course ?? body) as Record<string, unknown>) })
      return
    }
    if (q.length < 2) {
      res.status(400).json({ error: 'Escribe al menos 2 letras.' })
      return
    }
    const r = await fetch(`${BASE}/search?search_query=${encodeURIComponent(q)}`, { headers: { Authorization: `Key ${key}` } })
    if (!r.ok) {
      res.status(502).json({ error: 'El proveedor no respondió.' })
      return
    }
    const body = (await r.json()) as { courses?: unknown[] }
    res.status(200).json({ hits: (body.courses ?? []).slice(0, 25).map((c) => mapSearchHit(c as Record<string, unknown>)) })
  } catch {
    res.status(502).json({ error: 'Búsqueda no disponible ahora; sube una foto o captúralo a mano.' })
  }
}
