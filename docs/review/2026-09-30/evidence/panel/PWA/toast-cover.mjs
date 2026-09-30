import { launch, ctxFor, SHOTS } from './lib.mjs'
const b = await launch()
for (const dev of ['se', '15pro']) {
  const ctx = await ctxFor(b, dev)
  const page = await ctx.newPage()
  await page.goto('http://127.0.0.1:4173/t/_/full12-live/tarjeta', { waitUntil: 'networkidle' })
  const btn = page.getByRole('button', { name: 'Guardar hoyo' })
  await btn.waitFor()
  const before = await btn.boundingBox()
  await btn.tap()
  await page.waitForTimeout(700)
  const after = await btn.boundingBox()
  const probe = await page.evaluate(({ x, y }) => { const el = document.elementFromPoint(x, y); return el ? `${el.tagName}.${el.className} "${(el.textContent||'').trim().slice(0,40)}"` : null }, { x: after.x + after.width / 2, y: after.y + after.height / 2 })
  const toast = await page.locator('[role=status]').filter({ hasText: 'guardado' }).first().boundingBox().catch(() => null)
  console.log(dev, 'button before', JSON.stringify(before), 'after', JSON.stringify(after), '\n  toast', JSON.stringify(toast), '\n  elementFromPoint(center of Guardar hoyo) ->', probe)
  if (dev === 'se') await page.screenshot({ path: `${SHOTS}/t_tarjeta-full12-live-se-light-pwa-toast-over-save.png` })
  await ctx.close()
}
await b.close()
