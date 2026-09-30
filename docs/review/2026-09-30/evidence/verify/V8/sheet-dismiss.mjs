// V8 / A11Y-02: sighted dismissal paths of the player sheet on a phone (no Escape key):
// drag the handle down, tap the strip above; and how much strip is left under an iOS status bar.
import { chromium } from 'playwright-core'
const B = 'http://127.0.0.1:4208'
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const ctx = await b.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true })
const page = await ctx.newPage()
const cdp = await ctx.newCDPSession(page)
await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 59, bottom: 34, left: 0, right: 0 } })
const open = async () => {
  await page.goto(`${B}/t/_/full12-live`, { waitUntil: 'networkidle' })
  await page.locator('main button[aria-label]').filter({ hasText: /\d/ }).first().click()
  await page.getByRole('dialog').first().waitFor(); await page.waitForTimeout(400)
}
await open()
const box = await page.getByRole('dialog').first().boundingBox()
console.log(`sheet top=${Math.round(box.y)} (92dvh of 852); strip above = ${Math.round(box.y)} px, of which below a 59 px status bar = ${Math.round(box.y) - 59} px`)
// Drag the handle down 350 px
const hx = 196, hy = Math.round(box.y) + 8
await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: hx, y: hy }] })
for (let i = 1; i <= 7; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: hx, y: hy + i * 50 }] })
await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
await page.waitForTimeout(500)
console.log(`after dragging the handle down 350 px: dialogs=${await page.getByRole('dialog').count()}`)
// Tap in the strip just above the sheet (below the status bar)
await page.touchscreen.tap(196, Math.round(box.y) - 4)
await page.waitForTimeout(400)
console.log(`after tapping the strip at y=${Math.round(box.y) - 4}: dialogs=${await page.getByRole('dialog').count()}`)
await b.close()
