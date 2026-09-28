#!/usr/bin/env node
/* global document */
// Design screenshots (redesign brief, phase 0): every screen in every data
// state, at 390×844 (and 1024 wide for setup screens), into design/shots/<set>.
//   VITE_DESIGN_ROUTES=1 npm run build && npx vite preview --port 4173 &   (the fixture routes exist only in dev and design builds)
//   node scripts/design-shots.mjs before            # or: after, design
//   node scripts/design-shots.mjs before --only tarjeta   # filter by name
// Fixture states come from src/dev/fixtures.ts (no database). The few screens
// that need a real session (Home, Entrar, organizer) run against the Ensayo
// tournament with the throwaway organizer from scripts/design-organizer.mjs.
// Same Chromium/relay setup as e2e/smoke.mjs.
import { chromium } from 'playwright-core'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { loadEnv } from './lib/env.mjs'

const root = path.resolve(new URL('..', import.meta.url).pathname)
loadEnv()
const set = process.argv[2] ?? 'before'
const onlyIdx = process.argv.indexOf('--only')
const only = onlyIdx > 0 ? new RegExp(process.argv[onlyIdx + 1]) : null
const out = path.join(root, 'design', 'shots', set)
mkdirSync(out, { recursive: true })
const base = process.env.BASE ?? 'http://localhost:4173'
const T = 30000
const MAX_H = 3200

const b = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined })
const index = []
const errors = []
const PHONE = { width: 390, height: 844 }
const DESK = { width: 1024, height: 800 }
const TV = { width: 1280, height: 720 }

async function newPage(viewport, { relay = false, storage = {} } = {}) {
  const ctx = await b.newContext({ viewport, deviceScaleFactor: 1.5, reducedMotion: 'reduce' })
  if (relay) {
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
  } else await ctx.route('https://*.supabase.co/**', (r) => r.abort())
  await ctx.addInitScript((storage) => {
    for (const [k, v] of Object.entries(storage)) localStorage.setItem(k, v)
  }, storage)
  const p = await ctx.newPage()
  p.on('pageerror', (e) => errors.push(`${p.url()}: ${e}`))
  return p
}

async function settle(p) {
  await p.evaluate(() => document.fonts?.ready)
  await p.waitForTimeout(500)
}

async function shot(p, name, { full = true } = {}) {
  if (only && !only.test(name)) return
  const file = `${name}.jpg`
  await settle(p)
  // Full page, but capped so 60-player lists do not produce 10,000-px images.
  const height = full ? Math.min(await p.evaluate(() => document.documentElement.scrollHeight), MAX_H) : p.viewportSize().height
  await p.screenshot({ path: path.join(out, file), fullPage: full, clip: { x: 0, y: 0, width: p.viewportSize().width, height }, type: 'jpeg', quality: 75 })
  index.push(file)
  console.log('  ', file)
}

const FIXTURES = ['minimal4-setup', 'minimal4-live', 'full12-live', 'full12-finished', 'pairs8', 'large60', 'longnames']
const ADMIN_ON = ['full12-live', 'large60', 'longnames']
const ADMIN = ['torneo', 'jugadores', 'campos', 'rondas', 'grupos', 'handicaps', 'scores', 'calcutta', 'parejas', 'datos']

// ---- Fixture screens (phone) ----
{
  const p = await newPage(PHONE)
  for (const f of FIXTURES) {
    const at = (path = '') => p.goto(`${base}/t/_/${f}${path}`, { waitUntil: 'domcontentloaded' })
    console.log(f)
    await at()
    await shot(p, `${f}--live`)
    // Player sheet from the first leaderboard row.
    const row = p.locator('button[class*="leaderRow"]').first()
    if (await row.count()) {
      await row.click()
      await p.waitForTimeout(400)
      await shot(p, `${f}--live--player-sheet`, { full: false })
    }
    await at('/tarjeta')
    await shot(p, `${f}--tarjeta`)
    const grid = p.getByRole('button', { name: 'Ver tarjeta', exact: true })
    if (await grid.count()) {
      await grid.click()
      await shot(p, `${f}--tarjeta--grid`)
    }
    await at('/juegos')
    await shot(p, `${f}--juegos`)
    // The overview lists one row per game; the tabs appear inside a game.
    const firstGame = p.locator('button[class*="gameRow"]').first()
    if (await firstGame.count()) await firstGame.click()
    const tabs = p.locator('[role=tablist] [role=tab]')
    const n = await tabs.count()
    for (let i = 0; i < n; i++) {
      await tabs.nth(i).click()
      const label = ((await tabs.nth(i).innerText()) || `tab${i}`).toLowerCase().replace(/[^a-z0-9]+/g, '-')
      await shot(p, `${f}--juegos--${label}`)
    }
    await at('/dinero')
    await shot(p, `${f}--dinero`)
    const liq = p.getByRole('radio', { name: 'Liquidación', exact: true })
    if (await liq.count()) {
      await liq.click()
      await shot(p, `${f}--dinero--liquidacion`)
    }
    await at('/stats')
    await shot(p, `${f}--stats`)
    await at('/reglamento')
    await shot(p, `${f}--reglamento`)
    await at('/mas')
    await shot(p, `${f}--mas`)
    await at('/imprimir')
    await shot(p, `${f}--imprimir`)
    if (ADMIN_ON.includes(f)) {
      for (const a of ADMIN) {
        await at(`/admin/${a}`)
        await p.waitForTimeout(600)
        await shot(p, `${f}--admin-${a}`)
      }
    }
  }
  await p.context().close()
}

