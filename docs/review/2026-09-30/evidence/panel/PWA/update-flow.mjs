import { launch } from './lib.mjs'
import fs from 'node:fs'
const SW = 'site/sw.js'
const orig = fs.readFileSync('sw.orig.js', 'utf8')
fs.writeFileSync(SW, orig)
const bump = (tag) => fs.writeFileSync(SW, orig.replace(/("index\.html",revision:")[0-9a-f]+/, `$1${tag}`))
const b = await launch()
const ctx = await b.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
const page = await ctx.newPage()
const t0 = Date.now(); const ts = () => ((Date.now() - t0) / 1000).toFixed(1) + 's'
// Log every appearance/disappearance of the update toast from inside the page.
await page.addInitScript(() => {
  let was = false
  setInterval(() => {
    const now = [...document.querySelectorAll('[role=status]')].some((e) => e.textContent.includes('versión nueva'))
    if (now !== was) { was = now; console.log('[toast]', now ? 'SHOWN' : 'GONE', Math.round(performance.now())) }
  }, 100)
})
page.on('console', (m) => { if (m.text().startsWith('[toast]')) console.log(ts(), m.text()) })
const waitingSW = () => page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration())?.waiting)
await page.goto('http://127.0.0.1:4193/t/_/full12-live/tarjeta')
await page.evaluate(() => navigator.serviceWorker.ready)
await page.reload({ waitUntil: 'load' }); await page.getByRole('button', { name: 'Guardar hoyo' }).waitFor()
await page.waitForTimeout(4000) // let workbox-window register() settle after load
console.log(ts(), 'controlled:', await page.evaluate(() => !!navigator.serviceWorker.controller), 'waiting:', await waitingSW())
// A) deploy while the page stays open; no navigation for 20 s
bump('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')
console.log(ts(), 'A. deployed; page stays open')
await page.waitForTimeout(20000)
console.log(ts(), 'A. after 20 s open: waiting SW?', await waitingSW())
// B) dirty draft, then an update check
await page.getByRole('button', { name: /: más$/ }).first().tap()
console.log(ts(), 'B. draft dirty; calling registration.update()')
await page.evaluate(async () => { await (await navigator.serviceWorker.getRegistration()).update() })
for (let i = 0; i < 60 && !(await waitingSW()); i++) await page.waitForTimeout(500)
await page.waitForTimeout(1500)
console.log(ts(), 'B. waiting SW?', await waitingSW(), '(toast should be deferred)')
await page.getByRole('button', { name: 'Guardar hoyo' }).tap()
console.log(ts(), 'C. hole saved')
await page.waitForTimeout(30000)
console.log(ts(), 'E. 30 s later; still waiting SW?', await waitingSW())
await page.getByRole('link', { name: 'Más' }).tap(); await page.waitForTimeout(1500)
console.log(ts(), 'F. version text in Más:', await page.getByText(/Versión/).first().textContent().catch(() => null))
fs.writeFileSync(SW, orig)
await b.close()
