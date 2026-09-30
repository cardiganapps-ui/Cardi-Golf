// V13 / PERF-08: returning player (warm HTTP cache, saved session, snapshot cached in IndexedDB) reopening /t/ensayo
// on a weak link (400 ms RTT, 400/400 kbps) + 4x CPU. Records when the board appears vs the API chain.
import { chromium } from 'playwright-core'
import { writeFileSync } from 'node:fs'
const E = '/tmp/claude-0/-home-user-Cardi-Golf/ba82926f-40ab-5a97-99c4-91c99e01493a/scratchpad/verify/evidence/V13'
const STATE = `${E}/state-nico.json`
const BASE = 'https://golf.cardigan.mx'
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2, serviceWorkers: 'block', storageState: STATE })
const page = await ctx.newPage()
// Warm: one normal open (fills the HTTP cache and the IndexedDB snapshot cache).
await page.goto(BASE + '/t/ensayo', { waitUntil: 'domcontentloaded' })
await page.waitForSelector('button[class*="leaderRow"]', { timeout: 60000 })
await new Promise((r) => setTimeout(r, 3000))
const cached = await page.evaluate(async () => {
  const dbs = (await indexedDB.databases()).map((d) => d.name)
  const count = await new Promise((res) => {
    const req = indexedDB.open('cardi-golf-cache')
    req.onsuccess = () => {
      const db = req.result
      const names = [...db.objectStoreNames]
      if (!names.includes('snapshots')) return res({ names })
      const tx = db.transaction('snapshots', 'readonly')
      const c = tx.objectStore('snapshots').count()
      c.onsuccess = () => res({ names, snapshots: c.result })
    }
    req.onerror = () => res({ error: String(req.error) })
  })
  return { dbs, count }
})
console.log('IndexedDB on the device before the reopen:', JSON.stringify(cached))
const out = { cached, runs: [] }
for (const prof of [
  { name: 'weak 400ms/400kbps', latency: 400, down: 400e3, up: 400e3 },
  { name: 'weak 400ms/400kbps', latency: 400, down: 400e3, up: 400e3 },
]) {
  const cdp = await ctx.newCDPSession(page)
  await cdp.send('Network.enable')
  const reqs = []
  cdp.on('Network.requestWillBeSent', (e) => /supabase\.co\/(rest|auth)/.test(e.request.url) && reqs.push({ id: e.requestId, url: e.request.url.replace(/^https:\/\/[^/]+/, '').replace(/\?.*$/, ''), start: e.timestamp }))
  cdp.on('Network.loadingFinished', (e) => { const r = reqs.find((x) => x.id === e.requestId); if (r) r.end = e.timestamp })
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: prof.latency, downloadThroughput: prof.down / 8, uploadThroughput: prof.up / 8 })
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
  const t0 = Date.now()
  let spinnerAt = null
  await page.goto(BASE + '/t/ensayo', { waitUntil: 'commit' })
  const poll = setInterval(async () => {
    try {
      if (spinnerAt == null && (await page.locator('[role="status"][aria-label]').count()) > 0) spinnerAt = Date.now() - t0
    } catch {}
  }, 100)
  await page.waitForSelector('button[class*="leaderRow"]', { timeout: 120000 })
  clearInterval(poll)
  const boardMs = Date.now() - t0
  await new Promise((r) => setTimeout(r, 2500))
  const s0 = Math.min(...reqs.map((r) => r.start))
  const firstApiMs = reqs.length ? null : null
  const chain = reqs.sort((a, b) => a.start - b.start).map((r) => `${r.url.replace('/rest/v1/rpc/', 'rpc:').replace('/rest/v1/', '').replace('/auth/v1/', 'auth:')} +${Math.round((r.start - s0) * 1000)}→${r.end ? Math.round((r.end - s0) * 1000) : '?'}`)
  const rec = { profile: prof.name, boardMs, spinnerSeenAtMs: spinnerAt, apiRequests: reqs.length, apiSpanMs: Math.round((Math.max(...reqs.map((r) => r.end ?? 0)) - s0) * 1000), chain }
  out.runs.push(rec)
  console.log(`${prof.name}: board after ${boardMs} ms (spinner seen at ${spinnerAt} ms); ${reqs.length} API requests spanning ${rec.apiSpanMs} ms`)
  console.log('   ', chain.filter((c) => /lookup|membership|players|groups|holes|app_flags|auth:/.test(c)).join(' | '))
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 })
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 })
  await cdp.detach()
  await new Promise((r) => setTimeout(r, 1500))
}
await ctx.storageState({ path: STATE })
writeFileSync(`${E}/slow-open-${Date.now()}.json`, JSON.stringify(out, null, 2))
await b.close()
