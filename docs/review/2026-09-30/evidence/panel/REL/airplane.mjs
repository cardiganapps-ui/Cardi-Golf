// Airplane mode for nine holes, then reconnect: every queued score must reach the server.
// Nico's phone, group 3, round 2, holes 1-9: nudge players 0 and 1 (+1 or -1) on each hole.
import { readFileSync, writeFileSync } from 'node:fs'
import { launch, newPhone, E, BASE, sleep, bridgeRealtime, rest, STORAGE_KEY } from './lib.mjs'

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
await page.goto(`${BASE}/t/ensayo/tarjeta?hoyo=1`, { waitUntil: 'domcontentloaded' })
const save = page.getByRole('button', { name: /^Guardar (hoyo|y ver la tarjeta)$/ })
await save.waitFor({ timeout: 60000 })
await sleep(2000)
const order = await page.evaluate(() => [...document.querySelectorAll('[class*="playerNameText"]')].length)
await ctx.setOffline(true)
const expected = {}
for (let hole = 1; hole <= 9; hole++) {
  await page.waitForFunction((h) => document.querySelector('[class*="holeNum"]')?.textContent?.trim() === String(h), hole, { timeout: 10000 })
  for (const idx of [0, 1]) {
    const minus = page.locator('button[aria-label="Golpes: menos"]').nth(idx)
    const plus = page.locator('button[aria-label="Golpes: más"]').nth(idx)
    if ((await minus.isEnabled()) && hole % 2 === 0) await minus.click()
    else if (await plus.isEnabled()) await plus.click()
    else await page.locator('button[aria-label="Putts: más"]').nth(idx).click().catch(() => undefined)
  }
  // Values as shown in the steppers (strokes, putts) for the four players, and the pick-up state.
  expected[hole] = await page.evaluate(() =>
    [...document.querySelectorAll('[class*="controls"]')].map((c) => {
      const v = [...c.querySelectorAll('[aria-live]')].map((x) => Number(x.textContent))
      return { strokes: v[0], putts: v[1], pickedUp: c.querySelector('button[aria-pressed="true"]') != null }
    }),
  )
  await save.click()
  // Unusual values open a confirmation sheet.
  const confirm = page.getByRole('button', { name: /Sí, así fue|Confirmar|Está bien/ })
  if (await confirm.count()) await confirm.first().click().catch(() => undefined)
  await sleep(700)
}
log('queued offline:', JSON.stringify(await idb()), 'chip:', JSON.stringify(await page.locator('[class*="saveStatus"]').first().innerText().catch(() => '?')))
await page.getByRole('button', { name: 'Ver tarjeta' }).click().catch(() => undefined)
await sleep(800)
log('offline grid chip:', JSON.stringify(await page.locator('[class*="saveStatus"]').first().innerText().catch(() => '?')))
await page.screenshot({ path: `${E}/shots/airplane-offline-grid.png` })
// Reconnect.
const pushes = []
page.on('requestfinished', async (r) => {
  if (/rest\/v1\/scores/.test(r.url()) && r.method() === 'POST') pushes.push({ t: Date.now(), status: (await r.response())?.status() })
})
const t1 = Date.now()
await ctx.setOffline(false)
let drained = null
for (let i = 0; i < 1200; i++) {
  const c = await idb()
  if (c && c.items === 0) {
    drained = Date.now() - t1
    break
  }
  await sleep(100)
}
log('drained after ms:', drained, 'POSTs:', pushes.length, 'first at', pushes[0] ? pushes[0].t - t1 : null, 'last at', pushes.at(-1) ? pushes.at(-1).t - t1 : null, 'statuses:', [...new Set(pushes.map((p) => p.status))].join(','))
log('outbox now:', JSON.stringify(await idb()), 'chip:', JSON.stringify(await page.locator('[class*="saveStatus"]').first().innerText().catch(() => '?')))
// Verify the server.
const g = (await rest(`groups?round_id=eq.${R2}&number=eq.3&select=group_members(player_id)`, jwt)).body[0].group_members.map((m) => m.player_id).sort()
const rows = (await rest(`scores?round_id=eq.${R2}&hole=lte.9&player_id=in.(${g.join(',')})&select=player_id,hole,strokes,putts,picked_up`, jwt)).body
let ok = 0
const bad = []
for (let hole = 1; hole <= 9; hole++) {
  g.forEach((pid, idx) => {
    const r = rows.find((x) => x.player_id === pid && x.hole === hole)
    const e = expected[hole]?.[idx]
    const match = r && e && (e.pickedUp ? r.picked_up : r.strokes === e.strokes) && r.putts === e.putts
    if (match) ok++
    else bad.push({ hole, idx, server: r ? `${r.picked_up ? 'L' : r.strokes}/${r.putts}` : null, expected: e ? `${e.pickedUp ? 'L' : e.strokes}/${e.putts}` : null })
  })
}
log('server matches', ok, 'of', 9 * g.length, 'mismatches:', JSON.stringify(bad))
writeFileSync(`${E}/logs/airplane-${Date.now()}.json`, JSON.stringify({ expected, rows, pushes }, null, 1))
await b.close()
