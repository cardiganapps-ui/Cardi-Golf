/**
 * A request's JSON body, for the POST routes (QA-14). The platform parses a JSON body when the request says
 * it is JSON and hands over the text otherwise; a body that is missing, malformed or not an object is the
 * caller's mistake, which the route answers with a 400 of its own, never the platform's 500.
 */
import type { VercelRequest } from '@vercel/node'

export function jsonBody(req: VercelRequest): Record<string, unknown> | null {
  let raw: unknown
  try {
    // The platform parses on first read, and a malformed JSON body throws there.
    raw = req.body
    if (typeof raw === 'string') raw = JSON.parse(raw)
  } catch {
    return null
  }
  return raw != null && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null
}
