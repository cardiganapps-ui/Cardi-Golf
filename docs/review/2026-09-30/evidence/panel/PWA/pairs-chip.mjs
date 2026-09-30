import { launch } from './lib.mjs'
const b = await launch()
for (const [dev, vp] of [['se', { width: 375, height: 667 }], ['15pro', { width: 393, height: 852 }]]) {
  const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  const page = await ctx.newPage()
  await page.goto('http://127.0.0.1:4173/t/_/full12-live/juegos', { waitUntil: 'networkidle' })
  const tab = page.getByRole('tab', { name: /Matrimonios/ }).or(page.getByRole('radio', { name: /Matrimonios/ })).or(page.getByRole('button', { name: /Matrimonios/ }))
  await tab.first().click().catch(() => {})
  await page.waitForTimeout(800)
  // any element whose text is money and whose content overflows its box
  const clipped = await page.evaluate(() => [...document.querySelectorAll('span,div,td')].filter(e => /\$\d/.test(e.textContent) && e.children.length === 0 && (e.scrollWidth > e.clientWidth + 1)).map(e => `${e.textContent.trim()} (scroll ${e.scrollWidth} > client ${e.clientWidth})`).slice(0, 8))
  console.log(dev, 'clipped money texts:', JSON.stringify(clipped))
  await ctx.close()
}
await b.close()
