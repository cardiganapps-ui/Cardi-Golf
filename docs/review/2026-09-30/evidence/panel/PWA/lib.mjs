import { chromium } from 'playwright-core'
export const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
export const DEV = {
  se: { viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  '15pro': { viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  android: { viewport: { width: 412, height: 915 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  '15pro-land': { viewport: { width: 852, height: 393 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  ipad: { viewport: { width: 1024, height: 1366 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true },
}
export const IOS_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1'
export async function launch() { return chromium.launch({ executablePath: EXE }) }
export async function ctxFor(browser, dev, extra = {}) { return browser.newContext({ ...DEV[dev], ...extra }) }
export async function insets(page, ctx, v) { const cdp = await ctx.newCDPSession(page); await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: v }); return cdp }
export const SHOTS = '/home/user/Cardi-Golf/docs/review/2026-09-30/shots'
