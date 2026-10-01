/** Browser side of the two serverless routes (§13b-A/B). */
import { humanError, UserError } from './humanError'
import { supabase } from './supabase'
import type { ProviderCourse, ProviderSearchHit } from './courseProviders/types'

/** Base64 characters the extract route accepts (~3 MB); checked here first so the error is ours, not the platform's 413. */
export const MAX_SCORECARD_CHARS = 4_000_000

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase().auth.getSession()
  const token = data.session?.access_token
  return token ? { Authorization: `Bearer ${token}` } : {}
}

/** A refusal from one of our routes: its message is the route's own Spanish line, or copy for the status. */
export class RouteError extends UserError {
  code: string | null
  status: number
  constructor(message: string, status: number, code: string | null) {
    super(message)
    this.status = status
    this.code = code
  }
}

async function parse<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => ({}))) as { error?: unknown; code?: string } & T
  // A platform failure (a 504 page, a body that is not ours) has no line of ours: say what the status means.
  if (!res.ok) throw new RouteError(typeof body.error === 'string' ? body.error : humanError({ status: res.status }), res.status, body.code ?? null)
  return body
}

export async function searchCourses(q: string): Promise<ProviderSearchHit[]> {
  const body = await parse<{ hits: ProviderSearchHit[] }>(await fetch(`/api/course-search?q=${encodeURIComponent(q)}`, { headers: await authHeaders() }))
  return body.hits
}

/** `ref` is "<provider>:<externalId>" (see hitRef). */
export async function fetchProviderCourse(ref: string): Promise<ProviderCourse> {
  const body = await parse<{ course: ProviderCourse }>(await fetch(`/api/course-search?id=${encodeURIComponent(ref)}`, { headers: await authHeaders() }))
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
  if (imageBase64.length > MAX_SCORECARD_CHARS) throw new RouteError('La foto pesa más de 3 MB; toma una más ligera o recórtala.', 413, 'too_large')
  return parse(
    await fetch('/api/scorecard-extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
      body: JSON.stringify({ image: imageBase64, mediaType }),
    }),
  )
}
