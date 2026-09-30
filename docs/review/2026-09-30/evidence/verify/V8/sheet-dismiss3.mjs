import { chromium } from 'playwright-core'
const B = 'http://127.0.0.1:4208'
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const ctx = await b.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true })
const page = await ctx.newPage()
page.on('pageerror', (e) => console.log('[pageerror]', e.message))
for (const y of [66, 64, 60, 50, 34, 10]) {
  await page.goto(`${B}/t/_/full12-live`, { waitUntil: 'networkidle' })
  await page.locator('main button[aria-label]').filter({ hasText: /\d/ }).first().click()
  await page.getByRole('dialog').first().waitFor(); await page.waitForTimeout(500)
  await page.evaluate(() => { window.__ev = []; for (const t of ['touchstart', 'touchend', 'click', 'pointerdown', 'pointerup']) document.addEventListener(t, (e) => window.__ev.push(`${t}@${e.target?.className?.toString().slice(0, 18)}`), true) })
  await page.touchscreen.tap(196, y); await page.waitForTimeout(600)
  console.log(`touch tap at y=${y}: dialogs=${await page.getByRole('dialog').count()} events=${JSON.stringify(await page.evaluate(() => window.__ev))}`)
}
await b.close()
