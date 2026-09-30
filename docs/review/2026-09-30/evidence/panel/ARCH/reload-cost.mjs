import { chromium } from '/home/user/Cardi-Golf/node_modules/playwright-core/index.mjs'
import fs from 'node:fs'
const E = '/tmp/claude-0/-home-user-Cardi-Golf/ba82926f-40ab-5a97-99c4-91c99e01493a/scratchpad/panel/evidence/ARCH'
const state = `${E}/ensayo-state.json` // deleted after use: holds a session token
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const ctx = await b.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, ...(fs.existsSync(state) ? { storageState: state } : {}) })
const p = await ctx.newPage()
const reqs = []
p.on('requestfinished', async (r) => {
  const u = r.url()
  if (!u.includes('supabase.co')) return
  let size = 0
  try { size = (await r.sizes()).responseBodySize } catch {}
  reqs.push({ t: Date.now(), method: r.method(), path: new URL(u).pathname + (new URL(u).search.length > 80 ? new URL(u).search.slice(0, 80) + '…' : new URL(u).search), size })
})
await p.goto('http://127.0.0.1:4173/t/ensayo', { waitUntil: 'domcontentloaded' })
const who = await Promise.race([
  p.waitForSelector('text=Elige tu nombre', { timeout: 40000 }).then(() => 'enter'),
  p.waitForSelector('text=Individual', { timeout: 40000 }).then(() => 'in'),
])
if (who === 'enter') {
  await p.click('text=Nico')
  await p.waitForSelector('input[type=password]', { timeout: 40000 })
  await p.fill('input[type=password]', '1234')
  await p.waitForSelector('text=Individual', { timeout: 40000 })
}
await ctx.storageState({ path: state })
await p.waitForTimeout(3000)
// One reload, exactly what every device runs after any realtime change (tournamentStore.reload()).
reqs.length = 0
const t0 = Date.now()
await p.evaluate(() => window.dispatchEvent(new Event('online')))
await p.waitForTimeout(6000)
const rest = reqs.filter((r) => r.path.startsWith('/rest/v1/'))
const last = rest.length ? Math.max(...rest.map((r) => r.t)) - t0 : 0
console.log(`one store reload: ${rest.length} REST requests, ${(rest.reduce((s, r) => s + r.size, 0) / 1024).toFixed(1)} KiB response bodies (uncompressed), last response +${last} ms`)
const tables = {}
for (const r of rest) { const tname = r.path.split('/')[3]?.split('?')[0]; tables[tname] = (tables[tname] ?? 0) + 1 }
console.log(JSON.stringify(tables))
fs.writeFileSync(`${E}/reload-cost.json`, JSON.stringify(rest, null, 1))
await b.close()
