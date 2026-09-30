import { open, BASE, settle } from './lib.mjs'
const { browser, page } = await open('15pro')
await page.goto(BASE + '/organizer/nuevo/_', { waitUntil: 'networkidle' })
await settle(page)
const r = await page.evaluate(() => {
  const els = [...document.querySelectorAll('[class*="_choice_"]')]
  const sheets = []
  for (const sh of document.styleSheets) { let rules; try { rules = sh.cssRules } catch { continue }
    for (const r of rules) if (r.selectorText && /_choice_|_rowLine_1cnem/.test(r.selectorText) && /display/.test(r.cssText)) sheets.push((sh.href || 'inline').split('/').pop() + ' :: ' + r.selectorText + ' {display:' + r.style.display + '; grid-template-columns:' + r.style.gridTemplateColumns + '}') }
  return { n: els.length, disp: els.slice(0, 3).map(e => [e.className, getComputedStyle(e).display]), sheets }
})
console.log(JSON.stringify(r, null, 1))
await page.screenshot({ path: process.argv[2], fullPage: false })
await browser.close()
