// V13 / PERF-01: cold-cache open of /t/ensayo with the saved Nico session (no sign-in), 4G (150 ms, 1.6/0.75 Mbps) + 4x CPU,
// logo allowed vs logo blocked, alternating. Measures time to the first leaderboard row and total bytes.
import { chromium } from 'playwright-core'
import { writeFileSync } from 'node:fs'
const E = '/tmp/claude-0/-home-user-Cardi-Golf/ba82926f-40ab-5a97-99c4-91c99e01493a/scratchpad/verify/evidence/V13'
const STATE = `${E}/state-nico.json`
const BASE = 'https://golf.cardigan.mx'
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const res = []
for (const variant of ['logo', 'blocked', 'logo', 'blocked', 'logo', 'blocked']) {
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2, serviceWorkers: 'block', storageState: STATE })
  const page = await ctx.newPage()
  const cdp = await ctx.newCDPSession(page)
  await cdp.send('Network.enable')
  if (variant === 'blocked') await cdp.send('Network.setBlockedURLs', { urls: ['*tournament-assets/*logo.png*'] })
  const reqs = new Map()
  cdp.on('Network.requestWillBeSent', (e) => reqs.set(e.requestId, { url: e.request.url, start: e.timestamp }))
  cdp.on('Network.loadingFinished', (e) => { const r = reqs.get(e.requestId); if (r) Object.assign(r, { end: e.timestamp, bytes: e.encodedDataLength }) })
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.6e6 / 8, uploadThroughput: 750e3 / 8 })
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
  const t0 = Date.now()
  await page.goto(BASE + '/t/ensayo', { waitUntil: 'commit' })
  await page.waitForSelector('button[class*="leaderRow"]', { timeout: 120000 })
  const boardMs = Date.now() - t0
  await new Promise((r) => setTimeout(r, 9000))
  const list = [...reqs.values()]
  const nav = Math.min(...list.map((r) => r.start))
  const logo = list.find((r) => /logo\.png$/.test(r.url))
  const scores = list.find((r) => /rest\/v1\/scores/.test(r.url))
  const holes = list.find((r) => /rest\/v1\/holes/.test(r.url))
  const rec = {
    variant,
    boardMs,
    totalBytes: list.reduce((a, r) => a + (r.bytes ?? 0), 0),
    logo: logo ? { at: Math.round((logo.start - nav) * 1000), end: logo.end ? Math.round((logo.end - nav) * 1000) : null, bytes: logo.bytes ?? null } : null,
    lastWaveEnd: holes?.end ? Math.round((holes.end - nav) * 1000) : null,
    scoresMs: scores?.end ? Math.round((scores.end - scores.start) * 1000) : null,
  }
  res.push(rec)
  console.log(JSON.stringify(rec))
  await ctx.storageState({ path: STATE })
  await ctx.close()
}
writeFileSync(`${E}/cold-ab-${Date.now()}.json`, JSON.stringify(res, null, 2))
await b.close()
