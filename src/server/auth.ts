/**
 * Server-side gate for the course routes (audit P1 33): the caller must send
 * the Supabase session token, and that session must be allowed to manage
 * courses (an email account, or an admin player). Verified by asking the
 * database as that user, so the rule lives in one place (`can_manage_courses`).
 * Plus a best-effort per-IP rate limit (memory per function instance).
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

const hits = new Map<string, { n: number; reset: number }>()

export function rateLimited(req: VercelRequest, key: string, max: number, windowMs: number): boolean {
  const fwd = req.headers['x-forwarded-for']
  const ip = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown'
  const k = `${key}:${ip}`
  const now = Date.now()
  const cur = hits.get(k)
  if (!cur || cur.reset < now) {
    hits.set(k, { n: 1, reset: now + windowMs })
    if (hits.size > 5000) hits.clear()
    return false
  }
  cur.n += 1
  return cur.n > max
}

/** True when the bearer token belongs to a session that may manage courses. Answers the response itself when not. */
export async function requireCourseManager(req: VercelRequest, res: VercelResponse): Promise<boolean> {
  const url = process.env.VITE_SUPABASE_URL
  const anon = process.env.VITE_SUPABASE_ANON_KEY
  const auth = req.headers.authorization ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
  if (!url || !anon || !token) {
    res.status(401).json({ error: 'Inicia sesión para usar esta función.', code: 'unauthorized' })
    return false
  }
  const sb = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${token}` } } })
  const { data, error } = await sb.rpc('can_manage_courses')
  if (error || data !== true) {
    res.status(403).json({ error: 'Solo el Comité puede cargar campos.', code: 'forbidden' })
    return false
  }
  return true
}
