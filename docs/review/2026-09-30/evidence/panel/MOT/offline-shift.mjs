// Connectivity flap on the Tarjeta: where do the steppers go when the offline banner appears/disappears?
import { launch, ctx, BASE } from './lib.mjs'
const b = await launch()
for (const dev of ['15pro', 'se']) for (const scroll of [0, 'max']) {
  const c = await ctx(b, dev)
  const p = await c.newPage()
  await p.goto(BASE + '/t/_/full12-live/tarjeta', { waitUntil: 'networkidle' })
  await p.waitForTimeout(900)
  if (scroll === 'max') await p.evaluate(() => scrollTo(0, document.documentElement.scrollHeight))
  await p.waitForTimeout(200)
  const pos = () => p.evaluate(() => { const bt = [...document.querySelectorAll('button[aria-label="Golpes: más"]')][1]; const r = bt.getBoundingClientRect(); const save = [...document.querySelectorAll('button')].find((x) => /Guardar hoyo/.test(x.textContent)); return { plus2: Math.round(r.top), save: Math.round(save.getBoundingClientRect().top), y: Math.round(scrollY), banner: !!document.querySelector('[role="status"][class*="banner"]') } })
  const before = await pos()
  await c.setOffline(true); await p.waitForTimeout(300)
  const off = await pos()
  if (dev === '15pro' && scroll === 0) await p.screenshot({ path: 'shots/tarjeta-offline.png' })
  await c.setOffline(false); await p.waitForTimeout(300)
  const back = await pos()
  console.log(dev, 'scroll', scroll, '| 2nd player "+" top:', before.plus2, '→ offline', off.plus2, '→ online', back.plus2, '| save top', before.save, '→', off.save, '| banner', off.banner, '| scrollY', before.y, off.y)
  await c.close()
}
await b.close()
