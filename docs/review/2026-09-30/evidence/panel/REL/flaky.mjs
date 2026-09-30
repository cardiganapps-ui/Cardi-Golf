// Flaky network: abort every other Supabase REST/RPC request (or a random share). Measures outbox drain,
// what the chip says, and whether the board can refresh at all (the snapshot is ~22 requests, all-or-nothing).
// usage: node flaky.mjs <alternate|random10>
import { readFileSync, writeFileSync } from 'node:fs'
import { launch, newPhone, E, BASE, sleep, bridgeRealtime, rest, SB_URL, ANON, STORAGE_KEY } from './lib.mjs'

const MODE = process.argv[2] ?? 'alternate'
const R2 = 'a1852b80-3a0b-4148-8853-b630432dfd0e'
const jwt = JSON.parse(JSON.parse(readFileSync(`${E}/state/nico-A.json`, 'utf8')).origins.find((o) => o.origin === BASE).localStorage.find((x) => x.name === STORAGE_KEY).value).access_token
const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a)
const b = await launch()
const ctx = await newPhone(b, `${E}/state/nico-A.json`)
await bridgeRealtime(ctx, { fixJoin: true })
const page = await ctx.newPage()
const idb = () =>
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
await page.goto(`${BASE}/t/ensayo/tarjeta?hoyo=5`, { waitUntil: 'domcontentloaded' })
const save = page.getByRole('button', { name: /^Guardar (hoyo|y ver la tarjeta)$/ })
await save.waitFor({ timeout: 60000 })
await sleep(2000)
let n = 0
const stats = { aborted: 0, passed: 0, abortedPosts: 0, passedPosts: 0 }
let flaky = true
await ctx.route('**/rest/v1/**', async (route) => {
  if (!flaky) return route.continue()
  n++
  const drop = MODE === 'alternate' ? n % 2 === 1 : Math.random() < 0.1
  const post = route.request().method() === 'POST'
  if (drop) {
    stats.aborted++
    if (post) stats.abortedPosts++
    return route.abort('connectionreset')
  }
  stats.passed++
  if (post) stats.passedPosts++
  return route.continue()
})
// (a) Outbox under loss: save holes 5, 6, 7.
const chips = new Set()
const t0 = Date.now()
for (let hole = 5; hole <= 7; hole++) {
  await page.waitForFunction((h) => document.querySelector('[class*="holeNum"]')?.textContent?.trim() === String(h), hole, { timeout: 15000 })
  const cur = Number(await page.locator('[class*="controls"]').nth(2).locator('[aria-live]').first().textContent())
  await page.locator(`button[aria-label="Golpes: ${cur >= 7 ? 'menos' : 'más'}"]`).nth(2).click()
  await save.click()
  const sure = page.getByRole('button', { name: 'Sí, así fue' })
  if (await sure.count()) await sure.click().catch(() => undefined)
  await sleep(400)
  chips.add(await page.locator('[class*="saveStatus"]').first().innerText().catch(() => '?'))
}
let drained = null
for (let i = 0; i < 1200; i++) {
  const c = await idb()
  chips.add(await page.locator('[class*="saveStatus"]').first().innerText().catch(() => '?'))
  if (c && c.items === 0) {
    drained = Date.now() - t0
    break
  }
  await sleep(250)
}
log(MODE, 'outbox drained after ms:', drained, 'outbox', JSON.stringify(await idb()), 'chips seen:', JSON.stringify([...chips]), 'stats', JSON.stringify(stats))
// (b) Board freshness under loss: another device changes hole 8 (player idx 3); does this phone ever show it?
const g = (await rest(`groups?round_id=eq.${R2}&number=eq.3&select=group_members(player_id)`, jwt)).body[0].group_members.map((m) => m.player_id).sort()
const row = (await rest(`scores?round_id=eq.${R2}&hole=eq.8&player_id=eq.${g[3]}&select=strokes,putts,picked_up,entered_by`, jwt)).body[0]
await page.getByRole('button', { name: 'Ver tarjeta' }).click().catch(() => undefined)
await page.waitForSelector('table', { timeout: 15000 })
const cell = () => page.evaluate(() => {
  const tr = [...document.querySelectorAll('table tr')].find((x) => x.querySelector('td button')?.textContent?.trim() === '8')
  return tr ? tr.querySelectorAll('td')[6]?.textContent?.trim() : null
})
const before = await cell()
const reloadsBefore = { ...stats }
const tChange = Date.now()
const w = await fetch(`${SB_URL}/rest/v1/scores?on_conflict=round_id,player_id,hole`, {
  method: 'POST',
  headers: { apikey: ANON, Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
  body: JSON.stringify({ round_id: R2, player_id: g[3], hole: 8, strokes: row.strokes + 1, putts: row.putts, picked_up: row.picked_up, entered_by: row.entered_by, client_ts: new Date().toISOString() }),
})
log('remote change status', w.status, 'cell before', before)
let seenAt = null
for (let i = 0; i < 60; i++) {
  if ((await cell()) !== before) {
    seenAt = Date.now() - tChange
    break
  }
  if (i % 5 === 4) await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
  await sleep(1000)
}
log(MODE, 'remote change visible after ms:', seenAt, '(60 s window, a visibilitychange every 5 s); requests during window aborted/passed:', stats.aborted - reloadsBefore.aborted, stats.passed - reloadsBefore.passed)
log('header during loss:', JSON.stringify(await page.locator('header').first().innerText()), 'chip:', JSON.stringify(await page.locator('[class*="saveStatus"]').first().innerText().catch(() => '?')))
// (c) Loss ends: does the board catch up by itself?
flaky = false
const tEnd = Date.now()
let caught = null
for (let i = 0; i < 20; i++) {
  if ((await cell()) !== before) {
    caught = Date.now() - tEnd
    break
  }
  await sleep(1000)
}
log(MODE, 'after loss ends, board caught up by itself after ms:', caught, '(20 s window, no events)')
// Put hole 8 back.
await fetch(`${SB_URL}/rest/v1/scores?on_conflict=round_id,player_id,hole`, {
  method: 'POST',
  headers: { apikey: ANON, Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
  body: JSON.stringify({ round_id: R2, player_id: g[3], hole: 8, strokes: row.strokes, putts: row.putts, picked_up: row.picked_up, entered_by: row.entered_by, client_ts: new Date().toISOString() }),
})
writeFileSync(`${E}/logs/flaky-${MODE}-${Date.now()}.json`, JSON.stringify({ stats, chips: [...chips], drained, seenAt, caught }, null, 1))
await b.close()
