// Human-speed typing (150 ms/key) into inputs inside sheets: does focus survive each keystroke?
import { launch, phone, BASE, sleep, log } from './lib.mjs'
const b = await launch()
const results = []
async function tryField(name, url, open, locate, text) {
  const ctx = await phone(b, { blockSupabase: true })
  const p = await ctx.newPage()
  await p.goto(`${BASE}${url}`, { waitUntil: 'networkidle' })
  await sleep(300)
  await open(p)
  await sleep(400)
  const inp = await locate(p)
  await inp.tap()
  await inp.selectText().catch(() => {})
  const trace = []
  for (const ch of text) {
    await p.keyboard.type(ch)
    await sleep(150)
    trace.push(await p.evaluate(() => (document.activeElement?.tagName || '') + (document.activeElement?.getAttribute('role') ? '[' + document.activeElement.getAttribute('role') + ']' : '')))
  }
  const value = await inp.inputValue().catch(() => '?')
  const r = { name, typed: text, value, ok: value === text, focusTrace: trace.join(',') }
  results.push(r)
  log('sheet-focus', JSON.stringify(r))
  await ctx.close()
}
const J = '/t/_/full12-live/admin/jugadores'
await tryField('Jugadores › Editar › nombre completo', J, (p) => p.locator('[class*="rowBtn"]').nth(2).tap(), async (p) => p.getByRole('dialog').locator('input:not([type=file])').nth(0), 'Camilo Duarte Ruiz')
await tryField('Jugadores › Editar › hándicap base (a mano)', J, (p) => p.locator('[class*="rowBtn"]').nth(2).tap(), async (p) => {
  const d = p.getByRole('dialog')
  await d.getByRole('tab', { name: /mano/i }).tap()
  return d.locator('input[inputmode="decimal"]').first()
}, '17.5')
await tryField('Jugadores › Estimar › golpes buen día', J, async (p) => {
  await p.locator('[class*="rowBtn"]').nth(2).tap()
  await sleep(300)
  await p.getByRole('dialog').getByRole('tab', { name: /Estimar/ }).tap()
}, async (p) => p.getByRole('dialog').locator('input:not([type=file])').nth(2), '88')
await tryField('Jugadores › Agregar › nombre', J, (p) => p.getByRole('button', { name: 'Agregar jugador' }).tap(), async (p) => p.getByRole('dialog').locator('input:not([type=file])').nth(0), 'Jugador Doce')
await tryField('Jugadores › PIN', J, (p) => p.getByRole('button', { name: /PIN/ }).first().tap(), async (p) => p.getByRole('dialog').locator('input').first(), '4821')
await tryField('Campos › Buscar campo', '/t/_/full12-live/admin/campos', (p) => p.getByRole('button', { name: 'Buscar campo' }).tap(), async (p) => p.getByRole('dialog').locator('input').first(), 'Quivira')
await tryField('Campos › a mano › nombre del campo', '/t/_/full12-live/admin/campos', (p) => p.getByRole('button', { name: /mano/i }).tap(), async (p) => p.getByRole('dialog').locator('input').first(), 'Solmar')
await b.close()
