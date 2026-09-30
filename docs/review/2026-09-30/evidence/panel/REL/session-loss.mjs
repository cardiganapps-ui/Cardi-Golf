// A phone whose session dies while it holds queued scores (refresh token no longer valid: revoked/reused).
// Player D (non-admin) queues a hole offline; the stored refresh token is replaced by an invalid one and the
// access token marked expired; then the signal returns. What happens to the queue and what does he see?
import { readFileSync } from 'node:fs'
import { launch, newPhone, E, sleep, bridgeRealtime, rest, STORAGE_KEY } from './lib.mjs'

const BASE = 'http://127.0.0.1:4185'
const R2 = 'a1852b80-3a0b-4148-8853-b630432dfd0e'
const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a)
const nico = JSON.parse(JSON.parse(readFileSync(`${E}/state/nico-A.json`, 'utf8')).origins.find((o) => o.origin === BASE).localStorage.find((x) => x.name === STORAGE_KEY).value).access_token
const holeRows = async () => (await rest(`scores?round_id=eq.${R2}&hole=eq.16&select=player_id,strokes,entered_by&order=player_id`, nico)).body.map((r) => `${r.player_id.slice(0, 4)}:${r.strokes}@${r.entered_by?.slice(0, 4)}`)
const idb = (page) =>
  page.evaluate(
    () =>
      new Promise((res) => {
        const req = indexedDB.open('cardi-golf-outbox')
        req.onsuccess = () => {
          const tx = req.result.transaction(['items', 'rejected'])
          const a = tx.objectStore('items').count()
          const r = tx.objectStore('rejected').count()
          tx.oncomplete = () => res({ items: a.result, rejected: r.result })
        }
        req.onerror = () => res(null)
      }),
  )
log('server hole 16 before:', JSON.stringify(await holeRows()))
const b = await launch()
const ctx = await newPhone(b, `${E}/state/playerD.json`)
await bridgeRealtime(ctx, { fixJoin: true })
const page = await ctx.newPage()
const auth = []
page.on('response', (r) => {
  if (/auth\/v1\/(token|signup|user)/.test(r.url())) auth.push(`${r.url().split('/auth/v1/')[1].split('&')[0]} ${r.status()}`)
})
await page.goto(`${BASE}/t/ensayo/tarjeta?hoyo=16`, { waitUntil: 'domcontentloaded' })
const save = page.getByRole('button', { name: /^Guardar (hoyo|y ver la tarjeta)$/ })
await save.waitFor({ timeout: 60000 })
await sleep(1500)
await ctx.setOffline(true)
await page.locator('button[aria-label="Golpes: más"]').nth(0).click()
await save.click()
await sleep(1000)
log('queued offline:', JSON.stringify(await idb(page)))
await page.evaluate((k) => {
  const s = JSON.parse(localStorage.getItem(k))
  s.expires_at = Math.floor(Date.now() / 1000) - 60
  s.refresh_token = 'rel-invalid-' + Math.random().toString(36).slice(2)
  localStorage.setItem(k, JSON.stringify(s))
}, STORAGE_KEY)
await ctx.setOffline(false)
await sleep(15000)
const hasSession = await page.evaluate((k) => localStorage.getItem(k) != null, STORAGE_KEY)
log('after reconnect: auth responses', JSON.stringify(auth), 'stored session present:', hasSession, 'outbox', JSON.stringify(await idb(page)))
const main = (await page.locator('main').first().innerText().catch(() => '')).split('\n').filter(Boolean)
const box = main.findIndex((l) => /rechazad/i.test(l))
log('Tarjeta shows rejected box:', box >= 0, 'box lines (names withheld):', JSON.stringify(box >= 0 ? main.slice(box, box + 3).map((l) => l.replace(/^[^:]+:/, '<player>:')) : []), 'buttons:', JSON.stringify(await page.locator('[class*="actions"] button').allInnerTexts()))
log('header:', JSON.stringify(await page.locator('header').first().innerText().catch(() => '?')), 'chip:', JSON.stringify(await page.locator('[class*="saveStatus"]').first().innerText().catch(() => '?')))
log('server hole 16 after:', JSON.stringify(await holeRows()))
await b.close()
