// Admin de Polo on the in-memory fixture (/admin/_/…): find a tournament, block a person, delete-account sheet, a notice.
import { launch, phone, BASE, Journey, saveJson, shot, sleep, log, measureTargets } from './lib.mjs'
const b = await launch()
const out = {}
async function human(p, text) { for (const ch of text) { await p.keyboard.type(ch); await sleep(120) } }

// A. Find the Nacho tournament and open its Comité
{
  const ctx = await phone(b, { blockSupabase: true })
  const p = await ctx.newPage()
  await p.goto(`${BASE}/admin/_/resumen`, { waitUntil: 'networkidle' })
  await sleep(700)
  await shot(p, 'admin_-resumen-15pro-light-ux.png')
  out.resumenSmall = (await measureTargets(p)).filter((t) => t.small).map((t) => `${t.name} ${t.w}x${t.h}`).slice(0, 15)
  const j = new Journey('platform-find-tournament', p)
  await j.tap(p.getByRole('link', { name: 'Torneos' }).first(), 'Torneos', () => sleep(500))
  const search = p.locator('input[type="search"], input').first()
  await j.type(search, 'nacho', 'search nacho')
  await sleep(600)
  await j.tap(p.getByRole('link', { name: /Nacho/ }).or(p.getByRole('button', { name: /Nacho/ })).first(), 'open Nacho', () => sleep(600))
  await shot(p, 'admin_-torneos-15pro-light-ux-detail.png')
  out.tDetail = (await p.evaluate(() => document.body.innerText)).slice(0, 1400)
  out.find = j.summary()
  log('platform', `find tournament: taps=${out.find.taps} keys=${out.find.keystrokes}`)
  await ctx.close()
}
// B. Block a person (reason) and the delete-account sheet (typed email)
{
  const ctx = await phone(b, { blockSupabase: true })
  const p = await ctx.newPage()
  await p.goto(`${BASE}/admin/_/personas`, { waitUntil: 'networkidle' })
  await sleep(600)
  const j = new Journey('platform-block', p)
  await j.tap(p.getByRole('link', { name: /Mauricio/ }).or(p.getByRole('button', { name: /Mauricio/ })).first(), 'open Mauricio', () => sleep(600))
  await j.tap(p.getByRole('button', { name: /^Bloquear/ }).first(), 'Bloquear', () => p.getByRole('dialog').waitFor())
  const r = p.getByRole('dialog').locator('input').first()
  await r.tap()
  await human(p, 'Spam en avisos')
  out.blockReasonTyped = await r.inputValue()
  await shot(p, 'admin_-personas-15pro-light-ux-block.png')
  await j.tap(p.getByRole('dialog').getByRole('button', { name: /Bloquear/ }).last(), 'confirm Bloquear', () => sleep(500))
  out.block = j.summary()
  // Delete account sheet: type the exact email at human speed
  await p.getByRole('button', { name: /Borrar cuenta/ }).first().tap().catch(() => {})
  await sleep(600)
  const dlg = p.getByRole('dialog')
  out.deleteSheet = (await dlg.innerText().catch(() => '')).slice(0, 600)
  const inputs = dlg.locator('input')
  if (await inputs.count()) {
    await inputs.first().tap()
    await human(p, 'mau@example.com')
    out.deleteTyped = await inputs.first().inputValue()
  }
  await shot(p, 'admin_-personas-15pro-light-ux-delete.png')
  log('platform', `block: taps=${out.block.taps} reasonTyped="${out.blockReasonTyped}" deleteTyped="${out.deleteTyped}"`)
  await ctx.close()
}
// C. A notice to one person
{
  const ctx = await phone(b, { blockSupabase: true })
  const p = await ctx.newPage()
  await p.goto(`${BASE}/admin/_/avisos`, { waitUntil: 'networkidle' })
  await sleep(700)
  await shot(p, 'admin_-avisos-15pro-light-ux.png', { fullPage: true })
  out.avisosText = (await p.evaluate(() => document.body.innerText)).slice(0, 1200)
  const inputs = p.locator('input, textarea')
  out.avisosInputs = await inputs.count()
  await ctx.close()
}
// D. Salud and the switches
{
  const ctx = await phone(b, { blockSupabase: true })
  const p = await ctx.newPage()
  await p.goto(`${BASE}/admin/_/salud`, { waitUntil: 'networkidle' })
  await sleep(700)
  await shot(p, 'admin_-salud-15pro-light-ux.png', { fullPage: true })
  out.saludText = (await p.evaluate(() => document.body.innerText)).slice(0, 1500)
  const sw = p.locator('label.toggle input, [role="switch"]')
  out.switches = await sw.count()
  if (out.switches) {
    await p.locator('label.toggle').first().tap()
    await sleep(500)
    out.switchAsks = await p.getByRole('dialog').isVisible().catch(() => false)
    out.switchDialog = (await p.getByRole('dialog').innerText().catch(() => '')).slice(0, 300)
  }
  log('platform', `salud: switches=${out.switches} asks=${out.switchAsks}`)
  await ctx.close()
}
saveJson('platform', out)
await b.close()
