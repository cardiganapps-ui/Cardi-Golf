import { launch, BASE, sleep, shot, log } from './lib.mjs'
const b = await launch()
const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, locale: 'es-MX', hasTouch: true })
await ctx.route(/supabase\.co/, (r) => r.abort())
const p = await ctx.newPage()
await p.goto(`${BASE}/t/_/full12-finished/ceremonia`, { waitUntil: 'networkidle' })
await sleep(800)
const btns = await p.getByRole('button').allTextContents()
console.log('buttons at start', JSON.stringify(btns))
let taps = 0, steps = [], t0 = Date.now()
for (let i = 0; i < 40; i++) {
  const prog = await p.locator('[class*="progress"]').first().textContent().catch(() => '')
  const title = await p.locator('h2').first().textContent().catch(() => '')
  const reveal = p.getByRole('button', { name: /Revelar/ })
  if (await reveal.isVisible().catch(() => false)) {
    await reveal.tap(); taps++; steps.push(`R[${prog}] ${title}`)
    await sleep(1500)
    continue
  }
  const next = p.getByRole('button', { name: /Siguiente|Empezar/ }).last()
  if (!(await next.isEnabled().catch(() => false))) break
  await next.tap(); taps++; steps.push(`N[${prog}] ${title}`)
  // wait for the next step's Revelar or the end
  await Promise.race([p.getByRole('button', { name: /Revelar/ }).waitFor({ timeout: 3000 }).catch(() => {}), sleep(3000)])
}
console.log('taps', taps, 'secs (incl. 1.5 s pause per reveal)', ((Date.now() - t0) / 1000).toFixed(1))
console.log(steps.join('\n'))
// keyboard support on a laptop driving the TV
await p.goto(`${BASE}/t/_/full12-finished/ceremonia`, { waitUntil: 'networkidle' })
await sleep(600)
const before = await p.locator('h2').first().textContent().catch(() => '')
await p.keyboard.press('ArrowRight'); await sleep(600)
await p.keyboard.press('Space'); await sleep(600)
const after = await p.locator('h2').first().textContent().catch(() => '')
console.log('keyboard: before', JSON.stringify(before), 'after ArrowRight+Space', JSON.stringify(after))
await b.close()
