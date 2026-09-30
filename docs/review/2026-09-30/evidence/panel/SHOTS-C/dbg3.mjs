import { chromium } from 'playwright-core'
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const ctx = await b.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, reducedMotion: 'reduce' })
const p = await ctx.newPage()
for (const s of ['resumen', 'crews', 'avisos', 'auditoria', 'salud']) {
  await p.goto('http://127.0.0.1:4173/admin/_/' + s, { waitUntil: 'domcontentloaded' })
  await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(700)
  console.log(s, await p.evaluate(() => {
    const nav = document.querySelector('nav[aria-label]')
    const act = nav?.querySelector('a[aria-current="page"]')
    const r = act?.getBoundingClientRect()
    const cs = nav && getComputedStyle(nav)
    return JSON.stringify({ navOverflowX: cs?.overflowX, scrollLeft: nav?.scrollLeft, scrollW: nav?.scrollWidth, clientW: nav?.clientWidth, active: act?.textContent, activeLeft: r && Math.round(r.left), activeRight: r && Math.round(r.right), vw: innerWidth })
  }))
}
await b.close()
