import { launch, ctx, BASE } from './lib.mjs'
const b = await launch()
const c = await ctx(b, 'tv')
const p = await c.newPage()
await p.goto(BASE + '/t/_/full12-finished/ceremonia', { waitUntil: 'networkidle' })
await p.waitForTimeout(900)
await p.getByRole('button', { name: 'Empezar la ceremonia' }).click(); await p.waitForTimeout(900)
const titles = []
for (let k = 0; k < 20; k++) { const t = await p.evaluate(() => document.querySelector('h2')?.textContent || ''); titles.push(t); if (/Campe/i.test(t)) break; await p.getByRole('button', { name: 'Siguiente' }).click(); await p.waitForTimeout(900) }
console.log('steps seen:', titles.join(' → '))
await p.screenshot({ path: 'shots/champion-before.png' })
await p.getByRole('button', { name: 'Revelar' }).click()
await p.waitForTimeout(120); await p.screenshot({ path: 'shots/champion-120ms.png' })
await p.waitForTimeout(500); await p.screenshot({ path: 'shots/champion-620ms.png' })
await p.waitForTimeout(1500); await p.screenshot({ path: 'shots/champion-2100ms.png' })
await b.close()
