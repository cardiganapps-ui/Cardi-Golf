// A11Y panel: axe-core scan of every route on the shared preview server.
// Usage: node axe-scan.mjs <set> [outfile]
//   set = fixtures | real | aaa
import { chromium } from 'playwright-core'
import fs from 'node:fs'
import path from 'node:path'

const DIR = path.dirname(new URL(import.meta.url).pathname)
const AXE = path.join(DIR, 'node_modules/axe-core/axe.min.js')
const BASE = process.env.BASE ?? 'http://127.0.0.1:4173'
const set = process.argv[2] ?? 'fixtures'
const out = process.argv[3] ?? path.join(DIR, `axe-${set}.json`)
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']

const F = '/t/_/full12-live'
const adminSections = ['torneo', 'jugadores', 'campos', 'rondas', 'grupos', 'handicaps', 'juegos', 'scores', 'calcutta', 'parejas', 'equipos', 'historial', 'datos']
const platformSections = ['resumen', 'torneos', 'personas', 'campos', 'crews', 'avisos', 'auditoria', 'salud']

function fixtureRoutes() {
  const r = []
  for (const sub of ['', '/tarjeta', '/juegos', '/dinero', '/stats', '/reglamento', '/mas', '/tv', '/ceremonia', '/imprimir']) r.push({ route: F + sub })
  for (const s of adminSections) r.push({ route: `${F}/admin/${s}` })
  for (const fx of ['large60', 'longnames']) for (const sub of ['', '/tarjeta', '/juegos', '/dinero']) r.push({ route: `/t/_/${fx}${sub}` })
  for (const fx of ['minimal4-setup', 'full12-finished', 'friends8', 'pairs8', 'match8', 'team8', 'bracket8', 'stroke8', 'gloria4']) r.push({ route: `/t/_/${fx}` })
  r.push({ route: '/organizer/nuevo/_' })
  for (const n of ['yo', 'nuevo', 'extrano', 'manual']) r.push({ route: `/p/_/${n}` })
  r.push({ route: '/p/_/yo/vs' }, { route: '/p/_/yo/anio' })
  for (const x of ['/amigos/_', '/avisos/_', '/ronda/_', '/c/_', '/fixture', '/design']) r.push({ route: x })
  for (const s of platformSections) r.push({ route: `/admin/_/${s}` })
  r.push({ route: '/privacidad' }, { route: '/terminos' }, { route: '/no-existe-esta-ruta' }, { route: '/organizer/login' }, { route: '/entrar' }, { route: '/' })
  return r
}

async function scan(page, route, opts = {}) {
  const t0 = Date.now()
  let status = 'ok'
  try {
    if (!opts.noNav) {
      await page.goto(BASE + route, { waitUntil: 'networkidle', timeout: 45000 })
    }
  } catch (e) {
    status = 'nav-timeout'
  }
  await page.waitForTimeout(opts.settle ?? 900)
  if (opts.before) await opts.before(page)
  const has = await page.evaluate(() => typeof window.axe !== 'undefined')
  if (!has) await page.addScriptTag({ path: AXE })
  const res = await page.evaluate(async (runOnly) => {
    const r = await window.axe.run(document, { runOnly, resultTypes: ['violations', 'incomplete'] })
    const pick = (list) =>
      list.map((v) => ({
        id: v.id,
        impact: v.impact,
        help: v.help,
        tags: v.tags.filter((x) => /^wcag|best/.test(x)),
        count: v.nodes.length,
        nodes: v.nodes.slice(0, 8).map((n) => ({ target: n.target.join(' '), html: n.html.slice(0, 180), summary: (n.failureSummary || '').slice(0, 300), data: n.any?.[0]?.data ?? n.all?.[0]?.data ?? null })),
      }))
    return { violations: pick(r.violations), incomplete: pick(r.incomplete).map((x) => ({ id: x.id, count: x.count, nodes: x.nodes.slice(0, 3) })) }
  }, opts.runOnly ?? TAGS)
  const h1 = await page.evaluate(() => [...document.querySelectorAll('h1')].map((h) => h.textContent.trim()).slice(0, 3))
  return { route, label: opts.label ?? route, status, ms: Date.now() - t0, url: page.url(), h1, ...res }
}

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, locale: 'es-MX' })
const page = await ctx.newPage()
const results = []
const flush = () => fs.writeFileSync(out, JSON.stringify(results, null, 1))

if (set === 'fixtures') {
  const coarse = await (async () => {
    await page.goto(BASE + '/fixture', { waitUntil: 'networkidle' })
    return page.evaluate(() => ({ coarse: matchMedia('(pointer: coarse)').matches, hover: matchMedia('(hover: hover)').matches }))
  })()
  console.log('media', JSON.stringify(coarse))
  for (const r of fixtureRoutes()) {
    const res = await scan(page, r.route, r)
    results.push(res)
    console.log(`${res.route}  v=${res.violations.map((v) => `${v.id}(${v.impact[0]}${v.count})`).join(' ') || '-'}  ${res.status} ${res.ms}ms`)
    flush()
  }
} else if (set === 'aaa') {
  const routes = [F, F + '/tarjeta', F + '/juegos', F + '/dinero', F + '/stats', F + '/mas', F + '/tv', F + '/ceremonia', '/t/_/large60', '/t/_/large60/dinero', '/p/_/yo', '/p/_/yo/vs']
  for (const r of routes) {
    const res = await scan(page, r, { runOnly: ['color-contrast-enhanced'] })
    results.push(res)
    console.log(`${res.route}  v=${res.violations.map((v) => `${v.id}(${v.count})`).join(' ') || '-'}`)
    flush()
  }
}
await browser.close()
