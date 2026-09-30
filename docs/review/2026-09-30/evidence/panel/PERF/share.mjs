// What one «Compartir» tap costs: requests (and cache-busted ones), bytes, and time to the image, at 4x CPU.
// usage: node share.mjs <base> <route> [useNicoState=0] [taps=2]
import { writeFileSync, existsSync } from 'node:fs'
import { launch, sleep, load, E } from './perf-lib.mjs'

const BASE = process.argv[2] ?? 'http://127.0.0.1:4186'
const route = process.argv[3] ?? '/t/_/full12-live'
const useState = process.argv[4] === '1'
const TAPS = Number(process.argv[5] ?? 2)
const statePath = `${E}/state/nico-perf-golf_cardigan_mx.json`
const b = await launch()
const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2, serviceWorkers: 'block', acceptDownloads: true, ...(useState && existsSync(statePath) ? { storageState: statePath } : {}) })
const page = await ctx.newPage()
const cdp = await ctx.newCDPSession(page)
await cdp.send('Network.enable')
const reqs = new Map()
cdp.on('Network.requestWillBeSent', (e) => reqs.set(e.requestId, { url: e.request.url, t: e.timestamp }))
cdp.on('Network.responseReceived', (e) => { const r = reqs.get(e.requestId); if (r) r.cache = e.response.fromDiskCache || e.response.fromMemoryCache })
cdp.on('Network.loadingFinished', (e) => { const r = reqs.get(e.requestId); if (r) r.bytes = e.encodedDataLength })
await page.goto(`${BASE}${route}`, { waitUntil: 'load' })
const btn = page.getByRole('button', { name: /^Compartir/ }).first()
await btn.waitFor({ timeout: 60000 })
await sleep(2500)
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
const out = { base: BASE, route, load: load(), taps: [] }
for (let i = 0; i < TAPS; i++) {
  reqs.clear()
  const t0 = Date.now()
  const dl = page.waitForEvent('download', { timeout: 60000 }).catch(() => null)
  await btn.click()
  const d = await dl
  const ms = Date.now() - t0
  await sleep(1500)
  const list = [...reqs.values()]
  const tap = {
    msToImage: d ? ms : null,
    requests: list.length,
    cacheBusted: list.filter((r) => /[?&]\d{12,}$/.test(r.url)).length,
    bytes: list.reduce((a, r) => a + (r.bytes ?? 0), 0),
    fromCache: list.filter((r) => r.cache).length,
    urls: list.map((r) => `${r.bytes ?? '?'}B ${r.cache ? '(cache) ' : ''}${r.url.replace(/^https?:\/\/[^/]+/, '').slice(0, 120)}`),
  }
  out.taps.push(tap)
  console.log(`tap ${i}: image after ${tap.msToImage} ms; ${tap.requests} requests (${tap.cacheBusted} cache-busted), ${tap.bytes} B`)
  for (const u of tap.urls) console.log('   ', u)
  await sleep(2000)
}
if (useState) await ctx.storageState({ path: statePath })
writeFileSync(`${E}/share-${route.replace(/\W+/g, '_')}-${Date.now()}.json`, JSON.stringify(out, null, 2))
await b.close()
