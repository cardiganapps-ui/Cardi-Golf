import { open, BASE, settle } from './lib.mjs'
const { browser, page } = await open('15pro')
await page.goto(BASE + '/t/_/full12-finished/mas', { waitUntil: 'networkidle' }); await settle(page)
const live = await page.evaluate(() => { const b = document.querySelector('.btn--primary'); return b ? getComputedStyle(b).backgroundColor : null })
await page.goto(BASE + '/t/_/full12-finished/ceremonia', { waitUntil: 'networkidle' }); await settle(page)
const cer = await page.evaluate(() => { const b = document.querySelector('.btn--primary'); const n = [...document.querySelectorAll('button')].find(x => /Siguiente/.test(x.textContent)); const cs = n && getComputedStyle(n); return { primaryBg: b && getComputedStyle(b).backgroundColor, next: cs && { color: cs.color, bg: cs.backgroundColor } } })
console.log('Más primary (same tournament):', live, '| Ceremonia primary:', cer.primaryBg, '| Siguiente:', JSON.stringify(cer.next))
await browser.close()
