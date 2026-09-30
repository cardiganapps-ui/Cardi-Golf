import { chromium } from 'playwright-core'
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const ctx = await browser.newContext({ viewport: { width: 852, height: 393 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
const page = await ctx.newPage()
for (const [r, f] of [['/t/_/full12-live/tarjeta', 't_tarjeta-full12-live-15pro-light-a11y-landscape.png']]) {
  await page.goto('http://127.0.0.1:4173' + r, { waitUntil: 'networkidle' })
  await page.waitForTimeout(600)
  const m = await page.evaluate(() => { const sb = document.querySelector('[class*="saveBar"]')?.getBoundingClientRect(); const tb = document.querySelector('nav[aria-label="Secciones"]')?.getBoundingClientRect(); const first = document.querySelector('[role="group"]')?.getBoundingClientRect(); return { save: sb && [Math.round(sb.top), Math.round(sb.bottom)], tabbar: tb && [Math.round(tb.top), Math.round(tb.bottom)], firstStepperTop: first && Math.round(first.top), visibleForPlayers: innerHeight - (tb ? tb.height : 0) - (sb ? sb.height : 0) } })
  console.log(r, JSON.stringify(m))
  await page.screenshot({ path: '/home/user/Cardi-Golf/docs/review/2026-09-30/shots/' + f })
}
await browser.close()
