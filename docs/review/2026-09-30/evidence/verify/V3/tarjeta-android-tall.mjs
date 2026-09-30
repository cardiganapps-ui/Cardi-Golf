// PWA-01 scope: Android 412x915 when the Tarjeta is taller than the screen (hole contest on the hole) -> sticky save bar.
import { launch, phone, BASE, sleep, logTo, SHOTS } from './lib.mjs'
const log = logTo('tarjeta-taps.log')
const b = await launch()
for (const [fx, hole] of [['friends8', 2], ['friends8', 6]]) {
  const { ctx, page } = await phone(b, { width: 412, height: 915, onSupabase: (r) => (/\/rest\/v1\/scores/.test(r.request().url()) ? r.fulfill({ status: 201, body: '' }) : r.abort()) })
  await page.goto(`${BASE}/t/_/${fx}/tarjeta?hoyo=${hole}`, { waitUntil: 'domcontentloaded' })
  const btn = page.locator('[class*=saveBar] button').first()
  await btn.waitFor(); await sleep(800)
  const contest = await page.locator('[class*=contest]').count()
  const docH = await page.evaluate(() => document.documentElement.scrollHeight)
  let bb = await btn.boundingBox()
  await page.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2)
  await sleep(700)
  bb = await btn.boundingBox()
  const tb = await page.locator('[role=status]').filter({ hasText: 'guardado' }).first().boundingBox().catch(() => null)
  const contestAfter = await page.locator('[class*=contest]').count(); const holeAfter = await page.locator('[class*=holeNum]').first().textContent(); const center = await page.evaluate(({ x, y }) => { const el = document.elementFromPoint(x, y); const bt = el?.closest('button'); return `${bt ? 'BUTTON' : el?.tagName} "${(bt ?? el)?.textContent?.trim().slice(0, 20)}"` }, { x: bb.x + bb.width / 2, y: bb.y + bb.height / 2 })
  log('ANDROID-TALL', JSON.stringify({ fx, hole, contestBlocks: contest, docHeight: docH, save: { y: Math.round(bb.y), h: Math.round(bb.height) }, toast: tb && { y: Math.round(tb.y), h: Math.round(tb.height) }, centerHit: center, holeAfter, contestAfter }))
  if (fx === 'friends8' && hole === 2) await page.screenshot({ path: `${SHOTS}/t_tarjeta-friends8-android-light-v3-toast-over-save.png` })
  await ctx.close()
}
await b.close()
