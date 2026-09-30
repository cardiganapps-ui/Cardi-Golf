import { launch, SHOTS } from './lib.mjs'
import sharp from 'sharp'
const b = await launch()
const ctx = await b.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
const page = await ctx.newPage()
const cdp = await ctx.newCDPSession(page)
await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 59, bottom: 34, left: 0, right: 0 } })
for (const r of ['torneo', 'calcutta', 'grupos']) {
  await page.goto('http://127.0.0.1:4173/t/_/full12-live/admin/' + r, { waitUntil: 'networkidle' })
  await page.waitForTimeout(800)
  const bar = await page.evaluate(() => {
    const el = [...document.querySelectorAll('div')].find(d => getComputedStyle(d).position === 'sticky' && getComputedStyle(d).bottom !== 'auto')
    if (!el) return null
    const btn = el.querySelector('button'); const r = (btn ?? el).getBoundingClientRect()
    return { text: (btn?.textContent ?? '').trim().slice(0, 30), bottomGap: Math.round(innerHeight - r.bottom), stuck: Math.round(innerHeight - el.getBoundingClientRect().bottom) }
  })
  console.log('/admin/' + r, JSON.stringify(bar), '(home-indicator zone = bottom 34 px)')
  if (r === 'grupos') {
    const home = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="786" height="1704"><rect x="1.5" y="1636" width="783" height="66" fill="none" stroke="#d00" stroke-width="3" stroke-dasharray="10 8"/><rect x="253" y="1676" width="280" height="10" rx="5" fill="#000"/></svg>`)
    await sharp(await page.screenshot()).composite([{ input: home }]).png().toFile(`${SHOTS}/t_admin_grupos-full12-live-15pro-light-pwa-home-indicator.png`)
  }
}
await b.close()
