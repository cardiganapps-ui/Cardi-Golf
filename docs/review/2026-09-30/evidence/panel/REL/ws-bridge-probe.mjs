import { launch, newPhone, E, BASE, sleep, bridgeRealtime } from './lib.mjs'
const b = await launch()
const ctx = await newPhone(b, `${E}/state/nico-A.json`)
const log = []
await bridgeRealtime(ctx, { log: (x) => log.push(x) })
const page = await ctx.newPage()
const t0 = Date.now()
await page.goto(`${BASE}/t/ensayo`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('text=Individual', { timeout: 40000 })
await sleep(6000)
console.log('HEADER:', JSON.stringify(await page.locator('header').first().innerText()))
for (const [t, d, s] of log) if (!/heartbeat/.test(s)) console.log(t - t0, d, s)
await b.close()
