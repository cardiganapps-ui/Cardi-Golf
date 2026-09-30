// Ensayo on production: (1) warm open waterfall on throttled 4G + 4x CPU for a returning player;
// (2) cost of one snapshot reload (the path every Realtime event takes): requests, bytes, waves, main-thread time.
// usage: node ensayo-net.mjs [reloads=5] [base=https://golf.cardigan.mx]
import { writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { launch, sleep, load, cdpMetrics, diffMetrics, E } from './perf-lib.mjs'

const N = Number(process.argv[2] ?? 5)
const BASE = process.argv[3] ?? 'https://golf.cardigan.mx'
mkdirSync(`${E}/state`, { recursive: true })
const statePath = `${E}/state/nico-perf-${new URL(BASE).host.replace(/[:.]/g, '_')}.json`
const b = await launch()
const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2, serviceWorkers: 'block', ...(existsSync(statePath) ? { storageState: statePath } : {}) })
const page = await ctx.newPage()
const out = { base: BASE, loadBefore: load(), open: null, reloads: [] }
if (!existsSync(statePath)) {
  await page.goto(`${BASE}/t/ensayo`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('text=Elige tu nombre', { timeout: 60000 })
  await page.click('text=Nico')
  await page.waitForSelector('input[type=password]', { timeout: 30000 })
  await page.fill('input[type=password]', '1234')
  await page.waitForSelector('text=Individual', { timeout: 60000 })
  await ctx.storageState({ path: statePath })
  console.log('claimed Nico once; state saved')
}
// Warm the HTTP cache (immutable assets) like a returning phone.
await page.goto(`${BASE}/t/ensayo`, { waitUntil: 'load' })
await page.waitForSelector('text=Individual', { timeout: 60000 })
await sleep(2000)

const cdp = await ctx.newCDPSession(page)
await cdp.send('Network.enable')
await cdp.send('Performance.enable')
const reqs = new Map()
cdp.on('Network.requestWillBeSent', (e) => reqs.set(e.requestId, { url: e.request.url, method: e.request.method, start: e.timestamp, type: e.type }))
cdp.on('Network.responseReceived', (e) => { const r = reqs.get(e.requestId); if (r) { r.status = e.response.status; r.fromCache = e.response.fromDiskCache || e.response.fromServiceWorker } })
cdp.on('Network.loadingFinished', (e) => { const r = reqs.get(e.requestId); if (r) { r.end = e.timestamp; r.bytes = e.encodedDataLength } })
const short = (u) => u.replace(/^https:\/\/[^/]+/, '').replace(/\?.*$/, '').replace('/rest/v1/', 'rest:').replace('/auth/v1/', 'auth:')

// (1) Warm open on 4G (150 ms RTT, 1.6/0.75 Mbps) + 4x CPU.
await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.6e6 / 8, uploadThroughput: 750e3 / 8 })
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
reqs.clear()
const t0 = Date.now()
await page.goto(`${BASE}/t/ensayo`, { waitUntil: 'commit' })
const navStart = Date.now()
await page.waitForSelector('text=Individual', { timeout: 60000 })
await page.waitForFunction(() => document.querySelectorAll('button[aria-label]').length > 8, null, { timeout: 60000 })
const boardMs = Date.now() - t0
await sleep(3000)
const list = [...reqs.values()].filter((r) => r.start).sort((a, b) => a.start - b.start)
const base0 = list[0]?.start ?? 0
out.open = {
  boardVisibleMs: boardMs,
  commitMs: navStart - t0,
  requests: list.map((r) => ({ at: Math.round((r.start - base0) * 1000), dur: r.end ? Math.round((r.end - r.start) * 1000) : null, bytes: r.bytes ?? null, status: r.status ?? null, cache: !!r.fromCache, what: `${r.method} ${short(r.url)}` })),
}
console.log('warm open on 4G+4xCPU: board visible after', boardMs, 'ms;', list.length, 'requests')
for (const r of out.open.requests) if (!/\.(js|css|woff2|png|svg)$/.test(r.what) || !r.cache) console.log(`  +${r.at}ms ${r.dur}ms ${r.bytes}B ${r.cache ? 'cache' : ''} ${r.what}`)

// (2) Reloads, unthrottled network, 4x CPU: dispatch visibilitychange (store kick → reload()).
await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 })
for (let i = 0; i < N; i++) {
  await sleep(4000)
  reqs.clear()
  const m0 = await cdpMetrics(cdp)
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
  await sleep(6000)
  const m1 = await cdpMetrics(cdp)
  const rest = [...reqs.values()].filter((r) => /supabase\.co\/rest\/v1\//.test(r.url)).sort((a, b) => a.start - b.start)
  const s0 = rest[0]?.start ?? 0
  const starts = rest.map((r) => Math.round((r.start - s0) * 1000))
  // Waves: requests whose start is > 40 ms after the previous one open a new wave.
  let waves = rest.length ? 1 : 0
  for (let k = 1; k < starts.length; k++) if (starts[k] - starts[k - 1] > 40) waves++
  const bytes = rest.reduce((a, r) => a + (r.bytes ?? 0), 0)
  const lastEnd = Math.max(...rest.map((r) => r.end ?? 0))
  const rec = { requests: rest.length, waves, encodedBytes: bytes, wallMs: rest.length ? Math.round((lastEnd - s0) * 1000) : null, cdp: diffMetrics(m0, m1), tables: rest.map((r) => short(r.url).replace('rest:', '')) }
  out.reloads.push(rec)
  console.log(`reload ${i}: ${rec.requests} REST requests in ${rec.waves} waves, ${rec.encodedBytes} B on the wire, ${rec.wallMs} ms wall; script ${rec.cdp.ScriptDuration} ms, task ${rec.cdp.TaskDuration} ms (4x CPU)`)
}
// Decoded snapshot size (what compute/saveSnapshot handle), from IndexedDB cache.
out.snapshotCache = await page.evaluate(async () => {
  const dbs = await indexedDB.databases()
  return dbs.map((d) => d.name)
})
await ctx.storageState({ path: statePath })
out.loadAfter = load()
writeFileSync(`${E}/ensayo-net-${Date.now()}.json`, JSON.stringify(out, null, 2))
console.log('load', out.loadBefore, '→', out.loadAfter)
await b.close()
