/**
 * POST /api/push-dispatch, called by the database through pg_net once per new
 * notice: an account's notification (trigger notifications_push, migration
 * 0019) or a tournament's notice to the phones that hold a player by PIN
 * (trigger player_notices_push, 0052):
 *   Authorization: Bearer <PUSH_DISPATCH_SECRET>
 *   { subscriptions: [{ endpoint, keys: { p256dh, auth } }], notice: { id, kind, data, actor }, unread? }
 * Sends one web push per subscription, signed with the VAPID pair, and hands
 * the endpoints the push service rejected for good (404/410) back to the
 * database through push_prune (the same secret, the anon key). Never the
 * service-role key; never an amount the app wrote (its notices carry none;
 * a platform_notice is the Admin de Polo's own text). `unread` is an
 * account's inbox count, for the icon; a PIN phone has no inbox, so its
 * notices carry none and leave the icon's count as it is.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import webpush from 'web-push'
import { noticeLine, type NoticeLike } from '../src/lib/noticeText.js'
import { jsonBody } from '../src/server/body.js'
import { bearerMatches } from '../src/server/secret.js'
import { pushEndpointOk } from '../src/lib/pushEndpoint.js'

interface Body {
  subscriptions?: Array<{ endpoint: string; keys: { p256dh: string; auth: string } }>
  notice?: NoticeLike & { id: string }
  unread?: number
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' })
  const secret = process.env.PUSH_DISPATCH_SECRET
  const pub = process.env.VAPID_PUBLIC_KEY
  const priv = process.env.VAPID_PRIVATE_KEY
  if (!secret || !pub || !priv) return res.status(503).json({ error: 'push not configured' })
  if (!bearerMatches(req.headers.authorization, secret)) return res.status(401).json({ error: 'unauthorized' })

  const body = jsonBody(req) as Body | null
  if (!body) return res.status(400).json({ error: 'body' })
  const subs = Array.isArray(body.subscriptions) ? body.subscriptions.slice(0, 20) : []
  if (!body.notice || subs.length === 0) return res.status(200).json({ sent: 0 })

  webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? 'mailto:golf@cardigan.mx', pub, priv)
  const line = noticeLine(body.notice)
  const badge = typeof body.unread === 'number' && Number.isFinite(body.unread) ? Math.max(0, body.unread) : undefined
  const payload = JSON.stringify({
    title: line.title ?? 'Polo',
    body: line.body ?? line.text,
    url: line.to,
    tag: body.notice.id,
    badge,
  })

  // SEC-03: only a browser push service is called. An endpoint off the list can never be delivered: it is pruned
  // with the gone ones, and nothing is sent to it.
  const live: typeof subs = []
  const dead: string[] = []
  for (const s of subs) {
    if (pushEndpointOk(s?.endpoint)) live.push(s)
    else if (typeof s?.endpoint === 'string') dead.push(s.endpoint)
  }
  let sent = 0
  await Promise.all(
    live.map(async (s) => {
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
    const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    await sb.rpc('push_prune', { p_secret: secret, p_endpoints: dead })
  }
  return res.status(200).json({ sent, pruned: dead.length })
}
