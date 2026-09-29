/**
 * POST /api/push-dispatch, called by the database (trigger notifications_push,
 * migration 0019, through pg_net) once per new notification:
 *   Authorization: Bearer <PUSH_DISPATCH_SECRET>
 *   { subscriptions: [{ endpoint, keys: { p256dh, auth } }], notice: { id, kind, data, actor }, unread }
 * Sends one web push per subscription, signed with the VAPID pair, and hands
 * the endpoints the push service rejected for good (404/410) back to the
 * database through push_prune (the same secret, the anon key). Never the
 * service-role key; never an amount (notices carry none).
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import webpush from 'web-push'
import { timingSafeEqual } from 'node:crypto'
import { noticeLine, type NoticeLike } from '../src/lib/noticeText.js'

interface Body {
  subscriptions?: Array<{ endpoint: string; keys: { p256dh: string; auth: string } }>
  notice?: NoticeLike & { id: string }
  unread?: number
}

const sameSecret = (a: string, b: string) => {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' })
  const secret = process.env.PUSH_DISPATCH_SECRET
  const pub = process.env.VAPID_PUBLIC_KEY
  const priv = process.env.VAPID_PRIVATE_KEY
  if (!secret || !pub || !priv) return res.status(503).json({ error: 'push not configured' })
  const auth = String(req.headers.authorization ?? '')
  if (!sameSecret(auth, `Bearer ${secret}`)) return res.status(401).json({ error: 'unauthorized' })

  const body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) as Body
  const subs = (body.subscriptions ?? []).slice(0, 20)
  if (!body.notice || subs.length === 0) return res.status(200).json({ sent: 0 })

  webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? 'mailto:golf@cardigan.mx', pub, priv)
  const { text, to } = noticeLine(body.notice)
  const payload = JSON.stringify({ title: 'Polo', body: text, url: to, tag: body.notice.id, badge: Math.max(0, body.unread ?? 0) })

  const dead: string[] = []
  let sent = 0
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(s, payload, { TTL: 24 * 3600, urgency: 'normal' })
        sent++
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode
        if (code === 404 || code === 410) dead.push(s.endpoint)
      }
    }),
  )

  if (dead.length && process.env.VITE_SUPABASE_URL && process.env.VITE_SUPABASE_ANON_KEY) {
    const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
    await sb.rpc('push_prune', { p_secret: secret, p_endpoints: dead })
  }
  return res.status(200).json({ sent, pruned: dead.length })
}
