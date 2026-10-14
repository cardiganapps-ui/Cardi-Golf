/**
 * GET /api/manifest?t=<slug> → the installed app's manifest with this tournament's start URL (PWA-09).
 *
 * A tournament's pages point their manifest link here, so an app added to the home screen from one opens
 * that tournament the first time. An iPhone's installed app keeps nothing of Safari's (not the session,
 * not the last tournament), and opened on an empty Home that asked for a code. Everything but the start
 * URL is the build's own manifest (`src/lib/appManifest.ts`), `id` included, so it is the same app. It
 * reads nothing and returns nothing about the tournament: a slug that isn't one gets the plain manifest.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { APP_MANIFEST, startUrlFor } from '../src/lib/appManifest.js'

export default function handler(req: VercelRequest, res: VercelResponse) {
  const t = typeof req.query.t === 'string' ? req.query.t : ''
  res.setHeader('Content-Type', 'application/manifest+json')
  // The same answer for the same slug: the CDN keeps it a day, the phone an hour.
  res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400')
  res.status(200).send(JSON.stringify({ ...APP_MANIFEST, start_url: startUrlFor(t) }))
}
