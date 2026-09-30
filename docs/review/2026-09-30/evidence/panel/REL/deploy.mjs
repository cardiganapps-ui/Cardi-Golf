// A deploy lands mid-round. Own server :4185 serves deploy/current (build1 → build2 with a new index.html
// revision and renamed main + Stats chunks). Part 1: SW-controlled installed-app flow with an unsaved hole
// and queued writes. Part 2: a page with no service worker (in-app browser) navigating to a lazy route.
import { chromium } from 'playwright-core'
import { readFileSync, rmSync, mkdirSync, symlinkSync, unlinkSync } from 'node:fs'
import { CHROME, E, STORAGE_KEY, sleep, bridgeRealtime, launch } from './lib.mjs'

const ORIGIN = 'http://127.0.0.1:4185'
const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a)
const sw = (to) => {
  try { unlinkSync(`${E}/deploy/current`) } catch {}
  symlinkSync(to, `${E}/deploy/current`)
}
const st = JSON.parse(readFileSync(`${E}/state/nico-A.json`, 'utf8'))
const sess = st.origins.find((o) => o.origin === 'http://127.0.0.1:4173').localStorage.find((x) => x.name === STORAGE_KEY).value
const toasts = async (page) => page.evaluate(() => [...document.querySelectorAll('[role="status"]')].map((x) => x.textContent.trim()).filter(Boolean))
const idb = (page) =>
  page.evaluate(
    () =>
      new Promise((res) => {
        const req = indexedDB.open('cardi-golf-outbox')
        req.onsuccess = () => {
          try {
            const tx = req.result.transaction(['items'])
            const a = tx.objectStore('items').count()
            tx.oncomplete = () => res(a.result)
          } catch {
            res(null)
          }
        }
        req.onerror = () => res(null)
      }),
  )
const build = (page) => page.evaluate(() => document.querySelector('meta[name="rel-build"]')?.getAttribute('content') ?? '1')

