// Memory over a long session: drive a board with periodic updates and sample heap / DOM / listeners after a forced GC.
// usage: node memory.mjs ensayo-tv|fixture <minutes> <updateEverySec> [route]
//   ensayo-tv: production /t/ensayo/tv (Nico's saved session); update = visibilitychange → the store's reload()
//   fixture:   instrumented build on :4186, route default /t/_/large60; update = one changed score via the exposed store
import { writeFileSync, existsSync } from 'node:fs'
import { launch, sleep, load, cdpMetrics, E } from './perf-lib.mjs'

const mode = process.argv[2] ?? 'fixture'
const MIN = Number(process.argv[3] ?? 24)
const EVERY = Number(process.argv[4] ?? 10)
const route = process.argv[5] ?? (mode === 'fixture' ? '/t/_/large60' : '/t/ensayo/tv')
const BASE = mode === 'fixture' ? 'http://127.0.0.1:4186' : 'https://golf.cardigan.mx'
const statePath = `${E}/state/nico-perf-golf_cardigan_mx.json`
const b = await launch()
const ctx = await b.newContext({ viewport: mode === 'ensayo-tv' ? { width: 1920, height: 1080 } : { width: 412, height: 915 }, deviceScaleFactor: 1, serviceWorkers: 'block', ...(mode !== 'fixture' && existsSync(statePath) ? { storageState: statePath } : {}) })
if (mode === 'fixture') await ctx.route(/supabase\.co/, (r) => r.abort())
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)))
const cdp = await ctx.newCDPSession(page)
await cdp.send('Performance.enable')
await cdp.send('HeapProfiler.enable')
await page.goto(`${BASE}${route}`, { waitUntil: 'load' })
if (mode === 'fixture') await page.waitForFunction(() => window.__perfStore?.getState().data, null, { timeout: 30000 })
else await page.waitForFunction(() => document.body.innerText.length > 200, null, { timeout: 60000 })
await sleep(3000)
const out = { mode, route, minutes: MIN, everySec: EVERY, loadStart: load(), samples: [], updates: 0, reqCount: 0 }
page.on('request', (r) => { if (/supabase\.co\/rest\/v1\//.test(r.url())) out.reqCount++ })

async function sample(label) {
  await cdp.send('HeapProfiler.collectGarbage')
  await sleep(300)
  const m = await cdpMetrics(cdp)
  const extra = await page.evaluate(() => ({ dom: document.getElementsByTagName('*').length, heap: performance.memory?.usedJSHeapSize ?? null }))
  const s = { t: Math.round((Date.now() - t0) / 1000), label, updates: out.updates, heapMB: +(m.JSHeapUsedSize / 1048576).toFixed(2), totalHeapMB: +(m.JSHeapTotalSize / 1048576).toFixed(2), nodes: m.Nodes, domElements: extra.dom, listeners: m.JSEventListeners, documents: m.Documents, frames: m.Frames, layoutObjects: m.LayoutObjects, restRequests: out.reqCount }
  out.samples.push(s)
  console.log(JSON.stringify(s))
}
const t0 = Date.now()
await sample('start')
let nextSample = Date.now() + 60000
const end = Date.now() + MIN * 60000
while (Date.now() < end) {
  if (mode === 'fixture') {
    await page.evaluate((k) => {
      const st = window.__perfStore.getState()
      const snap = structuredClone(st.data.snapshot)
      const rid = snap.tournament.currentRoundId ?? snap.rounds[snap.rounds.length - 1].id
      const live = snap.scores.filter((s) => s.roundId === rid && !s.pickedUp && s.strokes != null)
      const sc = live[(k * 7) % live.length]
      if (sc) { sc.strokes = sc.strokes > 3 ? sc.strokes - 1 : sc.strokes + 1; sc.updatedAt = new Date().toISOString() }
      window.__perfStore.setState({ data: window.__perfData(snap), updatedAt: Date.now(), error: null })
    }, out.updates)
  } else {
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
  }
  out.updates++
  await sleep(EVERY * 1000)
  if (Date.now() >= nextSample) {
    await sample('tick')
    nextSample += 60000
  }
}
await sample('end')
out.loadEnd = load()
out.errors = errors.slice(0, 20)
const first = out.samples[1] ?? out.samples[0]
const last = out.samples[out.samples.length - 1]
const mins = (last.t - first.t) / 60
out.trend = { heapMBPerHour: mins > 0 ? +(((last.heapMB - first.heapMB) / mins) * 60).toFixed(2) : null, nodesPerHour: mins > 0 ? Math.round(((last.nodes - first.nodes) / mins) * 60) : null, listenersPerHour: mins > 0 ? Math.round(((last.listeners - first.listeners) / mins) * 60) : null }
if (mode !== 'fixture') await ctx.storageState({ path: statePath })
writeFileSync(`${E}/memory-${mode}-${Date.now()}.json`, JSON.stringify(out, null, 2))
console.log('TREND', JSON.stringify(out.trend), 'updates', out.updates, 'rest', out.reqCount, 'errors', errors.length)
await b.close()
