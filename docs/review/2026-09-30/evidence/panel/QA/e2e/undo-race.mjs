// QA probe (Ensayo only): tap «Deshacer» while the hole's first write is still on its way.
// Expected: the server ends with the pre-save value. Restores the hole afterwards.
import { chromium } from 'playwright-core'
import fs from 'node:fs'
const out = process.argv[2]
const base = 'http://127.0.0.1:4173', slug = 'ensayo'
const HOLD_MS = Number(process.env.HOLD_MS ?? 7000)
const log = (...a) => { const line = `[${new Date().toISOString().slice(11, 23)}] ` + a.join(' '); console.log(line); fs.appendFileSync(`${out}/undo-race.log`, line + '\n') }
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const statePath = `${out}/storage.json`
const ctx = await b.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, ...(fs.existsSync(statePath) ? { storageState: statePath } : {}) })
const p = await ctx.newPage()
const posts = []
p.on('request', (r) => { if (r.url().includes('/rest/v1/scores') && r.method() === 'POST') { try { const j = JSON.parse(r.postData()); posts.push(j); log('POST sent', JSON.stringify({ player: j.player_id.slice(0, 8), hole: j.hole, strokes: j.strokes })) } catch {} } })
p.on('response', (r) => { if (r.url().includes('/rest/v1/scores') && r.request().method() === 'POST') log('POST done', r.status()) })
const T = 45000
await p.goto(`${base}/t/${slug}`, { waitUntil: 'domcontentloaded' })
const who = await Promise.race([p.waitForSelector('text=Elige tu nombre', { timeout: T }).then(() => 'grid'), p.waitForSelector('text=Individual', { timeout: T }).then(() => 'in')])
if (who === 'grid') {
  await p.click('text=Nico')
  await p.waitForSelector('input[type=password]', { timeout: T })
  await p.fill('input[type=password]', '1234')
  await p.waitForSelector('text=Individual', { timeout: T })
  await ctx.storageState({ path: statePath })
}
log('entered as Nico')
const readHole = async () => {
  await p.goto(`${base}/t/${slug}/tarjeta?hoyo=1`, { waitUntil: 'domcontentloaded' })
  await p.locator('button', { hasText: /^Guardar (hoyo|y ver la tarjeta)$/ }).first().waitFor({ timeout: T })
  await p.waitForTimeout(1500)
  const names = await p.locator('[class*="playerNameText"]').allInnerTexts()
  const strokes = await p.locator('[role=group][aria-label="Golpes"] [class*="stepValue"]').allInnerTexts()
  return { names, strokes: strokes.map(Number) }
}
const before = await readHole()
log('hole 1 before:', JSON.stringify(before))
// Slow network for the first score write only.
let held = 0
await p.route('**/rest/v1/scores**', async (route) => {
  if (route.request().method() === 'POST' && held === 0) { held++; log(`holding the first score POST for ${HOLD_MS} ms`); await new Promise((r) => setTimeout(r, HOLD_MS)) }
  await route.continue()
})
const minus = p.locator('button[aria-label="Golpes: menos"]').first()
const changed = (await minus.isEnabled()) ? before.strokes[0] - 1 : before.strokes[0] + 1
if (changed < before.strokes[0]) await minus.click(); else await p.locator('button[aria-label="Golpes: más"]').first().click()
log(`changed ${before.names[0]}: ${before.strokes[0]} → ${changed}; tapping Guardar`)
await p.locator('button', { hasText: /^Guardar (hoyo|y ver la tarjeta)$/ }).first().click()
const undoBtn = p.locator('button', { hasText: /^Deshacer$/ })
await undoBtn.waitFor({ timeout: 5000 })
await p.waitForTimeout(800)
log('tapping Deshacer (the first write is still on its way)')
await undoBtn.click()
await p.waitForTimeout(500)
await p.screenshot({ path: `${out}/after-undo-tap.png` })
// Let everything drain.
await p.waitForTimeout(HOLD_MS + 6000)
for (let i = 0; i < 30 && (await p.locator('text=Sincronizado').count()) === 0; i++) await p.waitForTimeout(1000)
log('sync chip:', (await p.locator('text=Sincronizado').count()) ? 'Sincronizado' : 'not synced')
await p.unroute('**/rest/v1/scores**')
const after = await readHole()
log('hole 1 after reload:', JSON.stringify(after))
await p.screenshot({ path: `${out}/after-reload.png` })
const lost = after.strokes[0] !== before.strokes[0]
log(lost ? `UNDO LOST: server keeps ${after.strokes[0]} for ${before.names[0]} (expected ${before.strokes[0]})` : 'undo held')
// Restore the hole as found.
if (lost) {
  const btn = after.strokes[0] > before.strokes[0] ? p.locator('button[aria-label="Golpes: menos"]').first() : p.locator('button[aria-label="Golpes: más"]').first()
  for (let i = 0; i < Math.abs(after.strokes[0] - before.strokes[0]); i++) await btn.click()
  await p.locator('button', { hasText: /^Guardar (hoyo|y ver la tarjeta)$/ }).first().click()
  await p.waitForTimeout(4000)
  const restored = await readHole()
  log('restored:', JSON.stringify(restored), JSON.stringify(restored.strokes) === JSON.stringify(before.strokes) ? 'OK (as found)' : 'MISMATCH')
}
await b.close()
