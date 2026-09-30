// V13 / PERF-11 on a fixture route (in-memory data, no Supabase): requests made by the first and second «Compartir tabla» tap.
// usage: node share-fixture.mjs [base=http://127.0.0.1:4213] [route=/t/_/full12-live]
import { chromium } from 'playwright-core'
import { writeFileSync } from 'node:fs'
const BASE = process.argv[2] ?? 'http://127.0.0.1:4213'
const ROUTE = process.argv[3] ?? '/t/_/full12-live'
const E = '/tmp/claude-0/-home-user-Cardi-Golf/ba82926f-40ab-5a97-99c4-91c99e01493a/scratchpad/verify/evidence/V13'
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const out = []
for (const sw of ['block', 'allow']) {
  const ctx = await b.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, serviceWorkers: sw, acceptDownloads: true })
  const page = await ctx.newPage()
  // With the SW allowed, load twice so the page is SW-controlled with a full precache (a returning, installed phone).
  await page.goto(BASE + ROUTE, { waitUntil: 'networkidle' })
  if (sw === 'allow') {
    await page.waitForTimeout(4000)
    await page.reload({ waitUntil: 'networkidle' })
  }
  await page.waitForSelector('button:has-text("Compartir tabla")', { timeout: 60000 })
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(1500)
  const controlled = await page.evaluate(() => !!navigator.serviceWorker?.controller)
  const cdp = await ctx.newCDPSession(page)
  await cdp.send('Network.enable')
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
  for (const tap of ['first', 'second']) {
    const reqs = new Map()
    const onReq = (e) => reqs.set(e.requestId, { url: e.request.url })
    const onResp = (e) => { const r = reqs.get(e.requestId); if (r) Object.assign(r, { status: e.response.status, sw: !!e.response.fromServiceWorker, disk: !!e.response.fromDiskCache }) }
    const onFin = (e) => { const r = reqs.get(e.requestId); if (r) r.bytes = e.encodedDataLength }
    cdp.on('Network.requestWillBeSent', onReq)
    cdp.on('Network.responseReceived', onResp)
    cdp.on('Network.loadingFinished', onFin)
    const t0 = Date.now()
    const dl = page.waitForEvent('download', { timeout: 120000 }).catch(() => null)
    await page.locator('button:has-text("Compartir tabla")').first().click()
    await dl
    const ms = Date.now() - t0
    cdp.off('Network.requestWillBeSent', onReq)
    cdp.off('Network.responseReceived', onResp)
    cdp.off('Network.loadingFinished', onFin)
    const list = [...reqs.values()].filter((r) => !r.url.startsWith('data:'))
    const rec = { sw, controlled, tap, imageAfterMs: ms, requests: list.length, cacheBusted: list.filter((r) => /[?&]\d{12,}$/.test(r.url)).length, fromSW: list.filter((r) => r.sw).length, bytes: list.reduce((a, r) => a + (r.bytes ?? 0), 0), files: list.map((r) => `${r.bytes ?? '?'}B${r.sw ? ' (sw)' : ''} ${r.url.replace(BASE, '')}`) }
    out.push(rec)
    console.log(`SW ${sw} (controlled=${controlled}) ${tap} tap: image after ${ms} ms; ${rec.requests} requests, ${rec.cacheBusted} cache-busted, ${rec.fromSW} from SW, ${rec.bytes} B`)
    if (tap === 'first') for (const f of rec.files) console.log('    ' + f)
    await page.waitForTimeout(1500)
  }
  await ctx.close()
}
writeFileSync(`${E}/share-fixture-${Date.now()}.json`, JSON.stringify(out, null, 2))
await b.close()
