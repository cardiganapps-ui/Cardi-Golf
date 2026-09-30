// Journey: set a player's handicap with the three-score estimate, and add a new player + PIN (fixture full12-live).
import { launch, phone, BASE, Journey, saveJson, shot, sleep, log, measureTargets } from './lib.mjs'

const b = await launch()
const out = {}
const URL = `${BASE}/t/_/full12-live/admin/jugadores`

// A. Estimate for an existing player
{
  const ctx = await phone(b, { blockSupabase: true })
  const p = await ctx.newPage()
  await p.goto(URL, { waitUntil: 'networkidle' })
  await sleep(400)
  await shot(p, 't_admin_jugadores-full12-live-15pro-light-ux.png')
  const j = new Journey('handicap-estimate', p)
  // Row 3 player
  const rowBtn = p.locator('[class*="rowBtn"]').nth(2)
  const who = (await rowBtn.innerText()).split('\n')[0]
  await j.tap(rowBtn, `open player ${who}`, () => p.getByRole('dialog').waitFor())
  await sleep(300)
  const dlg = p.getByRole('dialog')
  out.sheetBox = await dlg.boundingBox()
  out.focusOnOpen = await p.evaluate(() => document.activeElement?.tagName + ':' + (document.activeElement?.getAttribute('class') || ''))
  j.scroll('scroll to Hándicap')
  await j.tap(dlg.getByRole('tab', { name: /Estimar/ }), 'Estimado tab', () => dlg.getByText(/Buen día/i).first().waitFor())
  await sleep(300)
  await shot(p, 't_admin_jugadores-full12-live-15pro-light-ux-estimate.png')
  const preset = await dlg.locator('input').evaluateAll((els) => els.map((e) => e.value).filter(Boolean).slice(0, 12))
  out.prefilled = preset
  // Overwrite the three gross scores: 88 / 95 / 104, with rating/slope for the good day.
  const est = dlg.locator('input:not([type=file])')
  // order: full name, display name, then per day: gross, par, rating, slope
  const gross = [88, 95, 104]
  for (let i = 0; i < 3; i++) {
    await j.type(est.nth(2 + i * 4), String(gross[i]), `gross ${i + 1}`, { clear: true })
  }
  await j.type(est.nth(2 + 2), '71.2', 'rating day 1', { clear: true })
  await j.type(est.nth(2 + 3), '128', 'slope day 1', { clear: true })
  await sleep(300)
  out.preview = await dlg.locator('[class*="figLg"]').first().textContent().catch(() => null)
  j.scroll('scroll to Guardar')
  await j.tap(dlg.getByRole('button', { name: 'Guardar' }), 'Guardar', () => p.locator('[aria-live="polite"]').filter({ hasText: /./ }).first().waitFor())
  out.saveToast = await p.locator('[aria-live="polite"]').allTextContents()
  const h = await dlg.evaluate((el) => el.scrollHeight).catch(() => null)
  out.sheetScrollHeight = h
  out.estimate = j.summary()
  log('handicap', `estimate: taps=${out.estimate.taps} keys=${out.estimate.keystrokes} prefilled=${JSON.stringify(preset)} preview=${out.preview} toast=${JSON.stringify(out.saveToast)} sheetScroll=${h}`)
  await ctx.close()
}

// B. New player with only a name: what handicap does he get?
{
  const ctx = await phone(b, { blockSupabase: true })
  const p = await ctx.newPage()
  await p.goto(URL, { waitUntil: 'networkidle' })
  const j = new Journey('add-player', p)
  await j.tap(p.getByRole('button', { name: /Agregar/ }).first(), 'Agregar jugador', () => p.getByRole('dialog').waitFor())
  const dlg = p.getByRole('dialog')
  const focused = await p.evaluate(() => document.activeElement?.tagName)
  await j.type(dlg.locator('input:not([type=file])').first(), 'Jugador Doce', 'full name', { focus: focused !== 'INPUT' })
  out.newPlayerDefaults = await dlg.evaluate((el) => {
    const tab = el.querySelector('[role="tab"][aria-selected="true"]')?.textContent
    const fig = el.querySelector('[class*="figLg"]')?.textContent
    const hcp = [...el.querySelectorAll('input')].map((i) => i.value)
    return { tab, fig, inputs: hcp.slice(0, 6) }
  })
  out.saveEnabledNameOnly = await dlg.getByRole('button', { name: 'Guardar' }).isEnabled()
  out.addPlayer = j.summary()
  log('handicap', `new player defaults: ${JSON.stringify(out.newPlayerDefaults)} saveEnabled=${out.saveEnabledNameOnly}`)
  await p.keyboard.press('Escape')
  await sleep(300)
  // PIN sheet
  const j2 = new Journey('set-pin', p)
  const pinBtn = p.getByRole('button', { name: /PIN/ }).first()
  await j2.tap(pinBtn, 'PIN button on a row', () => p.getByRole('dialog').waitFor())
  const pinFocus = await p.evaluate(() => document.activeElement?.getAttribute('inputmode'))
  await j2.type(p.getByRole('dialog').locator('input'), '4821', 'PIN', { focus: pinFocus !== 'numeric' })
  await j2.tap(p.getByRole('dialog').getByRole('button', { name: 'Guardar' }), 'Guardar PIN', () => p.locator('[aria-live="polite"]').filter({ hasText: /./ }).first().waitFor())
  out.pinToast = await p.locator('[aria-live="polite"]').allTextContents()
  out.setPin = j2.summary()
  out.pinShare = await p.getByRole('dialog').getByRole('button', { name: /Compartir|WhatsApp|Enviar/ }).count().catch(() => 0)
  log('handicap', `pin: taps=${out.setPin.taps} keys=${out.setPin.keystrokes} toast=${JSON.stringify(out.pinToast)} share=${out.pinShare}`)
  await ctx.close()
}
saveJson('handicap', out)
await b.close()
