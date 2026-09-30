import { open, BASE, settle } from './lib.mjs'
const { browser, page } = await open('15pro')
await page.goto(BASE + '/t/_/full12-live/juegos', { waitUntil: 'networkidle' })
await settle(page)
const probe = async (label) => page.evaluate((label) => {
  const rows = [...document.querySelectorAll('[class*="rowLine"], [class*="gameRow"]')]
  return { label, rows: rows.slice(0, 20).map(r => ({ cls: r.className, display: getComputedStyle(r).display, gtc: getComputedStyle(r).gridTemplateColumns, last: (() => { const l = r.lastElementChild; if (!l) return null; const b = l.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.right)] })(), w: Math.round(r.getBoundingClientRect().width) })) }
}, label)
console.log(JSON.stringify(await probe('overview'), null, 0).slice(0, 1500))
// open Calcutta
await page.getByRole('button', { name: /La Calcutta/ }).first().click()
await settle(page)
console.log(JSON.stringify(await probe('calcutta'), null, 0).slice(0, 3000))
// which stylesheets define display for the rowLine classes
const sheets = await page.evaluate(() => {
  const out = []
  for (const sh of document.styleSheets) { let rules; try { rules = sh.cssRules } catch { continue }
    for (const r of rules) if (r.selectorText && /rowLine|gameRow/.test(r.selectorText) && /display/.test(r.cssText)) out.push((sh.href || 'inline').split('/').pop() + ' :: ' + r.cssText.slice(0, 160)) }
  return out
})
console.log(sheets.join('\n'))
await page.screenshot({ path: process.argv[2] || '/dev/null' })
await browser.close()
