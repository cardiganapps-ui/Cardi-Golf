// V8 / PWA-02: independent probe of the sticky tournament header under an emulated iOS safe-area inset.
// Chromium only (no WebKit here): Emulation.setSafeAreaInsetsOverride feeds env(safe-area-inset-*).
import { chromium } from 'playwright-core'
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const BASE = 'http://127.0.0.1:4208'
const OUT = '/tmp/claude-0/-home-user-Cardi-Golf/ba82926f-40ab-5a97-99c4-91c99e01493a/scratchpad/verify/evidence/V8'
const b = await chromium.launch({ executablePath: EXE })
const ctx = await b.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
const page = await ctx.newPage()
const cdp = await ctx.newCDPSession(page)
await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 59, bottom: 34, left: 0, right: 0 } })

const probe = () => {
  const d = document.createElement('div')
  d.style.cssText = 'position:absolute;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)'
  document.body.appendChild(d)
  const cs = getComputedStyle(d)
  const env = { top: cs.paddingTop, bottom: cs.paddingBottom }
  d.remove()
  const header = document.querySelector('header')
  const r = header?.getBoundingClientRect()
  const hs = header ? getComputedStyle(header) : null
  const kids = header ? [...header.children].map((k) => { const kr = k.getBoundingClientRect(); return { tag: k.tagName, cls: k.className?.toString().slice(0, 30), text: (k.textContent || '').trim().slice(0, 30), top: Math.round(kr.top), bottom: Math.round(kr.bottom), left: Math.round(kr.left), right: Math.round(kr.right) } }) : []
  // effective background behind the status-bar band at (x, 20)
  const bgAt = (x, y) => {
    let el = document.elementFromPoint(x, y)
    const first = el ? `${el.tagName}.${(el.className?.toString() || '').slice(0, 25)}` : null
    while (el) { const c = getComputedStyle(el).backgroundColor; if (c && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent') return { first, bg: c, from: el.tagName }; el = el.parentElement }
    return { first, bg: getComputedStyle(document.documentElement).backgroundColor, from: 'html' }
  }
  return {
    env, safeTopVar: getComputedStyle(document.documentElement).getPropertyValue('--safe-top').trim(),
    scrollY: Math.round(window.scrollY), scrollHeight: document.scrollingElement.scrollHeight,
    header: r ? { top: Math.round(r.top), bottom: Math.round(r.bottom), position: hs.position, stickyTop: hs.top, paddingTop: hs.paddingTop, bg: hs.backgroundColor } : null,
    kids, band: { left: bgAt(40, 25), center: bgAt(196, 25), right: bgAt(340, 25) },
  }
}

const routes = ['', '/juegos', '/dinero', '/stats', '/mas', '/tarjeta']
const results = {}
for (const r of routes) {
  await page.goto(`${BASE}/t/_/full12-live${r}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(400)
  const rest = await page.evaluate(probe)
  if (r === '') await page.screenshot({ path: `${OUT}/notch-live-rest.png` })
  await page.evaluate(() => window.scrollTo(0, 600))
  await page.waitForTimeout(400)
  const scrolled = await page.evaluate(probe)
  if (r === '') await page.screenshot({ path: `${OUT}/notch-live-scrolled.png` })
  results[r || '/'] = { rest, scrolled }
  console.log(`${(r || '/').padEnd(9)} env.top=${rest.env.top} --safe-top=${rest.safeTopVar} | header rest top=${rest.header?.top} bottom=${rest.header?.bottom} | scrolled scrollY=${scrolled.scrollY} header top=${scrolled.header?.top} bottom=${scrolled.header?.bottom} (sticky top:${scrolled.header?.stickyTop}, padding-top:${scrolled.header?.paddingTop}) | band bg rest=${rest.band.center.bg} via ${rest.band.center.first} ; scrolled=${scrolled.band.center.bg} via ${scrolled.band.center.first}`)
}
console.log('header children after scroll on /:', JSON.stringify(results['/'].scrolled.kids))
// Control: no inset (Android Chrome / iOS Safari browser tab) -> header should sit at 0 in both states and that is correct there.
await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 0, bottom: 0, left: 0, right: 0 } })
await page.goto(`${BASE}/t/_/full12-live`, { waitUntil: 'networkidle' })
const ctlRest = await page.evaluate(probe)
await page.evaluate(() => window.scrollTo(0, 600)); await page.waitForTimeout(300)
const ctlScr = await page.evaluate(probe)
console.log(`control (no inset): env.top=${ctlRest.env.top} header rest top=${ctlRest.header.top} scrolled top=${ctlScr.header.top}`)
const fs = await import('node:fs')
fs.writeFileSync(`${OUT}/notch.json`, JSON.stringify(results, null, 1))
await b.close()
