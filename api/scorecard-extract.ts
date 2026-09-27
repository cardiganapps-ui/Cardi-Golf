/**
 * POST /api/scorecard-extract { image: <base64>, mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf' }
 * → { courseName, tees: [{ name, color, rating, slope, holes: [{ number, par, strokeIndex, yards }], confidence, issues }] }
 * Reads a scorecard photo with Claude (§13b-B). The result is a DRAFT the
 * organizer reviews; nothing is saved here. Without ANTHROPIC_API_KEY → 503.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { z } from 'zod'

const HoleSchema = z.object({
  number: z.number().int().min(1).max(18),
  par: z.number().int().min(3).max(6),
  strokeIndex: z.number().int().min(1).max(18),
  yards: z.number().int().nullable(),
})
const TeeSchema = z.object({
  name: z.string(),
  color: z.string().nullable(),
  rating: z.number().nullable(),
  slope: z.number().int().nullable(),
  parTotalPrinted: z.number().int().nullable(),
  holes: z.array(HoleSchema),
  confidence: z.enum(['high', 'medium', 'low']),
})
const CardSchema = z.object({
  courseName: z.string(),
  tees: z.array(TeeSchema),
})

export const config = { maxDuration: 60 }

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST' })
    return
  }
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    res.status(503).json({ error: 'Lectura de tarjeta pendiente: falta configurar la llave.', code: 'no_key' })
    return
  }
  const body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) as { image?: string; mediaType?: string }
  const image = body.image ?? ''
  const mediaType = body.mediaType ?? 'image/jpeg'
  if (!image || image.length > 14_000_000) {
    res.status(400).json({ error: 'Falta la imagen o es demasiado grande.' })
    return
  }

  const client = new Anthropic({ apiKey })
  const instructions =
    'Esta es la foto de una tarjeta de golf (scorecard). Extrae el nombre del campo y, por cada tee (salida) impreso, ' +
    'su nombre y color, rating y slope si aparecen, y los 18 hoyos con par, índice de dificultad (handicap/SI, 1–18) y yardas. ' +
    'Si la tarjeta tiene 9 hoyos, devuelve 9. Si un dato no aparece, usa null. No inventes stroke indexes: si no están impresos, ' +
    'usa null en confidence "low" y numera 1–18 en orden. Reporta parTotalPrinted si la tarjeta imprime el total.'
  const source =
    mediaType === 'application/pdf'
      ? ({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: image } } as const)
      : ({ type: 'image', source: { type: 'base64', media_type: mediaType as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif', data: image } } as const)

  try {
    const response = await client.messages.parse({
      model: 'claude-opus-5',
      max_tokens: 16000,
      messages: [{ role: 'user', content: [source, { type: 'text', text: instructions }] }],
      output_config: { format: zodOutputFormat(CardSchema) },
    })
    if (response.stop_reason === 'refusal' || !response.parsed_output) {
      res.status(422).json({ error: 'No pude leer esa tarjeta. Prueba con otra foto más nítida.' })
      return
    }
    const card = response.parsed_output
    const tees = card.tees.map((t) => {
      const issues: string[] = []
      const parSum = t.holes.reduce((s, h) => s + h.par, 0)
      if (t.parTotalPrinted != null && parSum !== t.parTotalPrinted) issues.push(`Los pares suman ${parSum}, la tarjeta dice ${t.parTotalPrinted}.`)
      const sis = t.holes.map((h) => h.strokeIndex).sort((a, b) => a - b)
      const expected = t.holes.map((_, i) => i + 1)
      if (sis.join(',') !== expected.join(',')) issues.push('Los índices de dificultad no son una permutación de 1 a ' + t.holes.length + '.')
      if (t.holes.length !== 18 && t.holes.length !== 9) issues.push(`Se leyeron ${t.holes.length} hoyos.`)
      return { ...t, parTotal: parSum, issues }
    })
    res.status(200).json({ courseName: card.courseName, tees })
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) {
      res.status(429).json({ error: 'Muchas lecturas seguidas; espera un minuto.' })
      return
    }
    if (e instanceof Anthropic.APIError) {
      res.status(502).json({ error: `No se pudo leer la tarjeta (${e.status}).` })
      return
    }
    res.status(500).json({ error: 'No se pudo leer la tarjeta.' })
  }
}
