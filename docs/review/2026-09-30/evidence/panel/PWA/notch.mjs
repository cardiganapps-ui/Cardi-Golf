import { launch, SHOTS } from './lib.mjs'
import sharp from 'sharp'
const b = await launch()
const ctx = await b.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
const page = await ctx.newPage()
const cdp = await ctx.newCDPSession(page)
await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 59, bottom: 34, left: 0, right: 0 } })
const overlay = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="786" height="1704">
  <rect x="0" y="0" width="786" height="118" fill="none" stroke="#d00" stroke-width="3" stroke-dasharray="10 8"/>
  <rect x="267" y="22" width="252" height="74" rx="37" fill="#000"/>
  <text x="96" y="74" font-family="sans-serif" font-size="34" font-weight="600" fill="#fff">9:41</text>
  <rect x="640" y="50" width="54" height="24" rx="6" fill="none" stroke="#fff" stroke-width="3"/><rect x="644" y="54" width="40" height="16" rx="3" fill="#fff"/>
  <text x="400" y="150" font-family="sans-serif" font-size="22" fill="#d00" text-anchor="middle">status-bar area (safe-area-inset-top 59 px), white icons from black-translucent</text>
</svg>`)
for (const [route, name, scroll] of [['/t/_/full12-live', 't_live-full12-live-15pro-light-pwa-notch', 600], ['/t/_/full12-live/juegos', 't_juegos-full12-live-15pro-light-pwa-notch', 500]]) {
  await page.goto('http://127.0.0.1:4173' + route, { waitUntil: 'networkidle' })
  await page.waitForTimeout(500)
  const hdr = page.locator('header').first()
  const top0 = (await hdr.boundingBox()).y
  await page.mouse.wheel(0, scroll)
  await page.waitForTimeout(600)
  const top1 = (await hdr.boundingBox()).y
  const scrollY = await page.evaluate(() => scrollY)
  console.log(route, 'header top before scroll', top0, 'after scroll', top1, 'scrollY', scrollY)
  const buf = await page.screenshot()
  await sharp(buf).composite([{ input: overlay }]).png().toFile(`${SHOTS}/${name}-scrolled.png`)
}
// Also: the top of the app at rest behind the status bar (what colour sits behind white icons)
await page.goto('http://127.0.0.1:4173/t/_/full12-live', { waitUntil: 'networkidle' })
const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
console.log('body background (behind the translucent status bar):', bg)
await b.close()
