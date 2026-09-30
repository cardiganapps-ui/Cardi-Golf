import { launch } from './lib.mjs'
const b = await launch()
const ctx = await b.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
const page = await ctx.newPage()
const routes = ['/', '/t/_/full12-live/admin/jugadores', '/t/_/full12-live/admin/calcutta', '/t/_/full12-live/admin/grupos', '/t/_/full12-live/admin/torneo', '/organizer/nuevo/_', '/ronda/_', '/t/_/large60']
for (const r of routes) {
  await page.goto('http://127.0.0.1:4173' + r, { waitUntil: 'networkidle' }).catch(() => {})
  await page.waitForTimeout(600)
  const small = await page.evaluate(() => [...document.querySelectorAll('input:not([type=checkbox]):not([type=radio]):not([type=hidden]), select, textarea')].filter(e => e.offsetParent).map(e => ({ fs: parseFloat(getComputedStyle(e).fontSize), what: e.getAttribute('aria-label') || e.placeholder || e.name || e.type })).filter(x => x.fs < 16))
  console.log(r.padEnd(34), small.length ? JSON.stringify(small.slice(0, 5)) : 'all inputs ≥ 16px')
}
await b.close()
