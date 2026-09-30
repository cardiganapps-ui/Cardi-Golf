import { open, BASE, settle } from './lib.mjs'
for (const [dev, fx] of [['se', 'full12-live'], ['15pro', 'full12-live'], ['se', 'longnames'], ['se', 'minimal4-live']]) {
  const { browser, page } = await open(dev)
  await page.goto(BASE + '/t/_/' + fx, { waitUntil: 'networkidle' }); await settle(page)
  const r = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('button[class*="leaderRow"]')]
    const tab = document.querySelector('nav[class*="tab"], [class*="tabbar"], [class*="tabs"]')
    const tabTop = tab ? tab.getBoundingClientRect().top : innerHeight
    const first = rows[0]?.getBoundingClientRect().top
    const visible = rows.filter(r => r.getBoundingClientRect().bottom <= tabTop).length
    return { vh: innerHeight, firstRowTop: Math.round(first), tabTop: Math.round(tabTop), fullyVisibleRows: visible, total: rows.length }
  })
  console.log(dev, fx, JSON.stringify(r))
  await browser.close()
}
