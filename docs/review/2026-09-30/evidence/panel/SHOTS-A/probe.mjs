import { chromium } from 'playwright-core'
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const ctx = await b.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, reducedMotion: 'reduce' })
const p = await ctx.newPage()
const reqs = []
p.on('request', (r) => { const u = r.url(); if (!u.startsWith('http://127.0.0.1')) reqs.push(r.method() + ' ' + u.replace(/\?.*/, '')) })
p.on('requestfailed', (r) => console.log('REQFAIL', r.url().slice(0, 120), r.failure()?.errorText))
p.on('response', (r) => { if (r.status() >= 400) console.log('HTTP', r.status(), r.url().slice(0, 140)) })
p.on('console', (m) => { if (['error', 'warning'].includes(m.type())) console.log('CONSOLE', m.type(), m.text().slice(0, 300)) })
p.on('pageerror', (e) => console.log('PAGEERROR', String(e).slice(0, 300)))
for (const path of ['', '/tarjeta', '/juegos', '/dinero', '/stats', '/reglamento', '/mas']) {
  const t0 = Date.now()
  await p.goto('http://127.0.0.1:4173/t/_/full12-live' + path, { waitUntil: 'domcontentloaded' })
  await p.evaluate(() => document.fonts.ready)
  await p.waitForTimeout(600)
  const info = await p.evaluate(() => ({ sw: document.scrollingElement.scrollWidth, iw: innerWidth, sh: document.scrollingElement.scrollHeight, h1: document.querySelector('h1,h2')?.textContent, bodyLen: document.body.innerText.length }))
  console.log(path || '/', Date.now() - t0, 'ms', JSON.stringify(info))
}
// open player sheet
await p.goto('http://127.0.0.1:4173/t/_/full12-live', { waitUntil: 'domcontentloaded' })
await p.evaluate(() => document.fonts.ready)
await p.waitForTimeout(600)
const rows = p.locator('button[class*="leaderRow"]')
console.log('leaderRows', await rows.count())
await rows.first().click()
await p.waitForTimeout(800)
console.log('dialogs', await p.locator('[role=dialog]').count())
console.log('reqs', [...new Set(reqs)])
await b.close()