// ---- TV and ceremony (1280×720, viewport only) ----
{
  const p = await newPage(TV)
  for (const f of ['minimal4-live', 'full12-live', 'full12-finished', 'large60', 'longnames']) {
    await p.goto(`${base}/t/_/${f}/tv`, { waitUntil: 'domcontentloaded' })
    await shot(p, `${f}--tv`, { full: false })
    await p.goto(`${base}/t/_/${f}/ceremonia`, { waitUntil: 'domcontentloaded' })
    await shot(p, `${f}--ceremonia`, { full: false })
    const start = p.getByRole('button', { name: /Empezar/ })
    if (await start.count()) {
      await start.click()
      await p.waitForTimeout(700)
      const reveal = p.getByRole('button', { name: 'Revelar', exact: true })
      if (await reveal.count()) {
        await reveal.click()
        await p.waitForTimeout(900)
        await shot(p, `${f}--ceremonia--reveal`, { full: false })
      }
    }
  }
  await p.context().close()
}

// ---- Setup screens at desktop width ----
{
  const p = await newPage(DESK)
  for (const f of ['full12-live', 'large60']) {
    for (const a of ['torneo', 'jugadores', 'grupos', 'scores', 'calcutta']) {
      await p.goto(`${base}/t/_/${f}/admin/${a}`, { waitUntil: 'domcontentloaded' })
      await p.waitForTimeout(600)
      await shot(p, `${f}--admin-${a}--desktop`)
    }
    await p.goto(`${base}/t/_/${f}`, { waitUntil: 'domcontentloaded' })
    await shot(p, `${f}--live--desktop`)
  }
  await p.context().close()
}

// ---- Real app: Home, Entrar, organizer (relay) ----
if (!process.env.SKIP_REAL) {
  const p = await newPage(PHONE, { relay: true })
  await p.goto(`${base}/`, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(1200)
  await shot(p, `home--first-run`)
  await p.goto(`${base}/t/ensayo`, { waitUntil: 'domcontentloaded' })
  await p.waitForSelector('text=Elige tu nombre', { timeout: T }).catch(() => undefined)
  await shot(p, `entrar--faces`)
  const face = p.locator('button', { hasText: 'Nico' }).first()
  if (await face.count()) {
    await face.click()
    await p.waitForTimeout(400)
    await shot(p, `entrar--pin`)
  }
  await p.goto(`${base}/organizer/login`, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(800)
  await shot(p, `organizer--login`)
  await p.goto(`${base}/organizer/reset`, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(800)
  await shot(p, `organizer--reset`)
  await p.context().close()

  // Home with a remembered tournament.
  const p2 = await newPage(PHONE, { relay: true, storage: { 'cardi-golf:last-tournament': JSON.stringify({ slug: 'ensayo', name: 'Ensayo · Nacho Invitational' }) } })
  await p2.goto(`${base}/`, { waitUntil: 'domcontentloaded' })
  await p2.waitForTimeout(1200)
  await shot(p2, `home--returning`)
  await p2.context().close()

  if (process.env.DESIGN_ORG_EMAIL && process.env.DESIGN_ORG_PASSWORD) {
    for (const [vp, suffix] of [
      [PHONE, ''],
      [DESK, '--desktop'],
    ]) {
      const p3 = await newPage(vp, { relay: true })
      await p3.goto(`${base}/organizer/login`, { waitUntil: 'domcontentloaded' })
      await p3.waitForSelector('input[type=email]', { timeout: T })
      await p3.fill('input[type=email]', process.env.DESIGN_ORG_EMAIL)
      await p3.fill('input[type=password]', process.env.DESIGN_ORG_PASSWORD)
      await p3.locator('button[type=submit]').click()
      await p3.waitForURL(/\/organizer$/, { timeout: T }).catch(() => undefined)
      await p3.waitForTimeout(1500)
      await shot(p3, `organizer--my-tournaments${suffix}`)
      await p3.goto(`${base}/organizer/new`, { waitUntil: 'domcontentloaded' })
      await p3.waitForTimeout(800)
      await shot(p3, `organizer--new-1${suffix}`)
      const name = p3.locator('input').first()
      await name.fill('Copa de la Amistad')
      await p3.getByRole('button', { name: 'Siguiente' }).click()
      await p3.waitForTimeout(400)
      await shot(p3, `organizer--new-2${suffix}`)
      const next = p3.getByRole('button', { name: 'Siguiente' })
      if (await next.count()) {
        await next.click()
        await p3.waitForTimeout(400)
        await shot(p3, `organizer--new-3${suffix}`)
      }
      await p3.context().close()
    }
  } else console.log('  (no DESIGN_ORG_* credentials: skipping organizer screens)')
}

// ---- /design (phase 1) ----
if (set === 'design' || set === 'after') {
  for (const [vp, suffix] of [
    [PHONE, ''],
    [DESK, '--desktop'],
  ]) {
    const p = await newPage(vp)
    await p.goto(`${base}/design`, { waitUntil: 'domcontentloaded' })
    await p.waitForTimeout(800)
    await shot(p, `design${suffix}`)
    await p.context().close()
  }
}

writeFileSync(path.join(out, 'index.md'), `# ${set} shots\n\n${index.map((f) => `- [${f}](./${f})`).join('\n')}\n`)
await b.close()
console.log(`${index.length} shots → design/shots/${set}`)
if (errors.length) {
  console.error('page errors:', errors)
  process.exit(1)
}
