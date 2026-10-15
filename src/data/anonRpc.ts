/**
 * A call to one of the public functions as anon, with no session at all
 * (STRAT-05): what a link to watch asks (`spectator_board`, `app_flags`).
 *
 * The app's client (`src/lib/supabase.ts`) reads the session this browser
 * keeps, sends its token with every request and refreshes an expired one,
 * writing it back. A link page is nobody's: in a browser where someone once
 * entered Polo, its asks went out as that person, and opening it could write
 * their session. Here it is a plain request with the publishable (anon) key
 * as both the key and the bearer: no auth client, nothing read from or
 * written to storage. The same deadline as every other request (REL-14).
 */
import { fetchWithTimeout } from '../lib/fetchWithTimeout'
import { ApiError } from './api'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** PostgREST's answer to `rpc/<name>`, or an `ApiError` with its code and the HTTP status, as supabase-js gives them. */
export async function anonRpc<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  if (!url || !anonKey) throw new Error('Faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.')
  const res = await fetchWithTimeout(`${url}/rest/v1/rpc/${encodeURIComponent(name)}`, {
    method: 'POST',
    headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(args),
  })
  const text = await res.text()
  let body: unknown = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = null
  }
  if (!res.ok) {
    const e = (body && typeof body === 'object' ? body : {}) as { message?: unknown; code?: unknown }
    const error = ApiError.from({ message: typeof e.message === 'string' ? e.message : res.statusText || `HTTP ${res.status}`, code: typeof e.code === 'string' ? e.code : null })
    throw Object.assign(error, { status: res.status })
  }
  return body as T
}
