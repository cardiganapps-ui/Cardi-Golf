import { launch } from './lib.mjs'
const b = await launch()
for (const vp of [{ width: 375, height: 667 }, { width: 320, height: 640 }]) {
  const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  const page = await ctx.newPage()
  await page.goto('http://127.0.0.1:4173/t/_/full12-live/juegos', { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: /Los Matrimonios/ }).first().click()
  await page.waitForTimeout(1000)
  const money = (await page.locator('main').innerText()).match(/\$[\d,]+/g)?.slice(0, 8)
  const clipped = await page.evaluate(() => [...document.querySelectorAll('main *')].filter(e => e.children.length === 0 && /\$\d/.test(e.textContent) && (e.scrollWidth > e.clientWidth + 1 || e.getBoundingClientRect().right > innerWidth + 0.5)).map(e => e.textContent.trim()))
  console.log(vp.width + 'px', 'money on pairs board:', JSON.stringify(money), '| clipped/overflowing:', JSON.stringify(clipped))
  await ctx.close()
}
await b.close()
