import { launch, SHOTS } from './lib.mjs'
import sharp from 'sharp'
const b = await launch()
const ctx = await b.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
const page = await ctx.newPage()
const cdp = await ctx.newCDPSession(page)
await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 59, bottom: 34, left: 0, right: 0 } })
const overlay = (caption) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="786" height="1704">
  <rect x="1.5" y="1.5" width="783" height="115" fill="none" stroke="#d00" stroke-width="3" stroke-dasharray="10 8"/>
  <rect x="267" y="22" width="252" height="74" rx="37" fill="#000"/>
  <text x="96" y="74" font-family="sans-serif" font-size="34" font-weight="600" fill="#fff">9:41</text>
  <rect x="640" y="50" width="54" height="24" rx="6" fill="none" stroke="#fff" stroke-width="3"/><rect x="644" y="54" width="40" height="16" rx="3" fill="#fff"/>
  <rect x="120" y="1560" width="546" height="40" rx="6" fill="#fff" stroke="#d00" stroke-width="2"/>
  <text x="393" y="1588" font-family="sans-serif" font-size="22" fill="#d00" text-anchor="middle">${caption}</text>
</svg>`)
await page.goto('http://127.0.0.1:4173/t/_/full12-live', { waitUntil: 'networkidle' })
await page.waitForTimeout(500)
let buf = await page.screenshot({ clip: { x: 0, y: 0, width: 393, height: 852 } })
await sharp(buf).composite([{ input: overlay('simulated iOS status bar, 59 px inset; at rest') }]).png().toFile(`${SHOTS}/t_live-full12-live-15pro-light-pwa-notch-rest.png`)
await page.mouse.wheel(0, 600)
await page.waitForTimeout(600)
buf = await page.screenshot()
await sharp(buf).composite([{ input: overlay('simulated iOS status bar; after scrolling 600 px') }]).png().toFile(`${SHOTS}/t_live-full12-live-15pro-light-pwa-notch-scrolled.png`)
await b.close()
