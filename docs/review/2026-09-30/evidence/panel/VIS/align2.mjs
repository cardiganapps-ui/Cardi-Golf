import { open, BASE, settle } from './lib.mjs'
const fixture = process.argv[2] || 'full12-live'
const { browser, page } = await open(process.argv[3] || '15pro')
await page.goto(BASE + '/t/_/' + fixture, { waitUntil: 'networkidle' })
await settle(page)
const r = await page.evaluate(() => {
  const heads = [...document.querySelectorAll('div[aria-hidden="true"]')].filter(d => /HOY|Hoy/i.test(d.textContent) && d.children.length === 5)
  const head = heads[0]
  const tb = (e) => { const r = document.createRange(); r.selectNodeContents(e); const b = r.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.right)] }
  const hs = [...head.children].map(e => ({ t: e.textContent, ta: getComputedStyle(e).textAlign, text: tb(e) }))
  const rows = [...document.querySelectorAll('button[class*="leaderRow"]')].slice(0, 12)
  const rs = rows.map(row => [...row.children].filter(e => !e.className.includes('moved')).slice(2).map(e => ({ t: e.textContent, ta: getComputedStyle(e).textAlign, text: tb(e) })))
  return { hs: hs.slice(2), rs }
})
console.log('HEADER', JSON.stringify(r.hs))
for (const row of r.rs) console.log(row.map(c => `${c.t}@${c.text[0]}-${c.text[1]}(${c.ta})`).join('  '))
await browser.close()
