// V6: where does "Ir al Comité" land, and is there any readiness list? (fixture, in-memory, no writes)
import { chromium } from 'playwright-core'
import fs from 'node:fs'
const BASE = 'http://127.0.0.1:4206'
const OUT = '/tmp/claude-0/-home-user-Cardi-Golf/ba82926f-40ab-5a97-99c4-91c99e01493a/scratchpad/verify/evidence/V6'
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, locale: 'es-MX' })
const page = await ctx.newPage()
const log = {}
await page.goto(BASE + '/t/_/minimal4-setup/admin', { waitUntil: 'networkidle' })
await page.waitForTimeout(800)
log.url = page.url()
log.text = (await page.evaluate(() => document.body.innerText)).replace(/\n+/g, ' / ').slice(0, 1500)
log.nav = await page.evaluate(() => {
  const nav = document.querySelector('nav[aria-label]')
  if (!nav) return null
  const items = [...nav.querySelectorAll('a')].map((a) => { const b = a.getBoundingClientRect(); return { label: a.textContent, inViewport: b.left >= 0 && b.right <= window.innerWidth } })
  return { scrollWidth: nav.scrollWidth, clientWidth: nav.clientWidth, count: items.length, visible: items.filter((i) => i.inViewport).length, items }
})
log.tabs = await page.evaluate(() => {
  const tl = document.querySelector('[role=tablist]')
  if (!tl) return null
  const items = [...tl.querySelectorAll('[role=tab]')].map((b) => { const r = b.getBoundingClientRect(); return { label: b.textContent, selected: b.getAttribute('aria-selected'), inViewport: r.left >= 0 && r.right <= window.innerWidth } })
  return { scrollWidth: tl.scrollWidth, clientWidth: tl.clientWidth, items }
})
await page.screenshot({ path: `${OUT}/comite-landing-minimal4-setup-393.png` })
await page.goto(BASE + '/t/_/minimal4-setup/admin/rondas', { waitUntil: 'networkidle' })
await page.waitForTimeout(600)
log.rondasText = (await page.evaluate(() => document.body.innerText)).replace(/\n+/g, ' / ').slice(0, 800)
fs.writeFileSync(`${OUT}/comite-landing.json`, JSON.stringify(log, null, 2))
console.log(JSON.stringify(log, null, 2))
await browser.close()
