// First install of the service worker on production `/`: what the precache downloads (count, encoded bytes, time).
// No sign-in happens on `/` for a visitor. usage: node sw-install.mjs
import { writeFileSync } from 'node:fs'
import { launch, sleep, load, E } from './perf-lib.mjs'

const b = await launch()
const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2, serviceWorkers: 'allow' })
const reqs = []
const t0 = Date.now()
ctx.on('requestfinished', async (r) => {
  let size = null
  try { size = (await r.sizes()).responseBodySize } catch {}
  reqs.push({ t: Date.now() - t0, sw: !!r.serviceWorker(), url: r.url().replace(/^https:\/\/[^/]+/, ''), size, type: r.resourceType() })
})
const page = await ctx.newPage()
await page.goto('https://golf.cardigan.mx/', { waitUntil: 'load' })
const loadMs = Date.now() - t0
const ready = await page.evaluate(async () => { const t = performance.now(); await navigator.serviceWorker.ready; return Math.round(performance.now() - t) })
await sleep(8000)
const cacheInfo = await page.evaluate(async () => {
  const names = await caches.keys()
  let n = 0
  for (const k of names) n += (await (await caches.open(k)).keys()).length
  const est = await navigator.storage?.estimate?.()
  return { names, entries: n, usageKB: est ? Math.round(est.usage / 1024) : null }
})
const swReqs = reqs.filter((r) => r.sw)
const pageReqs = reqs.filter((r) => !r.sw)
const sum = (xs) => xs.reduce((a, r) => a + (r.size ?? 0), 0)
const out = {
  load: load(), pageLoadMs: loadMs, swReadyAfterLoadMs: ready,
  page: { requests: pageReqs.length, bytes: sum(pageReqs) },
  serviceWorker: { requests: swReqs.length, bytes: sum(swReqs), lastAtMs: Math.max(0, ...swReqs.map((r) => r.t)), byType: Object.entries(swReqs.reduce((a, r) => { const k = r.url.split('?')[0].split('.').pop(); a[k] = (a[k] ?? 0) + (r.size ?? 0); return a }, {})) },
  cacheInfo,
  largestSw: swReqs.sort((a, b) => (b.size ?? 0) - (a.size ?? 0)).slice(0, 12).map((r) => `${r.size}B ${r.url}`),
}
writeFileSync(`${E}/sw-install-${Date.now()}.json`, JSON.stringify({ ...out, all: reqs }, null, 2))
console.log(JSON.stringify(out, null, 1))
await b.close()
