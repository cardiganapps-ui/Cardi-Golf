import { chromium } from 'playwright-core'
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
const page = await ctx.newPage()
await page.goto('http://127.0.0.1:4173/t/_/full12-live', { waitUntil: 'networkidle' })
await page.waitForTimeout(600)
await page.locator('button[aria-label*=".º"]').first().click()
await page.waitForTimeout(600)
const cells = await page.evaluate(() => [...document.querySelectorAll('[role="dialog"] button[aria-label^="Hoyo"]')].map((b) => { const r = b.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)] }))
const sizes = {}
for (const [w, h] of cells) sizes[`${w}x${h}`] = (sizes[`${w}x${h}`] ?? 0) + 1
console.log('player-sheet hole buttons', cells.length, JSON.stringify(sizes))
await page.locator('[role="dialog"] table').first().scrollIntoViewIfNeeded()
await page.waitForTimeout(200)
await page.screenshot({ path: '/home/user/Cardi-Golf/docs/review/2026-09-30/shots/t-full12-live-15pro-light-a11y-playersheet.png' })
await browser.close()
