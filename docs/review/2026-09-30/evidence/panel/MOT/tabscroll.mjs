// Tab switches keep the window scroll: scroll En vivo to the feed, then tap each tab and read scrollY.
import { launch, ctx, BASE } from './lib.mjs'
const b = await launch()
const c = await ctx(b, '15pro')
const p = await c.newPage()
await p.goto(BASE + '/t/_/full12-live', { waitUntil: 'networkidle' })
await p.waitForTimeout(900)
const max = await p.evaluate(() => document.documentElement.scrollHeight - innerHeight)
await p.evaluate(() => scrollTo(0, 1100)); await p.waitForTimeout(200)
console.log('En vivo scrollY', await p.evaluate(() => scrollY), 'of max', max)
for (const tab of ['Juegos', 'Dinero', 'Más', 'Tarjeta']) {
  await p.getByRole('link', { name: tab }).click(); await p.waitForTimeout(500)
  const r = await p.evaluate(() => ({ y: Math.round(scrollY), max: document.documentElement.scrollHeight - innerHeight, firstH: [...document.querySelectorAll('h1,h2,[class*="holeNum"]')].map((h) => ({ t: (h.textContent || '').slice(0, 20), top: Math.round(h.getBoundingClientRect().top) })).slice(0, 2) }))
  console.log(tab, JSON.stringify(r))
  if (tab === 'Juegos') await p.screenshot({ path: 'shots/tab-juegos-after-scroll.png' })
  await p.getByRole('link', { name: 'En vivo' }).click(); await p.waitForTimeout(400)
  await p.evaluate(() => scrollTo(0, 1100)); await p.waitForTimeout(200)
}
await b.close()
