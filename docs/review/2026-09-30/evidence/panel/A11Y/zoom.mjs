// 200% text (root font-size) and 320px reflow checks, with screenshots.
import { chromium } from 'playwright-core'
import fs from 'node:fs'
import path from 'node:path'
const DIR = path.dirname(new URL(import.meta.url).pathname)
const BASE = 'http://127.0.0.1:4173'
const SHOTS = '/home/user/Cardi-Golf/docs/review/2026-09-30/shots/'
const F = '/t/_/full12-live'
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })

const probe = () =>
  document.fonts.ready.then(() => {
    const vw = document.documentElement.clientWidth
    const hScroll = document.documentElement.scrollWidth > vw + 1
    const over = []
    const clipped = []
    for (const el of document.querySelectorAll('main *')) {
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue
      const cs = getComputedStyle(el)
      if (cs.visibility === 'hidden') continue
      // Content that sticks out of the viewport (and is not inside a horizontal scroller).
      if (r.right > vw + 1 && !el.closest('[class*="gridWrap"], [class*="tableWrap"], [class*="segmented"], nav')) over.push(`${el.tagName.toLowerCase()}.${String(el.className).replace(/_[a-z0-9]{5}_\d+/g, '').slice(0, 30)} "${(el.textContent || '').trim().slice(0, 30)}" right=${Math.round(r.right)}`)
      // Text cut off inside its own box (ellipsis or overflow hidden).
      if ((cs.overflow === 'hidden' || cs.textOverflow === 'ellipsis') && el.scrollWidth > el.clientWidth + 1 && el.textContent.trim()) clipped.push(`"${el.textContent.trim().slice(0, 40)}" (${el.clientWidth}/${el.scrollWidth}px)`)
    }
    return { vw, hScroll, scrollWidth: document.documentElement.scrollWidth, overflowCount: over.length, overflow: over.slice(0, 8), clippedCount: clipped.length, clipped: clipped.slice(0, 10) }
  })

const out = {}
// 1) 200% text at the 15 Pro size
{
  const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'es-MX' })
  const page = await ctx.newPage()
  const cases = [
    [F, 't-full12-live-15pro-light-a11y-text200.png'],
    [F + '/tarjeta', 't_tarjeta-full12-live-15pro-light-a11y-text200.png'],
    [F + '/tarjeta#grid', 't_tarjeta-full12-live-15pro-light-a11y-text200-grid.png'],
    [F + '/dinero', 't_dinero-full12-live-15pro-light-a11y-text200.png'],
    [F + '/juegos#individual', 't_juegos-full12-live-15pro-light-a11y-text200-individual.png'],
    ['/t/_/longnames', 't-longnames-15pro-light-a11y-text200.png'],
    [F + '/admin/calcutta', 't_admin_calcutta-full12-live-15pro-light-a11y-text200.png'],
  ]
  for (const [route, shot] of cases) {
    const [p, hash] = route.split('#')
    await page.goto(BASE + p, { waitUntil: 'networkidle' })
    await page.waitForTimeout(600)
    await page.evaluate(() => (document.documentElement.style.fontSize = '200%'))
    if (hash === 'grid') await page.getByRole('button', { name: /^Ver tarjeta$/ }).click()
    if (hash === 'individual') await page.locator('main h1 ~ div button').first().click()
    await page.waitForTimeout(500)
    out[`200% ${route}`] = await page.evaluate(probe)
    await page.screenshot({ path: SHOTS + shot })
    console.log(`200% ${route}: hScroll=${out[`200% ${route}`].hScroll} overflow=${out[`200% ${route}`].overflowCount} clipped=${out[`200% ${route}`].clippedCount}`)
  }
  await ctx.close()
}
// 2) 320 px reflow at 100%
{
  const ctx = await browser.newContext({ viewport: { width: 320, height: 568 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'es-MX' })
  const page = await ctx.newPage()
  const cases = [F, F + '/tarjeta', F + '/tarjeta#grid', F + '/juegos', F + '/dinero', F + '/stats', F + '/mas', F + '/admin/torneo', F + '/admin/jugadores', F + '/admin/scores', F + '/admin/calcutta', '/t/_/longnames', '/t/_/longnames/tarjeta', '/t/_/large60/dinero', '/organizer/nuevo/_', '/p/_/yo', '/ronda/_', '/']
  for (const route of cases) {
    const [p, hash] = route.split('#')
    await page.goto(BASE + p, { waitUntil: 'networkidle' })
    await page.waitForTimeout(600)
    if (hash === 'grid') await page.getByRole('button', { name: /^Ver tarjeta$/ }).click()
    await page.waitForTimeout(300)
    out[`320 ${route}`] = await page.evaluate(probe)
    const o = out[`320 ${route}`]
    console.log(`320 ${route}: hScroll=${o.hScroll} (${o.scrollWidth}) overflow=${o.overflowCount} clipped=${o.clippedCount}`)
    if (route === F + '/tarjeta') await page.screenshot({ path: SHOTS + 't_tarjeta-full12-live-se-light-a11y-320.png' })
    if (route === '/t/_/longnames/tarjeta') await page.screenshot({ path: SHOTS + 't_tarjeta-longnames-se-light-a11y-320.png' })
  }
  // 3) 320 px AND 200% text on the Tarjeta: the worst case for low-vision players
  await page.goto(BASE + F + '/tarjeta', { waitUntil: 'networkidle' })
  await page.waitForTimeout(500)
  await page.evaluate(() => (document.documentElement.style.fontSize = '200%'))
  await page.waitForTimeout(400)
  out['320+200% tarjeta'] = await page.evaluate(probe)
  await page.screenshot({ path: SHOTS + 't_tarjeta-full12-live-se-light-a11y-320-text200.png' })
  console.log('320+200% tarjeta', JSON.stringify(out['320+200% tarjeta']).slice(0, 400))
  await ctx.close()
}
fs.writeFileSync(path.join(DIR, 'zoom.json'), JSON.stringify(out, null, 1))
await browser.close()
