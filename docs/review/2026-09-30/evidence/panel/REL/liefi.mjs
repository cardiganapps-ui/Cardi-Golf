// Lie-fi: (A) one score POST stalls (the connection is up but the response never comes) — what happens to
// the rest of the queue? (B) cold open where every Supabase request stalls — does the cached board show?
import { chromium } from 'playwright-core'
import { readFileSync, rmSync, mkdirSync } from 'node:fs'
import { CHROME, E, BASE, STORAGE_KEY, sleep, bridgeRealtime, launch, newPhone } from './lib.mjs'

const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a)
const st = JSON.parse(readFileSync(`${E}/state/nico-A.json`, 'utf8'))
const sess = st.origins.find((o) => o.origin === BASE).localStorage.find((x) => x.name === STORAGE_KEY).value
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

// ---- A: one stalled POST ----
const b = await launch()
const ctx = await newPhone(b, `${E}/state/nico-A.json`)
await bridgeRealtime(ctx, { fixJoin: true })
const page = await ctx.newPage()
await page.goto(`${BASE}/t/ensayo/tarjeta?hoyo=15`, { waitUntil: 'domcontentloaded' })
const save = page.getByRole('button', { name: /^Guardar (hoyo|y ver la tarjeta)$/ })
await save.waitFor({ timeout: 60000 })
await sleep(1500)
let held = null
let heldOnce = false
await ctx.route('**/rest/v1/scores**', async (route) => {
  if (route.request().method() === 'POST' && !heldOnce) {
    heldOnce = true
    held = route
    return // never answer (until released)
  }
  return route.continue()
})
const tA = Date.now()
for (const hole of [15, 16]) {
  await page.waitForFunction((h) => document.querySelector('[class*="holeNum"]')?.textContent?.trim() === String(h), hole, { timeout: 15000 })
  const cur = Number(await page.locator('[class*="controls"]').nth(0).locator('[aria-live]').first().textContent())
  await page.locator(`button[aria-label="Golpes: ${cur >= 6 ? 'menos' : 'más'}"]`).nth(0).click()
  await save.click()
  const sure = page.getByRole('button', { name: 'Sí, así fue' })
  if (await sure.count()) await sure.click().catch(() => undefined)
  await sleep(600)
}
const samples = []
for (let s = 0; s < 60; s += 10) {
  samples.push({ s, outbox: await idb(page), chip: await page.locator('[class*="saveStatus"]').first().innerText().catch(() => '?') })
  // the app's own nudges: online + visibility events
  await page.evaluate(() => {
    dispatchEvent(new Event('online'))
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await sleep(10000)
}
log('A: one stalled POST, 60 s:', JSON.stringify(samples))
await held?.continue().catch(() => undefined)
let drained = null
const tR = Date.now()
for (let i = 0; i < 120; i++) {
  if ((await idb(page)) === 0) {
    drained = Date.now() - tR
    break
  }
  await sleep(250)
}
log('A: after releasing the stalled request, drained in ms:', drained, 'total since first save', Date.now() - tA)
await b.close()

// ---- B: cold open on lie-fi ----
const dir = `${E}/profiles/liefi`
rmSync(dir, { recursive: true, force: true })
mkdirSync(dir, { recursive: true })
let pc = await chromium.launchPersistentContext(dir, { executablePath: CHROME, viewport: { width: 393, height: 852 }, deviceScaleFactor: 2 })
await bridgeRealtime(pc, { fixJoin: true })
let p = pc.pages()[0] ?? (await pc.newPage())
await p.goto(`${BASE}/fixture`, { waitUntil: 'domcontentloaded' })
await p.evaluate(([k, v]) => localStorage.setItem(k, v), [STORAGE_KEY, sess])
await p.goto(`${BASE}/t/ensayo`, { waitUntil: 'domcontentloaded' })
await p.waitForSelector('text=Individual', { timeout: 60000 })
await p.evaluate(() => navigator.serviceWorker.ready)
await sleep(3000)
await pc.close()
pc = await chromium.launchPersistentContext(dir, { executablePath: CHROME, viewport: { width: 393, height: 852 }, deviceScaleFactor: 2 })
await bridgeRealtime(pc, { block: () => true })
await pc.route('https://*.supabase.co/**', () => undefined) // connected, but nothing ever answers
p = pc.pages()[0] ?? (await pc.newPage())
const t0 = Date.now()
await p.goto(`${BASE}/t/ensayo`, { waitUntil: 'domcontentloaded' })
let shown = null
const seen = new Set()
for (let i = 0; i < 90; i++) {
  const txt = (await p.locator('body').innerText().catch(() => '')).split('\n').filter(Boolean).slice(0, 3).join(' | ')
  seen.add(txt.slice(0, 120))
  if ((await p.locator('text=Individual').count()) > 0) {
    shown = Date.now() - t0
    break
  }
  await sleep(1000)
}
log('B: lie-fi cold open (valid token, SW + cache present): board shown after ms:', shown, '(90 s window); screens seen:', JSON.stringify([...seen]))
await p.screenshot({ path: `${E}/shots/liefi-cold-open.png` })
await pc.close()
