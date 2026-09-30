import { chromium } from 'playwright-core'
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const ctx = await b.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, reducedMotion: 'reduce', isMobile: true, hasTouch: true })
const p = await ctx.newPage()
p.on('response', (r) => { if (r.status() >= 400) console.log('  HTTP', r.status(), r.url().slice(0, 140)) })
p.on('console', (m) => { if (['error', 'warning'].includes(m.type())) console.log('  CONSOLE', m.type(), m.text().slice(0, 300)) })
p.on('pageerror', (e) => console.log('  PAGEERROR', String(e).slice(0, 300)))
const routes = process.argv.slice(2)
for (const path of routes) {
  const t0 = Date.now()
  await p.goto('http://127.0.0.1:4173' + path, { waitUntil: 'domcontentloaded' })
  await p.evaluate(() => document.fonts.ready)
  await p.waitForTimeout(900)
  const info = await p.evaluate(() => ({ url: location.pathname, sw: document.scrollingElement.scrollWidth, iw: innerWidth, sh: document.scrollingElement.scrollHeight, h1: [...document.querySelectorAll('h1,h2')].slice(0,3).map(x=>x.textContent.trim().slice(0,50)), bodyLen: document.body.innerText.length, links: [...document.querySelectorAll('a[href]')].map(a=>a.getAttribute('href')).filter(h=>h.includes('/_/')).slice(0,12) }))
  console.log(path, Date.now() - t0, 'ms', JSON.stringify(info))
}
await b.close()
