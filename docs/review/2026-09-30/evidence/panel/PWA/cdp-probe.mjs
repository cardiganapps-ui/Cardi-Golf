import { chromium } from 'playwright-core'
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
console.log('version', browser.version())
const ctx = await browser.newContext()
const page = await ctx.newPage()
const cdp = await ctx.newCDPSession(page)
for (const [m, p] of [
  ['Emulation.setSafeAreaInsetsOverride', { insets: { top: 59, bottom: 34, left: 0, right: 0 } }],
  ['Emulation.setEmulatedMedia', { features: [{ name: 'display-mode', value: 'standalone' }] }],
]) {
  try { await cdp.send(m, p); console.log(m, 'OK') } catch (e) { console.log(m, 'ERR', e.message) }
}
await page.goto('http://127.0.0.1:4173/fixture')
console.log('display-mode standalone?', await page.evaluate(() => matchMedia('(display-mode: standalone)').matches))
console.log('safe top', await page.evaluate(() => { const d = document.createElement('div'); d.style.cssText='position:fixed;top:0;height:env(safe-area-inset-top);width:1px'; document.body.appendChild(d); return d.getBoundingClientRect().height }))
await browser.close()
