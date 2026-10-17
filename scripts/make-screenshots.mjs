#!/usr/bin/env node
// The installed app's manifest screenshots (PWA-14): Chrome's install sheet on Android shows them, and
// shows a bare «¿Instalar?» without them. Two real screens, En vivo and the Tarjeta, from the fixture
// build at a phone's narrow size, on a tournament whose people and event are all made up (src/dev/fixtures.ts,
// `friends8`). Written as WebP under public/screenshots/ (committed; the worker never keeps them).
//   npm run build:fixtures && npx vite preview --outDir dist-fixtures --port 4173 &
//   node scripts/make-screenshots.mjs        # BASE=http://127.0.0.1:4173 by default; CHROMIUM=/path/to/chrome
import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'
import sharp from 'sharp'

const base = process.env.BASE ?? 'http://127.0.0.1:4173'
/** CSS pixels and density: the browser suite's phone, so the shots are what a 393-px phone shows. */
const PHONE = { width: 393, height: 852 }
const SCALE = 2
const SHOTS = [
  { file: 'public/screenshots/envivo.webp', path: '/t/_/friends8?net=live' },
  { file: 'public/screenshots/tarjeta.webp', path: '/t/_/friends8/tarjeta?net=live' },
]

mkdirSync('public/screenshots', { recursive: true })
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined })
const context = await browser.newContext({
  viewport: PHONE,
  deviceScaleFactor: SCALE,
  isMobile: true,
  hasTouch: true,
  reducedMotion: 'reduce',
  serviceWorkers: 'block',
})
// No server: every Supabase call is answered empty, as in the browser suite (e2e/fixtures/base.ts).
await context.route(/supabase\.co|\/rest\/v1\/|\/auth\/v1\//, (r) =>
  r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
)
// The install card is for a phone that has not installed the app: the shots are of the app installed.
await context.addInitScript(() => localStorage.setItem('cardi-golf:installed', '1'))
const page = await context.newPage()
for (const shot of SHOTS) {
  await page.goto(`${base}${shot.path}`, { waitUntil: 'networkidle' })
  await page.locator('main').first().waitFor()
  await page.waitForTimeout(600)
  const png = await page.screenshot()
  await sharp(png).webp({ quality: 82 }).toFile(shot.file)
  console.log('wrote', shot.file)
}
await browser.close()
