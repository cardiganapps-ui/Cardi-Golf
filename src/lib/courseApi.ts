/** Browser side of the two serverless routes (§13b-A/B). */
import type { ProviderCourse, ProviderSearchHit } from './courseProviders/types'

export class RouteError extends Error {
  code: string | null
  status: number
  constructor(message: string, status: number, code: string | null) {
    super(message)
    this.status = status
    this.code = code
  }
}

async function parse<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => ({}))) as { error?: string; code?: string } & T
  if (!res.ok) throw new RouteError(body.error ?? `Error ${res.status}`, res.status, body.code ?? null)
  return body
}

export async function searchCourses(q: string): Promise<ProviderSearchHit[]> {
  const body = await parse<{ hits: ProviderSearchHit[] }>(await fetch(`/api/course-search?q=${encodeURIComponent(q)}`))
  return body.hits
}

export async function fetchProviderCourse(id: string): Promise<ProviderCourse> {
  const body = await parse<{ course: ProviderCourse }>(await fetch(`/api/course-search?id=${encodeURIComponent(id)}`))
  return body.course
}

export interface ExtractedTee {
  name: string
  color: string | null
  rating: number | null
  slope: number | null
  parTotal: number
  holes: Array<{ number: number; par: number; strokeIndex: number; yards: number | null }>
  confidence: 'high' | 'medium' | 'low'
  issues: string[]
}

export async function extractScorecard(imageBase64: string, mediaType: string): Promise<{ courseName: string; tees: ExtractedTee[] }> {
  return parse(
    await fetch('/api/scorecard-extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: imageBase64, mediaType }),
    }),
  )
}
