import { chromium } from 'playwright-core'
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
const page = await ctx.newPage()
await page.goto('http://127.0.0.1:4173/t/_/full12-live/admin/calcutta', { waitUntil: 'networkidle' })
await page.waitForTimeout(700)
const nav = await page.evaluate(() => { const n = document.querySelector('nav'); const r = n?.getBoundingClientRect(); const cs = n && getComputedStyle(n); return { label: n?.getAttribute('aria-label'), w: r?.width, sw: n?.scrollWidth, overflowX: cs?.overflowX, mask: cs?.maskImage || cs?.webkitMaskImage } })
console.log('nav', JSON.stringify(nav))
for (let i = 0; i < 14; i++) {
  await page.keyboard.press('Tab')
  const f = await page.evaluate(() => { const a = document.activeElement; const r = a.getBoundingClientRect(); const sc = a.closest('nav'); return { t: a.textContent.trim().slice(0, 20), left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), navScroll: sc ? Math.round(sc.scrollLeft) : null, hit: (() => { const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return e ? e.tagName + '.' + String(e.className).slice(0, 30) : null })() } })
  console.log(i, JSON.stringify(f))
  if (f.t === 'Grupos') await page.screenshot({ path: '/home/user/Cardi-Golf/docs/review/2026-09-30/shots/t_admin_calcutta-full12-live-15pro-light-a11y-navfocus.png' })
}
await browser.close()
