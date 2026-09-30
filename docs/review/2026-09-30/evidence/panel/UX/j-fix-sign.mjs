// Journeys on the Tarjeta: fix a wrong score from the group's phone, then finish the round and sign the rival card.
import { launch, phone, BASE, Journey, saveJson, shot, sleep, log } from './lib.mjs'

const b = await launch()
const out = {}
const holeNum = (p) => p.locator('[class*="holeNum"]')

// A. At hole 12 (current), fix hole 9 for row 1 (+1 stroke), then get back to 12.
{
  const ctx = await phone(b, { blockSupabase: true })
  const p = await ctx.newPage()
  await p.goto(`${BASE}/t/_/full12-live/tarjeta`, { waitUntil: 'networkidle' })
  await p.getByRole('button', { name: 'Guardar hoyo' }).waitFor()
  const j = new Journey('fix-score-tarjeta', p)
  await j.tap(p.getByRole('button', { name: 'Ver tarjeta' }), 'Ver tarjeta', () => p.locator('table').waitFor())
  j.scroll('scroll to hole 9 in the grid')
  await j.tap(p.locator('table button', { hasText: /^9$/ }), 'hole 9 in grid', () => holeNum(p).filter({ hasText: /^9$/ }).waitFor())
  const row1 = p.locator('[class*="player_"]').filter({ has: p.locator('[role="group"]') }).first()
  const s = row1.locator('[role="group"]').first()
  const v0 = Number(await s.locator('[aria-live]').textContent())
  await j.tap(s.locator('button').nth(1), 'row 1 strokes +', () => s.locator('[aria-live]', { hasText: String(v0 + 1) }).waitFor())
  await j.tap(p.getByRole('button', { name: /Guardar hoyo/ }), 'Guardar hoyo 9', () => Promise.race([holeNum(p).filter({ hasText: /^10$/ }).waitFor(), p.getByText('¿Quién embocó al último?').waitFor()]))
  if (await p.getByText('¿Quién embocó al último?').isVisible().catch(() => false)) {
    out.fixAskedTiebreak = true
    await j.tap(p.getByRole('dialog').getByRole('button').nth(1), 'tiebreak asked again while fixing strokes', () => holeNum(p).filter({ hasText: /^10$/ }).waitFor())
  }
  out.afterFixLandsOn = await holeNum(p).textContent()
  out.afterFixToast = await p.locator('[class*="toaster"]').allTextContents()
  // back to the group's hole
  await j.tap(p.getByRole('button', { name: 'Ver tarjeta' }), 'Ver tarjeta', () => p.locator('table').waitFor())
  j.scroll('scroll to hole 12')
  await j.tap(p.locator('table button', { hasText: /^12$/ }), 'hole 12 in grid', () => holeNum(p).filter({ hasText: /^12$/ }).waitFor())
  out.fixTarjeta = j.summary()
  log('fix-sign', `fix in Tarjeta: taps=${out.fixTarjeta.taps} landsOn=${out.afterFixLandsOn} toast=${JSON.stringify(out.afterFixToast)}`)
  await ctx.close()
}

// B. Finish holes 12..18 with defaults, then sign the rival pair's card.
{
  const ctx = await phone(b, { blockSupabase: true })
  const p = await ctx.newPage()
  await p.goto(`${BASE}/t/_/full12-live/tarjeta`, { waitUntil: 'networkidle' })
  await p.getByRole('button', { name: 'Guardar hoyo' }).waitFor()
  const j = new Journey('finish-and-sign', p)
  for (let h = 12; h <= 18; h++) {
    const btn = p.getByRole('button', { name: /Guardar/ }).first()
    await j.tap(btn, `Guardar hoyo ${h}`, async () => {
      if (h < 18) await holeNum(p).filter({ hasText: new RegExp(`^${h + 1}$`) }).waitFor()
      else await p.locator('table').waitFor()
    })
    await sleep(750) // a settle gap so the double-tap defect does not fire
    if (await p.getByText('¿Quién embocó al último?').isVisible().catch(() => false)) {
      await j.tap(p.getByRole('dialog').getByRole('button').nth(1), 'tiebreak answer')
    }
  }
  await sleep(500)
  out.lastLabel = 'Guardar el 18 (label of last save)'
  const signBtns = p.getByRole('button', { name: /Firmar/ })
  out.signButtons = await signBtns.count()
  await shot(p, 't_tarjeta-full12-live-15pro-light-ux-sign-ready.png', { fullPage: true })
  const signBox = out.signButtons ? await signBtns.first().boundingBox() : null
  out.signBox = signBox
  if (out.signButtons) {
    await j.tap(signBtns.first(), 'Firmar tarjeta', () => p.getByRole('dialog').waitFor())
    out.signSheet = await p.getByRole('dialog').innerText()
    await shot(p, 't_tarjeta-full12-live-15pro-light-ux-sign-confirm.png')
    await j.tap(p.getByRole('dialog').getByRole('button', { name: /Firmar/ }), 'confirm Firmar', () => p.getByRole('dialog').waitFor({ state: 'detached' }))
    await sleep(800)
    await shot(p, 't_tarjeta-full12-live-15pro-light-ux-signed.png')
    out.afterSign = (await p.evaluate(() => document.body.innerText)).split('\n').filter((l) => /Firm|firm|FIRM|Sin firmar/.test(l))
  }
  out.sign = j.summary()
  log('fix-sign', `finish+sign: taps=${out.sign.taps} signButtons=${out.signButtons} sheet=${JSON.stringify(out.signSheet)} after=${JSON.stringify(out.afterSign)}`)
  await ctx.close()
}
saveJson('fix-sign', out)
await b.close()
