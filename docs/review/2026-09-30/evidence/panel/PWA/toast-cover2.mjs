import { launch, SHOTS } from './lib.mjs'
const b = await launch()
const cases = [
  ['15pro-standalone', { width: 393, height: 852 }, { top: 59, bottom: 34, left: 0, right: 0 }],
  ['15pro-safari', { width: 393, height: 659 }, { top: 0, bottom: 0, left: 0, right: 0 }],
  ['13mini-standalone', { width: 375, height: 812 }, { top: 50, bottom: 34, left: 0, right: 0 }],
  ['android', { width: 412, height: 915 }, { top: 0, bottom: 0, left: 0, right: 0 }],
]
for (const [name, viewport, ins] of cases) {
  const ctx = await b.newContext({ viewport, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  const page = await ctx.newPage()
  const cdp = await ctx.newCDPSession(page)
  await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: ins })
  await page.goto('http://127.0.0.1:4173/t/_/full12-live/tarjeta', { waitUntil: 'networkidle' })
  const btn = page.getByRole('button', { name: 'Guardar hoyo' })
  await btn.waitFor()
  await btn.tap()
  await page.waitForTimeout(600)
  const bb = await btn.boundingBox()
  const toast = page.locator('[role=status]').filter({ hasText: 'guardado' }).first()
  const tb = await toast.boundingBox().catch(() => null)
  const act = await toast.locator('button').boundingBox().catch(() => null)
  const hit = async (x, y) => page.evaluate(({ x, y }) => { const el = document.elementFromPoint(x, y); return el ? `${el.tagName} "${(el.textContent||'').trim().slice(0,30)}"` : null }, { x, y })
  console.log(name, 'save', JSON.stringify(bb), 'toast', JSON.stringify(tb), 'action', JSON.stringify(act))
  if (bb) console.log('   hit@center', await hit(bb.x + bb.width / 2, bb.y + bb.height / 2), '| hit@center+50px', await hit(bb.x + bb.width / 2 + 50, bb.y + bb.height / 2))
  if (name === '15pro-standalone') await page.screenshot({ path: `${SHOTS}/t_tarjeta-full12-live-15pro-light-pwa-standalone-toast-over-save.png` })
  await ctx.close()
}
await b.close()
