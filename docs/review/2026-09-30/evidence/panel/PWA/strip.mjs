import { launch } from './lib.mjs'
const b = await launch()
const ctx = await b.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
const page = await ctx.newPage()
const cdp = await ctx.newCDPSession(page)
await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 59, bottom: 34, left: 0, right: 0 } })
for (const r of ['', '/juegos', '/dinero', '/mas']) {
  await page.goto('http://127.0.0.1:4173/t/_/full12-live' + r, { waitUntil: 'networkidle' })
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  await page.waitForTimeout(400)
  const m = await page.evaluate(() => { const nav = document.querySelector('nav[aria-label]:last-of-type') ?? [...document.querySelectorAll('nav')].pop(); const r = nav.getBoundingClientRect(); return { navBottom: Math.round(r.bottom), navHeight: Math.round(r.height), vh: innerHeight, docBottomGap: Math.round(document.documentElement.scrollHeight - (scrollY + innerHeight)) } })
  console.log(('/t/_/full12-live' + r).padEnd(26), JSON.stringify(m), m.navBottom === m.vh ? 'tab bar flush with the bottom (no strip)' : 'GAP ' + (m.vh - m.navBottom) + 'px under the tab bar')
}
await b.close()
