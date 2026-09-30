// "A phone closed for two days": persistent profile (SW, IndexedDB, localStorage survive), a hole queued
// offline, then the clock-sensitive state aged by 2 days (access token expiry, outbox createdAt, cached
// snapshot savedAt). Reopen with no signal, then reconnect. Saves the refreshed Nico session at the end.
// usage: node two-days.mjs <hole>
import { chromium } from 'playwright-core'
import { readFileSync, writeFileSync, rmSync, mkdirSync } from 'node:fs'
import { CHROME, E, BASE, STORAGE_KEY, sleep, bridgeRealtime, rest } from './lib.mjs'

const HOLE = Number(process.argv[2] ?? 16)
const dir = `${E}/profiles/twodays`
rmSync(dir, { recursive: true, force: true })
mkdirSync(dir, { recursive: true })
const st = JSON.parse(readFileSync(`${E}/state/nico-A.json`, 'utf8'))
const sessVal = st.origins.find((o) => o.origin === BASE).localStorage.find((x) => x.name === STORAGE_KEY).value
const shots = `${E}/shots`
const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a)
const open = async () => {
  const ctx = await chromium.launchPersistentContext(dir, { executablePath: CHROME, viewport: { width: 393, height: 852 }, deviceScaleFactor: 2 })
  await bridgeRealtime(ctx, { fixJoin: false })
  return ctx
}

