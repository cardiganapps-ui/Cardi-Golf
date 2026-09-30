// Save-to-other-phone latency on throttled 4G: phone A saves a hole in the Tarjeta, phone B (Tarjeta grid)
// timestamps the DOM change for the first and the fourth player of that hole with a MutationObserver.
// usage: node latency.mjs <broken|fixed> <samples> [timeoutMs]
import { launch, newPhone, E, BASE, sleep, bridgeRealtime } from './lib.mjs'
import { writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

const mode = process.argv[2] ?? 'fixed'
const N = Number(process.argv[3] ?? 10)
const TIMEOUT = Number(process.argv[4] ?? 20000)
const HOLES = [10, 11, 12, 13, 14, 15, 16, 17]
const state = `${E}/state/nico-A.json`
const b = await launch()
const throttle = async (page) => {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Network.enable')
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.6e6 / 8, uploadThroughput: 750e3 / 8 })
}
const mk = async (name) => {
  const ctx = await newPhone(b, state)
  // WS frames bypass CDP throttling in this bridge: add ~75 ms each way (half of the 150 ms RTT).
  await bridgeRealtime(ctx, { fixJoin: mode === 'fixed', delayMs: 75 })
  const page = await ctx.newPage()
  await throttle(page)
  page.on('pageerror', (e) => console.log(name, 'pageerror', String(e).slice(0, 200)))
  return page
}
const A = await mk('A')
const B = await mk('B')
const bReq = []
B.on('request', (r) => {
  if (/\/rest\/v1\//.test(r.url())) bReq.push({ t: Date.now(), url: r.url().split('/rest/v1/')[1].split('?')[0] })
})
const aPush = []
A.on('requestfinished', (r) => {
  if (/\/rest\/v1\/scores/.test(r.url()) && r.method() === 'POST') aPush.push(Date.now())
})

await B.goto(`${BASE}/t/ensayo/tarjeta`, { waitUntil: 'domcontentloaded' })
await B.getByRole('button', { name: 'Ver tarjeta' }).click({ timeout: 60000 })
await B.waitForSelector('table', { timeout: 30000 })
await sleep(3000)
const header = await B.locator('header').first().innerText()
const load = execSync('cat /proc/loadavg').toString().trim()
console.log('mode', mode, 'B header', JSON.stringify(header), 'load', load)

const samples = []
for (let i = 0; i < N; i++) {
  const hole = HOLES[i % HOLES.length]
  await A.goto(`${BASE}/t/ensayo/tarjeta?hoyo=${hole}`, { waitUntil: 'domcontentloaded' })
  const save = A.getByRole('button', { name: /^Guardar (hoyo|y ver la tarjeta)$/ })
  await save.waitFor({ timeout: 60000 })
  await sleep(1200)
  // Arm B's observer on row `hole`: player columns 0 and 3.
  await B.evaluate((hole) => {
    const w = window
    w.__lat = { first: null, last: null }
    const rowOf = () => [...document.querySelectorAll('table tr')].find((tr) => tr.querySelector('td button')?.textContent?.trim() === String(hole))
    const cells = () => {
      const tds = rowOf()?.querySelectorAll('td')
      return tds ? [tds[3]?.textContent, tds[6]?.textContent] : [null, null]
    }
    const base = cells()
    w.__latBase = base
    if (w.__latObs) w.__latObs.disconnect()
    w.__latObs = new MutationObserver(() => {
      const c = cells()
      if (w.__lat.first == null && c[0] !== base[0]) w.__lat.first = Date.now()
      if (w.__lat.last == null && c[1] !== base[1]) w.__lat.last = Date.now()
    })
    w.__latObs.observe(document.body, { subtree: true, childList: true, characterData: true })
  }, hole)
  // Nudge the first and the fourth player: down when possible, else up.
  for (const idx of [0, 3]) {
    const minus = A.locator('button[aria-label="Golpes: menos"]').nth(idx)
    if (await minus.isEnabled()) await minus.click()
    else await A.locator('button[aria-label="Golpes: más"]').nth(idx).click()
  }
  bReq.length = 0
  aPush.length = 0
  const tA = await A.evaluate(() => Date.now())
  await save.click()
  const deadline = Date.now() + TIMEOUT
  let r
  while (Date.now() < deadline) {
    r = await B.evaluate(() => window.__lat)
    if (r.first && r.last) break
    await sleep(100)
  }
  const s = {
    hole,
    firstMs: r.first ? r.first - tA : null,
    lastMs: r.last ? r.last - tA : null,
    aPushesDoneMs: aPush.map((t) => t - tA),
    bReloadsTriggered: bReq.filter((x) => x.url === 'tournaments').length,
    bRestRequests: bReq.length,
  }
  samples.push(s)
  console.log(JSON.stringify(s))
  await sleep(1500)
}
const q = (arr, p) => {
  const a = arr.filter((x) => x != null).sort((x, y) => x - y)
  if (!a.length) return null
  return a[Math.min(a.length - 1, Math.floor(p * (a.length - 1) + 0.5))]
}
const summary = {
  mode,
  load,
  n: samples.length,
  first: { p50: q(samples.map((s) => s.firstMs), 0.5), p90: q(samples.map((s) => s.firstMs), 0.9), max: q(samples.map((s) => s.firstMs), 1), timeouts: samples.filter((s) => s.firstMs == null).length },
  last: { p50: q(samples.map((s) => s.lastMs), 0.5), p90: q(samples.map((s) => s.lastMs), 0.9), max: q(samples.map((s) => s.lastMs), 1), timeouts: samples.filter((s) => s.lastMs == null).length },
  loadAfter: execSync('cat /proc/loadavg').toString().trim(),
}
console.log('SUMMARY', JSON.stringify(summary))
writeFileSync(`${E}/logs/latency-${mode}-${Date.now()}.json`, JSON.stringify({ summary, samples }, null, 1))
await b.close()
