// Tournament-day sheets: type at human speed into a field that is NOT the autofocused one.
import { launch, phone, BASE, sleep, log, shot } from './lib.mjs'
const b = await launch()
async function human(p, text) { for (const ch of text) { await p.keyboard.type(ch); await sleep(150) } }
const vals = (p) => p.evaluate(() => [...document.querySelectorAll('[role=dialog] input:not([type=file]):not([type=checkbox])')].map((i) => i.value))

// 1. Comité › Hándicaps: override the playing handicap to 13 with a reason.
{
  const ctx = await phone(b, { blockSupabase: true }); const p = await ctx.newPage()
  await p.goto(`${BASE}/t/_/full12-live/admin/handicaps`, { waitUntil: 'networkidle' }); await sleep(400)
  await p.getByRole('button', { name: /Ajustar|Editar|Cambiar/ }).first().tap(); await sleep(400)
  const d = p.getByRole('dialog')
  const before = await vals(p)
  const ph = d.locator('input').first()
  await ph.tap(); await ph.selectText(); await human(p, '13')
  const mid = await vals(p)
  await shot(p, 't_admin_handicaps-full12-live-15pro-light-ux-override-typing.png')
  log('sheet-focus2', JSON.stringify({ sheet: 'Hándicaps › Ajustar: type 13 into Hándicap de juego', before, after: mid }))
  await ctx.close()
}
// 2. Comité › Tarjetas: correct a hole to 10 strokes.
{
  const ctx = await phone(b, { blockSupabase: true }); const p = await ctx.newPage()
  await p.goto(`${BASE}/t/_/full12-live/admin/scores`, { waitUntil: 'networkidle' }); await sleep(500)
  const tile = p.locator('[class*="holes"] button').first()
  await tile.tap(); await sleep(400)
  const before = await vals(p)
  const st = p.getByRole('dialog').locator('input').first()
  await st.tap(); await st.selectText(); await human(p, '10')
  const after = await vals(p)
  log('sheet-focus2', JSON.stringify({ sheet: 'Tarjetas › hoyo: type 10 into Golpes', before, after }))
  await ctx.close()
}
// 3. Jugadores › Agregar: name, then tab to Nombre corto and type.
{
  const ctx = await phone(b, { blockSupabase: true }); const p = await ctx.newPage()
  await p.goto(`${BASE}/t/_/full12-live/admin/jugadores`, { waitUntil: 'networkidle' }); await sleep(400)
  await p.getByRole('button', { name: 'Agregar jugador' }).tap(); await sleep(400)
  await human(p, 'Jugador Doce')
  const short = p.getByRole('dialog').locator('input:not([type=file])').nth(1)
  await short.tap(); await human(p, 'Doce')
  const hc = p.getByRole('dialog').locator('input[inputmode="decimal"]').first()
  await hc.tap(); await hc.selectText(); await human(p, '21.5')
  const after = await vals(p)
  await shot(p, 't_admin_jugadores-full12-live-15pro-light-ux-add-typing.png')
  log('sheet-focus2', JSON.stringify({ sheet: 'Jugadores › Agregar: name, then "Doce" in Nombre corto, then 21.5 in hándicap', after }))
  await ctx.close()
}
// 4. Rondas › Agregar ronda: number field.
{
  const ctx = await phone(b, { blockSupabase: true }); const p = await ctx.newPage()
  await p.goto(`${BASE}/t/_/full12-live/admin/rondas`, { waitUntil: 'networkidle' }); await sleep(400)
  await p.getByRole('button', { name: 'Agregar ronda' }).tap(); await sleep(400)
  const n = p.getByRole('dialog').locator('input').first()
  await n.tap(); await n.selectText(); await human(p, '12')
  log('sheet-focus2', JSON.stringify({ sheet: 'Rondas › Agregar ronda: type 12 into Número', after: await vals(p) }))
  await ctx.close()
}
await b.close()