// Phase 1: online visit, then queue a hole offline.
let ctx = await open()
let page = ctx.pages()[0] ?? (await ctx.newPage())
await page.goto(`${BASE}/fixture`, { waitUntil: 'domcontentloaded' })
await page.evaluate(([k, v]) => localStorage.setItem(k, v), [STORAGE_KEY, sessVal])
await page.goto(`${BASE}/t/ensayo`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('text=Individual', { timeout: 60000 })
await page.evaluate(() => navigator.serviceWorker.ready)
await sleep(4000)
log('phase1 SW controller:', await page.evaluate(() => !!navigator.serviceWorker.controller))
await page.goto(`${BASE}/t/ensayo/tarjeta?hoyo=${HOLE}`, { waitUntil: 'domcontentloaded' })
await page.getByRole('button', { name: /^Guardar (hoyo|y ver la tarjeta)$/ }).waitFor({ timeout: 60000 })
await sleep(1500)
await ctx.setOffline(true)
await page.locator('button[aria-label="Golpes: más"]').nth(1).click()
const queuedStrokes = await page.locator('[class*="player"]').nth(1).innerText()
await page.getByRole('button', { name: /^Guardar (hoyo|y ver la tarjeta)$/ }).click()
await sleep(1500)
const chip1 = await page.locator('[class*="saveStatus"]').first().innerText().catch(() => '?')
log('phase1 queued offline; chip:', JSON.stringify(chip1))
// Age everything by two days.
const TWO_DAYS = 2 * 24 * 3600 * 1000
await page.evaluate(
  async ([k, ms]) => {
    const s = JSON.parse(localStorage.getItem(k))
    s.expires_at = Math.floor((Date.now() - ms) / 1000) + 3600
    localStorage.setItem(k, JSON.stringify(s))
    const age = (name, store, field) =>
      new Promise((res) => {
        const req = indexedDB.open(name)
        req.onsuccess = () => {
          const db = req.result
          const tx = db.transaction(store, 'readwrite')
          const os = tx.objectStore(store)
          os.openCursor().onsuccess = (e) => {
            const c = e.target.result
            if (!c) return
            const v = c.value
            v[field] = v[field] - ms
            c.update(v)
            c.continue()
          }
          tx.oncomplete = () => res(true)
          tx.onerror = () => res(false)
        }
        req.onerror = () => res(false)
      })
    return [await age('cardi-golf-outbox', 'items', 'createdAt'), await age('cardi-golf-cache', 'snapshots', 'savedAt'), await age('cardi-golf-cache', 'entries', 'savedAt')]
  },
  [STORAGE_KEY, TWO_DAYS],
)
const outboxCount = await page.evaluate(
  () =>
    new Promise((res) => {
      const req = indexedDB.open('cardi-golf-outbox')
      req.onsuccess = () => {
        const c = req.result.transaction('items').objectStore('items').count()
        c.onsuccess = () => res(c.result)
      }
    }),
)
log('phase1 outbox items in IndexedDB:', outboxCount)
await ctx.close()

// Phase 2a: reopen with no signal.
ctx = await open()
await ctx.setOffline(true)
page = ctx.pages()[0] ?? (await ctx.newPage())
const tokenReqs = []
page.on('request', (r) => {
  if (/auth\/v1\/token/.test(r.url())) tokenReqs.push({ t: Date.now(), url: r.url().split('?')[1] })
})
const t0 = Date.now()
let navErr = null
await page.goto(`${BASE}/t/ensayo`, { waitUntil: 'domcontentloaded' }).catch((e) => (navErr = e.message.slice(0, 120)))
log('phase2a navigation error:', navErr)
let shownAt = null
for (let i = 0; i < 300; i++) {
  if ((await page.locator('text=Individual').count()) > 0) {
    shownAt = Date.now() - t0
    break
  }
  await sleep(100)
}
log('phase2a board visible after ms:', shownAt)
await sleep(1500)
const hdr = await page.locator('header').first().innerText().catch(() => '?')
const status = await page.locator('main').first().innerText().catch(() => '?')
log('phase2a header:', JSON.stringify(hdr))
log('phase2a live status line:', JSON.stringify(status.split('\n').slice(0, 6)))
await page.screenshot({ path: `${shots}/twodays-offline-open.png` })
await page.goto(`${BASE}/t/ensayo/tarjeta?hoyo=${HOLE}`, { waitUntil: 'domcontentloaded' }).catch(() => undefined)
await sleep(2500)
const chip2 = await page.locator('[class*="saveStatus"]').first().innerText().catch(() => '?')
log('phase2a tarjeta chip:', JSON.stringify(chip2))
await page.screenshot({ path: `${shots}/twodays-offline-tarjeta.png` })

// Phase 2b: signal returns.
const t1 = Date.now()
const pushes = []
page.on('requestfinished', async (r) => {
  if (/rest\/v1\/scores/.test(r.url()) && r.method() === 'POST') pushes.push({ t: Date.now() - t1, status: (await r.response())?.status() })
})
await ctx.setOffline(false)
let drained = null
for (let i = 0; i < 600; i++) {
  const c = await page.locator('[class*="saveStatus"]').first().innerText().catch(() => '')
  if (/Sincronizado/.test(c)) {
    drained = Date.now() - t1
    break
  }
  await sleep(100)
}
log('phase2b chip «Sincronizado» after ms:', drained, 'pushes:', JSON.stringify(pushes), 'token requests:', JSON.stringify(tokenReqs.map((x) => ({ ms: x.t - t0, grant: x.url }))))
// Watch the header and the snapshot/gate requests for 75 s after the signal came back.
const reqs = []
page.on('request', (r) => {
  const u = r.url()
  if (/rest\/v1\/(tournaments\?|rpc\/lookup_tournament|rpc\/my_membership)/.test(u)) reqs.push({ ms: Date.now() - t1, what: u.split('/rest/v1/')[1].split('?')[0] })
})
let lastHdr = ''
for (let i = 0; i < 75; i++) {
  const h = await page.locator('header').first().innerText().catch(() => '?')
  if (h !== lastHdr) {
    log(`phase2b +${Date.now() - t1} ms header:`, JSON.stringify(h))
    lastHdr = h
  }
  await sleep(1000)
}
log('phase2b gate/snapshot requests after reconnect:', JSON.stringify(reqs))
await page.goto(`${BASE}/t/ensayo`, { waitUntil: 'domcontentloaded' }).catch(() => undefined)
await sleep(3000)
log('phase2b after in-app navigation to En vivo, header:', JSON.stringify(await page.locator('header').first().innerText().catch(() => '?')), 'status:', JSON.stringify((await page.locator('main').first().innerText().catch(() => '?')).split('\n').slice(2, 5)))
await page.screenshot({ path: `${shots}/twodays-reconnected-tarjeta.png` })
// Save the refreshed session for later experiments (never printed).
const fresh = await page.evaluate((k) => localStorage.getItem(k), STORAGE_KEY)
const s = JSON.parse(fresh)
log('session now expires', new Date(s.expires_at * 1000).toISOString(), 'same user', s.user?.id?.slice(0, 8))
st.origins.find((o) => o.origin === BASE).localStorage.find((x) => x.name === STORAGE_KEY).value = fresh
writeFileSync(`${E}/state/nico-A.json`, JSON.stringify(st))
// Server truth for the hole.
const r = await rest(`scores?select=player_id,hole,strokes,putts,client_ts&hole=eq.${HOLE}&round_id=eq.a1852b80-3a0b-4148-8853-b630432dfd0e`, s.access_token)
log('server rows (first two players):', JSON.stringify(r.body).slice(0, 400), 'queued second player strokes line:', JSON.stringify(queuedStrokes.split('\n').slice(0, 3)))
await ctx.close()
