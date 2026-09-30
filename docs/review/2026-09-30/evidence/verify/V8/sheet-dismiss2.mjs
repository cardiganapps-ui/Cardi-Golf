import { chromium } from 'playwright-core'
const B = 'http://127.0.0.1:4208'
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
for (const inset of [0, 59]) {
  const ctx = await b.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true })
  const page = await ctx.newPage()
  const cdp = await ctx.newCDPSession(page)
  await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: inset, bottom: inset ? 34 : 0, left: 0, right: 0 } })
  await page.goto(`${B}/t/_/full12-live`, { waitUntil: 'networkidle' })
  await page.locator('main button[aria-label]').filter({ hasText: /\d/ }).first().click()
  await page.getByRole('dialog').first().waitFor(); await page.waitForTimeout(500)
  const box = await page.getByRole('dialog').first().boundingBox()
  for (const y of [64, 40, 10]) {
    const hit = await page.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return e ? `${e.tagName}.${(e.className || '').toString().slice(0, 30)} role=${e.getAttribute('role')}` : null }, [196, y])
    console.log(`inset ${inset}: sheet top=${Math.round(box.y)}; elementFromPoint(196,${y}) = ${hit}`)
  }
  await page.touchscreen.tap(196, 64); await page.waitForTimeout(500)
  const afterTap = await page.getByRole('dialog').count()
  let afterClick = afterTap
  if (afterTap) { await page.mouse.click(196, 40); await page.waitForTimeout(500); afterClick = await page.getByRole('dialog').count() }
  console.log(`inset ${inset}: after touch tap at y=64 dialogs=${afterTap}; after mouse click at y=40 dialogs=${afterClick}`)
  await ctx.close()
}
await b.close()
