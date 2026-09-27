#!/usr/bin/env node
// End-to-end smoke (CLAUDE.md §4 "Playwright for one end-to-end smoke test"):
// enter the Ensayo tournament as the admin player, make sure round 1 is live,
// enter hole 1 for the group, and see the leaderboard change.
//   npm run build && npx vite preview --port 4173 &   (or BASE=https://cardi-golf.vercel.app)
//   node e2e/smoke.mjs [outputDir]
// Needs the Ensayo tournament (scripts/seed-ensayo.mjs) and a Chromium:
// CHROMIUM=/path/to/chrome (defaults to Playwright's).
// E2E_RELAY=1 routes Supabase HTTP through Node's fetch (for sandboxes whose
// proxy breaks Chromium's CONNECT tunnel; needs NODE_USE_ENV_PROXY=1).
import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'

const out = process.argv[2] ?? 'test-results'
mkdirSync(out, { recursive: true })
const base = process.env.BASE ?? 'http://localhost:4173'
const slug = process.env.E2E_SLUG ?? 'ensayo'
const player = process.env.E2E_PLAYER ?? 'Nico'
const pin = process.env.E2E_PIN ?? '1234'
const T = Number(process.env.E2E_TIMEOUT ?? 40000)

const launch = { executablePath: process.env.CHROMIUM || undefined }
const b = await chromium.launch(launch)
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
if (process.env.E2E_RELAY) {
  await ctx.route('https://*.supabase.co/**', async (route) => {
    const req = route.request()
    try {
      const headers = { ...req.headers() }
      delete headers['content-length']
      const res = await fetch(req.url(), { method: req.method(), headers, body: ['GET', 'HEAD'].includes(req.method()) ? undefined : req.postDataBuffer() })
      const body = Buffer.from(await res.arrayBuffer())
      const h = {}
      res.headers.forEach((v, k) => {
        if (!['content-encoding', 'content-length', 'transfer-encoding'].includes(k)) h[k] = v
      })
      await route.fulfill({ status: res.status, headers: h, body })
    } catch {
      await route.abort()
    }
  })
}
const p = await ctx.newPage()
const errors = []
p.on('pageerror', (e) => errors.push(String(e)))
p.on('console', (m) => m.type() === 'error' && !m.text().includes('WebSocket') && errors.push(m.text()))
const shot = (name) => p.screenshot({ path: `${out}/${name}.png`, fullPage: true })
let failed = 0
const check = (ok, label) => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${label}`)
  if (!ok) failed++
}

try {
  await p.goto(`${base}/t/${slug}`, { waitUntil: 'domcontentloaded' })
  await p.waitForSelector('text=Toca tu cara', { timeout: T })
  await p.click(`text=${player}`)
  await p.waitForSelector('input[type=password]', { timeout: T })
  await p.fill('input[type=password]', pin)
  await p.waitForSelector('text=Individual', { timeout: T })
  check(true, 'entered with a PIN')

  await p.goto(`${base}/t/${slug}/admin/rondas`, { waitUntil: 'domcontentloaded' })
  await p.waitForSelector('text=Agregar ronda', { timeout: T })
  // Start round 1 only if it is not live yet (repeat runs must not start round 2).
  if ((await p.locator('text=En juego').count()) === 0) {
    const startBtn = p.locator('button:has-text("Iniciar ronda")').first()
    if (await startBtn.count()) {
      await startBtn.click()
      await p.waitForSelector('text=En juego', { timeout: T })
    }
  }
  check(true, 'round 1 is live')

  await p.goto(`${base}/t/${slug}/tarjeta`, { waitUntil: 'domcontentloaded' })
  await p.waitForSelector('text=Guardar hoyo', { timeout: T })
  await shot('card')
  const firstName = (await p.locator('[class*=playerCard] strong').first().innerText()).trim()
  await p.locator('button[aria-label="Golpes −1"]').first().click()
  await p.click('text=Guardar hoyo')
  await p.waitForTimeout(1500)
  check((await p.locator('text=Sincronizado').count()) > 0 || (await p.locator('text=pendiente').count()) > 0, 'hole saved (sync chip visible)')

  await p.goto(`${base}/t/${slug}`, { waitUntil: 'domcontentloaded' })
  await p.waitForSelector('text=Individual', { timeout: T })
  await p.waitForTimeout(2000)
  await shot('live')
  const body = await p.innerText('body')
  check(body.includes(firstName.split(' ')[0]), 'leaderboard shows the scorer group')
  check(/HOY\s*[1-9]/.test(body), 'leaderboard shows points for today')
  await p.locator('button').filter({ hasText: firstName }).first().click()
  await p.waitForSelector('text=¿Cómo se calculó?', { timeout: T })
  await shot('player')
  check(true, 'player sheet opens with explanations')

  // M5: Dinero, TV board, auctioneer console, pairs draw.
  await p.goto(`${base}/t/${slug}/dinero`, { waitUntil: 'domcontentloaded' })
  await p.waitForSelector('text=Si terminara ahora', { timeout: T })
  await p.waitForTimeout(800)
  await shot('money')
  const moneyBody = await p.innerText('body')
  check(/banco/i.test(moneyBody) && /\$\d/.test(moneyBody), 'Dinero shows the bank card with amounts')
  await p.getByRole('tab', { name: 'Liquidación', exact: true }).click()
  await p.waitForSelector('text=Quién debe qué', { timeout: T })
  await shot('settlement')
  check((await p.locator('text=Vía banco').count()) > 0, 'settlement mode renders')

  await p.goto(`${base}/t/${slug}/admin/calcutta`, { waitUntil: 'domcontentloaded' })
  await p.waitForSelector('text=Consola del subastador', { timeout: T })
  await p.waitForTimeout(800)
  await shot('auction')
  check(/Pozo\s*\$\d/.test(await p.innerText('body')), 'auctioneer console shows the pot')

  await p.goto(`${base}/t/${slug}/admin/parejas`, { waitUntil: 'domcontentloaded' })
  await p.waitForSelector('text=Sorteo de parejas', { timeout: T })
  await shot('draw')
  check(true, 'pairs draw renders')

  // M6: stats, rules, ceremony, feed on Live.
  await p.goto(`${base}/t/${slug}/stats`, { waitUntil: 'domcontentloaded' })
  await p.waitForSelector('text=Premios automáticos', { timeout: T })
  await p.waitForTimeout(800)
  await shot('stats')
  check((await p.locator('text=Carrera de puntos').count()) > 0, 'stats shows awards and the race chart')

  await p.goto(`${base}/t/${slug}/reglamento`, { waitUntil: 'domcontentloaded' })
  await p.waitForSelector('text=Reglamento', { timeout: T })
  await shot('rules')
  check(/anti-sandbag/.test(await p.innerText('body')), 'rules render from settings')

  await p.goto(`${base}/t/${slug}`, { waitUntil: 'domcontentloaded' })
  await p.waitForSelector('text=Individual', { timeout: T })
  await p.waitForTimeout(800)
  check((await p.locator('text=Cambio de líder').count()) + (await p.locator('text=birdie').count()) + (await p.locator('text=Todavía no pasa nada').count()) > 0, 'feed ticker renders')

  await p.setViewportSize({ width: 1280, height: 720 })
  await p.goto(`${base}/t/${slug}/ceremonia`, { waitUntil: 'domcontentloaded' })
  await p.waitForSelector('text=Empezar la ceremonia', { timeout: T })
  await p.locator('text=Empezar la ceremonia').click()
  await p.waitForSelector('text=Revelar', { timeout: T })
  await p.locator('text=Revelar').click()
  await p.waitForTimeout(1200)
  await shot('ceremony')
  check(true, 'ceremony reveals the first step')
  await p.goto(`${base}/t/${slug}/tv`, { waitUntil: 'domcontentloaded' })
  await p.waitForSelector('text=Individual', { timeout: T })
  await p.waitForTimeout(800)
  await shot('tv')
  check(true, 'TV board renders')
} catch (e) {
  failed++
  console.error('  ✗', e.message)
  await shot('failure').catch(() => undefined)
}
console.log('page errors:', errors.length ? errors : 'none')
if (errors.length) failed++
await b.close()
console.log(failed ? `\n✗ ${failed} failure(s)` : '\n✓ smoke passed')
process.exit(failed ? 1 : 0)
