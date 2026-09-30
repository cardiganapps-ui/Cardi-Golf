// First navigation to a lazy screen (Más → Estadísticas; En vivo → TV): how long is the skeleton up, at 1x and 4x?
import { launch, ctx, BASE, load, throttle } from './lib.mjs'
const b = await launch()
for (const [from, linkName, name] of [['/t/_/full12-live/mas', /Estad/, 'Estadísticas']]) for (const rate of [1, 4]) {
  const c = await ctx(b, '15pro')
  const p = await c.newPage()
  await p.goto(BASE + from, { waitUntil: 'networkidle' })
  await p.waitForTimeout(900)
  await throttle(p, rate)
  await p.evaluate(() => { window.__sk = []; const t0 = performance.now(); const f = () => { window.__sk.push([Math.round(performance.now() - t0), document.querySelectorAll('[class*="skeleton"]').length, !!document.querySelector('.recharts-wrapper, [class*="chart"]')]); if (performance.now() - t0 < 3000) requestAnimationFrame(f) }; requestAnimationFrame(f) })
  await p.getByRole('link', { name: linkName }).first().click()
  await p.waitForTimeout(3100)
  const sk = await p.evaluate(() => window.__sk)
  const skFrames = sk.filter((x) => x[1] > 0)
  const content = sk.find((x) => x[2])
  console.log(name, rate + 'x', '| skeleton visible frames', skFrames.length, skFrames.length ? `${skFrames[0][0]}–${skFrames[skFrames.length - 1][0]} ms` : '', '| content at', content ? content[0] + ' ms' : 'never', '| load', load().split(' ')[0])
  await c.close()
}
await b.close()
