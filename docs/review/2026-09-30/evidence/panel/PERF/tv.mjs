// TV screen: cost of the 12 s board rotation over 60 s at 4x CPU (fixture, instrumented build).
import { writeFileSync } from 'node:fs'
import { launch, sleep, load, cdpMetrics, diffMetrics, HOOK_SCRIPT, E } from './perf-lib.mjs'
const fixture = process.argv[2] ?? 'full12-live'
const b = await launch()
const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, serviceWorkers: 'block' })
await ctx.addInitScript(HOOK_SCRIPT)
await ctx.route(/supabase\.co/, (r) => r.abort())
const page = await ctx.newPage()
const cdp = await ctx.newCDPSession(page)
await cdp.send('Performance.enable')
await page.goto(`http://127.0.0.1:4186/t/_/${fixture}/tv`, { waitUntil: 'load' })
await page.waitForFunction(() => window.__perfStore?.getState().data, null, { timeout: 30000 })
await sleep(3000)
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
await page.evaluate(() => window.__RCreset())
const m0 = await cdpMetrics(cdp)
await sleep(60500)
const m1 = await cdpMetrics(cdp)
const rc = await page.evaluate(() => JSON.parse(JSON.stringify(window.__RC)))
const out = { fixture, load: load(), windowSec: 60.5, commits: rc.commits, rendered: rc.nRendered, mounted: rc.nMounted, dom: rc.mutations, cdp: diffMetrics(m0, m1), topMounted: Object.entries(rc.mounted).sort((a, b) => b[1] - a[1]).slice(0, 8) }
writeFileSync(`${E}/tv-${fixture}-${Date.now()}.json`, JSON.stringify(out, null, 2))
console.log(JSON.stringify(out))
await b.close()