// ---------- Part 1 ----------
sw('build1')
const dir = `${E}/profiles/deploy`
rmSync(dir, { recursive: true, force: true })
mkdirSync(dir, { recursive: true })
let ctx = await chromium.launchPersistentContext(dir, { executablePath: CHROME, viewport: { width: 393, height: 852 }, deviceScaleFactor: 2 })
await bridgeRealtime(ctx, { fixJoin: true })
let page = ctx.pages()[0] ?? (await ctx.newPage())
await page.goto(`${ORIGIN}/fixture`, { waitUntil: 'domcontentloaded' })
await page.evaluate(([k, v]) => localStorage.setItem(k, v), [STORAGE_KEY, sess])
await page.goto(`${ORIGIN}/t/ensayo`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('text=Individual', { timeout: 60000 })
await page.evaluate(() => navigator.serviceWorker.ready)
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForSelector('text=Individual', { timeout: 60000 })
log('part1 build', await build(page), 'controlled', await page.evaluate(() => !!navigator.serviceWorker.controller))
await page.goto(`${ORIGIN}/t/ensayo/tarjeta?hoyo=17`, { waitUntil: 'domcontentloaded' })
const save = page.getByRole('button', { name: /^Guardar (hoyo|y ver la tarjeta)$/ })
await save.waitFor({ timeout: 60000 })
await sleep(1500)
await page.locator('button[aria-label="Golpes: más"]').nth(3).click() // unsaved hole: editing = true
// Deploy.
sw('build2')
const tDeploy = Date.now()
// An SPA never navigates, so nothing checks for a new SW by itself; wait 20 s to see.
await sleep(20000)
log('part1 20 s after deploy without a navigation: waiting SW?', await page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration())?.waiting), 'toasts', JSON.stringify(await toasts(page)))
// Force the check a navigation (or the 24 h timer) would do.
await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.update())
for (let i = 0; i < 60; i++) {
  if (await page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration())?.waiting)) break
  await sleep(500)
}
log('part1 update found; waiting SW:', await page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration())?.waiting), 'toasts while the hole is dirty:', JSON.stringify(await toasts(page)), 'still build', await build(page))
// Save the hole offline (queued), which releases the deferred offer.
await ctx.setOffline(true)
await save.click()
const sure = page.getByRole('button', { name: 'Sí, así fue' })
if (await sure.count()) await sure.click().catch(() => undefined)
await sleep(800)
const t2 = Date.now()
log('part1 after save: outbox', await idb(page), 'toasts', JSON.stringify(await toasts(page)))
let goneAt = null
for (let i = 0; i < 40; i++) {
  const ts = await toasts(page)
  if (!ts.some((x) => /versión nueva/.test(x))) {
    goneAt = Date.now() - t2
    break
  }
  await sleep(250)
}
log('part1 «versión nueva» toast disappeared after ms:', goneAt, '— any other update affordance later?', JSON.stringify(await toasts(page)))
await page.goto(`${ORIGIN}/t/ensayo/juegos`, { waitUntil: 'commit' }).catch(() => undefined) // in-app nav would not reload; this is a full nav to see what loads
await sleep(3000)
log('part1 after a full navigation while the old SW still controls: build', await build(page), 'outbox', await idb(page), 'toasts', JSON.stringify(await toasts(page)))
await ctx.close()
// App killed and reopened (all clients closed → the waiting SW may activate).
ctx = await chromium.launchPersistentContext(dir, { executablePath: CHROME, viewport: { width: 393, height: 852 }, deviceScaleFactor: 2 })
await bridgeRealtime(ctx, { fixJoin: true })
await ctx.setOffline(true)
page = ctx.pages()[0] ?? (await ctx.newPage())
await page.goto(`${ORIGIN}/t/ensayo/tarjeta`, { waitUntil: 'domcontentloaded' }).catch((e) => log('reopen nav error', e.message.slice(0, 80)))
await sleep(12000)
log('part1 reopened offline: build', await build(page), 'outbox', await idb(page), 'main text', JSON.stringify((await page.locator('main').first().innerText().catch(() => '')).split('\n').slice(0, 3)))
await ctx.setOffline(false)
for (let i = 0; i < 80; i++) {
  if ((await idb(page)) === 0) break
  await sleep(500)
}
log('part1 back online: outbox', await idb(page), 'build', await build(page))
await ctx.close()

// ---------- Part 2: no service worker (in-app browser) ----------
sw('build1')
const b = await launch()
const c2 = await b.newContext({ serviceWorkers: 'block', viewport: { width: 393, height: 852 }, deviceScaleFactor: 2 })
await bridgeRealtime(c2, { fixJoin: true })
const p2 = await c2.newPage()
const errs = []
p2.on('pageerror', (e) => errs.push(String(e).slice(0, 160)))
p2.on('console', (m) => m.type() === 'error' && errs.push(m.text().slice(0, 160)))
await p2.goto(`${ORIGIN}/fixture`, { waitUntil: 'domcontentloaded' })
await p2.evaluate(([k, v]) => localStorage.setItem(k, v), [STORAGE_KEY, sess])
await p2.goto(`${ORIGIN}/t/ensayo`, { waitUntil: 'domcontentloaded' })
await p2.waitForSelector('text=Individual', { timeout: 60000 })
sw('build2')
await sleep(500)
await p2.evaluate(() => {
  history.pushState({}, '', '/t/ensayo/stats')
  dispatchEvent(new PopStateEvent('popstate'))
})
await sleep(5000)
log('part2 (no SW) in-app nav to Estadísticas after the deploy:', JSON.stringify((await p2.locator('body').innerText()).split('\n').filter(Boolean).slice(0, 6)), 'errors:', JSON.stringify(errs.slice(-3)))
await p2.screenshot({ path: `${E}/shots/deploy-nosw-stats.png` })
await b.close()
sw('build1')
