// Day-2 handicap review, settlement + "Pagado", and the Ceremonia, on fixtures.
import { launch, phone, BASE, Journey, saveJson, shot, sleep, log, measureTargets } from './lib.mjs'
const b = await launch()
const out = {}

// A. Day-2 handicaps
{
  const ctx = await phone(b, { blockSupabase: true })
  const p = await ctx.newPage()
  await p.goto(`${BASE}/t/_/full12-live/admin/handicaps`, { waitUntil: 'networkidle' })
  await sleep(500)
  await shot(p, 't_admin_handicaps-full12-live-15pro-light-ux.png')
  out.hcpText = (await p.evaluate(() => document.body.innerText)).split('\n').slice(14, 60).join(' | ')
  out.hcpTargets = (await measureTargets(p)).filter((t) => t.small).map((t) => `${t.name} ${t.w}x${t.h}`)
  await ctx.close()
}

// B. Dinero on the finished tournament: settlement and every "Pagado".
{
  const ctx = await phone(b, { blockSupabase: true })
  const p = await ctx.newPage()
  await p.goto(`${BASE}/t/_/full12-finished/dinero`, { waitUntil: 'networkidle' })
  await sleep(500)
  await shot(p, 't_dinero-full12-finished-15pro-light-ux.png')
  const j = new Journey('settlement', p)
  const segs = await p.getByRole('radio').allTextContents()
  out.moneyViews = segs
  const liq = p.getByRole('radio', { name: /Liquidación/ })
  if (await liq.count()) await j.tap(liq, 'Liquidación', () => sleep(300))
  await sleep(400)
  await shot(p, 't_dinero-full12-finished-15pro-light-ux-liquidacion.png', { fullPage: true })
  out.paidButtons = await p.getByRole('button', { name: /Pagado/ }).count()
  out.liqText = (await p.evaluate(() => document.body.innerText)).slice(0, 2500)
  out.scrollHeight = await p.evaluate(() => document.documentElement.scrollHeight)
  // Tap the first "Pagado": does it ask, and what does a failure look like?
  if (out.paidButtons) {
    await j.tap(p.getByRole('button', { name: /Pagado/ }).first(), 'first Pagado', () => sleep(700))
    out.paidDialog = await p.getByRole('dialog').isVisible().catch(() => false)
    out.paidToast = await p.locator('[class*="toaster"]').allTextContents()
  }
  out.settlement = j.summary()
  log('money', JSON.stringify({ views: segs, paidButtons: out.paidButtons, paidDialog: out.paidDialog, paidToast: out.paidToast, scrollHeight: out.scrollHeight }))
  await ctx.close()
}

// C. Ceremonia at TV size, walked with the on-screen buttons.
{
  const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, locale: 'es-MX', hasTouch: true })
  await ctx.route(/supabase\.co/, (r) => r.abort())
  const p = await ctx.newPage()
  await p.goto(`${BASE}/t/_/full12-finished/ceremonia`, { waitUntil: 'networkidle' })
  await sleep(800)
  await shot(p, 't_ceremonia-full12-finished-tv-dark-ux-start.png')
  const j = new Journey('ceremonia', p)
  let guard = 0
  const trail = []
  while (guard++ < 40) {
    const reveal = p.getByRole('button', { name: /Revelar/ })
    if (await reveal.isVisible().catch(() => false)) {
      await j.tap(reveal, 'Revelar', () => sleep(50))
      trail.push('R')
      continue
    }
    const next = p.getByRole('button', { name: /Siguiente|Empezar|Comenzar/ }).last()
    if (await next.isEnabled().catch(() => false)) {
      const before = await p.locator('[class*="progress"]').textContent().catch(() => '')
      await j.tap(next, `Siguiente (${before})`, () => sleep(50))
      trail.push('N')
    } else break
    await sleep(250)
  }
  await sleep(600)
  await shot(p, 't_ceremonia-full12-finished-tv-dark-ux-end.png')
  out.ceremony = j.summary()
  out.ceremonyTrail = trail.join('')
  out.keyboard = await p.evaluate(() => !!document.querySelector('[aria-keyshortcuts]'))
  log('ceremony', `taps=${out.ceremony.taps} trail=${out.ceremonyTrail}`)
  await ctx.close()
}
saveJson('money-ceremony', out)
await b.close()
