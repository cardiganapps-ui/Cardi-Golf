import { chromium } from 'playwright-core'
export const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
export const BASE = process.env.BASE || 'http://127.0.0.1:4188'
export const DEV = {
  se: { viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  '15pro': { viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  android: { viewport: { width: 412, height: 915 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  ipad: { viewport: { width: 1024, height: 1366 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true },
  laptop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  tv: { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 },
}
export async function open(device = '15pro', extra = {}) {
  const browser = await chromium.launch({ executablePath: EXE })
  const ctx = await browser.newContext({ ...DEV[device], locale: 'es-MX', timezoneId: 'America/Mazatlan', colorScheme: 'light', reducedMotion: 'reduce', ...extra })
  const page = await ctx.newPage()
  return { browser, ctx, page }
}
export async function settle(page, ms = 600) {
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(ms)
}
