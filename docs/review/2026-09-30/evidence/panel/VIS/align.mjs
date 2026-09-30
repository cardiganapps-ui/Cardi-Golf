import { open, BASE, settle } from './lib.mjs'
const { browser, page } = await open('15pro')
await page.goto(BASE + '/t/_/full12-live', { waitUntil: 'networkidle' })
await settle(page)
const r = await page.evaluate(() => {
  const head = [...document.querySelectorAll('[class*="boardHead"]')][0]
  const rows = [...document.querySelectorAll('button[class*="leaderRow"]')].slice(0, 6)
  const hs = [...head.children].map(e => ({ t: e.textContent, ta: getComputedStyle(e).textAlign, right: Math.round(e.getBoundingClientRect().right), textRight: (() => { const r = document.createRange(); r.selectNodeContents(e); const b = r.getBoundingClientRect(); return Math.round(b.right) })() }))
  const rs = rows.map(row => [...row.children].filter(e => !e.className.includes('moved')).map(e => { const r = document.createRange(); r.selectNodeContents(e); const b = r.getBoundingClientRect(); return { t: e.textContent.slice(0, 14), cls: e.className.split(' ').map(c => c.replace(/^_|_[a-z0-9]+$/gi, '')).join('.'), ta: getComputedStyle(e).textAlign, boxRight: Math.round(e.getBoundingClientRect().right), textLeft: Math.round(b.left), textRight: Math.round(b.right) } }))
  return { hs, rs }
})
console.log('HEADER', JSON.stringify(r.hs))
for (const row of r.rs) console.log(JSON.stringify(row.slice(2)))
await browser.close()
