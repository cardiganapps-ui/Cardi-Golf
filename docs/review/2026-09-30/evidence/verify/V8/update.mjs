// V8 / PWA-03: does a deploy reach an open app, how long is it offered, is it offered again,
// and does closing the app apply it? Serves site/ via serve.mjs on :4208. "Deploy" = new index.html revision in site/sw.js.
import { chromium } from 'playwright-core'
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs'
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const DIR = '/tmp/claude-0/-home-user-Cardi-Golf/ba82926f-40ab-5a97-99c4-91c99e01493a/scratchpad/verify/evidence/V8'
const URL0 = 'http://127.0.0.1:4208/t/_/full12-live'
copyFileSync(`${DIR}/sw.orig.js`, `${DIR}/site/sw.js`)
const t0 = Date.now(); const T = () => ((Date.now() - t0) / 1000).toFixed(1) + 's'
const log = (...a) => console.log(T(), ...a)

const b = await chromium.launch({ executablePath: EXE })
const ctx = await b.newContext({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true })
// Record every appearance/disappearance of the update toast, in every page of the context.
await ctx.addInitScript(() => {
  const seen = new Set()
  const tick = () => {
    const now = [...document.querySelectorAll('[role=status]')].map((n) => n.textContent || '').filter((x) => /versi[oó]n nueva/i.test(x))
    const key = now.join('|')
    if (now.length && !seen.has('on')) { seen.add('on'); seen.delete('off'); console.log(`[toast] SHOWN: ${key}`) }
    if (!now.length && seen.has('on')) { seen.delete('on'); console.log('[toast] GONE') }
  }
  setInterval(tick, 100)
})
const attach = (p, name) => p.on('console', (m) => { if (m.text().startsWith('[toast]')) log(`${name} ${m.text()}`) })
const swState = (p) => p.evaluate(async () => {
  const r = await navigator.serviceWorker.getRegistration()
  return { controlled: !!navigator.serviceWorker.controller, active: r?.active?.state ?? null, waiting: r?.waiting?.state ?? null, installing: r?.installing?.state ?? null }
})

let page = await ctx.newPage(); attach(page, 'p1')
await page.goto(URL0, { waitUntil: 'networkidle' })
await page.evaluate(() => navigator.serviceWorker.ready)
await page.reload({ waitUntil: 'networkidle' })
log('A. first install + reload:', JSON.stringify(await swState(page)))

// Deploy: new revision for index.html
const sw = readFileSync(`${DIR}/site/sw.js`, 'utf8')
writeFileSync(`${DIR}/site/sw.js`, sw.replace('a25e7d6f615560f94fb45d905cab9cda', 'deadbeefdeadbeefdeadbeefdeadbeef'))
log('B. deployed (sw.js revision bumped)')
// App stays open; user switches away and back (synthetic visibility events: the app has no SW listener anyway)
for (let i = 0; i < 4; i++) {
  await page.waitForTimeout(5000)
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
}
log('C. 20 s open after deploy, no navigation:', JSON.stringify(await swState(page)))

// Cold start = navigation: the browser's own soft update finds the new sw.js
await page.reload({ waitUntil: 'networkidle' })
for (let i = 0; i < 30; i++) { const s = await swState(page); if (s.waiting) break; await page.waitForTimeout(500) }
log('D. after a navigation:', JSON.stringify(await swState(page)))
await page.waitForTimeout(40000)
log('E. 40 s later, same page:', JSON.stringify(await swState(page)), '| toast visible now?', await page.getByText(/versión nueva/i).count())

// Another navigation in the same tab: offered again?
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(3000)
log('F. second reload:', JSON.stringify(await swState(page)))
await page.waitForTimeout(5000)

// Close the app completely (all clients gone), then reopen
await page.close()
await new Promise((r) => setTimeout(r, 1500))
page = await ctx.newPage(); attach(page, 'p2')
await page.goto(URL0, { waitUntil: 'networkidle' })
await page.waitForTimeout(3000)
const rev = await page.evaluate(async () => {
  const names = await caches.keys(); const out = []
  for (const n of names) { const c = await caches.open(n); for (const k of await c.keys()) if (/index\.html/.test(k.url)) out.push(k.url.replace(location.origin, '')) }
  return out
})
log('G. after closing every page and reopening:', JSON.stringify(await swState(page)), 'precached index.html entries:', JSON.stringify(rev))
await page.goto('http://127.0.0.1:4208/t/_/full12-live/mas', { waitUntil: 'networkidle' })
log('H. Más version text:', JSON.stringify(await page.getByText(/^Versión/).allTextContents()))
await b.close()
copyFileSync(`${DIR}/sw.orig.js`, `${DIR}/site/sw.js`)
