#!/usr/bin/env node
// SHOTS-A: canonical player-facing tournament screenshots on the in-memory fixtures.
//   node capture.mjs [--only <regex on file name>] [--dry]
// Writes PNGs to docs/review/2026-09-30/shots/ and results to ./results-A.json (merged by file).
import { chromium } from 'playwright-core'
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { analyzeStatic, analyzeReach } from './analyze.mjs'

const HERE = path.dirname(new URL(import.meta.url).pathname)
const BASE = 'http://127.0.0.1:4173'
const OUT = '/home/user/Cardi-Golf/docs/review/2026-09-30/shots'
const REL = 'docs/review/2026-09-30/shots'
const RESULTS = path.join(HERE, 'results-A.json')
const MAX_H = 3200
mkdirSync(OUT, { recursive: true })
const onlyIdx = process.argv.indexOf('--only')
const only = onlyIdx > 0 ? new RegExp(process.argv[onlyIdx + 1]) : null
const dry = process.argv.includes('--dry')

const UA_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
const UA_ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36'
const UA_IPAD = 'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
const DEVICES = {
  se: { viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: UA_IPHONE },
  '15pro': { viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: UA_IPHONE },
  android: { viewport: { width: 412, height: 915 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: UA_ANDROID },
  ipad: { viewport: { width: 1024, height: 1366 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, userAgent: UA_IPAD },
}
const ROUTES = { t_live: '', t_tarjeta: '/tarjeta', t_juegos: '/juegos', t_dinero: '/dinero', t_stats: '/stats', t_reglamento: '/reglamento', t_mas: '/mas' }
const M1_FIX = ['minimal4-setup', 'minimal4-live', 'full12-live', 'full12-finished', 'pairs8', 'large60', 'longnames']
const M2_FIX = ['full12-live', 'longnames', 'large60']

const slugify = (s) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

// ---------- interactions ----------
async function settle(page) {
  await page.waitForFunction(() => !document.querySelector('div[role=status][class*="loading"]'), null, { timeout: 8000 }).catch(() => undefined)
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(600)
}
async function openSheet(page) {
  await page.locator('button[class*="leaderRow"]').first().click()
  await page.locator('[role=dialog]').first().waitFor({ timeout: 5000 })
  await page.waitForTimeout(500)
}
async function clickText(page, role, name) {
  const loc = page.getByRole(role, { name, exact: true })
  await loc.first().click()
  await page.waitForTimeout(400)
}
const S = {
  'player-sheet': openSheet,
  'player-sheet-bottom': async (page) => {
    await openSheet(page)
    await page.evaluate(() => {
      const d = [...document.querySelectorAll('[role=dialog]')].pop()
      for (const el of [d, ...d.querySelectorAll('*')]) if (el.scrollHeight > el.clientHeight + 4 && /(auto|scroll)/.test(getComputedStyle(el).overflowY)) el.scrollTop = el.scrollHeight
    })
    await page.waitForTimeout(300)
  },
  'player-sheet-howcalc': async (page) => {
    await openSheet(page)
    await page.locator('[role=dialog] button', { hasText: '¿Cómo se calculó?' }).first().click()
    await page.waitForFunction(() => document.querySelectorAll('[role=dialog]').length >= 2, null, { timeout: 5000 })
    await page.waitForTimeout(500)
  },
  'player-sheet-hole': async (page) => {
    await openSheet(page)
    await page.locator('[role=dialog] button[class*="gridCellBtn"]').nth(4).click()
    await page.waitForFunction(() => document.querySelectorAll('[role=dialog]').length >= 2, null, { timeout: 5000 })
    await page.waitForTimeout(500)
  },
  gross: (page) => clickText(page, 'radio', 'Gross'),
  grid: (page) => clickText(page, 'button', 'Ver tarjeta'),
  'grid-full': (page) => clickText(page, 'button', 'Ver tarjeta'),
  'stepper-changed': async (page) => {
    await page.getByRole('button', { name: 'Golpes: más' }).first().click()
    await page.waitForTimeout(400)
  },
  'snake-tiebreak': async (page) => {
    const plus = page.getByRole('button', { name: 'Putts: más' })
    await plus.nth(0).click()
    await plus.nth(1).click()
    await page.getByRole('button', { name: 'Guardar hoyo', exact: true }).click()
    await page.getByRole('dialog', { name: '¿Quién embocó al último?' }).waitFor({ timeout: 5000 })
    await page.waitForTimeout(500)
  },
  'confirm-unusual': async (page) => {
    const plus = page.getByRole('button', { name: 'Golpes: más' }).first()
    for (let i = 0; i < 12; i++) {
      const v = await page.locator('[role=group][aria-label="Golpes"] span[aria-live]').first().innerText()
      if (Number(v) >= 10) break
      await plus.click()
    }
    await page.getByRole('button', { name: 'Guardar hoyo', exact: true }).click()
    await page.locator('[role=dialog]').first().waitFor({ timeout: 5000 })
    await page.waitForTimeout(500)
  },
  liquidacion: (page) => clickText(page, 'radio', 'Liquidación'),
  'liquidacion-full': (page) => clickText(page, 'radio', 'Liquidación'),
  'liquidacion-sin-banco': async (page) => {
    await clickText(page, 'radio', 'Liquidación')
    await clickText(page, 'radio', 'Sin banco')
  },
  'liquidacion-sin-banco-full': async (page) => {
    await clickText(page, 'radio', 'Liquidación')
    await clickText(page, 'radio', 'Sin banco')
    await page.evaluate(() => window.scrollTo(0, 0))
  },
  'por-juego': (page) => clickText(page, 'radio', 'Por juego'),
  'person-open': async (page) => {
    await page.locator('button[class*="personRow"]').first().click()
    await page.waitForTimeout(400)
  },
}
/** Juegos: open the first game, then select tab `i`. */
const tabState = (i) => async (page) => {
  await page.locator('button[class*="gameRow"]').first().click()
  await page.waitForTimeout(300)
  const tabs = page.locator('[role=tablist] [role=tab]')
  if ((await tabs.count()) > i) await tabs.nth(i).click()
  await page.waitForTimeout(400)
}

// ---------- job list ----------
async function discoverFixtures(browser) {
  const ctx = await browser.newContext()
  const p = await ctx.newPage()
  await p.goto(`${BASE}/fixture`, { waitUntil: 'domcontentloaded' })
  await p.waitForSelector('a[href^="/t/_/"]', { timeout: 15000 })
  const names = await p.$$eval('a[href^="/t/_/"]', (as) => as.map((a) => a.getAttribute('href').slice(5)))
  // Tab labels per fixture (for Juegos sub-tab state names).
  const tabs = {}
  for (const f of names) {
    await p.goto(`${BASE}/t/_/${f}/juegos`, { waitUntil: 'domcontentloaded' })
    await p.waitForTimeout(700)
    const row = p.locator('button[class*="gameRow"]').first()
    if (!(await row.count())) {
      tabs[f] = []
      continue
    }
    await row.click()
    await p.waitForTimeout(300)
    const t = await p.$$eval('[role=tablist] [role=tab]', (els) => els.map((e) => e.textContent.trim()))
    tabs[f] = t.length ? t : [await p.locator('h1').first().innerText()]
  }
  await ctx.close()
  return { names, tabs }
}

function buildJobs(fixtures, tabs) {
  const jobs = []
  const add = (route, fixture, device, state = null, opts = {}) => {
    const file = `${route}-${fixture}-${device}-light${state ? `-${state}` : ''}.png`
    jobs.push({ file, route, fixture, device, state, url: `${BASE}/t/_/${fixture}${ROUTES[route]}`, full: !!opts.full || /(^|-)full$/.test(state ?? ''), setup: opts.setup ?? (state && S[state]) ?? null, matrix: opts.matrix })
  }
  // 1. main routes × 7 fixtures at 15pro, plus full-page live/juegos/dinero
  for (const f of M1_FIX) {
    for (const r of Object.keys(ROUTES)) add(r, f, '15pro', null, { matrix: 1 })
    for (const r of ['t_live', 't_juegos', 't_dinero']) add(r, f, '15pro', 'full', { matrix: 1 })
  }
  // 2. device sweep
  for (const f of M2_FIX) for (const r of ['t_live', 't_tarjeta', 't_juegos', 't_dinero']) for (const d of ['se', 'android', 'ipad']) add(r, f, d, null, { matrix: 2 })
  // 3. every other fixture × live/juegos/dinero at 15pro
  for (const f of fixtures.filter((x) => !M1_FIX.includes(x))) for (const r of ['t_live', 't_juegos', 't_dinero']) add(r, f, '15pro', null, { matrix: 3 })
  // 4. states on full12-live
  const F = 'full12-live'
  for (const s of ['player-sheet', 'player-sheet-bottom', 'player-sheet-howcalc', 'player-sheet-hole', 'gross']) add('t_live', F, '15pro', s, { matrix: 4 })
  for (const s of ['grid', 'grid-full', 'stepper-changed', 'snake-tiebreak', 'confirm-unusual']) add('t_tarjeta', F, '15pro', s, { matrix: 4 })
  ;(tabs[F] ?? []).forEach((label, i) => {
    add('t_juegos', F, '15pro', `tab-${slugify(label)}`, { setup: tabState(i), matrix: 4 })
    add('t_juegos', F, '15pro', `tab-${slugify(label)}-full`, { setup: tabState(i), matrix: 4, full: true })
  })
  for (const s of ['person-open', 'por-juego', 'liquidacion', 'liquidacion-full', 'liquidacion-sin-banco']) add('t_dinero', F, '15pro', s, { matrix: 4 })
  add('t_mas', F, '15pro', 'full', { matrix: 4 })
  // Extra states on other fixtures (same lane: player-facing screens).
  for (const f of ['longnames', 'large60', 'full12-finished']) add('t_live', f, '15pro', 'player-sheet', { matrix: 5 })
  add('t_tarjeta', 'longnames', '15pro', 'grid', { matrix: 5 })
  add('t_tarjeta', 'large60', '15pro', 'grid', { matrix: 5 })
  add('t_dinero', 'full12-finished', '15pro', 'liquidacion', { matrix: 5 })
  add('t_dinero', 'full12-finished', '15pro', 'liquidacion-full', { matrix: 5 })
  add('t_dinero', F, '15pro', 'liquidacion-sin-banco-full', { matrix: 4 })
  ;(tabs.friends8 ?? []).forEach((label, i) => add('t_juegos', 'friends8', '15pro', `tab-${slugify(label)}`, { setup: tabState(i), matrix: 5 }))
  for (const f of ['stroke8', 'match8', 'team8', 'bracket8', 'scramble8', 'pairs8', 'large60', 'longnames']) {
    if (!fixtures.includes(f)) continue
    const label = (tabs[f] ?? [])[0]
    if (label) add('t_juegos', f, '15pro', `tab-${slugify(label)}`, { setup: tabState(0), matrix: 5 })
  }
  for (const f of ['pairs8', 'longnames']) {
    const i = (tabs[f] ?? []).findIndex((l) => /matrimonios|parejas/i.test(l))
    if (i > 0) add('t_juegos', f, '15pro', `tab-${slugify(tabs[f][i])}`, { setup: tabState(i), matrix: 5 })
  }
  return jobs
}

// ---------- run ----------
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const { names: fixtures, tabs } = await discoverFixtures(browser)
console.log('fixtures:', fixtures.join(', '))
console.log('tabs:', JSON.stringify(tabs))
let jobs = buildJobs(fixtures, tabs)
if (only) jobs = jobs.filter((j) => only.test(j.file))
console.log(`${jobs.length} jobs`)
if (dry) {
  for (const j of jobs) console.log(j.file)
  await browser.close()
  process.exit(0)
}

const prev = existsSync(RESULTS) ? JSON.parse(readFileSync(RESULTS, 'utf8')) : []
const results = new Map(prev.map((r) => [r.file, r]))
const byDevice = new Map()
for (const j of jobs) {
  if (!byDevice.has(j.device)) byDevice.set(j.device, [])
  byDevice.get(j.device).push(j)
}
const t0 = Date.now()
for (const [device, list] of byDevice) {
  const ctx = await browser.newContext({ ...DEVICES[device], reducedMotion: 'reduce', colorScheme: 'light', locale: 'es-MX', timezoneId: 'America/Mazatlan', serviceWorkers: 'block' })
  let events = []
  for (const j of list) {
    // A fresh page per shot: no state leaks between shots.
    const page = await ctx.newPage()
    page.on('pageerror', (e) => events.push({ kind: 'pageerror', text: String(e.message || e).slice(0, 300) }))
    page.on('console', (m) => {
      // "Service Worker registration blocked by Playwright" is this harness (serviceWorkers: 'block'), not the app.
      if ((m.type() === 'error' || m.type() === 'warning') && !/blocked by Playwright/.test(m.text())) events.push({ kind: `console.${m.type()}`, text: m.text().slice(0, 300) })
    })
    page.on('requestfailed', (r) => {
      const err = r.failure()?.errorText ?? ''
      if (!/ERR_ABORTED/.test(err)) events.push({ kind: 'requestfailed', text: `${r.method()} ${r.url().replace(/\?.*/, '')} ${err}` })
    })
    page.on('response', async (r) => {
      if (r.status() >= 400) {
        let body = ''
        try {
          body = (await r.text()).slice(0, 160)
        } catch {
          /* navigation raced */
        }
        events.push({ kind: 'http', text: `${r.status()} ${r.request().method()} ${r.url().replace(/\?.*/, '')}`, body })
      }
    })
    events = []
    const rec = { file: `${REL}/${j.file}`, url: j.url.replace(BASE, 'http://127.0.0.1:4173'), device: j.device, viewport: `${DEVICES[j.device].viewport.width}×${DEVICES[j.device].viewport.height} @${DEVICES[j.device].deviceScaleFactor}x`, fixture: j.fixture, route: j.route, state: j.state ?? 'default', full: j.full, observations: [], metrics: {} }
    try {
      await page.goto(j.url, { waitUntil: 'domcontentloaded', timeout: 30000 })
      await settle(page)
      if (!(await page.evaluate(() => matchMedia('(pointer: coarse)').matches))) rec.observations.push('HARNESS: touch emulation not active (pointer: fine); sizes may differ from a phone')
      if (j.setup) await j.setup(page)
      await page.waitForTimeout(150)
      const dest = path.join(OUT, j.file)
      if (j.full) {
        // Playwright's fullPage (and CDP captureBeyondViewport) drop the page's touch
        // emulation (pointer: coarse → fine, 44 px buttons → 36 px) for the rest of the
        // page's life. A viewport as tall as the page renders the same pixels and keeps it.
        const vp = DEVICES[j.device].viewport
        const h = Math.min(await page.evaluate(() => document.scrollingElement.scrollHeight), MAX_H)
        rec.metrics.capturedHeight = h
        await page.setViewportSize({ width: vp.width, height: Math.max(h, vp.height) })
        await page.waitForTimeout(350)
        await page.screenshot({ path: dest, animations: 'disabled' })
        await page.setViewportSize(vp)
        await page.waitForTimeout(350)
      } else {
        await page.screenshot({ path: dest, animations: 'disabled' })
      }
      const st = await page.evaluate(analyzeStatic, { scopeSel: null, full: j.full, capH: MAX_H })
      const reach = await page.evaluate(analyzeReach, { scopeSel: null })
      rec.observations.push(...st.obs, ...reach.obs)
      rec.metrics = { ...rec.metrics, ...st.metrics, fixedBottomBar: reach.barHeight }
      if (j.full && st.metrics.scrollHeight > MAX_H) rec.observations.push(`full page is ${st.metrics.scrollHeight}px tall; capture capped at ${MAX_H}px`)
    } catch (e) {
      rec.observations.push(`CAPTURE FAILED: ${String(e.message || e).split('\n')[0].slice(0, 200)}`)
    }
    await page.waitForTimeout(100)
    for (const ev of events) {
      let note = ''
      if (ev.kind === 'http' && /rpc\/tournament_profiles/.test(ev.text)) note = ' [fixture artifact: the player sheet asks production for profiles of a non-UUID fixture tournament id]'
      if (ev.kind === 'console.error' && /Failed to load resource: the server responded with a status of 400/.test(ev.text) && events.some((x) => x.kind === 'http' && /tournament_profiles/.test(x.text))) continue
      rec.observations.push(`${ev.kind}: ${ev.text}${ev.body ? ` → ${ev.body.replace(/\s+/g, ' ')}` : ''}${note}`)
    }
    results.set(rec.file, rec)
    console.log(`${j.file}  ${rec.observations.length ? '⚑ ' + rec.observations.length : 'ok'}`)
    await page.close()
  }
  await ctx.close()
}
await browser.close()
const out = [...results.values()].sort((a, b) => a.file.localeCompare(b.file))
writeFileSync(RESULTS, JSON.stringify(out, null, 1))
console.log(`done ${jobs.length} jobs in ${Math.round((Date.now() - t0) / 1000)}s → ${RESULTS}`)
