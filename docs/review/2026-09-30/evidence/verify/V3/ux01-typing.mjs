// UX-01 independent repro: type into Comité sheets like a person (tap the field, then keys at human speed),
// and also with Playwright's fill(). Records every field's value and where focus is after each key.
import { launch, phone, BASE, sleep, logTo, focused, sheetValues, SHOTS } from './lib.mjs'
import { writeFileSync } from 'node:fs'
const log = logTo('ux01-typing.log')
const b = await launch()
const results = []

async function tapField(page, locator) {
  await locator.scrollIntoViewIfNeeded()
  const bb = await locator.boundingBox()
  await page.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2)
  await sleep(120)
  await page.keyboard.press('Control+A') // select the old text without changing it (no re-render)
}
/** Type char by char at `delay` ms, recording the sheet after each key. */
async function typeHuman(page, text, delay = 150) {
  const steps = []
  for (const ch of text) {
    await page.keyboard.type(ch)
    await sleep(delay)
    steps.push({ key: ch, focus: await focused(page), values: await sheetValues(page) })
  }
  return steps
}
const ONLY = process.argv[2] ? process.argv[2].split(',') : null
async function run(name, url, open, actions, { shot } = {}) {
  if (ONLY && !ONLY.includes(name.split(' ')[0])) return
  const { ctx, page } = await phone(b)
  await page.goto(`${BASE}${url}`, { waitUntil: 'domcontentloaded' })
  await sleep(1500)
  await open(page)
  await page.locator('[role=dialog]').last().waitFor()
  await sleep(250)
  const r = { name, openedWithFocus: await focused(page), actions: [] }
  for (const a of actions) {
    const field = a.field(page)
    if (a.mode === 'fill') {
      await field.fill(a.text)
      await sleep(250)
      r.actions.push({ field: a.label, mode: 'fill', typed: a.text, focus: await focused(page), values: await sheetValues(page) })
    } else {
      await tapField(page, field)
      const before = await focused(page)
      const steps = await typeHuman(page, a.text, a.delay ?? 150)
      r.actions.push({ field: a.label, mode: `keys@${a.delay ?? 150}ms`, typed: a.text, focusBefore: before, afterFirstKey: steps[0].focus, final: steps.at(-1).values, finalFocus: steps.at(-1).focus })
    }
  }
  if (shot) await page.screenshot({ path: `${SHOTS}/${shot}` })
  results.push(r)
  log(JSON.stringify(r))
  await ctx.close()
}
const dlg = (p) => p.locator('[role=dialog]').last()
const byLabel = (lab) => (p) => dlg(p).locator('label, .field, [class*=field]').filter({ hasText: lab }).locator('input').first()

// A. Hándicaps › Editar (Ajuste del Comité): Hándicap de juego 13, human speed
await run('A handicaps override 13', '/t/_/full12-live/admin/handicaps', (p) => p.getByRole('button', { name: 'Editar' }).first().tap(), [
  { label: 'Hándicap de juego', field: byLabel('Hándicap de juego'), text: '13' },
], { shot: 't_admin_handicaps-full12-live-15pro-light-v3-typing13.png' })
// A2. reason first (autofocused), then the value
await run('A2 handicaps reason then 13', '/t/_/full12-live/admin/handicaps', (p) => p.getByRole('button', { name: 'Editar' }).first().tap(), [
  { label: 'Razón', field: (p) => dlg(p).locator('input').nth(1), text: 'Lluvia' },
  { label: 'Hándicap de juego', field: byLabel('Hándicap de juego'), text: '13' },
])
// A3. fill() (one input event with the whole value)
await run('A3 handicaps fill 13', '/t/_/full12-live/admin/handicaps', (p) => p.getByRole('button', { name: 'Editar' }).first().tap(), [
  { label: 'Hándicap de juego', field: byLabel('Hándicap de juego'), text: '13', mode: 'fill' },
])
// A4. fast typist (20 ms/key, under the 30 ms refocus timer)
await run('A4 handicaps 13 fast', '/t/_/full12-live/admin/handicaps', (p) => p.getByRole('button', { name: 'Editar' }).first().tap(), [
  { label: 'Hándicap de juego', field: byLabel('Hándicap de juego'), text: '13', delay: 20 },
])
// B. Tarjetas (scores) › a hole: Golpes 10
await run('B scores golpes 10', '/t/_/full12-live/admin/scores', (p) => p.locator('[class*=holes] button').first().tap(), [
  { label: 'Golpes', field: byLabel('Golpes'), text: '10' },
])
// C. Rondas › Agregar ronda: Número 12
await run('C rondas numero 12', '/t/_/full12-live/admin/rondas', (p) => p.getByRole('button', { name: 'Agregar ronda' }).tap(), [
  { label: 'Número', field: (p) => dlg(p).locator('input').first(), text: '12' },
])
// D. Jugadores › Agregar jugador: full name (autofocused), short name, base handicap
await run('D jugadores add', '/t/_/full12-live/admin/jugadores', (p) => p.getByRole('button', { name: 'Agregar jugador' }).tap(), [
  { label: 'Nombre completo', field: (p) => dlg(p).locator('input.input').nth(0), text: 'Jugador Doce' },
  { label: 'Nombre corto', field: (p) => dlg(p).locator('input.input').nth(1), text: 'Doce' },
  { label: 'Hándicap base', field: (p) => dlg(p).locator('input.input').last(), text: '21.5' },
], { shot: 't_admin_jugadores-full12-live-15pro-light-v3-add-typing.png' })
// E. Jugadores › edit an existing player: full name and base handicap
await run('E jugadores edit existing', '/t/_/full12-live/admin/jugadores', (p) => p.getByRole('button', { name: /Camilo Duarte/ }).tap(), [
  { label: 'Nombre completo', field: (p) => dlg(p).locator('input.input').nth(0), text: 'Camilo Duarte Ruiz' },
  { label: 'Hándicap base', field: (p) => dlg(p).locator('input.input').last(), text: '17.5' },
])
// F. Jugadores › Poner PIN (autofocused field): 1234
await run('F jugadores pin', '/t/_/full12-live/admin/jugadores', (p) => p.getByRole('button', { name: 'Poner PIN' }).first().tap(), [
  { label: 'PIN', field: (p) => dlg(p).locator('input').first(), text: '1234' },
])
// G. Campos › Capturar a mano (course editor keeps its own state): course name, rating
await run('G campos manual', '/t/_/full12-live/admin/campos', (p) => p.getByRole('button', { name: 'Capturar a mano' }).tap(), [
  { label: 'Campo (first input)', field: (p) => dlg(p).locator('input.input').first(), text: 'Solmar Golf Links' },
])
await b.close()
writeFileSync(`${process.env.V3 ?? '.'}/ux01-typing-${process.argv[2] ?? 'all'}.json`, JSON.stringify(results, null, 2))
