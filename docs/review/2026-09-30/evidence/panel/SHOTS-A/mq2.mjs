import { chromium } from 'playwright-core'
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
const base = { viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block' }
for (const [name, extra] of [['base', {}], ['ua', { userAgent: UA }], ['all', { userAgent: UA, reducedMotion: 'reduce', colorScheme: 'light', locale: 'es-MX', timezoneId: 'America/Mazatlan' }]]) {
  const ctx = await b.newContext({ ...base, ...extra })
  const p = await ctx.newPage()
  await p.goto('http://127.0.0.1:4173/t/_/full12-live', { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(1500)
  const r = await p.evaluate(() => ({ coarse: matchMedia('(pointer: coarse)').matches, btns: [...document.querySelectorAll('button')].filter(b => /Compartir/.test(b.textContent)).map(b => b.className + ' ' + Math.round(b.getBoundingClientRect().height)) }))
  console.log(name, JSON.stringify(r))
  await ctx.close()
}
await b.close()
