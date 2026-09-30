import { launch, SHOTS } from './lib.mjs'
import sharp from 'sharp'
const b = await launch()
const ctx = await b.newContext({ viewport: { width: 852, height: 393 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
const page = await ctx.newPage()
const cdp = await ctx.newCDPSession(page)
await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 0, bottom: 21, left: 59, right: 59 } })
const island = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1704" height="786"><rect x="22" y="267" width="74" height="252" rx="37" fill="#000"/><rect x="1.5" y="1.5" width="115" height="783" fill="none" stroke="#d00" stroke-width="3" stroke-dasharray="10 8"/><rect x="1587" y="1.5" width="115" height="783" fill="none" stroke="#d00" stroke-width="3" stroke-dasharray="10 8"/></svg>`)
for (const [route, name] of [['/t/_/full12-live/admin/scores', 't_admin_scores-full12-live-15pro-light-pwa-landscape-notch'], ['/t/_/full12-live/tv', 't_tv-full12-live-15pro-dark-pwa-landscape-notch'], ['/t/_/full12-live', 't_live-full12-live-15pro-light-pwa-landscape-notch']]) {
  await page.goto('http://127.0.0.1:4173' + route, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1200)
  // leftmost visible text x among text-bearing elements
  const minX = await page.evaluate(() => {
    let m = 1e9, who = ''
    for (const el of document.querySelectorAll('h1,h2,h3,span,td,th,a,button,p,strong,div')) {
      if (!el.childNodes.length || ![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) continue
      const r = el.getBoundingClientRect(); if (r.width === 0 || r.bottom < 0 || r.top > innerHeight) continue
      if (r.left < m) { m = r.left; who = el.tagName + ' "' + el.textContent.trim().slice(0, 25) + '"' }
    }
    return { m: Math.round(m), who }
  })
  console.log(route, 'leftmost text x =', minX.m, minX.who, '(left inset 59)')
  const buf = await page.screenshot()
  await sharp(buf).composite([{ input: island }]).png().toFile(`${SHOTS}/${name}.png`)
}
await b.close()
