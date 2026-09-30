// Journey: load a course in Comité › Campos by search, by photo and by hand (fixture full12-live).
import { launch, phone, BASE, Journey, saveJson, shot, sleep, log, measureTargets } from './lib.mjs'

const b = await launch()
const out = {}
const URL = `${BASE}/t/_/full12-live/admin/campos`

// A. Search
{
  const ctx = await phone(b, { blockSupabase: true })
  const p = await ctx.newPage()
  const apiCalls = []
  p.on('response', (r) => r.url().includes('/api/') && apiCalls.push(`${r.status()} ${r.url().replace(BASE, '')}`))
  await p.goto(URL, { waitUntil: 'networkidle' })
  await sleep(500)
  await shot(p, 't_admin_campos-full12-live-15pro-light-ux.png')
  out.landing = (await p.evaluate(() => document.body.innerText)).slice(0, 900)
  const j = new Journey('course-search', p)
  await j.tap(p.getByRole('button', { name: 'Buscar campo' }), 'Buscar campo', () => p.getByRole('dialog').waitFor())
  const focused = await p.evaluate(() => document.activeElement?.tagName)
  await j.type(p.getByRole('dialog').locator('input'), 'Quivira', 'type Quivira', { focus: focused !== 'INPUT' })
  await j.tap(p.getByRole('dialog').getByRole('button', { name: 'Buscar', exact: true }), 'Buscar', () => p.getByRole('dialog').locator('p').first().waitFor({ timeout: 20000 }))
  await sleep(500)
  out.searchMsg = await p.getByRole('dialog').innerText()
  await shot(p, 't_admin_campos-full12-live-15pro-light-ux-search.png')
  out.search = j.summary()
  out.searchApi = [...apiCalls]
  log('course', `search: taps=${out.search.taps} keys=${out.search.keystrokes} msg=${JSON.stringify(out.searchMsg)} api=${apiCalls.join(' | ')}`)
  await ctx.close()
}

// B. Photo
{
  const ctx = await phone(b, { blockSupabase: true })
  const p = await ctx.newPage()
  const apiCalls = []
  p.on('response', (r) => r.url().includes('/api/') && apiCalls.push(`${r.status()} ${r.url().replace(BASE, '')}`))
  await p.goto(URL, { waitUntil: 'networkidle' })
  const j = new Journey('course-photo', p)
  const chooser = p.waitForEvent('filechooser')
  await j.tap(p.getByRole('button', { name: 'Subir tarjeta' }), 'Subir tarjeta (opens the OS picker)')
  const fc = await chooser
  await fc.setFiles('/home/user/Cardi-Golf/design/shots/after/full12-finished--tarjeta.jpg')
  j.note('OS photo picker: +2–3 taps outside the app (choose Photo Library / Take Photo, pick the image)')
  const t0 = performance.now()
  // wait for the toast or a draft
  await Promise.race([p.locator('[aria-live="polite"]').filter({ hasText: /./ }).first().waitFor({ timeout: 30000 }), p.getByRole('dialog').waitFor({ timeout: 30000 })])
  out.photoWaitMs = Math.round(performance.now() - t0)
  await sleep(300)
  out.photoToast = await p.locator('[aria-live="polite"]').allTextContents()
  await shot(p, 't_admin_campos-full12-live-15pro-light-ux-photo-error.png')
  out.photo = j.summary()
  out.photoApi = [...apiCalls]
  log('course', `photo: toast=${JSON.stringify(out.photoToast)} api=${apiCalls.join(' | ')} wait=${out.photoWaitMs}`)
  await ctx.close()
}

// C. Manual: 18 holes, par + SI each, then check what the backdrop does.
{
  const ctx = await phone(b, { blockSupabase: true })
  const p = await ctx.newPage()
  await p.goto(URL, { waitUntil: 'networkidle' })
  const j = new Journey('course-manual', p)
  await j.tap(p.getByRole('button', { name: 'Capturar a mano' }).or(p.getByRole('button', { name: /mano/i })), 'Capturar a mano', () => p.getByRole('dialog').waitFor())
  await sleep(400)
  const dlg = p.getByRole('dialog')
  out.manualSheetBox = await dlg.boundingBox()
  await shot(p, 't_admin_campos-full12-live-15pro-light-ux-manual.png')
  const targets = await measureTargets(p, { scope: '[role="dialog"]' })
  saveJson('targets-course-editor', targets)
  out.manualSmallTargets = targets.filter((t) => t.small).length
  out.manualTargets = targets.length
  // Is the untouched blank card already "valid" (Guardar enabled once a name is typed)?
  await j.type(dlg.locator('input').first(), 'Solmar Golf Links', 'course name')
  out.saveEnabledWithDefaults = await dlg.getByRole('button', { name: 'Guardar' }).isEnabled()
  // Enter a real-looking card: pars and SIs for 18 holes.
  const par = [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 3, 4, 5, 4, 4, 3, 4, 5]
  const si = [7, 11, 17, 3, 1, 13, 15, 9, 5, 8, 18, 2, 12, 4, 10, 16, 6, 14]
  const rows = dlg.locator('table tbody tr')
  for (let i = 0; i < 18; i++) {
    const r = rows.nth(i)
    const inputs = r.locator('input')
    if (par[i] !== 4) await j.type(inputs.nth(0), String(par[i]), `hole ${i + 1} par`, { clear: true })
    if (si[i] !== i + 1) await j.type(inputs.nth(1), String(si[i]), `hole ${i + 1} SI`, { clear: true })
  }
  out.manualIssues = await dlg.locator('ul.error').allTextContents()
  out.saveEnabledAfter = await dlg.getByRole('button', { name: 'Guardar' }).isEnabled()
  out.manual = j.summary()
  log('course', `manual: taps=${out.manual.taps} keys=${out.manual.keystrokes} saveEnabledWithDefaults=${out.saveEnabledWithDefaults} small=${out.manualSmallTargets}/${out.manualTargets} sheet=${JSON.stringify(out.manualSheetBox)}`)
  // Tap the backdrop above the sheet: is the typed card discarded without asking?
  const box = await dlg.boundingBox()
  if (box && box.y > 8) {
    await p.touchscreen.tap(196, Math.max(4, box.y / 2))
    await sleep(500)
    out.backdropClosed = !(await dlg.isVisible().catch(() => false))
  } else out.backdropClosed = 'no backdrop visible (sheet fills the screen)'
  // Escape as well
  log('course', `backdrop tap closed the draft: ${out.backdropClosed}`)
  await ctx.close()
}
saveJson('course', out)
await b.close()
