// Journey: organizer creates a tournament through the wizard demo (/organizer/nuevo/_), three ways.
import { launch, phone, BASE, Journey, saveJson, shot, sleep, log, measureTargets } from './lib.mjs'

const b = await launch()
const out = {}
const W = '/organizer/nuevo/_'

async function start(name) {
  const ctx = await phone(b, { blockSupabase: true })
  const p = await ctx.newPage()
  await p.goto(`${BASE}/fixture`, { waitUntil: 'domcontentloaded' })
  await p.goto(`${BASE}${W}`, { waitUntil: 'networkidle' })
  await p.getByText('Paso 1 de 3').waitFor()
  return { ctx, p, j: new Journey(name, p) }
}
const next = (p) => p.getByRole('button', { name: 'Siguiente' })

// A. Blank: name only, accept every default.
if (!process.argv.includes('--cd')) {
  const { ctx, p, j } = await start('wizard-blank')
  await shot(p, 'organizer_nuevo_-demo-15pro-light-ux-step1.png')
  await j.type(p.locator('input').first(), 'Copa Prueba', 'name')
  await j.tap(next(p), 'Siguiente (1→2)', () => p.getByText('Paso 2 de 3').waitFor())
  await sleep(300)
  await shot(p, 'organizer_nuevo_-demo-15pro-light-ux-step2.png')
  await shot(p, 'organizer_nuevo_-demo-15pro-light-ux-step2-full.png', { fullPage: true })
  const t2 = await measureTargets(p)
  saveJson('targets-wizard-step2', t2)
  const h2 = await p.evaluate(() => document.documentElement.scrollHeight)
  j.scroll('scroll to Siguiente on step 2')
  await j.tap(next(p), 'Siguiente (2→3)', () => p.getByText('Paso 3 de 3').waitFor())
  await sleep(300)
  await shot(p, 'organizer_nuevo_-demo-15pro-light-ux-step3.png')
  await j.tap(p.getByRole('button', { name: /Crear/ }), 'Crear torneo', () => p.getByText(/EJEMPL/).waitFor())
  await sleep(300)
  await shot(p, 'organizer_nuevo_-demo-15pro-light-ux-created.png')
  const s = j.summary()
  s.step2ScrollHeight = h2
  out.blank = s
  log('wizard', `blank: taps=${s.taps} keys=${s.keystrokes} appMs=${s.appMs}`)
  // What does the created screen offer as the next step?
  out.createdText = (await p.evaluate(() => document.body.innerText)).slice(0, 700)
  await ctx.close()
}

// B. From the "Viaje con Calcutta" template.
if (!process.argv.includes('--cd')) {
  const { ctx, p, j } = await start('wizard-calcutta-template')
  await j.type(p.locator('input').first(), "Nacho's Bachelor Invitational", 'name')
  await j.type(p.locator('input').nth(1), 'Los Cabos, abril 2027', 'tagline')
  await j.tap(next(p), 'Siguiente (1→2)', () => p.getByText('Paso 2 de 3').waitFor())
  j.scroll('scroll to template link')
  await j.tap(p.getByRole('button', { name: /plantilla/ }), 'template link', () => p.getByRole('dialog').waitFor())
  await sleep(300)
  await shot(p, 'organizer_nuevo_-demo-15pro-light-ux-templates.png')
  await j.tap(p.getByRole('dialog').getByRole('radio', { name: /Viaje con Calcutta/ }), 'Viaje con Calcutta', () => p.getByRole('dialog').waitFor({ state: 'detached' }))
  await sleep(300)
  j.scroll('scroll to Siguiente')
  await j.tap(next(p), 'Siguiente (2→3)', () => p.getByText('Paso 3 de 3').waitFor())
  await sleep(300)
  await shot(p, 'organizer_nuevo_-demo-15pro-light-ux-step3-calcutta.png')
  out.calcuttaReview = (await p.evaluate(() => document.body.innerText)).slice(0, 1200)
  const createBtn = p.getByRole('button', { name: /Crear/ })
  out.calcuttaCreateEnabled = await createBtn.isEnabled()
  if (out.calcuttaCreateEnabled) await j.tap(createBtn, 'Crear torneo', () => p.getByText(/EJEMPL/).waitFor())
  const s = j.summary()
  out.calcutta = s
  log('wizard', `calcutta template: taps=${s.taps} keys=${s.keystrokes} appMs=${s.appMs} createEnabled=${out.calcuttaCreateEnabled}`)
  await ctx.close()
}

// C. Custom from blank: 12 players, 2 days, money on at $2,500.
{
  const { ctx, p, j } = await start('wizard-custom')
  await j.type(p.locator('input').first(), 'Copa de Otoño', 'name')
  await j.tap(next(p), 'Siguiente (1→2)', () => p.getByText('Paso 2 de 3').waitFor())
  const playersInput = p.getByRole('textbox', { name: /jugadores/i }).or(p.locator('input[inputmode="numeric"]').first())
  await j.type(playersInput.first(), '12', 'players = 12', { clear: true })
  await j.tap(p.getByRole('radio', { name: '2', exact: true }), 'rounds = 2')
  await j.tap(p.locator('label.toggle').first(), 'money on', () => p.getByText(/Inscripción|Entrada/i).first().waitFor())
  await sleep(200)
  const fee = p.locator('input[inputmode="numeric"]').nth(1)
  await j.type(fee, '2500', 'entry fee 2500', { clear: true })
  j.scroll('scroll to Siguiente')
  await j.tap(next(p), 'Siguiente (2→3)', () => p.getByText('Paso 3 de 3').waitFor())
  await sleep(300)
  out.customReview = (await p.evaluate(() => document.body.innerText)).slice(0, 1200)
  await shot(p, 'organizer_nuevo_-demo-15pro-light-ux-step3-custom.png')
  const createBtn = p.getByRole('button', { name: /Crear/ })
  out.customCreateEnabled = await createBtn.isEnabled()
  if (out.customCreateEnabled) await j.tap(createBtn, 'Crear torneo', () => p.getByText(/EJEMPL/).waitFor())
  const s = j.summary()
  out.custom = s
  log('wizard', `custom: taps=${s.taps} keys=${s.keystrokes} appMs=${s.appMs} createEnabled=${out.customCreateEnabled}`)
  await ctx.close()
}

// D. Browser Back in the middle of the wizard (Android back / iOS edge swipe).
{
  const { ctx, p } = await start('wizard-back')
  await p.locator('input').first().fill('Copa que se pierde')
  await next(p).tap()
  await p.getByText('Paso 2 de 3').waitFor()
  await p.goBack()
  await sleep(800)
  out.backUrl = p.url()
  out.backText = (await p.evaluate(() => document.body.innerText)).slice(0, 200)
  await p.goForward()
  await sleep(800)
  out.forwardUrl = p.url()
  out.forwardStep = (await p.getByText(/Paso \d de 3/).first().textContent().catch(() => null))
  out.forwardName = await p.locator('input').first().inputValue().catch(() => null)
  log('wizard', `back: url=${out.backUrl} forward=${out.forwardUrl} step=${out.forwardStep} name="${out.forwardName}"`)
  await ctx.close()
}
saveJson(process.argv.includes('--cd') ? 'wizard-cd' : 'wizard', out)
await b.close()
